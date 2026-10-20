import { readFile } from "node:fs/promises";
import { pool, transaction } from "./db.js";
await transaction(async (q) => {
  await q("SELECT pg_advisory_xact_lock(712409)");
  await q(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz DEFAULT now())",
  );
  for (const [version, file] of [
    [1, "001_initial.sql"],
    [2, "002_client_oauth.sql"],
    [3, "003_oauth_families.sql"],
    [4, "004_oauth_browser_origin.sql"],
  ] as const) {
    if (
      !(
        await q("SELECT version FROM schema_migrations WHERE version=$1", [
          version,
        ])
      ).length
    ) {
      await q(
        await readFile(
          new URL(`../../../infrastructure/${file}`, import.meta.url),
          "utf8",
        ),
      );
      await q("INSERT INTO schema_migrations(version) VALUES($1)", [version]);
    }
  }
});
await pool.end();
