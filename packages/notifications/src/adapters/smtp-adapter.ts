/**
 * NOTIF2-01: SMTP notification adapter
 * @task NOTIF2-01
 *
 * implements NotificationAdapter via a MailTransport interface,
 * keeping nodemailer as an injected dependency for testability.
 */

import { Result } from '@aptivo/types';
import type {
  AdapterSendParams,
  NotificationAdapter,
  NotificationError,
  SubscriberData,
} from '../types.js';

// ---------------------------------------------------------------------------
// mail transport interface (injectable — no direct nodemailer dependency)
// ---------------------------------------------------------------------------

export interface MailTransport {
  sendMail(options: MailOptions): Promise<MailResult>;
}

export interface MailOptions {
  from: string;
  to: string;
  subject?: string;
  html: string;
}

export interface MailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

// ---------------------------------------------------------------------------
// smtp config
// ---------------------------------------------------------------------------

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure?: boolean;
}

// ---------------------------------------------------------------------------
// config validation
// ---------------------------------------------------------------------------

export function validateSmtpConfig(
  config: Partial<SmtpConfig>,
): Result<SmtpConfig, { message: string }> {
  if (!config.host) {
    return Result.err({ message: 'smtp config: host is required' });
  }
  if (!config.port || config.port < 1 || config.port > 65535) {
    return Result.err({ message: 'smtp config: port must be between 1 and 65535' });
  }
  if (!config.user) {
    return Result.err({ message: 'smtp config: user is required' });
  }
  if (!config.pass) {
    return Result.err({ message: 'smtp config: pass is required' });
  }
  if (!config.from) {
    return Result.err({ message: 'smtp config: from address is required' });
  }

  return Result.ok({
    host: config.host,
    port: config.port,
    user: config.user,
    pass: config.pass,
    from: config.from,
    secure: config.secure ?? config.port === 465,
  });
}

// ---------------------------------------------------------------------------
// adapter factory
// ---------------------------------------------------------------------------

export function createSmtpAdapter(
  transport: MailTransport,
  config: SmtpConfig,
): NotificationAdapter {
  return {
    async send(
      params: AdapterSendParams,
    ): Promise<Result<{ id: string }, NotificationError>> {
      // validate recipient
      if (!params.recipientId) {
        return Result.err({
          _tag: 'InvalidParams',
          message: 'smtp adapter: recipientId is required',
        });
      }

      try {
        const result = await transport.sendMail({
          from: config.from,
          to: params.recipientId,
          subject: params.subject,
          html: params.body,
        });

        // check for rejected recipients
        if (result.rejected.length > 0 && result.accepted.length === 0) {
          return Result.err({
            _tag: 'DeliveryFailed',
            message: `smtp: all recipients rejected: ${result.rejected.join(', ')}`,
            cause: result,
            attempts: 1,
          });
        }

        return Result.ok({ id: result.messageId });
      } catch (cause) {
        return Result.err({
          _tag: 'DeliveryFailed',
          message: cause instanceof Error
            ? cause.message
            : 'unknown smtp delivery error',
          cause,
          attempts: 1,
        });
      }
    },

    // smtp has no subscriber management — no-op
    async upsertSubscriber(
      _id: string,
      _data: SubscriberData,
    ): Promise<Result<void, NotificationError>> {
      return Result.ok(undefined);
    },
  };
}
