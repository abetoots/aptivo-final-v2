/**
 * SP-04: Novu Notification Spike
 * @spike SP-04
 * @brd BO-CORE-004, BRD §6.5 (Build: Notifications)
 * @frd FR-CORE-NTF-001 through FR-CORE-NTF-004
 * @add ADD §7 (Notification Layer)
 * @warnings T1-W24, S3-W7 (Novu transactionId dedup window)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-04
 */

// spike validation: verify Novu integration for multi-channel notifications,
// template rendering, delivery tracking, and deduplication

import { Result } from '@aptivo/types';

export const SP_04_CONFIG = {
  name: 'SP-04: Novu Notifications',
  risk: 'HIGH' as const,
  validations: [
    'Novu SDK initialization and configuration',
    'Template creation and rendering',
    'Email channel delivery',
    'In-app notification delivery',
    'Subscriber management',
    'Delivery status tracking',
  ],
} as const;

// ---------------------------------------------------------------------------
// notification channel type
// ---------------------------------------------------------------------------

export type NotificationChannel = 'email' | 'in-app' | 'sms' | 'push' | 'chat';

// ---------------------------------------------------------------------------
// notification template
// ---------------------------------------------------------------------------

export interface NotificationTemplate {
  readonly id: string;
  readonly name: string;
  readonly channels: readonly NotificationChannel[];
  readonly content: string; // template string with {{variable}} placeholders
}

// ---------------------------------------------------------------------------
// template rendering
// ---------------------------------------------------------------------------

/**
 * Renders a notification template by replacing {{var}} placeholders with values.
 * Returns Result.err for missing variables.
 */
