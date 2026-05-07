/**
 * S18-B1: Crypto live-trading position lifecycle table.
 *
 * Distinct from `tradeExecutions` (S6-INF-CRY) — that table records
 * paper-trade fills and basic open/close state, but doesn't carry the
 * SL/TP prices the live-trade monitor cron compares current price
 * against. Rather than widen the existing table (which would force
 * paper trades to also persist SL/TP and pollute their fixture
 * shape), the live track gets its own table whose row is created when
 * a HITL-approved live trade fills and updated when the position
 * monitor closes it.
 *
 * Lifecycle:
 *   1. Workflow's `execute-live` step calls the exchange MCP adapter
 *      to fill an order, then inserts a row here with
 *      `closedAt = null`, SL/TP prices populated.
 *   2. The `crypto-position-monitor` Inngest cron polls open
 *      positions every 30s, calls `getCurrentPrice(symbol)` (or batch
 *      `getCurrentPrices` for many positions), compares against
 *      sl_price / tp_price, and closes the position via the same
 *      exchange adapter when crossed.
 *   3. Close emits `crypto.position.closed` with `exitReason` so
 *      reporting and the daily-loss circuit breaker can attribute.
 *
 * Why a separate table for live vs paper:
 *   - Paper trades use `tradeExecutions.isPaper = true`; live trades
 *     use this new `crypto_positions` table. Reporting can union
 *     when needed.
 *   - The monitor cron only needs to scan `crypto_positions WHERE
 *     closed_at IS NULL` — small index, fast lookup; doesn't have
 *     to filter `isPaper` semantics out of a join.
 *   - SL/TP semantics are live-trade specific (paper trades exit on
 *     wall-clock or manual close in the existing scaffold).
 *
 * Audit attribution: `executedBy` carries the HITL approver's
 * userId (S18-A1's actor-propagation closure). The position-close
 * audit emit attributes to that user too — anomaly aggregate scopes
 * by audit_logs.user_id, which only populates when actor.type='user'.
 */

import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tradeSignals } from './crypto-domain.js';
import { departments } from './departments.js';

export const cryptoPositions = pgTable(
  'crypto_positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** trade signal that authorized this position; FK informational only */
    signalId: uuid('signal_id').references(() => tradeSignals.id),

    /** department whose live-trading budget this position counts against */
    departmentId: uuid('department_id').references(() => departments.id).notNull(),

    /** token symbol (e.g. 'ETH', 'BTC') — used by the monitor cron */
    token: varchar('token', { length: 50 }).notNull(),

    /** trade direction; determines SL/TP comparison sense in the monitor */
    direction: varchar('direction', { length: 10 }).notNull(), // long | short

    /** exchange identifier (e.g. 'binance', 'coinbase'); 'paper' is reserved for the paper-trade scaffold */
    exchange: varchar('exchange', { length: 50 }).notNull(),

    /** fill price reported by the exchange MCP adapter on entry */
    entryPrice: numeric('entry_price', { precision: 18, scale: 8 }).notNull(),

    /** position size in USD; budget enforcement happens before insert */
    sizeUsd: numeric('size_usd', { precision: 14, scale: 2 }).notNull(),

    /** stop-loss exit price; cron closes when price crosses this */
    slPrice: numeric('sl_price', { precision: 18, scale: 8 }).notNull(),

    /** take-profit exit price; cron closes when price crosses this */
    tpPrice: numeric('tp_price', { precision: 18, scale: 8 }).notNull(),

    /** fill price reported by the exchange MCP adapter on exit; null while open */
    exitPrice: numeric('exit_price', { precision: 18, scale: 8 }),

    /** realized PnL in USD; null while open */
    pnlUsd: numeric('pnl_usd', { precision: 14, scale: 2 }),

    /**
     * Why the position closed. Null while open.
     * - 'sl' / 'tp': monitor cron triggered the exit
     * - 'manual': admin override or HITL-driven close
     */
    exitReason: varchar('exit_reason', { length: 10 }), // sl | tp | manual | null

    /**
     * S18-A1: HITL approver who authorized the live trade. Stamped at
     * insert; the position-close audit emit attributes to this user
     * so audit_logs.user_id populates and the anomaly aggregate
     * matches per-user volume.
     *
     * Not declared as FK to users to avoid a cycle with the user
     * deletion / GDPR retention flows; treated as a free-form UUID
     * pointer with the constraint enforced at write time by the
     * workflow.
     */
    executedBy: uuid('executed_by').notNull(),

    openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    // monitor cron filters on `closed_at IS NULL` — partial index would
    // be ideal but Drizzle's pg-core doesn't expose partial WHERE
    // without raw SQL; a regular btree on closed_at is acceptable
    // since the open set is small (10s, not 100k+).
    index('crypto_positions_open_idx').on(table.closedAt),
    // daily-loss circuit breaker filters by `(departmentId, closedAt)`
    // since `findClosedSince` uses `WHERE department_id = $1 AND
    // closed_at >= $2`. Round-1 multi-model review (Codex MEDIUM)
    // caught that the prior `(departmentId, openedAt)` index didn't
    // serve this query — the optimizer would scan rather than seek
    // under load.
    index('crypto_positions_dept_closed_idx').on(table.departmentId, table.closedAt),
    // monitor cron groups by token for batch price lookup
    index('crypto_positions_token_idx').on(table.token),
    // Round-2 multi-model review (Gemini HIGH): a workflow re-run
    // (manual re-trigger or Inngest replay) would dedupe the venue
    // entry fill via `clientOrderId='live-${signalId}'` but still
    // create a SECOND position row with a fresh UUID. The cron would
    // then see two open positions and emit two DIFFERENT exit orders
    // (`clientOrderId='exit-${positionId}-${reason}'` differs because
    // positionId differs) — double-sell at the venue.
    //
    // The unique index on signal_id closes this. PostgreSQL UNIQUE
    // allows multiple NULLs by default (standard SQL semantics: two
    // NULLs are not equal), so admin-driven manual positions without
    // a backing signal can still coexist; only repeat-signalId rows
    // are blocked. The store's `create()` will surface the unique
    // violation as an error to the workflow's `store-position` step,
    // which is the correct behaviour for a defensive constraint.
    uniqueIndex('crypto_positions_signal_unique_idx').on(table.signalId),
  ],
);
