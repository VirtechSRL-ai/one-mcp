# Contributing

Use Node 22.22+, npm ci and a disposable PostgreSQL 17 instance. Run setup/migrate, npm run typecheck, npm test and npm run build. Start API/dashboard and run npm run test:e2e for UI or transport changes. Keep .env and real account data out of commits. Tests use synthetic data. Report live provider tests separately from fixtures.

Add connectors through explicit tool definitions and an OAuthEngine adapter. Every tool requires a schema, provider scope and write classification. Externally sourced descriptions are untrusted. Enforce policy at call time, not only in discovery. Include negative tenant/authorization tests. Keep changes focused; do not add empty packages or claim compatibility without evidence. Contributions are under Apache-2.0.
