/**
 * FW-04: Shared Types Package — EventEnvelope tests
 * @task FW-04
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { EventEnvelopeSchema } from '../src/schemas/event-envelope.js';
import type { EventEnvelope } from '../src/schemas/event-envelope.js';

// A simple data schema for testing
const TestPayloadSchema = z.object({
  userId: z.string(),
  action: z.string(),
});

const TestEnvelopeSchema = EventEnvelopeSchema(TestPayloadSchema);

// Valid ULID (26 chars, Crockford Base32)
const VALID_ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

const validEnvelope = {
  id: VALID_ULID,
  type: 'aptivo.user.created',
  source: 'user-service',
  time: '2026-01-15T10:30:00Z',
  dataContentType: 'application/json' as const,
  data: {
    userId: 'user-123',
    action: 'create',
  },
};

describe('EventEnvelopeSchema', () => {
  // -------------------------------------------------------------------------
  // Valid envelopes
  // -------------------------------------------------------------------------
  describe('valid envelopes', () => {
    it('parses a minimal valid envelope', () => {
      const result = TestEnvelopeSchema.safeParse(validEnvelope);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(VALID_ULID);
        expect(result.data.type).toBe('aptivo.user.created');
        expect(result.data.source).toBe('user-service');
        expect(result.data.dataContentType).toBe('application/json');
        expect(result.data.data).toStrictEqual({
          userId: 'user-123',
          action: 'create',
        });
      }
    });

    it('parses an envelope with optional correlationId', () => {
      const result = TestEnvelopeSchema.safeParse({
        ...validEnvelope,
        correlationId: 'corr-abc',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.correlationId).toBe('corr-abc');
      }
    });

    it('parses an envelope with optional causationId', () => {
      const result = TestEnvelopeSchema.safeParse({
        ...validEnvelope,
        causationId: 'cause-xyz',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.causationId).toBe('cause-xyz');
      }
    });

    it('parses an envelope with both correlationId and causationId', () => {
      const result = TestEnvelopeSchema.safeParse({
        ...validEnvelope,
        correlationId: 'corr-1',
        causationId: 'cause-1',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.correlationId).toBe('corr-1');
        expect(result.data.causationId).toBe('cause-1');
      }
    });

    it('parses a datetime with offset', () => {
      const result = TestEnvelopeSchema.safeParse({
        ...validEnvelope,
        time: '2026-01-15T10:30:00+05:30',
      });
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Invalid envelopes — missing required fields
  // -------------------------------------------------------------------------
  describe('missing required fields', () => {
    it('rejects when id is missing', () => {
      const { id: _, ...noId } = validEnvelope;
      const result = TestEnvelopeSchema.safeParse(noId);
      expect(result.success).toBe(false);
    });

    it('rejects when type is missing', () => {
      const { type: _, ...noType } = validEnvelope;
      const result = TestEnvelopeSchema.safeParse(noType);
      expect(result.success).toBe(false);
    });

    it('rejects when source is missing', () => {
      const { source: _, ...noSource } = validEnvelope;
      const result = TestEnvelopeSchema.safeParse(noSource);
      expect(result.success).toBe(false);
    });

    it('rejects when time is missing', () => {
      const { time: _, ...noTime } = validEnvelope;
      const result = TestEnvelopeSchema.safeParse(noTime);
      expect(result.success).toBe(false);
    });

    it('rejects when dataContentType is missing', () => {
      const { dataContentType: _, ...noContentType } = validEnvelope;
      const result = TestEnvelopeSchema.safeParse(noContentType);
      expect(result.success).toBe(false);
    });

    it('rejects when data is missing', () => {
      const { data: _, ...noData } = validEnvelope;
      const result = TestEnvelopeSchema.safeParse(noData);
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Invalid envelopes — wrong types / formats
  // -------------------------------------------------------------------------
  describe('invalid field values', () => {
    it('rejects an invalid ULID for id', () => {
      const result = TestEnvelopeSchema.safeParse({
        ...validEnvelope,
        id: 'not-a-ulid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects a non-string id', () => {
      const result = TestEnvelopeSchema.safeParse({
        ...validEnvelope,
        id: 12345,
      });
      expect(result.success).toBe(false);
    });

    it('rejects an invalid datetime for time', () => {
      const result = TestEnvelopeSchema.safeParse({
        ...validEnvelope,
        time: 'not-a-date',
      });
      expect(result.success).toBe(false);
    });

    it('rejects a wrong literal for dataContentType', () => {
      const result = TestEnvelopeSchema.safeParse({
        ...validEnvelope,
        dataContentType: 'text/plain',
      });
      expect(result.success).toBe(false);
    });

    it('rejects data that does not match the payload schema', () => {
      const result = TestEnvelopeSchema.safeParse({
        ...validEnvelope,
        data: { invalid: true },
      });
      expect(result.success).toBe(false);
    });

    it('rejects completely empty data object when fields are required', () => {
      const result = TestEnvelopeSchema.safeParse({
        ...validEnvelope,
        data: {},
      });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Generic data schema
  // -------------------------------------------------------------------------
  describe('parameterized data schema', () => {
    it('works with a different payload schema', () => {
      const OrderSchema = z.object({
        orderId: z.string().uuid(),
        total: z.number().positive(),
      });
      const OrderEnvelopeSchema = EventEnvelopeSchema(OrderSchema);

      const result = OrderEnvelopeSchema.safeParse({
        ...validEnvelope,
        data: {
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          total: 99.99,
        },
      });

      expect(result.success).toBe(true);
    });

    it('rejects invalid data for a different payload schema', () => {
      const OrderSchema = z.object({
        orderId: z.string().uuid(),
        total: z.number().positive(),
      });
      const OrderEnvelopeSchema = EventEnvelopeSchema(OrderSchema);

      const result = OrderEnvelopeSchema.safeParse({
        ...validEnvelope,
        data: {
          orderId: 'not-a-uuid',
          total: -5,
        },
      });

      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('rejects null input', () => {
      const result = TestEnvelopeSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it('rejects undefined input', () => {
      const result = TestEnvelopeSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it('rejects a non-object input', () => {
      const result = TestEnvelopeSchema.safeParse('a string');
      expect(result.success).toBe(false);
    });

    it('strips unknown properties', () => {
      const result = TestEnvelopeSchema.safeParse({
        ...validEnvelope,
        unknownField: 'should be stripped',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('unknownField');
      }
    });
  });

  // -------------------------------------------------------------------------
  // EventEnvelope type compatibility
  // -------------------------------------------------------------------------
  describe('EventEnvelope type', () => {
    it('satisfies the expected shape', () => {
      const envelope: EventEnvelope<{ userId: string }> = {
        id: VALID_ULID,
        type: 'test.event',
        source: 'test',
        time: '2026-01-01T00:00:00Z',
        dataContentType: 'application/json',
        data: { userId: '123' },
      };

      expect(envelope.id).toBe(VALID_ULID);
      expect(envelope.dataContentType).toBe('application/json');
    });

    it('allows optional correlation and causation ids', () => {
      const envelope: EventEnvelope<{ x: number }> = {
        id: VALID_ULID,
        type: 'test',
        source: 'test',
        time: '2026-01-01T00:00:00Z',
        dataContentType: 'application/json',
        data: { x: 1 },
        correlationId: 'c',
        causationId: 'ca',
      };

      expect(envelope.correlationId).toBe('c');
      expect(envelope.causationId).toBe('ca');
    });
  });
});
