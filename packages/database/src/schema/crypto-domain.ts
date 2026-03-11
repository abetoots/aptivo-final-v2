/**
 * S6-INF-CRY: crypto domain schema
 * @task S6-INF-CRY
 * @frd docs/02-requirements/crypto-domain-frd.md §2.1
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  numeric,
  index,
} from 'drizzle-orm/pg-core';

// -- monitored wallets --

export const monitoredWallets = pgTable('monitored_wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  address: varchar('address', { length: 100 }).notNull(),
  chain: varchar('chain', { length: 20 }).notNull(), // base | arbitrum | optimism
  label: varchar('label', { length: 100 }),
  thresholdUsd: numeric('threshold_usd', { precision: 12, scale: 2 }).default('10000'),
  isEnabled: boolean('is_enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// -- trade signals --

export const tradeSignals = pgTable(
  'trade_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: varchar('token', { length: 50 }).notNull(),
    direction: varchar('direction', { length: 10 }).notNull(), // long | short
    entryZone: numeric('entry_zone', { precision: 18, scale: 8 }),
    stopLoss: numeric('stop_loss', { precision: 18, scale: 8 }),
    takeProfit: numeric('take_profit', { precision: 18, scale: 8 }),
    reasoning: text('reasoning'),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
    status: varchar('status', { length: 20 }).notNull(), // pending | approved | rejected | expired | executed
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('trade_signals_status_idx').on(table.status),
  ],
);

// -- trade executions --

export const tradeExecutions = pgTable(
  'trade_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    signalId: uuid('signal_id').references(() => tradeSignals.id),
    exchange: varchar('exchange', { length: 50 }).notNull(),
    entryPrice: numeric('entry_price', { precision: 18, scale: 8 }),
    exitPrice: numeric('exit_price', { precision: 18, scale: 8 }),
    sizeUsd: numeric('size_usd', { precision: 12, scale: 2 }),
    pnlUsd: numeric('pnl_usd', { precision: 12, scale: 2 }),
    status: varchar('status', { length: 20 }).notNull(), // open | closed | canceled
    isPaper: boolean('is_paper').notNull().default(true),
    riskData: jsonb('risk_data'),
    openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    index('trade_executions_status_idx').on(table.status),
  ],
);

// -- portfolio states --

export const portfolioStates = pgTable('portfolio_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  totalValueUsd: numeric('total_value_usd', { precision: 14, scale: 2 }),
  positions: jsonb('positions'), // array of { token, size, entryPrice, currentPrice }
  dailyPnlUsd: numeric('daily_pnl_usd', { precision: 12, scale: 2 }),
  drawdownPct: numeric('drawdown_pct', { precision: 5, scale: 2 }),
  snapshotAt: timestamp('snapshot_at', { withTimezone: true }).defaultNow(),
});

// -- security reports (SEC-001) --

export const securityReports = pgTable(
  'security_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenAddress: varchar('token_address', { length: 100 }).notNull(),
    chain: varchar('chain', { length: 20 }).notNull(),
    liquidityUsd: numeric('liquidity_usd', { precision: 14, scale: 2 }),
    isHoneypot: boolean('is_honeypot').notNull().default(false),
    isMintable: boolean('is_mintable').notNull().default(false),
    ownershipRenounced: boolean('ownership_renounced').default(false),
    riskScore: integer('risk_score').notNull(), // 0-100
    reasons: jsonb('reasons').default([]), // string[]
    status: varchar('status', { length: 20 }).notNull().default('completed'),
    scannedAt: timestamp('scanned_at', { withTimezone: true }).defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('security_reports_token_idx').on(table.tokenAddress, table.chain),
    index('security_reports_scanned_at_idx').on(table.scannedAt),
  ],
);
