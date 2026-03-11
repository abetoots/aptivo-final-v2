/**
 * INT-W2: Drizzle adapter for TemplateStore
 * @task INT-W2
 * @frd FR-CORE-NOTIF-001
 *
 * resolves notification templates by slug + optional version.
 * when version is omitted, returns the latest active version.
 */

import { eq, and, desc } from 'drizzle-orm';
import { notificationTemplates } from '../schema/notifications.js';
import type { TemplateStore, TemplateRecord } from '@aptivo/notifications';
import type { DrizzleClient } from './types.js';

// ---------------------------------------------------------------------------
// row -> TemplateRecord mapping (strips id, createdAt, updatedAt)
// ---------------------------------------------------------------------------

type TemplateRow = typeof notificationTemplates.$inferSelect;

function toTemplateRecord(row: TemplateRow): TemplateRecord {
  return {
    slug: row.slug,
    name: row.name,
    domain: row.domain ?? undefined,
    version: row.version,
    isActive: row.isActive,
    emailTemplate: row.emailTemplate as TemplateRecord['emailTemplate'] ?? null,
    telegramTemplate: row.telegramTemplate as TemplateRecord['telegramTemplate'] ?? null,
    pushTemplate: row.pushTemplate as TemplateRecord['pushTemplate'] ?? null,
    variableSchema: row.variableSchema as TemplateRecord['variableSchema'] ?? null,
  };
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createDrizzleTemplateStore(db: DrizzleClient): TemplateStore {
  return {
    async findBySlug(slug: string, version?: number): Promise<TemplateRecord | null> {
      if (version !== undefined) {
        // exact version lookup
        const rows = await db
          .select()
          .from(notificationTemplates)
          .where(
            and(
              eq(notificationTemplates.slug, slug),
              eq(notificationTemplates.version, version),
              eq(notificationTemplates.isActive, true),
            ),
          )
          .orderBy(desc(notificationTemplates.version))
          .limit(1);

        if (rows.length === 0) return null;
        return toTemplateRecord(rows[0]!);
      }

      // latest active version
      const rows = await db
        .select()
        .from(notificationTemplates)
        .where(
          and(
            eq(notificationTemplates.slug, slug),
            eq(notificationTemplates.isActive, true),
          ),
        )
        .orderBy(desc(notificationTemplates.version))
        .limit(1);

      if (rows.length === 0) return null;
      return toTemplateRecord(rows[0]!);
    },
  };
}
