/**
 * S6-CF-04: shared drizzle client type for all adapters
 * @task S6-CF-04
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DrizzleClient = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  execute: (query: any) => Promise<any>;
  transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T>;
};
