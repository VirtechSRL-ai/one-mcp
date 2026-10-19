import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});
export const db = drizzle(pool);
export async function query<T = Record<string, any>>(
  sql: string,
  args: unknown[] = [],
): Promise<T[]> {
  return (await pool.query(sql, args)).rows;
}
export async function transaction<T>(fn: (q: typeof query) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const result = await fn(async (s, a) => (await c.query(s, a)).rows);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
