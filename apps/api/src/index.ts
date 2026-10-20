import { buildApp } from "./app.js";
import { Service } from "./service.js";
import { pool, query } from "./db.js";
const base = process.env.PUBLIC_URL || "http://localhost:3000";
if (!process.env.VAULT_KEY)
  throw new Error("Set VAULT_KEY; run npm run setup for local configuration");
const app = await buildApp(new Service(base, process.env.VAULT_KEY));
await query(
  "UPDATE approvals SET state='failed_indeterminate' WHERE state='executing'",
);
const retention = Number(process.env.AUDIT_RETENTION_DAYS || 30);
if (!Number.isInteger(retention) || retention < 1 || retention > 3650)
  throw new Error("Invalid audit retention");
const cleanup = async () => {
  await query(
    "DELETE FROM audit WHERE created_at<now()-($1::integer*interval '1 day')",
    [retention],
  );
  await query("DELETE FROM sessions WHERE expires_at<now()");
  await query("DELETE FROM oauth_states WHERE expires_at<now()");
  await query(
    "DELETE FROM oauth_authorization_requests WHERE expires_at<now()-interval '1 day'",
  );
  await query(
    "DELETE FROM oauth_codes WHERE expires_at<now()-interval '1 day'",
  );
  await query(
    "DELETE FROM oauth_tokens WHERE expires_at<now()-interval '1 day'",
  );
  await query(
    "UPDATE approvals SET state='expired' WHERE state='pending' AND expires_at<now()",
  );
};
await cleanup();
const timer = setInterval(() => {
  void cleanup().catch(() => app.log.error("Retention cleanup failed"));
}, 3600000);
timer.unref();
await app.listen({ port: Number(process.env.PORT || 4000), host: "0.0.0.0" });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    void app.close().then(() => pool.end());
  });
