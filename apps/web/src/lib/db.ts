/**
 * INT-W6: lazy-initialized drizzle client
 * @task INT-W6
 */

import { createDatabase, type Database } from '@aptivo/database';

// lazy singleton — avoids cold-start overhead and missing env at import time
let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL not set');
    }
    _db = createDatabase(connectionString);
  }
  return _db;
}
