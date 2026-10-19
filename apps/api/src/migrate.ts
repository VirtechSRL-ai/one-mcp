import { readFile } from "node:fs/promises";
import { pool, transaction } from "./db.js";
await transaction(async (q) => {
  await q("SELECT pg_advisory_xact_lock(712409)");
  await q(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz DEFAULT now())",
  );
  if (
    !(await q("SELECT version FROM schema_migrations WHERE version=1")).length
  ) {
    await q(
      await readFile(
        new URL("../../../infrastructure/001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    await q("INSERT INTO schema_migrations(version) VALUES(1)");
  }
});
await pool.end();
