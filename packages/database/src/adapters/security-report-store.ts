/**
 * S7-INF-01: security report store adapter
 * @task S7-INF-01
 * @frd docs/02-requirements/crypto-domain-frd.md §SEC-001
 */

import { eq, and, desc, gt } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { securityReports } from '../schema/crypto-domain.js';

// -- store interface --

export interface SecurityReportStore {
  create(report: {
    tokenAddress: string;
    chain: string;
    liquidityUsd?: string;
    isHoneypot: boolean;
    isMintable: boolean;
    ownershipRenounced?: boolean;
    riskScore: number;
    reasons?: unknown[];
    status?: string;
  }): Promise<{ id: string }>;
  findByToken(tokenAddress: string, chain: string): Promise<SecurityReportRecord | null>;
  findRecent(tokenAddress: string, chain: string, withinMs: number): Promise<SecurityReportRecord | null>;
}

export interface SecurityReportRecord {
  id: string;
  tokenAddress: string;
  chain: string;
  liquidityUsd: string | null;
  isHoneypot: boolean;
  isMintable: boolean;
  ownershipRenounced: boolean | null;
  riskScore: number;
  reasons: unknown;
  status: string;
  scannedAt: Date | null;
}

// -- adapter factory --

export function createDrizzleSecurityReportStore(db: DrizzleClient): SecurityReportStore {
  return {
    async create(report) {
      const rows = await db
        .insert(securityReports)
        .values(report)
        .returning({ id: securityReports.id });
      return { id: rows[0]!.id };
    },

    async findByToken(tokenAddress, chain) {
      const rows = await db
        .select()
        .from(securityReports)
        .where(
          and(
            eq(securityReports.tokenAddress, tokenAddress),
            eq(securityReports.chain, chain),
          ),
        )
        .orderBy(desc(securityReports.scannedAt))
        .limit(1);
      if (rows.length === 0) return null;
      const r = rows[0]!;
      return {
        id: r.id,
        tokenAddress: r.tokenAddress,
        chain: r.chain,
        liquidityUsd: r.liquidityUsd,
        isHoneypot: r.isHoneypot,
        isMintable: r.isMintable,
        ownershipRenounced: r.ownershipRenounced,
        riskScore: r.riskScore,
        reasons: r.reasons,
        status: r.status,
        scannedAt: r.scannedAt,
      };
    },

    async findRecent(tokenAddress, chain, withinMs) {
      const cutoff = new Date(Date.now() - withinMs);
      const rows = await db
        .select()
        .from(securityReports)
        .where(
          and(
            eq(securityReports.tokenAddress, tokenAddress),
            eq(securityReports.chain, chain),
            gt(securityReports.scannedAt, cutoff),
          ),
        )
        .orderBy(desc(securityReports.scannedAt))
        .limit(1);
      if (rows.length === 0) return null;
      const r = rows[0]!;
      return {
        id: r.id,
        tokenAddress: r.tokenAddress,
        chain: r.chain,
        liquidityUsd: r.liquidityUsd,
        isHoneypot: r.isHoneypot,
        isMintable: r.isMintable,
        ownershipRenounced: r.ownershipRenounced,
        riskScore: r.riskScore,
        reasons: r.reasons,
        status: r.status,
        scannedAt: r.scannedAt,
      };
    },
  };
}
