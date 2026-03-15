/**
 * S7-HR-01: interview scheduling workflow tests
 * @task S7-HR-01
 *
 * verifies the interview scheduling pipeline using @inngest/test
 * for deterministic step execution.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InngestTestEngine } from '@inngest/test';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// mock services — declared before vi.mock calls (hoisted)
// ---------------------------------------------------------------------------

const mockMcpWrapper = {
  executeTool: vi.fn(),
};

const mockAuditService = {
  emit: vi.fn(),
};

const mockNotificationService = {
  send: vi.fn(),
};

const mockInterviewStore = {
  findByApplication: vi.fn().mockResolvedValue([]),
  updateStatus: vi.fn().mockResolvedValue(undefined),
};

// ---------------------------------------------------------------------------
// mock modules
// ---------------------------------------------------------------------------

vi.mock('../src/lib/services', () => ({
  getMcpWrapper: () => mockMcpWrapper,
  getAuditService: () => mockAuditService,
  getNotificationService: () => mockNotificationService,
  getInterviewStore: () => mockInterviewStore,
}));

// ---------------------------------------------------------------------------
// import under test (after mocks are declared)
// ---------------------------------------------------------------------------

import { interviewSchedulingFn } from '../src/lib/workflows/hr-interview-scheduling.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// fresh engine per test to avoid mock handler cache contamination
const engineFor = (fn: any, opts?: Partial<InngestTestEngine.Options>) =>
  new InngestTestEngine({ function: fn, ...opts });

const triggerEvent = (overrides?: Record<string, unknown>) =>
  [
    {
      name: 'hr/interview.scheduling.requested' as const,
      data: {
        applicationId: 'app-1',
        interviewerId: 'interviewer-1',
        interviewType: 'technical',
        candidateEmail: 'candidate@example.com',
        candidateName: 'Jane Doe',
        ...overrides,
      },
    },
  ] as [any];

// default available slots returned by calendar MCP
const defaultSlots = [
  '2026-03-15T10:00:00Z',
  '2026-03-15T14:00:00Z',
  '2026-03-16T09:00:00Z',
  '2026-03-16T15:00:00Z',
];

// default MCP success response for availability check
const mcpAvailabilitySuccess = () =>
  Result.ok({
    content: { slots: defaultSlots },
    isError: false,
    durationMs: 120,
  });

// default MCP success response for calendar event creation
const mcpCreateEventSuccess = () =>
  Result.ok({
    content: { eventId: 'cal-evt-1' },
    isError: false,
    durationMs: 200,
  });

// standard audit response
const auditSuccessResponse = () =>
  Result.ok({
    id: 'audit-001',
    previousHash: null,
    currentHash: 'abc123',
    sequence: 1,
    timestamp: new Date().toISOString(),
  });

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // default: audit succeeds
  mockAuditService.emit.mockResolvedValue(auditSuccessResponse());

  // default: notification succeeds
  mockNotificationService.send.mockResolvedValue(Result.ok({ deliveryId: 'notif-1' }));

  // default: interview store returns a pending interview for status update
  mockInterviewStore.findByApplication.mockResolvedValue([
    { id: 'int-1', applicationId: 'app-1', status: 'scheduled' },
  ]);
  mockInterviewStore.updateStatus.mockResolvedValue(undefined);

  // default: MCP availability returns slots, calendar creation succeeds
  mockMcpWrapper.executeTool.mockImplementation(
    async (_serverId: string, toolName: string) => {
      if (toolName === 'getAvailableSlots') return mcpAvailabilitySuccess();
      if (toolName === 'createEvent') return mcpCreateEventSuccess();
      return Result.err({ _tag: 'ToolNotFound', tool: toolName, server: _serverId });
    },
  );
});

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('S7-HR-01: Interview Scheduling Workflow', () => {
  // -------------------------------------------------------------------------
  // 1. happy path: slots found → candidate selects → calendar event → confirmed
  // -------------------------------------------------------------------------
  describe('happy path', () => {
    it('finds slots, proposes to candidate, creates calendar event after selection, and records audit', async () => {
      const engine = engineFor(interviewSchedulingFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-slot-selection',
            handler: () => ({
              name: 'hr/interview.slot.selected',
              data: {
                interviewId: 'app-1',
                selectedSlot: '2026-03-15T10:00:00Z',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'confirmed',
        interviewId: 'app-1',
        dateTime: '2026-03-15T10:00:00Z',
      });

      // verify MCP called for availability
      expect(mockMcpWrapper.executeTool).toHaveBeenCalledWith(
        'google-calendar',
        'getAvailableSlots',
        expect.objectContaining({
          userId: 'interviewer-1',
          durationMinutes: 60, // technical = 60
          lookAheadDays: 7,
        }),
      );

      // verify slot proposal notification sent
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'candidate@example.com',
          templateSlug: 'hr-interview-slots',
        }),
      );

      // verify MCP called for calendar event creation
      expect(mockMcpWrapper.executeTool).toHaveBeenCalledWith(
        'google-calendar',
        'createEvent',
        expect.objectContaining({
          dateTime: '2026-03-15T10:00:00Z',
          attendees: ['candidate@example.com', 'interviewer-1'],
        }),
      );

      // verify confirmation notifications sent (candidate + interviewer)
      const confirmCalls = vi.mocked(mockNotificationService.send).mock.calls.filter(
        ([arg]) => arg.templateSlug === 'hr-interview-confirmed',
      );
      expect(confirmCalls).toHaveLength(2);

      // verify audit trail recorded
      expect(mockAuditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { id: 'system', type: 'workflow' },
          action: 'hr.interview.scheduled',
          resource: { type: 'application', id: 'app-1' },
          domain: 'hr',
          metadata: expect.objectContaining({
            interviewerId: 'interviewer-1',
            interviewType: 'technical',
            dateTime: '2026-03-15T10:00:00Z',
            calendarEventId: 'cal-evt-1',
            candidateEmail: 'candidate@example.com',
          }),
        }),
      );
    });

    it('uses 45-minute duration for non-technical interviews', async () => {
      const engine = engineFor(interviewSchedulingFn, {
        events: triggerEvent({ interviewType: 'behavioral' }),
        steps: [
          {
            id: 'wait-for-slot-selection',
            handler: () => ({
              name: 'hr/interview.slot.selected',
              data: {
                interviewId: 'app-1',
                selectedSlot: '2026-03-15T10:00:00Z',
              },
            }),
          },
        ],
      });

      await engine.execute();

      // verify availability request uses 45 minutes for behavioral
      expect(mockMcpWrapper.executeTool).toHaveBeenCalledWith(
        'google-calendar',
        'getAvailableSlots',
        expect.objectContaining({
          durationMinutes: 45,
        }),
      );

      // verify calendar event also uses 45 minutes
      expect(mockMcpWrapper.executeTool).toHaveBeenCalledWith(
        'google-calendar',
        'createEvent',
        expect.objectContaining({
          durationMinutes: 45,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. no available slots → manual_intervention
  // -------------------------------------------------------------------------
  describe('no available slots', () => {
    it('returns manual_intervention when no interviewer slots are available', async () => {
      mockMcpWrapper.executeTool.mockResolvedValue(
        Result.ok({
          content: { slots: [] },
          isError: false,
          durationMs: 100,
        }),
      );

      const engine = engineFor(interviewSchedulingFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'manual_intervention',
        reason: 'No available interviewer slots in next 7 days',
      });

      // verify audit recorded for no-slots
      expect(mockAuditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'hr.interview.no-slots',
          resource: { type: 'application', id: 'app-1' },
          domain: 'hr',
        }),
      );

      // no notification or calendar event should be created
      expect(mockNotificationService.send).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. candidate timeout (48h) → canceled
  // -------------------------------------------------------------------------
  describe('candidate timeout', () => {
    it('returns canceled when candidate does not select a slot within 48 hours', async () => {
      const engine = engineFor(interviewSchedulingFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-slot-selection',
            handler: () => null, // simulates timeout
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'canceled',
        reason: 'Candidate did not select a slot within 48 hours',
      });

      // verify timeout audit recorded
      expect(mockAuditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'hr.interview.selection-timeout',
          resource: { type: 'application', id: 'app-1' },
          domain: 'hr',
          metadata: expect.objectContaining({
            candidateEmail: 'candidate@example.com',
          }),
        }),
      );

      // no calendar event should be created
      const createEventCalls = vi.mocked(mockMcpWrapper.executeTool).mock.calls.filter(
        ([, toolName]) => toolName === 'createEvent',
      );
      expect(createEventCalls).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 3b. slot validation — P1.5-07
  // -------------------------------------------------------------------------
  describe('slot validation (P1.5-07)', () => {
    it('rejects a slot not in the proposed set', async () => {
      const engine = engineFor(interviewSchedulingFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-slot-selection',
            handler: () => ({
              name: 'hr/interview.slot.selected',
              data: {
                interviewId: 'app-1',
                selectedSlot: '2099-01-01T00:00:00Z', // arbitrary slot not in proposed set
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'error',
        step: 'slot-validation',
        error: 'Invalid slot selection',
      });

      // calendar event should NOT be created
      const createCalls = vi.mocked(mockMcpWrapper.executeTool).mock.calls.filter(
        ([, toolName]) => toolName === 'createEvent',
      );
      expect(createCalls).toHaveLength(0);
    });

    it('rejects an empty slot selection', async () => {
      const engine = engineFor(interviewSchedulingFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-slot-selection',
            handler: () => ({
              name: 'hr/interview.slot.selected',
              data: {
                interviewId: 'app-1',
                selectedSlot: '',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'error',
        step: 'slot-validation',
        error: 'Invalid slot selection',
      });
    });

    it('accepts a valid slot from the proposed set', async () => {
      const engine = engineFor(interviewSchedulingFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-slot-selection',
            handler: () => ({
              name: 'hr/interview.slot.selected',
              data: {
                interviewId: 'app-1',
                selectedSlot: '2026-03-15T14:00:00Z', // second slot from defaultSlots
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'confirmed',
        interviewId: 'app-1',
        dateTime: '2026-03-15T14:00:00Z',
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. MCP failure on availability check → error at check-availability
  // -------------------------------------------------------------------------
  describe('MCP availability failure', () => {
    it('returns error when MCP availability check fails', async () => {
      mockMcpWrapper.executeTool.mockResolvedValue(
        Result.err({ _tag: 'TransportError', tool: 'getAvailableSlots', message: 'Connection refused' }),
      );

      const engine = engineFor(interviewSchedulingFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'error',
        step: 'check-availability',
        error: 'TransportError',
      });

      // no downstream steps should execute
      expect(mockNotificationService.send).not.toHaveBeenCalled();
      expect(mockAuditService.emit).not.toHaveBeenCalled();
    });

    it('returns error when MCP throws an exception', async () => {
      mockMcpWrapper.executeTool.mockRejectedValue(new Error('Network timeout'));

      const engine = engineFor(interviewSchedulingFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'error',
        step: 'check-availability',
        error: 'Network timeout',
      });
    });
  });

  // -------------------------------------------------------------------------
  // 5. calendar event creation failure → error at create-calendar-event
  // -------------------------------------------------------------------------
  describe('calendar event creation failure', () => {
    it('returns error when calendar event creation fails via MCP', async () => {
      // availability succeeds, but createEvent fails
      mockMcpWrapper.executeTool.mockImplementation(
        async (_serverId: string, toolName: string) => {
          if (toolName === 'getAvailableSlots') return mcpAvailabilitySuccess();
          if (toolName === 'createEvent') {
            return Result.err({ _tag: 'TransportError', tool: 'createEvent', message: 'Calendar API down' });
          }
          return Result.err({ _tag: 'ToolNotFound', tool: toolName, server: _serverId });
        },
      );

      const engine = engineFor(interviewSchedulingFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-slot-selection',
            handler: () => ({
              name: 'hr/interview.slot.selected',
              data: {
                interviewId: 'app-1',
                selectedSlot: '2026-03-15T10:00:00Z',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'error',
        step: 'create-calendar-event',
        error: 'TransportError',
      });

      // no confirmation notifications should be sent
      const confirmCalls = vi.mocked(mockNotificationService.send).mock.calls.filter(
        ([arg]) => arg.templateSlug === 'hr-interview-confirmed',
      );
      expect(confirmCalls).toHaveLength(0);

      // no final audit trail
      const auditCalls = vi.mocked(mockAuditService.emit).mock.calls.filter(
        ([arg]) => arg.action === 'hr.interview.scheduled',
      );
      expect(auditCalls).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 6. notification failure is non-blocking → workflow still completes
  // -------------------------------------------------------------------------
  describe('notification failure is non-blocking', () => {
    it('completes workflow even when slot proposal notification fails', async () => {
      mockNotificationService.send.mockRejectedValue(new Error('Email service down'));

      const engine = engineFor(interviewSchedulingFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-slot-selection',
            handler: () => ({
              name: 'hr/interview.slot.selected',
              data: {
                interviewId: 'app-1',
                selectedSlot: '2026-03-15T10:00:00Z',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      // workflow should still complete despite notification failure
      expect(result).toMatchObject({
        status: 'confirmed',
        interviewId: 'app-1',
        dateTime: '2026-03-15T10:00:00Z',
      });

      // audit trail still recorded
      expect(mockAuditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'hr.interview.scheduled',
        }),
      );
    });

    it('completes workflow even when confirmation notification fails', async () => {
      // first call (propose-slots) succeeds, subsequent calls (notify-parties) fail
      let callCount = 0;
      mockNotificationService.send.mockImplementation(async () => {
        callCount++;
        if (callCount > 1) throw new Error('Notification gateway down');
        return Result.ok({ deliveryId: 'notif-1' });
      });

      const engine = engineFor(interviewSchedulingFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-slot-selection',
            handler: () => ({
              name: 'hr/interview.slot.selected',
              data: {
                interviewId: 'app-1',
                selectedSlot: '2026-03-15T10:00:00Z',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'confirmed',
        interviewId: 'app-1',
      });
    });
  });
});
