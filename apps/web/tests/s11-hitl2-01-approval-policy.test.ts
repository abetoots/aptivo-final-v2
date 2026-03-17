/**
 * HITL2-01: Approval Policy Model + Schema tests
 * @task HITL2-01
 *
 * verifies approval policy zod schema validation, drizzle adapter crud,
 * decision enum extension, and hitl_requests schema additions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ApprovalPolicySchema,
  ApprovalPolicyType,
  EscalationPolicySchema,
  type ApprovalPolicyStore,
  type ApprovalPolicyRecord,
} from '@aptivo/hitl-gateway';

// ---------------------------------------------------------------------------
// in-memory store for adapter tests (mirrors drizzle adapter contract)
// ---------------------------------------------------------------------------

function createInMemoryApprovalPolicyStore(): ApprovalPolicyStore {
  const records: ApprovalPolicyRecord[] = [];

  return {
    async create(policy) {
      const record: ApprovalPolicyRecord = {
        id: crypto.randomUUID(),
        name: policy.name,
        type: policy.type,
        threshold: policy.threshold,
        approverRoles: policy.approverRoles,
        maxRetries: policy.maxRetries,
        timeoutSeconds: policy.timeoutSeconds,
        escalationPolicy: policy.escalationPolicy ?? null,
        createdAt: new Date(),
      };
      records.push(record);
      return record;
    },

    async findById(id) {
      return records.find((r) => r.id === id) ?? null;
    },

    async findByName(name) {
      return records.find((r) => r.name === name) ?? null;
    },

    async list() {
      return [...records].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
  };
}

// ---------------------------------------------------------------------------
// schema validation: quorum policy
// ---------------------------------------------------------------------------

describe('ApprovalPolicySchema', () => {
  describe('quorum policy', () => {
    it('validates a valid quorum policy', () => {
      const input = {
        name: 'trade-approval',
        type: 'quorum' as const,
        threshold: 2,
        approverRoles: ['risk-manager', 'compliance-officer', 'cfo'],
        maxRetries: 3,
        timeoutSeconds: 86400,
      };

      const result = ApprovalPolicySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('trade-approval');
        expect(result.data.type).toBe('quorum');
        expect(result.data.threshold).toBe(2);
        expect(result.data.approverRoles).toHaveLength(3);
      }
    });

    it('rejects quorum without threshold', () => {
      const input = {
        name: 'missing-threshold',
        type: 'quorum' as const,
        approverRoles: ['role-a', 'role-b'],
      };

      const result = ApprovalPolicySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects threshold > approverRoles.length', () => {
      const input = {
        name: 'over-threshold',
        type: 'quorum' as const,
        threshold: 5,
        approverRoles: ['role-a', 'role-b'],
      };

      const result = ApprovalPolicySchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // schema validation: sequential policy
  // ---------------------------------------------------------------------------

  describe('sequential policy', () => {
    it('validates a valid sequential policy', () => {
      const input = {
        name: 'contract-review',
        type: 'sequential' as const,
        approverRoles: ['legal', 'finance', 'ceo'],
        escalationPolicy: {
          timeoutAction: 'escalate' as const,
          escalateToRole: 'board',
        },
        timeoutSeconds: 172800,
      };

      const result = ApprovalPolicySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('sequential');
        expect(result.data.approverRoles).toStrictEqual(['legal', 'finance', 'ceo']);
        expect(result.data.escalationPolicy?.timeoutAction).toBe('escalate');
        expect(result.data.escalationPolicy?.escalateToRole).toBe('board');
        expect(result.data.timeoutSeconds).toBe(172800);
      }
    });

    it('accepts sequential without escalationPolicy (optional)', () => {
      const input = {
        name: 'simple-chain',
        type: 'sequential' as const,
        approverRoles: ['manager'],
      };

      const result = ApprovalPolicySchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // schema validation: single policy (backward compat)
  // ---------------------------------------------------------------------------

  describe('single policy', () => {
    it('validates a single-approver policy', () => {
      const input = {
        name: 'basic-approval',
        type: 'single' as const,
        approverRoles: ['manager'],
      };

      const result = ApprovalPolicySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('single');
        expect(result.data.approverRoles).toStrictEqual(['manager']);
        // defaults applied
        expect(result.data.maxRetries).toBe(3);
        expect(result.data.timeoutSeconds).toBe(86400);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // schema validation: rejection cases
  // ---------------------------------------------------------------------------

  describe('rejection cases', () => {
    it('rejects empty approverRoles', () => {
      const input = {
        name: 'empty-roles',
        type: 'single' as const,
        approverRoles: [],
      };

      const result = ApprovalPolicySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects empty name', () => {
      const input = {
        name: '',
        type: 'single' as const,
        approverRoles: ['manager'],
      };

      const result = ApprovalPolicySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects name exceeding 100 chars', () => {
      const input = {
        name: 'a'.repeat(101),
        type: 'single' as const,
        approverRoles: ['manager'],
      };

      const result = ApprovalPolicySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects maxRetries > 10', () => {
      const input = {
        name: 'over-retries',
        type: 'single' as const,
        approverRoles: ['manager'],
        maxRetries: 11,
      };

      const result = ApprovalPolicySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects timeoutSeconds < 60', () => {
      const input = {
        name: 'too-short-timeout',
        type: 'single' as const,
        approverRoles: ['manager'],
        timeoutSeconds: 30,
      };

      const result = ApprovalPolicySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects timeoutSeconds > 604800 (7 days)', () => {
      const input = {
        name: 'too-long-timeout',
        type: 'single' as const,
        approverRoles: ['manager'],
        timeoutSeconds: 604801,
      };

      const result = ApprovalPolicySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid policy type', () => {
      const input = {
        name: 'bad-type',
        type: 'majority' as any,
        approverRoles: ['manager'],
      };

      const result = ApprovalPolicySchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// ApprovalPolicyType enum
// ---------------------------------------------------------------------------

describe('ApprovalPolicyType', () => {
  it('accepts valid types', () => {
    expect(ApprovalPolicyType.safeParse('single').success).toBe(true);
    expect(ApprovalPolicyType.safeParse('quorum').success).toBe(true);
    expect(ApprovalPolicyType.safeParse('sequential').success).toBe(true);
  });

  it('rejects invalid types', () => {
    expect(ApprovalPolicyType.safeParse('majority').success).toBe(false);
    expect(ApprovalPolicyType.safeParse('').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EscalationPolicySchema
// ---------------------------------------------------------------------------

describe('EscalationPolicySchema', () => {
  it('validates with all fields', () => {
    const result = EscalationPolicySchema.safeParse({
      timeoutAction: 'reject',
      escalateToRole: 'cto',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.timeoutAction).toBe('reject');
      expect(result.data?.escalateToRole).toBe('cto');
    }
  });

  it('applies default timeoutAction of escalate', () => {
    const result = EscalationPolicySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.timeoutAction).toBe('escalate');
    }
  });

  it('accepts undefined (optional schema)', () => {
    const result = EscalationPolicySchema.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  it('accepts skip and reject timeout actions', () => {
    expect(EscalationPolicySchema.safeParse({ timeoutAction: 'skip' }).success).toBe(true);
    expect(EscalationPolicySchema.safeParse({ timeoutAction: 'reject' }).success).toBe(true);
  });

  it('rejects invalid timeoutAction', () => {
    const result = EscalationPolicySchema.safeParse({ timeoutAction: 'abort' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// in-memory store CRUD tests (validates adapter contract)
// ---------------------------------------------------------------------------

describe('ApprovalPolicyStore (in-memory)', () => {
  let store: ApprovalPolicyStore;

  beforeEach(() => {
    store = createInMemoryApprovalPolicyStore();
  });

  it('create returns record with id and createdAt', async () => {
    const record = await store.create({
      name: 'test-policy',
      type: 'quorum',
      threshold: 2,
      approverRoles: ['role-a', 'role-b', 'role-c'],
      maxRetries: 3,
      timeoutSeconds: 86400,
      escalationPolicy: null,
    });

    expect(record.id).toBeTruthy();
    expect(record.id.length).toBeGreaterThan(0);
    expect(record.name).toBe('test-policy');
    expect(record.type).toBe('quorum');
    expect(record.threshold).toBe(2);
    expect(record.approverRoles).toStrictEqual(['role-a', 'role-b', 'role-c']);
    expect(record.maxRetries).toBe(3);
    expect(record.timeoutSeconds).toBe(86400);
    expect(record.escalationPolicy).toBeNull();
    expect(record.createdAt).toBeInstanceOf(Date);
  });

  it('findById returns created policy', async () => {
    const created = await store.create({
      name: 'find-by-id-test',
      type: 'single',
      threshold: null,
      approverRoles: ['manager'],
      maxRetries: 1,
      timeoutSeconds: 3600,
      escalationPolicy: null,
    });

    const found = await store.findById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.name).toBe('find-by-id-test');
    expect(found!.type).toBe('single');
  });

  it('findById returns null for unknown id', async () => {
    const found = await store.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('findByName returns matching policy', async () => {
    await store.create({
      name: 'unique-name',
      type: 'sequential',
      threshold: null,
      approverRoles: ['legal', 'cfo'],
      maxRetries: 2,
      timeoutSeconds: 172800,
      escalationPolicy: { timeoutAction: 'reject' },
    });

    const found = await store.findByName('unique-name');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('unique-name');
    expect(found!.type).toBe('sequential');
    expect(found!.escalationPolicy).toStrictEqual({ timeoutAction: 'reject' });
  });

  it('findByName returns null for unknown name', async () => {
    const found = await store.findByName('nonexistent');
    expect(found).toBeNull();
  });

  it('list returns all policies ordered by createdAt desc', async () => {
    // create first policy with an older timestamp
    const first = await store.create({
      name: 'first-policy',
      type: 'single',
      threshold: null,
      approverRoles: ['role-a'],
      maxRetries: 3,
      timeoutSeconds: 86400,
      escalationPolicy: null,
    });
    // backdate the first record to ensure deterministic ordering
    first.createdAt = new Date(Date.now() - 10_000);

    const second = await store.create({
      name: 'second-policy',
      type: 'quorum',
      threshold: 2,
      approverRoles: ['role-a', 'role-b'],
      maxRetries: 3,
      timeoutSeconds: 86400,
      escalationPolicy: null,
    });

    const all = await store.list();
    expect(all).toHaveLength(2);
    // most recent first
    expect(all[0]!.name).toBe('second-policy');
    expect(all[1]!.name).toBe('first-policy');
  });

  it('list returns empty array when no policies exist', async () => {
    const all = await store.list();
    expect(all).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// decision enum: request_changes
// ---------------------------------------------------------------------------

describe('hitlDecisionEnum', () => {
  it('includes request_changes in decision values', async () => {
    // import the schema to verify the enum includes request_changes
    const { hitlDecisionEnum } = await import('@aptivo/database');
    const values = hitlDecisionEnum.enumValues;

    expect(values).toContain('approved');
    expect(values).toContain('rejected');
    expect(values).toContain('request_changes');
    expect(values).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// hitl_requests schema: policyId and retryCount columns
// ---------------------------------------------------------------------------

describe('hitlRequests schema', () => {
  it('has policyId column', async () => {
    const { hitlRequests } = await import('@aptivo/database');
    const columns = Object.keys(hitlRequests);

    // drizzle table objects have column accessors
    expect(hitlRequests.policyId).toBeDefined();
  });

  it('has retryCount column', async () => {
    const { hitlRequests } = await import('@aptivo/database');

    expect(hitlRequests.retryCount).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// approval_policies schema: table shape
// ---------------------------------------------------------------------------

describe('approvalPolicies schema', () => {
  it('exports the table and enum', async () => {
    const { approvalPolicies, approvalPolicyTypeEnum } = await import('@aptivo/database');

    expect(approvalPolicies).toBeDefined();
    expect(approvalPolicyTypeEnum).toBeDefined();
    expect(approvalPolicyTypeEnum.enumValues).toStrictEqual(['single', 'quorum', 'sequential']);
  });

  it('has expected columns', async () => {
    const { approvalPolicies } = await import('@aptivo/database');

    expect(approvalPolicies.id).toBeDefined();
    expect(approvalPolicies.name).toBeDefined();
    expect(approvalPolicies.type).toBeDefined();
    expect(approvalPolicies.threshold).toBeDefined();
    expect(approvalPolicies.approverRoles).toBeDefined();
    expect(approvalPolicies.maxRetries).toBeDefined();
    expect(approvalPolicies.timeoutSeconds).toBeDefined();
    expect(approvalPolicies.escalationPolicy).toBeDefined();
    expect(approvalPolicies.createdAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// drizzle adapter factory export
// ---------------------------------------------------------------------------

describe('createDrizzleApprovalPolicyStore', () => {
  it('is exported from database adapters', async () => {
    const { createDrizzleApprovalPolicyStore } = await import('@aptivo/database/adapters');
    expect(typeof createDrizzleApprovalPolicyStore).toBe('function');
  });
});
