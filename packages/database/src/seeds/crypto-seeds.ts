/**
 * S6-INF-SEED: crypto domain RBAC, notification, and MCP seeds
 * @task S6-INF-SEED
 */

import type { DrizzleClient } from '../adapters/types.js';
import { rolePermissions } from '../schema/user-roles.js';
import { notificationTemplates } from '../schema/notifications.js';
import { mcpServers } from '../schema/mcp-registry.js';

// -- crypto rbac permissions --

export const CRYPTO_PERMISSIONS = [
  // trader role
  { role: 'trader', permission: 'crypto/signal.create' },
  { role: 'trader', permission: 'crypto/signal.view' },
  { role: 'trader', permission: 'crypto/trade.execute' },
  { role: 'trader', permission: 'crypto/trade.view' },
  { role: 'trader', permission: 'crypto/portfolio.view' },
  { role: 'trader', permission: 'crypto/wallet.view' },
  // trader-readonly role
  { role: 'trader-readonly', permission: 'crypto/signal.view' },
  { role: 'trader-readonly', permission: 'crypto/trade.view' },
  { role: 'trader-readonly', permission: 'crypto/portfolio.view' },
  { role: 'trader-readonly', permission: 'crypto/wallet.view' },
  // risk-manager role
  { role: 'risk-manager', permission: 'crypto/signal.view' },
  { role: 'risk-manager', permission: 'crypto/trade.view' },
  { role: 'risk-manager', permission: 'crypto/trade.pause' },
  { role: 'risk-manager', permission: 'crypto/portfolio.view' },
  { role: 'risk-manager', permission: 'crypto/wallet.view' },
  { role: 'risk-manager', permission: 'crypto/wallet.manage' },
] as const;

// -- crypto notification templates --

export const CRYPTO_TEMPLATES = [
  {
    slug: 'crypto-trade-alert',
    name: 'Crypto Trade Alert',
    domain: 'crypto',
    version: 1,
    isActive: true,
    emailTemplate: {
      subject: 'Trade Alert: {{token}} {{direction}}',
      body: 'A {{direction}} trade for {{token}} (size: ${{size}}) has been executed.',
    },
    variableSchema: { required: ['token', 'direction', 'size'] },
  },
  {
    slug: 'crypto-signal-approval',
    name: 'Crypto Signal Approval Request',
    domain: 'crypto',
    version: 1,
    isActive: true,
    emailTemplate: {
      subject: 'Signal Approval: {{token}}',
      body: 'A trade signal for {{token}} requires approval.\n\nReasoning: {{reasoning}}\nConfidence: {{confidenceScore}}%',
    },
    variableSchema: { required: ['token', 'reasoning', 'confidenceScore'] },
  },
] as const;

// -- crypto mcp servers --

export const CRYPTO_MCP_SERVERS = [
  {
    name: 'dexscreener',
    transport: 'http',
    command: 'https://api.dexscreener.com',
    description: 'Market data for DEX tokens',
    isEnabled: true,
  },
] as const;

// -- seed functions --

export async function seedCryptoRoles(db: DrizzleClient): Promise<{ insertedCount: number }> {
  let count = 0;
  for (const perm of CRYPTO_PERMISSIONS) {
    await db
      .insert(rolePermissions)
      .values(perm)
      .onConflictDoNothing();
    count++;
  }
  return { insertedCount: count };
}

export async function seedCryptoTemplates(db: DrizzleClient): Promise<{ insertedCount: number }> {
  let count = 0;
  for (const template of CRYPTO_TEMPLATES) {
    await db
      .insert(notificationTemplates)
      .values({ ...template })
      .onConflictDoNothing();
    count++;
  }
  return { insertedCount: count };
}

export async function seedCryptoMcpServers(db: DrizzleClient): Promise<{ insertedCount: number }> {
  let count = 0;
  for (const server of CRYPTO_MCP_SERVERS) {
    await db
      .insert(mcpServers)
      .values({ ...server })
      .onConflictDoNothing();
    count++;
  }
  return { insertedCount: count };
}

export async function seedAllCrypto(db: DrizzleClient): Promise<void> {
  await seedCryptoRoles(db);
  await seedCryptoTemplates(db);
  await seedCryptoMcpServers(db);
}
