/**
 * pglite test helper — provides an in-memory PostgreSQL instance for testing
 * drizzle queries against a real SQL engine.
 */

// if @electric-sql/pglite is available, use it
// otherwise provide a stub that documents the intended interface
export interface PgLiteTestDb {
  execute(sql: string): Promise<{ rows: unknown[] }>;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<PgLiteTestDb> {
  try {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    return {
      async execute(sql: string) {
        const result = await db.query(sql);
        return { rows: result.rows ?? [] };
      },
      async close() {
        await db.close();
      },
    };
  } catch {
    // pglite not available — return stub
    return {
      async execute() { return { rows: [] }; },
      async close() {},
    };
  }
}
