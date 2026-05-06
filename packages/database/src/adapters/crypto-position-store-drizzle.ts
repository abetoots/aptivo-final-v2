/**
 * S18-B1: Crypto live-trade position store adapter.
 *
 * Backs the `crypto_positions` table (see
 * packages/database/src/schema/crypto-positions.ts). Three call
 * surfaces drive the lifecycle:
 *
 *   - `create()` from the live-trade workflow's `execute-live` step
 *     after the exchange MCP adapter reports a fill
 *   - `findOpen()` from the position-monitor cron every 30s
 *   - `close()` from the monitor when SL/TP crosses, or from an
 *     admin override route on a manual close
 *
 * Numeric column conventions match the rest of the crypto stores:
 * Drizzle's pg adapter returns NUMERIC columns as strings so the
 * adapter passes them through unchanged. Conversion to number happens
 * at consumer boundaries where the precision loss of float math is
 * acceptable (e.g. SL/TP comparisons in the cron).
 */

import { and, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { cryptoPositions } from '../schema/crypto-positions.js';

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

/**
 * Why a position closed:
 *   - 'sl': stop-loss crossed; cron-triggered exit
 *   - 'tp': take-profit crossed; cron-triggered exit
 *   - 'manual': admin override or HITL-driven close
 */
export type PositionExitReason = 'sl' | 'tp' | 'manual';

export interface CryptoPositionStore {
  /**
   * Insert a new open position. All numeric inputs are strings to
   * preserve precision through the pg NUMERIC type.
   */
  create(input: {
    signalId?: string;
    departmentId: string;
    token: string;
    direction: 'long' | 'short';
    exchange: string;
    entryPrice: string;
    sizeUsd: string;
    slPrice: string;
    tpPrice: string;
    executedBy: string;
  }): Promise<{ id: string }>;

  findById(id: string): Promise<CryptoPositionRecord | null>;

  /**
   * Fetch open positions (closedAt IS NULL). The monitor cron iterates
   * this set; with the partial-index-equivalent on `closedAt` (regular
   * btree, see schema), the lookup is bounded by the live position
   * count which is small in practice.
   */
  findOpen(): Promise<CryptoPositionRecord[]>;

  /**
   * Fetch positions for `departmentId` that closed at or after `since`.
   * Used by the daily-loss circuit breaker (FR-CRYPTO-RISK-002) to sum
   * realized losses within the current UTC day. The
   * `(department_id, opened_at)` composite index supports this scan
   * efficiently when the time window is short.
   *
   * Returns only closed positions (closedAt >= since); open positions
   * carry no realized pnl and are excluded by the WHERE clause rather
   * than filtered client-side.
   */
  findClosedSince(departmentId: string, since: Date): Promise<CryptoPositionRecord[]>;

  /**
   * Atomically transition an open position to closed. Idempotent on a
   * second call with the same id (the WHERE clause filters out
   * already-closed rows).
   */
  close(
    id: string,
    args: {
      exitPrice: string;
      pnlUsd: string;
      exitReason: PositionExitReason;
    },
  ): Promise<void>;
}

export interface CryptoPositionRecord {
  id: string;
  signalId: string | null;
  departmentId: string;
  token: string;
  direction: string;
  exchange: string;
  entryPrice: string;
  sizeUsd: string;
  slPrice: string;
  tpPrice: string;
  exitPrice: string | null;
  pnlUsd: string | null;
  exitReason: string | null;
  executedBy: string;
  openedAt: Date;
  closedAt: Date | null;
}

// ---------------------------------------------------------------------------
// adapter factory
// ---------------------------------------------------------------------------

function rowToRecord(r: typeof cryptoPositions.$inferSelect): CryptoPositionRecord {
  return {
    id: r.id,
    signalId: r.signalId,
    departmentId: r.departmentId,
    token: r.token,
    direction: r.direction,
    exchange: r.exchange,
    entryPrice: r.entryPrice,
    sizeUsd: r.sizeUsd,
    slPrice: r.slPrice,
    tpPrice: r.tpPrice,
    exitPrice: r.exitPrice,
    pnlUsd: r.pnlUsd,
    exitReason: r.exitReason,
    executedBy: r.executedBy,
    openedAt: r.openedAt,
    closedAt: r.closedAt,
  };
}

export function createDrizzleCryptoPositionStore(db: DrizzleClient): CryptoPositionStore {
  return {
    async create(input) {
      const rows = await db
        .insert(cryptoPositions)
        .values({
          signalId: input.signalId ?? null,
          departmentId: input.departmentId,
          token: input.token,
          direction: input.direction,
          exchange: input.exchange,
          entryPrice: input.entryPrice,
          sizeUsd: input.sizeUsd,
          slPrice: input.slPrice,
          tpPrice: input.tpPrice,
          executedBy: input.executedBy,
        })
        .returning({ id: cryptoPositions.id });
      return { id: rows[0]!.id };
    },

    async findById(id) {
      const rows = await db
        .select()
        .from(cryptoPositions)
        .where(eq(cryptoPositions.id, id));
      if (rows.length === 0) return null;
      return rowToRecord(rows[0]!);
    },

    async findOpen() {
      const rows = await db
        .select()
        .from(cryptoPositions)
        .where(isNull(cryptoPositions.closedAt));
      return rows.map(rowToRecord);
    },

    async findClosedSince(departmentId, since) {
      const rows = await db
        .select()
        .from(cryptoPositions)
        .where(
          and(
            eq(cryptoPositions.departmentId, departmentId),
            isNotNull(cryptoPositions.closedAt),
            gte(cryptoPositions.closedAt, since),
          ),
        );
      return rows.map(rowToRecord);
    },

    async close(id, args) {
      // WHERE includes `closed_at IS NULL` so a duplicate call from a
      // crashed-and-retried cron run is a no-op rather than a clobber
      // of the original close metadata.
      await db
        .update(cryptoPositions)
        .set({
          exitPrice: args.exitPrice,
          pnlUsd: args.pnlUsd,
          exitReason: args.exitReason,
          closedAt: new Date(),
        })
        .where(and(eq(cryptoPositions.id, id), isNull(cryptoPositions.closedAt)));
    },
  };
}
