/**
 * S6-HR-01: candidate application workflow tests
 * @task S6-HR-01
 *
 * verifies the HR candidate intake pipeline using @inngest/test
 * for deterministic step execution.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InngestTestEngine } from '@inngest/test';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// mock services — must be declared before vi.mock calls (hoisted)
// ---------------------------------------------------------------------------

const mockLlmGateway = {
  complete: vi.fn(),
};

const mockAuditService = {
  emit: vi.fn(),
};

const mockNotificationService = {
  send: vi.fn(),
};

const mockCandidateStore = {
  create: vi.fn(),
  findById: vi.fn(),
  findByEmail: vi.fn(),
  updateStatus: vi.fn(),
};

const mockApplicationStore = {
  create: vi.fn(),
  findByCandidate: vi.fn(),
  updateStage: vi.fn(),
};

// ---------------------------------------------------------------------------
// mock modules
// ---------------------------------------------------------------------------

vi.mock('../src/lib/services', () => ({
  getLlmGateway: () => mockLlmGateway,
  getAuditService: () => mockAuditService,
  getNotificationService: () => mockNotificationService,
  getCandidateStore: () => mockCandidateStore,
  getApplicationStore: () => mockApplicationStore,
}));

// ---------------------------------------------------------------------------
// import under test (after mocks are declared)
// ---------------------------------------------------------------------------

import { candidateFlowFn } from '../src/lib/workflows/hr-candidate-flow.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// fresh engine per test to avoid mock handler cache contamination
const engineFor = (fn: any, opts?: Partial<InngestTestEngine.Options>) =>
  new InngestTestEngine({ function: fn, ...opts });

const triggerEvent = (overrides?: Record<string, unknown>) =>
  [
    {
      name: 'hr/application.received' as const,
      data: {
        resumeText: 'John Doe\njohn@example.com\nSkills: TypeScript, React, Node.js',
        source: 'website',
        positionId: 'pos-123',
        candidateEmail: 'john@example.com',
        ...overrides,
      },
    },
  ] as [any];

// standard LLM response for happy path
const llmSuccessResponse = () =>
  Result.ok({
    completion: {
      id: 'llm-1',
      content: JSON.stringify({
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1-555-0100',
        skills: ['TypeScript', 'React', 'Node.js'],
      }),
      finishReason: 'stop',
      usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
    },
    costUsd: 0.002,
    provider: 'openai',
    wasFallback: false,
    latencyMs: 200,
  });

// standard audit response
const auditSuccessResponse = () =>
  Result.ok({
    id: 'audit-001',
    previousHash: null,
    currentHash: 'abc123',
    sequence: 1,
    timestamp: new Date(),
  });

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // default mocks — overridden per test when needed
  mockAuditService.emit.mockResolvedValue(auditSuccessResponse());
  mockNotificationService.send.mockResolvedValue(Result.ok({ deliveryId: 'notif-1' }));
});

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('S6-HR-01: Candidate Application Workflow', () => {
  // -------------------------------------------------------------------------
  // 1. happy path — new candidate
  // -------------------------------------------------------------------------
  describe('happy path — new candidate', () => {
    it('parses resume, creates candidate + application, requests consent, notifies recruiter, and records audit', async () => {
      // arrange
      mockLlmGateway.complete.mockResolvedValue(llmSuccessResponse());
      mockCandidateStore.findByEmail.mockResolvedValue(null);
      mockCandidateStore.create.mockResolvedValue({ id: 'cand-001' });
      mockCandidateStore.findById.mockResolvedValue({
        id: 'cand-001',
        name: 'John Doe',
        email: 'john@example.com',
        consentStatus: 'pending',
      });
      mockApplicationStore.create.mockResolvedValue({ id: 'app-001' });

      const engine = engineFor(candidateFlowFn, { events: triggerEvent() });
      const { result } = await engine.execute();

      // assert result
      expect(result).toMatchObject({
        status: 'created',
        candidateId: 'cand-001',
        applicationId: 'app-001',
        isNew: true,
      });

      // verify LLM called
      expect(mockLlmGateway.complete).toHaveBeenCalledTimes(1);

      // verify candidate created (not reused)
      expect(mockCandidateStore.create).toHaveBeenCalledTimes(1);
      expect(mockCandidateStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'John Doe',
          email: 'john@example.com',
          consentStatus: 'pending',
        }),
      );

      // verify application created
      expect(mockApplicationStore.create).toHaveBeenCalledTimes(1);
      expect(mockApplicationStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateId: 'cand-001',
          source: 'website',
          currentStage: 'received',
        }),
      );

      // verify consent request notification sent
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          templateSlug: 'hr-consent-request',
          recipientId: 'cand-001',
        }),
      );

      // verify recruiter notification sent
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          templateSlug: 'hr-new-application',
          recipientId: 'recruiter-pool',
        }),
      );

      // verify audit recorded
      expect(mockAuditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'hr.application.received',
          domain: 'hr',
          resource: { type: 'application', id: 'app-001' },
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. duplicate candidate — reuse existing
  // -------------------------------------------------------------------------
  describe('duplicate candidate', () => {
    it('finds existing candidate by email, creates new application, skips consent, returns isNew: false', async () => {
      mockLlmGateway.complete.mockResolvedValue(llmSuccessResponse());
      mockCandidateStore.findByEmail.mockResolvedValue({
        id: 'cand-existing',
        name: 'John Doe',
        email: 'john@example.com',
        consentStatus: 'granted',
      });
      mockApplicationStore.create.mockResolvedValue({ id: 'app-002' });

      const engine = engineFor(candidateFlowFn, { events: triggerEvent() });
      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'created',
        candidateId: 'cand-existing',
        applicationId: 'app-002',
        isNew: false,
      });

      // candidate.create should NOT be called for duplicates
      expect(mockCandidateStore.create).not.toHaveBeenCalled();

      // consent-check step should skip for existing candidate
      expect(mockCandidateStore.findById).not.toHaveBeenCalled();

      // recruiter notification still sent
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          templateSlug: 'hr-new-application',
        }),
      );

      // audit still recorded
      expect(mockAuditService.emit).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. LLM failure → error at parse-resume step
  // -------------------------------------------------------------------------
  describe('LLM failure', () => {
    it('returns error result at parse-resume step when LLM gateway fails', async () => {
      mockLlmGateway.complete.mockResolvedValue(
        Result.err({ _tag: 'ServiceUnavailable', provider: 'openai' }),
      );

      const engine = engineFor(candidateFlowFn, { events: triggerEvent() });
      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'error',
        step: 'parse-resume',
        error: 'ServiceUnavailable',
      });

      // no downstream calls
      expect(mockCandidateStore.findByEmail).not.toHaveBeenCalled();
      expect(mockCandidateStore.create).not.toHaveBeenCalled();
      expect(mockApplicationStore.create).not.toHaveBeenCalled();
      expect(mockNotificationService.send).not.toHaveBeenCalled();
      expect(mockAuditService.emit).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 4. LLM returns non-JSON → fallback to candidateEmail from event
  // -------------------------------------------------------------------------
  describe('LLM non-JSON output', () => {
    it('falls back to candidateEmail from event data when LLM returns invalid JSON', async () => {
      mockLlmGateway.complete.mockResolvedValue(
        Result.ok({
          completion: {
            id: 'llm-2',
            content: 'This is not valid JSON, just a text summary of the resume.',
            finishReason: 'stop',
            usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
          },
          costUsd: 0.002,
          provider: 'openai',
          wasFallback: false,
          latencyMs: 200,
        }),
      );
      mockCandidateStore.findByEmail.mockResolvedValue(null);
      mockCandidateStore.create.mockResolvedValue({ id: 'cand-fallback' });
      mockCandidateStore.findById.mockResolvedValue({
        id: 'cand-fallback',
        name: 'Unknown',
        email: 'john@example.com',
        consentStatus: 'pending',
      });
      mockApplicationStore.create.mockResolvedValue({ id: 'app-fallback' });

      const engine = engineFor(candidateFlowFn, { events: triggerEvent() });
      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'created',
        candidateId: 'cand-fallback',
        isNew: true,
      });

      // candidate created with fallback values
      expect(mockCandidateStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Unknown',
          email: 'john@example.com',
          skills: [],
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. consent already granted → consent notification NOT sent
  // -------------------------------------------------------------------------
  describe('consent already granted', () => {
    it('skips consent notification when candidate already has consent', async () => {
      mockLlmGateway.complete.mockResolvedValue(llmSuccessResponse());
      mockCandidateStore.findByEmail.mockResolvedValue(null);
      mockCandidateStore.create.mockResolvedValue({ id: 'cand-granted' });
      mockCandidateStore.findById.mockResolvedValue({
        id: 'cand-granted',
        name: 'John Doe',
        email: 'john@example.com',
        consentStatus: 'granted',
      });
      mockApplicationStore.create.mockResolvedValue({ id: 'app-granted' });

      const engine = engineFor(candidateFlowFn, { events: triggerEvent() });
      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'created',
        candidateId: 'cand-granted',
        isNew: true,
      });

      // consent-request template should NOT be sent
      const consentCalls = vi.mocked(mockNotificationService.send).mock.calls.filter(
        ([arg]) => arg.templateSlug === 'hr-consent-request',
      );
      expect(consentCalls).toHaveLength(0);

      // recruiter notification still sent
      const recruiterCalls = vi.mocked(mockNotificationService.send).mock.calls.filter(
        ([arg]) => arg.templateSlug === 'hr-new-application',
      );
      expect(recruiterCalls).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 6. new candidate with pending consent → consent request sent
  // -------------------------------------------------------------------------
  describe('new candidate consent request', () => {
    it('sends consent request notification when new candidate has pending consent', async () => {
      mockLlmGateway.complete.mockResolvedValue(llmSuccessResponse());
      mockCandidateStore.findByEmail.mockResolvedValue(null);
      mockCandidateStore.create.mockResolvedValue({ id: 'cand-pending' });
      mockCandidateStore.findById.mockResolvedValue({
        id: 'cand-pending',
        name: 'John Doe',
        email: 'john@example.com',
        consentStatus: 'pending',
      });
      mockApplicationStore.create.mockResolvedValue({ id: 'app-pending' });

      const engine = engineFor(candidateFlowFn, { events: triggerEvent() });
      const { result } = await engine.execute();

      expect(result).toMatchObject({ status: 'created' });

      // consent request notification sent with correct template + recipient
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'cand-pending',
          channel: 'email',
          templateSlug: 'hr-consent-request',
          variables: expect.objectContaining({
            candidateName: 'John Doe',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 7. recruiter notification failure → non-blocking, workflow completes
  // -------------------------------------------------------------------------
  describe('recruiter notification failure', () => {
    it('completes workflow even when recruiter notification throws', async () => {
      mockLlmGateway.complete.mockResolvedValue(llmSuccessResponse());
      mockCandidateStore.findByEmail.mockResolvedValue(null);
      mockCandidateStore.create.mockResolvedValue({ id: 'cand-nf' });
      mockCandidateStore.findById.mockResolvedValue({
        id: 'cand-nf',
        name: 'John Doe',
        email: 'john@example.com',
        consentStatus: 'granted',
      });
      mockApplicationStore.create.mockResolvedValue({ id: 'app-nf' });

      // consent notification succeeds but recruiter notification throws
      let callCount = 0;
      mockNotificationService.send.mockImplementation(async () => {
        callCount++;
        // first call is consent-check (skipped for granted), so recruiter is the first
        throw new Error('Novu delivery failed');
      });

      const engine = engineFor(candidateFlowFn, { events: triggerEvent() });
      const { result } = await engine.execute();

      // workflow still completes despite notification failure
      expect(result).toMatchObject({
        status: 'created',
        candidateId: 'cand-nf',
        applicationId: 'app-nf',
        isNew: true,
      });

      // audit still recorded after notification failure
      expect(mockAuditService.emit).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 8. audit trail recorded with correct domain and metadata
  // -------------------------------------------------------------------------
  describe('audit trail', () => {
    it('records audit event with hr domain and correct metadata', async () => {
      mockLlmGateway.complete.mockResolvedValue(llmSuccessResponse());
      mockCandidateStore.findByEmail.mockResolvedValue(null);
      mockCandidateStore.create.mockResolvedValue({ id: 'cand-aud' });
      mockCandidateStore.findById.mockResolvedValue({
        id: 'cand-aud',
        name: 'John Doe',
        email: 'john@example.com',
        consentStatus: 'granted',
      });
      mockApplicationStore.create.mockResolvedValue({ id: 'app-aud' });

      const engine = engineFor(candidateFlowFn, { events: triggerEvent() });
      await engine.execute();

      expect(mockAuditService.emit).toHaveBeenCalledTimes(1);
      expect(mockAuditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          // S18-A1: 'system' aligns with the centralized taxonomy —
          // external trigger (resume submission webhook), not internal
          // maintenance work. Same NULL user_id outcome as 'workflow'.
          actor: { id: 'system', type: 'system' },
          action: 'hr.application.received',
          resource: { type: 'application', id: 'app-aud' },
          domain: 'hr',
          metadata: expect.objectContaining({
            candidateId: 'cand-aud',
            isNewCandidate: true,
            source: 'website',
            positionId: 'pos-123',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 9. candidate store create failure → error at create-candidate step
  // -------------------------------------------------------------------------
  describe('candidate store failure', () => {
    it('returns error at create-candidate step when store throws', async () => {
      mockLlmGateway.complete.mockResolvedValue(llmSuccessResponse());
      mockCandidateStore.findByEmail.mockResolvedValue(null);
      mockCandidateStore.create.mockRejectedValue(new Error('DB connection lost'));

      const engine = engineFor(candidateFlowFn, { events: triggerEvent() });
      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'error',
        step: 'create-candidate',
        error: 'DB connection lost',
      });

      // no notification or audit calls after failure
      expect(mockNotificationService.send).not.toHaveBeenCalled();
      expect(mockAuditService.emit).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 10. no positionId — application created with undefined position
  // -------------------------------------------------------------------------
  describe('no positionId in event', () => {
    it('creates application without positionId and uses "unspecified" in notification', async () => {
      mockLlmGateway.complete.mockResolvedValue(llmSuccessResponse());
      mockCandidateStore.findByEmail.mockResolvedValue(null);
      mockCandidateStore.create.mockResolvedValue({ id: 'cand-nopos' });
      mockCandidateStore.findById.mockResolvedValue({
        id: 'cand-nopos',
        name: 'John Doe',
        email: 'john@example.com',
        consentStatus: 'granted',
      });
      mockApplicationStore.create.mockResolvedValue({ id: 'app-nopos' });

      const engine = engineFor(candidateFlowFn, {
        events: triggerEvent({ positionId: undefined }),
      });
      const { result } = await engine.execute();

      expect(result).toMatchObject({ status: 'created' });

      // application created without positionId
      expect(mockApplicationStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: undefined,
        }),
      );

      // recruiter notification uses 'unspecified' for position
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          templateSlug: 'hr-new-application',
          variables: expect.objectContaining({
            position: 'unspecified',
          }),
        }),
      );
    });
  });
});
