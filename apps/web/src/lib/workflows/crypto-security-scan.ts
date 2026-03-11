/**
 * S7-CRY-01: crypto security detection workflow
 * @task S7-CRY-01
 *
 * pipeline: cache check -> liquidity check (MCP) -> contract scan (MCP) ->
 *           risk scoring -> store report -> audit trail
 */

import { inngest } from '../inngest.js';
import {
  getSecurityReportStore,
  getMcpWrapper,
  getAuditService,
} from '../services.js';
import type { AuditEventInput } from '@aptivo/audit';

// ---------------------------------------------------------------------------
// result type
// ---------------------------------------------------------------------------

export type SecurityScanResult =
  | { status: 'cached'; report: SecurityReport }
  | { status: 'scanned'; report: SecurityReport }
  | { status: 'error'; step: string; error: string };

export interface SecurityReport {
  tokenAddress: string;
  chain: string;
  liquidityUsd: number;
  isHoneypot: boolean;
  isMintable: boolean;
  ownershipRenounced: boolean;
  riskScore: number;
  reasons: string[];
  riskStatus: string;
}

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 3_600_000; // 1 hour

const LIQUIDITY_THRESHOLD = 50_000;

// ---------------------------------------------------------------------------
// helper: emit audit event (fire-and-forget, never blocks)
// ---------------------------------------------------------------------------

async function emitAudit(input: AuditEventInput): Promise<{ auditId?: string }> {
  try {
    const auditService = getAuditService();
    const result = await auditService.emit(input);
    if (!result.ok) return {};
    return { auditId: result.value.id };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// inngest function
// ---------------------------------------------------------------------------

export const securityScanFn = inngest.createFunction(
  { id: 'crypto-security-scan', retries: 0 },
  { event: 'crypto/security.scan.requested' },
  async ({ event, step }): Promise<SecurityScanResult> => {
    const { tokenAddress, chain, requestedBy } = event.data;

    // step 1: check-cache — return early if a recent report exists
    const cached = await step.run('check-cache', async () => {
      try {
        const store = getSecurityReportStore();
        const recent = await store.findRecent(tokenAddress, chain, CACHE_TTL_MS);
        if (recent) {
          return {
            hit: true as const,
            report: {
              tokenAddress: recent.tokenAddress,
              chain: recent.chain,
              liquidityUsd: recent.liquidityUsd ? parseFloat(recent.liquidityUsd) : 0,
              isHoneypot: recent.isHoneypot,
              isMintable: recent.isMintable,
              ownershipRenounced: recent.ownershipRenounced ?? false,
              riskScore: recent.riskScore,
              reasons: Array.isArray(recent.reasons) ? (recent.reasons as string[]) : [],
              riskStatus: recent.status,
            },
          };
        }
        return { hit: false as const };
      } catch (err: unknown) {
        // cache miss on error — proceed with full scan
        return { hit: false as const };
      }
    });

    if (cached.hit) {
      return { status: 'cached', report: cached.report };
    }

    // step 2: liquidity-check — call MCP crypto-scanner tool
    const liquidityResult = await step.run('liquidity-check', async () => {
      try {
        const wrapper = getMcpWrapper();
        const result = await wrapper.executeTool('crypto-scanner', 'check-liquidity', {
          tokenAddress,
          chain,
        });

        if (!result.ok) {
          // mcp failure — default to 0 liquidity (worst case)
          return { liquidityUsd: 0 };
        }

        const content = result.value.content as Record<string, unknown>;
        const liquidityUsd = typeof content.liquidityUsd === 'number'
          ? content.liquidityUsd
          : 0;

        return { liquidityUsd };
      } catch {
        return { liquidityUsd: 0 };
      }
    });

    // step 3: contract-scan — call MCP crypto-scanner tool
    const contractResult = await step.run('contract-scan', async () => {
      try {
        const wrapper = getMcpWrapper();
        const result = await wrapper.executeTool('crypto-scanner', 'scan-contract', {
          tokenAddress,
          chain,
        });

        if (!result.ok) {
          // mcp failure — worst-case flags
          return {
            isHoneypot: true,
            isMintable: true,
            ownershipRenounced: false,
          };
        }

        const content = result.value.content as Record<string, unknown>;
        return {
          isHoneypot: content.isHoneypot === true,
          isMintable: content.isMintable === true,
          ownershipRenounced: content.ownershipRenounced === true,
        };
      } catch {
        // worst-case on exception
        return {
          isHoneypot: true,
          isMintable: true,
          ownershipRenounced: false,
        };
      }
    });

    // step 4: risk-scoring — compute score, store report, emit audit
    const report = await step.run('risk-scoring', async () => {
      const { liquidityUsd } = liquidityResult;
      const { isHoneypot, isMintable, ownershipRenounced } = contractResult;

      // compute risk score (0-100)
      let riskScore = 0;
      const reasons: string[] = [];

      if (isHoneypot) {
        riskScore += 40;
        reasons.push('honeypot detected');
      }
      if (isMintable) {
        riskScore += 25;
        reasons.push('mintable token');
      }
      if (!ownershipRenounced) {
        riskScore += 15;
        reasons.push('ownership not renounced');
      }
      if (liquidityUsd < LIQUIDITY_THRESHOLD) {
        riskScore += 20;
        reasons.push(`low liquidity ($${liquidityUsd})`);
      }

      // determine status
      let riskStatus: string;
      if (riskScore >= 60) {
        riskStatus = 'dangerous';
      } else if (riskScore >= 30) {
        riskStatus = 'warning';
      } else {
        riskStatus = 'safe';
      }

      // store report
      const store = getSecurityReportStore();
      await store.create({
        tokenAddress,
        chain,
        liquidityUsd: String(liquidityUsd),
        isHoneypot,
        isMintable,
        ownershipRenounced,
        riskScore,
        reasons,
        status: riskStatus,
      });

      // emit audit event
      await emitAudit({
        actor: { id: requestedBy, type: 'user' },
        action: 'crypto.security.scanned',
        resource: { type: 'security-report', id: tokenAddress },
        domain: 'crypto',
        metadata: {
          chain,
          riskScore,
          riskStatus,
          isHoneypot,
          isMintable,
          ownershipRenounced,
          liquidityUsd,
        },
      });

      return {
        tokenAddress,
        chain,
        liquidityUsd,
        isHoneypot,
        isMintable,
        ownershipRenounced,
        riskScore,
        reasons,
        riskStatus,
      };
    });

    return { status: 'scanned', report };
  },
);
