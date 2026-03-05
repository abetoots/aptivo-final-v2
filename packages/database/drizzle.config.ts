/**
 * FW-02: Database Package
 * @task FW-02
 * @spec docs/04-specs/database.md
 * @see docs/04-specs/common-patterns.md §2 (Result types for DB operations)
 */

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
