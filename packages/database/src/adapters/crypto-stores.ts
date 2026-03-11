/**
 * S6-INF-CRY: crypto domain store adapters
 * @task S6-INF-CRY
 * @frd docs/02-requirements/crypto-domain-frd.md §2.1
 */

import { eq } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import {
  monitoredWallets,
  tradeSignals,
  tradeExecutions,
  portfolioStates,
} from '../schema/crypto-domain.js';

// -- store interfaces --

export interface WalletStore {
  create(wallet: {
    address: string;
    chain: string;
    label?: string;
    thresholdUsd?: string;
  }): Promise<{ id: string }>;
  findById(id: string): Promise<WalletRecord | null>;
  findAll(): Promise<WalletRecord[]>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
}

export interface WalletRecord {
  id: string;
  address: string;
  chain: string;
  label: string | null;
  thresholdUsd: string | null;
  isEnabled: boolean | null;
}

export interface TradeSignalStore {
  create(signal: {
    token: string;
    direction: string;
    entryZone?: string;
    stopLoss?: string;
    takeProfit?: string;
    reasoning?: string;
    confidenceScore?: string;
    status: string;
    expiresAt?: Date;
  }): Promise<{ id: string }>;
  findPending(): Promise<TradeSignalRecord[]>;
  updateStatus(id: string, status: string): Promise<void>;
  findById(id: string): Promise<TradeSignalRecord | null>;
}

export interface TradeSignalRecord {
  id: string;
  token: string;
  direction: string;
  entryZone: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
  reasoning: string | null;
  confidenceScore: string | null;
  status: string;
  expiresAt: Date | null;
  createdAt: Date | null;
}

export interface TradeExecutionStore {
  create(execution: {
    signalId: string;
    exchange: string;
    entryPrice?: string;
    sizeUsd?: string;
    status: string;
    isPaper: boolean;
    riskData?: Record<string, unknown>;
  }): Promise<{ id: string }>;
  findOpen(): Promise<TradeExecutionRecord[]>;
  close(id: string, exitPrice: string, pnlUsd: string): Promise<void>;
  findById(id: string): Promise<TradeExecutionRecord | null>;
}

export interface TradeExecutionRecord {
  id: string;
  signalId: string | null;
  exchange: string;
  entryPrice: string | null;
  exitPrice: string | null;
  sizeUsd: string | null;
  pnlUsd: string | null;
  status: string;
  isPaper: boolean;
  riskData: unknown;
  openedAt: Date | null;
  closedAt: Date | null;
}

// -- adapter factories --

export function createDrizzleWalletStore(db: DrizzleClient): WalletStore {
  return {
    async create(wallet) {
      const rows = await db
        .insert(monitoredWallets)
        .values(wallet)
        .returning({ id: monitoredWallets.id });
      return { id: rows[0]!.id };
    },

    async findById(id) {
      const rows = await db
        .select()
        .from(monitoredWallets)
        .where(eq(monitoredWallets.id, id));
      if (rows.length === 0) return null;
      const r = rows[0]!;
      return {
        id: r.id,
        address: r.address,
        chain: r.chain,
        label: r.label,
        thresholdUsd: r.thresholdUsd,
        isEnabled: r.isEnabled,
      };
    },

    async findAll() {
      const rows = await db.select().from(monitoredWallets);
      return rows.map((r: typeof monitoredWallets.$inferSelect) => ({
        id: r.id,
        address: r.address,
        chain: r.chain,
        label: r.label,
        thresholdUsd: r.thresholdUsd,
        isEnabled: r.isEnabled,
      }));
    },

    async setEnabled(id, enabled) {
      await db
        .update(monitoredWallets)
        .set({ isEnabled: enabled, updatedAt: new Date() })
        .where(eq(monitoredWallets.id, id));
    },
  };
}

export function createDrizzleTradeSignalStore(db: DrizzleClient): TradeSignalStore {
  return {
    async create(signal) {
      const rows = await db
        .insert(tradeSignals)
        .values(signal)
        .returning({ id: tradeSignals.id });
      return { id: rows[0]!.id };
    },

    async findPending() {
      const rows = await db
        .select()
        .from(tradeSignals)
        .where(eq(tradeSignals.status, 'pending'));
      return rows.map((r: typeof tradeSignals.$inferSelect) => ({
        id: r.id,
        token: r.token,
        direction: r.direction,
        entryZone: r.entryZone,
        stopLoss: r.stopLoss,
        takeProfit: r.takeProfit,
        reasoning: r.reasoning,
        confidenceScore: r.confidenceScore,
        status: r.status,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
      }));
    },

    async updateStatus(id, status) {
      await db
        .update(tradeSignals)
        .set({ status })
        .where(eq(tradeSignals.id, id));
    },

    async findById(id) {
      const rows = await db
        .select()
        .from(tradeSignals)
        .where(eq(tradeSignals.id, id));
      if (rows.length === 0) return null;
      const r = rows[0]!;
      return {
        id: r.id,
        token: r.token,
        direction: r.direction,
        entryZone: r.entryZone,
        stopLoss: r.stopLoss,
        takeProfit: r.takeProfit,
        reasoning: r.reasoning,
        confidenceScore: r.confidenceScore,
        status: r.status,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
      };
    },
  };
}

export function createDrizzleTradeExecutionStore(db: DrizzleClient): TradeExecutionStore {
  return {
    async create(execution) {
      const rows = await db
        .insert(tradeExecutions)
        .values(execution)
        .returning({ id: tradeExecutions.id });
      return { id: rows[0]!.id };
    },

    async findOpen() {
      const rows = await db
        .select()
        .from(tradeExecutions)
        .where(eq(tradeExecutions.status, 'open'));
      return rows.map((r: typeof tradeExecutions.$inferSelect) => ({
        id: r.id,
        signalId: r.signalId,
        exchange: r.exchange,
        entryPrice: r.entryPrice,
        exitPrice: r.exitPrice,
        sizeUsd: r.sizeUsd,
        pnlUsd: r.pnlUsd,
        status: r.status,
        isPaper: r.isPaper,
        riskData: r.riskData,
        openedAt: r.openedAt,
        closedAt: r.closedAt,
      }));
    },

    async close(id, exitPrice, pnlUsd) {
      await db
        .update(tradeExecutions)
        .set({
          exitPrice,
          pnlUsd,
          status: 'closed',
          closedAt: new Date(),
        })
        .where(eq(tradeExecutions.id, id));
    },

    async findById(id) {
      const rows = await db
        .select()
        .from(tradeExecutions)
        .where(eq(tradeExecutions.id, id));
      if (rows.length === 0) return null;
      const r = rows[0]!;
      return {
        id: r.id,
        signalId: r.signalId,
        exchange: r.exchange,
        entryPrice: r.entryPrice,
        exitPrice: r.exitPrice,
        sizeUsd: r.sizeUsd,
        pnlUsd: r.pnlUsd,
        status: r.status,
        isPaper: r.isPaper,
        riskData: r.riskData,
        openedAt: r.openedAt,
        closedAt: r.closedAt,
      };
    },
  };
}
