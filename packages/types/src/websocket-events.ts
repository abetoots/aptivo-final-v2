/**
 * WFE3-02: WebSocket frame schemas — canonical protocol contract (v1.0).
 *
 * Implements `docs/04-specs/websocket-lifecycle.md`. These Zod schemas are
 * the authoritative frame definitions for both the server (apps/ws-server)
 * and any future UI consumer (Phase 3.5 UI-F). Any protocol change MUST
 * go through this file — the server parses every inbound frame against
 * these schemas.
 *
 * Frozen for v1.0 at Sprint 16 end (per the WFE3-02 acceptance gate).
 * v1.1 changes require explicit migration notes in this header.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// inbound frames (client → server)
// ---------------------------------------------------------------------------

export const AuthFrameSchema = z.object({
  type: z.literal('auth'),
  token: z.string().min(1),
});

export const SubscribeFrameSchema = z.object({
  type: z.literal('subscribe'),
  topic: z.string().min(1),
});

export const UnsubscribeFrameSchema = z.object({
  type: z.literal('unsubscribe'),
  topic: z.string().min(1),
});

export const PongFrameSchema = z.object({
  type: z.literal('pong'),
});

export const ResumeFrameSchema = z.object({
  type: z.literal('resume'),
  topic: z.string().min(1),
  lastEventId: z.string().min(1),
});

export const InboundFrameSchema = z.discriminatedUnion('type', [
  AuthFrameSchema,
  SubscribeFrameSchema,
  UnsubscribeFrameSchema,
  PongFrameSchema,
  ResumeFrameSchema,
]);

export type AuthFrame = z.infer<typeof AuthFrameSchema>;
export type SubscribeFrame = z.infer<typeof SubscribeFrameSchema>;
export type UnsubscribeFrame = z.infer<typeof UnsubscribeFrameSchema>;
export type PongFrame = z.infer<typeof PongFrameSchema>;
export type ResumeFrame = z.infer<typeof ResumeFrameSchema>;
export type InboundFrame = z.infer<typeof InboundFrameSchema>;

// ---------------------------------------------------------------------------
// outbound frames (server → client)
// ---------------------------------------------------------------------------

export const AuthRequiredFrameSchema = z.object({
  type: z.literal('auth_required'),
});

export const AuthOkFrameSchema = z.object({
  type: z.literal('auth_ok'),
  userId: z.string(),
  roles: z.array(z.string()),
});

export const AuthFailedFrameSchema = z.object({
  type: z.literal('auth_failed'),
  reason: z.string(),
});

export const SubscribeOkFrameSchema = z.object({
  type: z.literal('subscribe_ok'),
  topic: z.string(),
});

export const EventFrameSchema = z.object({
  type: z.literal('event'),
  topic: z.string(),
  eventId: z.string(),
  timestamp: z.string().datetime({ offset: true }),
  data: z.unknown(),
});

export const PingFrameSchema = z.object({
  type: z.literal('ping'),
});

export const FullSyncFrameSchema = z.object({
  type: z.literal('full_sync'),
  topic: z.string(),
  reason: z.string().optional(),
});

export const ReconnectFrameSchema = z.object({
  type: z.literal('reconnect'),
  reason: z.string(),
  retryAfterMs: z.number().int().nonnegative().optional(),
});

export const ErrorFrameSchema = z.object({
  type: z.literal('error'),
  code: z.number().int(),
  message: z.string(),
  topic: z.string().optional(),
});

export const OutboundFrameSchema = z.discriminatedUnion('type', [
  AuthRequiredFrameSchema,
  AuthOkFrameSchema,
  AuthFailedFrameSchema,
  SubscribeOkFrameSchema,
  EventFrameSchema,
  PingFrameSchema,
  FullSyncFrameSchema,
  ReconnectFrameSchema,
  ErrorFrameSchema,
]);

export type AuthRequiredFrame = z.infer<typeof AuthRequiredFrameSchema>;
export type AuthOkFrame = z.infer<typeof AuthOkFrameSchema>;
export type AuthFailedFrame = z.infer<typeof AuthFailedFrameSchema>;
export type SubscribeOkFrame = z.infer<typeof SubscribeOkFrameSchema>;
export type EventFrame = z.infer<typeof EventFrameSchema>;
export type PingFrame = z.infer<typeof PingFrameSchema>;
export type FullSyncFrame = z.infer<typeof FullSyncFrameSchema>;
export type ReconnectFrame = z.infer<typeof ReconnectFrameSchema>;
export type ErrorFrame = z.infer<typeof ErrorFrameSchema>;
export type OutboundFrame = z.infer<typeof OutboundFrameSchema>;

// ---------------------------------------------------------------------------
// WebSocket close codes
// ---------------------------------------------------------------------------

export const WsCloseCodes = {
  /** Normal close (1000) — no reconnect */
  NormalClose: 1000,
  /** Going away (1001) — deployment, auto-reconnect */
  GoingAway: 1001,
  /** Policy violation (1008) — auth failures / heartbeat misses */
  PolicyViolation: 1008,
  /** Server error (1011) — reconnect with backoff */
  ServerError: 1011,
  /** Try again later (1013) — used for backpressure disconnect */
  TryAgainLater: 1013,
  /** App: auth timeout (4001) — re-authenticate */
  AuthTimeout: 4001,
  /** App: rate limited (4002) — retry after delay */
  RateLimited: 4002,
  /** App: token expired mid-session (4003) — re-authenticate; new in WFE3-02 */
  TokenExpired: 4003,
} as const;

export type WsCloseCode = (typeof WsCloseCodes)[keyof typeof WsCloseCodes];
