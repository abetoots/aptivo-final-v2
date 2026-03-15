/**
 * S7-HR-01: interview scheduling workflow
 * @task S7-HR-01
 * @frd docs/02-requirements/hr-domain-frd.md §CM-003
 *
 * pipeline: scheduling requested → check availability → propose slots →
 *           wait for selection → create calendar event → notify parties → audit
 */

import { inngest } from '../inngest.js';
import {
  getAuditService,
  getInterviewStore,
  getMcpWrapper,
  getNotificationService,
} from '../services.js';
import type { AuditEventInput } from '@aptivo/audit';

// ---------------------------------------------------------------------------
// result types
// ---------------------------------------------------------------------------

export type InterviewSchedulingResult =
  | { status: 'confirmed'; interviewId: string; dateTime: string }
  | { status: 'manual_intervention'; reason: string }
  | { status: 'canceled'; reason: string }
  | { status: 'error'; step: string; error: string };

// ---------------------------------------------------------------------------
// helper: emit audit event (fire-and-forget, never blocks)
// ---------------------------------------------------------------------------

async function emitAudit(input: AuditEventInput): Promise<void> {
  try {
    const auditService = getAuditService();
    await auditService.emit(input);
  } catch {
    // non-blocking
  }
}

// ---------------------------------------------------------------------------
// inngest function
// ---------------------------------------------------------------------------

export const interviewSchedulingFn = inngest.createFunction(
  { id: 'hr-interview-scheduling', retries: 1 },
  { event: 'hr/interview.scheduling.requested' },
  async ({ event, step }): Promise<InterviewSchedulingResult> => {
    const { applicationId, interviewerId, interviewType, candidateEmail, candidateName } = event.data;

    // step 1: check-availability — query calendar MCP for free slots
    const availabilityResult = await step.run('check-availability', async () => {
      try {
        const mcpWrapper = getMcpWrapper();
        const result = await mcpWrapper.executeTool(
          'google-calendar',
          'getAvailableSlots',
          {
            userId: interviewerId,
            durationMinutes: interviewType === 'technical' ? 60 : 45,
            lookAheadDays: 7,
          },
        );

        if (!result.ok) {
          return { success: false as const, error: result.error._tag ?? 'MCP call failed' };
        }

        const slots = (result.value.content as { slots?: string[] })?.slots ?? [];
        return { success: true as const, slots };
      } catch (err: unknown) {
        return { success: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    if (!availabilityResult.success) {
      return { status: 'error', step: 'check-availability', error: availabilityResult.error };
    }

    // no available slots → manual intervention
    if (availabilityResult.slots.length === 0) {
      await step.run('audit-no-slots', () =>
        emitAudit({
          actor: { id: 'system', type: 'system' },
          action: 'hr.interview.no-slots',
          resource: { type: 'application', id: applicationId },
          domain: 'hr',
          metadata: { interviewerId, interviewType },
        }),
      );
      return { status: 'manual_intervention', reason: 'No available interviewer slots in next 7 days' };
    }

    // step 2: propose-slots — send top 3 slots to candidate
    const proposedSlots = availabilityResult.slots.slice(0, 3);

    await step.run('propose-slots', async () => {
      try {
        const notificationService = getNotificationService();
        await notificationService.send({
          recipientId: candidateEmail,
          channel: 'email',
          templateSlug: 'hr-interview-slots',
          variables: {
            candidateName,
            slots: proposedSlots.join(', '),
            interviewType,
          },
        });
      } catch {
        // non-blocking: candidate can still receive slots via other channels
      }
    });

    // step 3: wait-for-selection — candidate picks a slot (48h timeout)
    const selection = await step.waitForEvent('wait-for-slot-selection', {
      event: 'hr/interview.slot.selected',
      timeout: '48h',
      if: `async.data.interviewId == '${applicationId}'`,
    });

    if (selection === null) {
      // timeout → canceled
      await step.run('audit-timeout', () =>
        emitAudit({
          actor: { id: 'system', type: 'system' },
          action: 'hr.interview.selection-timeout',
          resource: { type: 'application', id: applicationId },
          domain: 'hr',
          metadata: { candidateEmail, proposedSlots },
        }),
      );
      return { status: 'canceled', reason: 'Candidate did not select a slot within 48 hours' };
    }

    const selectedSlot = (selection.data as { selectedSlot: string }).selectedSlot;

    // validate selected slot is in the proposed set — prevents arbitrary datetime injection
    if (!selectedSlot || !proposedSlots.includes(selectedSlot)) {
      return { status: 'error', step: 'slot-validation', error: 'Invalid slot selection' };
    }

    // step 4: create-event — create calendar event via MCP
    const calendarResult = await step.run('create-calendar-event', async () => {
      try {
        const mcpWrapper = getMcpWrapper();
        const result = await mcpWrapper.executeTool(
          'google-calendar',
          'createEvent',
          {
            title: `${interviewType} Interview — ${candidateName}`,
            dateTime: selectedSlot,
            durationMinutes: interviewType === 'technical' ? 60 : 45,
            attendees: [candidateEmail, interviewerId],
          },
        );

        if (!result.ok) {
          return { success: false as const, error: result.error._tag ?? 'Calendar event creation failed' };
        }

        return { success: true as const, eventId: (result.value.content as { eventId?: string })?.eventId ?? 'cal-event' };
      } catch (err: unknown) {
        return { success: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    if (!calendarResult.success) {
      return { status: 'error', step: 'create-calendar-event', error: calendarResult.error };
    }

    // update interviews table to confirmed
    await step.run('update-interview-status', async () => {
      try {
        const interviewStore = getInterviewStore();
        const interviews = await interviewStore.findByApplication(applicationId);
        const pending = interviews.find((i) => i.status === 'scheduled' || i.status === 'pending');
        if (pending) {
          await interviewStore.updateStatus(pending.id, 'confirmed');
        }
      } catch {
        // non-blocking — calendar event is the source of truth
      }
    });

    // step 5: notify-parties — send confirmation to candidate + interviewer
    await step.run('notify-parties', async () => {
      try {
        const notificationService = getNotificationService();
        await Promise.all([
          notificationService.send({
            recipientId: candidateEmail,
            channel: 'email',
            templateSlug: 'hr-interview-confirmed',
            variables: { candidateName, dateTime: selectedSlot, interviewType },
          }),
          notificationService.send({
            recipientId: interviewerId,
            channel: 'email',
            templateSlug: 'hr-interview-confirmed',
            variables: { candidateName, dateTime: selectedSlot, interviewType },
          }),
        ]);
      } catch {
        // non-blocking
      }
    });

    // step 6: audit-trail
    await step.run('audit-trail', () =>
      emitAudit({
        actor: { id: 'system', type: 'workflow' },
        action: 'hr.interview.scheduled',
        resource: { type: 'application', id: applicationId },
        domain: 'hr',
        metadata: {
          interviewerId,
          interviewType,
          dateTime: selectedSlot,
          calendarEventId: calendarResult.eventId,
          candidateEmail,
        },
      }),
    );

    return {
      status: 'confirmed',
      interviewId: applicationId,
      dateTime: selectedSlot,
    };
  },
);
