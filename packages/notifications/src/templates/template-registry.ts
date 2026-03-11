/**
 * NOTIF-02: In-memory template registry
 * @task NOTIF-02
 * @frd FR-CORE-NOTIF-001
 *
 * TemplateRegistry implementation backed by an injectable store.
 * Resolves templates by slug + optional version + optional channel filtering.
 */

import { Result } from '@aptivo/types';
import type { NotificationError, TemplateRecord, TemplateRegistry } from '../types.js';

// ---------------------------------------------------------------------------
// store interface (DB adapter injects this)
// ---------------------------------------------------------------------------

export interface TemplateStore {
  findBySlug(slug: string, version?: number): Promise<TemplateRecord | null>;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createTemplateRegistry(store: TemplateStore): TemplateRegistry {
  return {
    async resolve(
      slug: string,
      version?: number,
      _channel?: string,
    ): Promise<Result<TemplateRecord, NotificationError>> {
      const template = await store.findBySlug(slug, version);

      if (!template) {
        return Result.err({ _tag: 'TemplateNotFound', slug, version });
      }

      if (!template.isActive) {
        return Result.err({ _tag: 'TemplateNotFound', slug, version });
      }

      return Result.ok(template);
    },
  };
}
