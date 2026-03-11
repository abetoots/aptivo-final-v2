/**
 * NOTIF-01: Notification types and interfaces
 * @task NOTIF-01
 * @frd FR-CORE-NOTIF-001
 * @guidelines §2.1 (Functional core — Result types, factory pattern)
 *
 * Defines the generalized notification dispatch interfaces,
 * extending the HITL-08 Novu adapter pattern into a standalone package.
 */

import type { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// notification parameters
// ---------------------------------------------------------------------------

export interface NotificationParams {
  recipientId: string;
  channel: 'email' | 'telegram' | 'push';
  templateSlug: string;
  templateVersion?: number;
  variables: Record<string, unknown>;
  /** for dedup (same pattern as HITL-08 requestId → novu transactionId) */
  transactionId?: string;
  domain?: string;
}

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type NotificationError =
  | { _tag: 'DeliveryFailed'; message: string; cause: unknown; attempts: number }
  | { _tag: 'InvalidParams'; message: string }
  | { _tag: 'RecipientOptedOut'; recipientId: string; channel: string }
  | { _tag: 'TemplateNotFound'; slug: string; version?: number }
  | { _tag: 'RenderError'; message: string };

// ---------------------------------------------------------------------------
// adapter interfaces (NOTIF-01)
// ---------------------------------------------------------------------------

export interface AdapterSendParams {
  recipientId: string;
  channel: 'email' | 'telegram' | 'push';
  subject?: string;
  body: string;
  transactionId?: string;
  metadata?: Record<string, unknown>;
}

export interface SubscriberData {
  email?: string;
  phone?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationAdapter {
  send(params: AdapterSendParams): Promise<Result<{ id: string }, NotificationError>>;
  upsertSubscriber(id: string, data: SubscriberData): Promise<Result<void, NotificationError>>;
}

// ---------------------------------------------------------------------------
// preference store (per-channel opt-out)
// ---------------------------------------------------------------------------

export interface NotificationPreferenceStore {
  isOptedOut(userId: string, channel: string): Promise<boolean>;
  setOptOut(userId: string, channel: string, optedOut: boolean): Promise<void>;
}

// ---------------------------------------------------------------------------
// delivery log store (attempt tracking)
// ---------------------------------------------------------------------------

export interface DeliveryLogEntry {
  recipientId: string;
  channel: string;
  templateSlug: string;
  transactionId?: string;
  status: 'delivered' | 'failed' | 'opted_out';
  attempt: number;
  error?: string;
  deliveredAt?: Date;
}

export interface DeliveryLogStore {
  record(log: DeliveryLogEntry): Promise<void>;
}

// ---------------------------------------------------------------------------
// template types (NOTIF-02)
// ---------------------------------------------------------------------------

export interface TemplateRecord {
  slug: string;
  name: string;
  domain?: string;
  version: number;
  isActive: boolean;
  emailTemplate?: { subject: string; body: string } | null;
  telegramTemplate?: { body: string } | null;
  pushTemplate?: { title: string; body: string } | null;
  variableSchema?: Record<string, unknown> | null;
}

export interface TemplateRegistry {
  resolve(slug: string, version?: number, channel?: string): Promise<Result<TemplateRecord, NotificationError>>;
}

// ---------------------------------------------------------------------------
// service deps & interface
// ---------------------------------------------------------------------------

export interface NotificationServiceDeps {
  adapter: NotificationAdapter;
  preferenceStore: NotificationPreferenceStore;
  deliveryLogStore: DeliveryLogStore;
  templateRegistry: TemplateRegistry;
  maxRetries?: number;
  logger?: { warn: (msg: string, meta?: Record<string, unknown>) => void };
}

export interface NotificationService {
  send(params: NotificationParams): Promise<Result<{ deliveryId: string }, NotificationError>>;
  upsertSubscriber(id: string, data: SubscriberData): Promise<Result<void, NotificationError>>;
  setOptOut(userId: string, channel: string, optedOut: boolean): Promise<Result<void, NotificationError>>;
}
