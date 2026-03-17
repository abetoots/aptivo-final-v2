/**
 * FW-02: Database Package
 * @task FW-02
 * @spec docs/04-specs/database.md
 * @see docs/04-specs/common-patterns.md §2 (Result types for DB operations)
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema/index.js';

/** optional pool configuration passed through to the underlying driver */
export interface PoolOptions {
  max?: number;
  idleTimeoutMs?: number;
}

export const createDatabase = (connectionString: string, poolOptions?: PoolOptions) => {
  return drizzle(connectionString, {
    schema,
    ...(poolOptions ? { connection: { max: poolOptions.max, idleTimeoutMillis: poolOptions.idleTimeoutMs } } : {}),
  });
};

export type Database = ReturnType<typeof createDatabase>;
