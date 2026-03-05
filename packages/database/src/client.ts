/**
 * FW-02: Database Package
 * @task FW-02
 * @spec docs/04-specs/database.md
 * @see docs/04-specs/common-patterns.md §2 (Result types for DB operations)
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema/index.js';

export const createDatabase = (connectionString: string) => {
  return drizzle(connectionString, { schema });
};

export type Database = ReturnType<typeof createDatabase>;
