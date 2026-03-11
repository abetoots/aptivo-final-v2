/**
 * NOTIF-01: Notification service factory
 * @task NOTIF-01
 * @frd FR-CORE-NOTIF-001
 * @guidelines §2.1 (Functional core — Result types, factory pattern)
 *
 * createNotificationService(deps) — same factory pattern as createLlmGateway, createMcpWrapper.
 *
 * Pipeline:
 * 1. Validate params
 * 2. Resolve template
 * 3. Render body with variable substitution
 * 4. Check opt-out preference
 * 5. Send via adapter (with retries for transient failures)
 * 6. Log delivery attempt
 * 7. Return Result
 */

import { Result } from '@aptivo/types';
import { renderTemplate } from './templates/template-renderer.js';
import type {
  NotificationParams,
  NotificationError,
  NotificationService,
  NotificationServiceDeps,
  SubscriberData,
} from './types.js';

const DEFAULT_MAX_RETRIES = 3;

export function createNotificationService(deps: NotificationServiceDeps): NotificationService {
  const maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES;

  return {
    async send(params: NotificationParams): Promise<Result<{ deliveryId: string }, NotificationError>> {
      // 1. validate
      if (!params.recipientId || !params.channel || !params.templateSlug) {
        return Result.err({
          _tag: 'InvalidParams',
          message: 'Missing required fields: recipientId, channel, templateSlug',
        });
      }

      try {
        // 2. resolve template
        const templateResult = await deps.templateRegistry.resolve(
          params.templateSlug,
          params.templateVersion,
          params.channel,
        );
        if (!templateResult.ok) {
          return Result.err(templateResult.error);
        }
        const template = templateResult.value;

        // 3. render body
        const channelTemplate = getChannelTemplate(template, params.channel);
        if (!channelTemplate) {
          return Result.err({
            _tag: 'TemplateNotFound',
            slug: params.templateSlug,
            version: params.templateVersion,
          });
        }

        const bodyResult = renderTemplate(channelTemplate.body, params.variables, template.variableSchema);
        if (!bodyResult.ok) {
          return Result.err(bodyResult.error);
        }

        let subject: string | undefined;
        if ('subject' in channelTemplate && channelTemplate.subject) {
          const subjectResult = renderTemplate(channelTemplate.subject, params.variables, template.variableSchema);
          if (!subjectResult.ok) {
            return Result.err(subjectResult.error);
          }
          subject = subjectResult.value;
        }

        // 4. check opt-out
        const optedOut = await deps.preferenceStore.isOptedOut(params.recipientId, params.channel);
        if (optedOut) {
          await deps.deliveryLogStore.record({
            recipientId: params.recipientId,
            channel: params.channel,
            templateSlug: params.templateSlug,
            transactionId: params.transactionId,
            status: 'opted_out',
            attempt: 0,
          });
          return Result.err({
            _tag: 'RecipientOptedOut',
            recipientId: params.recipientId,
            channel: params.channel,
          });
        }

        // 5. send with retry + exponential backoff
        let lastError: unknown;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          // backoff before retry (not on first attempt)
          if (attempt > 1) {
            await sleep(backoffMs(attempt));
          }

          const sendResult = await deps.adapter.send({
            recipientId: params.recipientId,
            channel: params.channel,
            subject,
            body: bodyResult.value,
            transactionId: params.transactionId,
          });

          if (sendResult.ok) {
            // 6. log success
            await deps.deliveryLogStore.record({
              recipientId: params.recipientId,
              channel: params.channel,
              templateSlug: params.templateSlug,
              transactionId: params.transactionId,
              status: 'delivered',
              attempt,
              deliveredAt: new Date(),
            });
            return Result.ok({ deliveryId: sendResult.value.id });
          }

          lastError = sendResult.error;

          // log failed attempt
          await deps.deliveryLogStore.record({
            recipientId: params.recipientId,
            channel: params.channel,
            templateSlug: params.templateSlug,
            transactionId: params.transactionId,
            status: 'failed',
            attempt,
            error: 'message' in sendResult.error ? sendResult.error.message : sendResult.error._tag,
          });

          // only retry on DeliveryFailed (transient); other errors are permanent
          if (sendResult.error._tag !== 'DeliveryFailed') {
            return Result.err(sendResult.error);
          }
        }

        // all retries exhausted
        return Result.err({
          _tag: 'DeliveryFailed',
          message: 'All retry attempts exhausted',
          cause: lastError,
          attempts: maxRetries,
        });
      } catch (err) {
        deps.logger?.warn('notification send failed', { error: String(err) });
        return Result.err({
          _tag: 'DeliveryFailed',
          message: err instanceof Error ? err.message : 'Unexpected error during notification send',
          cause: err,
          attempts: 0,
        });
      }
    },

    async upsertSubscriber(id: string, data: SubscriberData): Promise<Result<void, NotificationError>> {
      return deps.adapter.upsertSubscriber(id, data);
    },

    async setOptOut(userId: string, channel: string, optedOut: boolean): Promise<Result<void, NotificationError>> {
      try {
        await deps.preferenceStore.setOptOut(userId, channel, optedOut);
        return Result.ok(undefined);
      } catch (err) {
        return Result.err({
          _tag: 'InvalidParams',
          message: `Failed to update opt-out preference: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** exponential backoff: 100ms, 200ms, 400ms, ... */
function backoffMs(attempt: number): number {
  return 100 * Math.pow(2, attempt - 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getChannelTemplate(
  template: { emailTemplate?: { subject: string; body: string } | null; telegramTemplate?: { body: string } | null; pushTemplate?: { title: string; body: string } | null },
  channel: 'email' | 'telegram' | 'push',
): { subject?: string; body: string } | null {
  switch (channel) {
    case 'email':
      return template.emailTemplate ?? null;
    case 'telegram':
      return template.telegramTemplate ?? null;
    case 'push':
      return template.pushTemplate ? { subject: template.pushTemplate.title, body: template.pushTemplate.body } : null;
  }
}