export const renderTemplate = (
  template: NotificationTemplate,
  variables: Record<string, string>,
): Result<string, string> => {
  const placeholderPattern = /\{\{(\w+(?:\.\w+)*)\}\}/g;
  const missingVars: string[] = [];
  let rendered = template.content;

  // first pass: find all placeholders and check for missing variables
  const matches = [...template.content.matchAll(placeholderPattern)];
  for (const match of matches) {
    const varName = match[1]!;
    if (!(varName in variables)) {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    return Result.err(`Missing template variables: ${missingVars.join(', ')}`);
  }

  // second pass: replace all placeholders
  rendered = template.content.replace(placeholderPattern, (_match, varName: string) => {
    return variables[varName]!;
  });

  return Result.ok(rendered);
};

// ---------------------------------------------------------------------------
// delivery status tracking
// ---------------------------------------------------------------------------

export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed';

interface DeliveryRecord {
  readonly deliveryId: string;
  readonly subscriberId: string;
  readonly templateId: string;
  readonly channel: NotificationChannel;
  readonly payload: Record<string, unknown>;
  status: DeliveryStatus;
  failureReason?: string;
  readonly createdAt: number;
}

/**
 * Tracks notification delivery lifecycle (pending -> sent -> delivered | failed).
 */
export class DeliveryTracker {
  private deliveries = new Map<string, DeliveryRecord>();
  private counter = 0;

  /**
   * Sends a notification and returns a delivery ID for tracking.
   */
  send(
    subscriberId: string,
    templateId: string,
    channel: NotificationChannel,
    payload: Record<string, unknown>,
  ): string {
    this.counter += 1;
    const deliveryId = `dlv-${this.counter.toString().padStart(6, '0')}`;
    this.deliveries.set(deliveryId, {
      deliveryId,
      subscriberId,
      templateId,
      channel,
      payload,
      status: 'pending',
      createdAt: Date.now(),
    });
    return deliveryId;
  }

  /**
   * Returns the current delivery status.
   */
  getStatus(deliveryId: string): Result<DeliveryStatus, string> {
    const record = this.deliveries.get(deliveryId);
    if (!record) {
      return Result.err(`Delivery not found: ${deliveryId}`);
    }
    return Result.ok(record.status);
  }

  /**
   * Returns the full delivery record.
   */
  getRecord(deliveryId: string): Result<DeliveryRecord, string> {
    const record = this.deliveries.get(deliveryId);
    if (!record) {
      return Result.err(`Delivery not found: ${deliveryId}`);
    }
    return Result.ok(record);
  }

  /**
   * Simulates successful delivery by advancing status to 'delivered'.
   */
  simulateDelivery(deliveryId: string): Result<void, string> {
    const record = this.deliveries.get(deliveryId);
    if (!record) {
      return Result.err(`Delivery not found: ${deliveryId}`);
    }
    // advance through the lifecycle: pending -> sent -> delivered
    record.status = 'delivered';
    return Result.ok(undefined);
  }

  /**
   * Simulates delivery failure by setting status to 'failed' with a reason.
   */
  simulateFailure(deliveryId: string, reason: string): Result<void, string> {
    const record = this.deliveries.get(deliveryId);
    if (!record) {
      return Result.err(`Delivery not found: ${deliveryId}`);
    }
    record.status = 'failed';
    record.failureReason = reason;
    return Result.ok(undefined);
  }

  /**
   * Marks a delivery as 'sent' (intermediate status between pending and delivered).
   */
  markSent(deliveryId: string): Result<void, string> {
    const record = this.deliveries.get(deliveryId);
    if (!record) {
      return Result.err(`Delivery not found: ${deliveryId}`);
    }
    record.status = 'sent';
    return Result.ok(undefined);
  }
}

// ---------------------------------------------------------------------------
// transaction deduplication (T1-W24 / S3-W7)
// ---------------------------------------------------------------------------

/**
 * Validates Novu transactionId deduplication behavior.
 * T1-W24 / S3-W7: the dedup window determines how long a transactionId
 * is considered a duplicate. Messages with the same transactionId within
 * the window are blocked; outside the window they are allowed.
 */
export class TransactionDedup {
  private seen = new Map<string, number>(); // transactionId -> timestamp
  private readonly windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  /**
   * Checks if a transactionId was already seen within the dedup window.
   */
  isDuplicate(transactionId: string): boolean {
    const recorded = this.seen.get(transactionId);
    if (recorded === undefined) {
      return false;
    }
    const elapsed = Date.now() - recorded;
    return elapsed < this.windowMs;
  }

  /**
   * Records a transactionId with the current timestamp.
   */
  record(transactionId: string): void {
    this.seen.set(transactionId, Date.now());
  }

  /**
   * Records a transactionId with a specific timestamp (for testing).
   */
  recordAt(transactionId: string, timestamp: number): void {
    this.seen.set(transactionId, timestamp);
  }

  /**
   * Returns the configured dedup window in milliseconds.
   */
  getWindowMs(): number {
    return this.windowMs;
  }
}

// ---------------------------------------------------------------------------
// subscriber management
// ---------------------------------------------------------------------------

interface SubscriberRecord {
  readonly subscriberId: string;
  channels: Set<NotificationChannel>;
}

/**
 * Manages notification subscriber preferences (channel opt-in/out).
 */
export class SubscriberManager {
  private subscribers = new Map<string, SubscriberRecord>();

  /**
   * Registers a subscriber with their preferred notification channels.
   */
  register(subscriberId: string, channels: NotificationChannel[]): void {
    this.subscribers.set(subscriberId, {
      subscriberId,
      channels: new Set(channels),
    });
  }

  /**
   * Returns the subscriber's channel preferences.
   */
  getPreferences(subscriberId: string): Result<NotificationChannel[], string> {
    const record = this.subscribers.get(subscriberId);
    if (!record) {
      return Result.err(`Subscriber not found: ${subscriberId}`);
    }
    return Result.ok([...record.channels]);
  }

  /**
   * Unsubscribes a subscriber from a specific channel.
   */
  unsubscribe(subscriberId: string, channel: NotificationChannel): Result<void, string> {
    const record = this.subscribers.get(subscriberId);
    if (!record) {
      return Result.err(`Subscriber not found: ${subscriberId}`);
    }
    record.channels.delete(channel);
    return Result.ok(undefined);
  }

  /**
   * Checks if a subscriber is registered.
   */
  isRegistered(subscriberId: string): boolean {
    return this.subscribers.has(subscriberId);
  }
}
