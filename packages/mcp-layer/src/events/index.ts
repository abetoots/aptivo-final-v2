/**
 * MCP-09: Events module barrel export
 */

export { createValidatedSender } from './validated-sender.js';
export { MCP_EVENT_SCHEMAS } from './event-schemas.js';

export type { McpEventName } from './event-schemas.js';

export type {
  EventSender,
  EventSchemaMap,
  ValidatedEventSender,
  ValidatedSendError,
  ValidatedSenderLogger,
} from './validated-sender.js';
