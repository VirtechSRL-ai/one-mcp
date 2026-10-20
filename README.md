# ONE

**Connect once. Use everywhere.**

An independent, self-hosted connection layer for AI applications. Users own upstream connections; every MCP client receives a separate key and explicit tool grants. ONE is not an AI agent.

> Developer preview. ONE is a provisional name. Native OAuth adapters are implemented and tested with synthetic providers; real Google/GitHub/Slack authorization is an operator acceptance gate, not a verified live integration. URL-only MCP OAuth enrollment is implemented; actual product/client acceptance remains separate from SDK/browser tests. Do not expose this preview publicly without reviewing the security and deployment guides.

## Run locally

Requires Docker Compose and Node.js 22.22+ (Node is used to generate initial configuration).

```bash
git clone https://github.com/VirtechSRL-ai/one-mcp.git
cd one-mcp
npm run setup
docker compose up -d --build
```

Open [localhost:3000](http://localhost:3000). Create an account, enable **Connections → Built-in verification**, add `http://localhost:3000/mcp` to an OAuth-capable client, then sign in and grant `demo.echo` on the consent screen. Manual keys remain an advanced fallback in **AI Clients**. Provider credentials are not needed for this verification flow.

`npm run setup` creates `.env` with random database and vault credentials and preserves existing configuration. Copying `.env.example` alone is insufficient: its placeholders deliberately do not work. Vault keys must be backed up securely with the database. Losing the key loses upstream credentials.

For development:

```bash
npm ci
npm run setup
docker compose up -d db
npm run migrate
npm run dev
# separate terminal
npm run dev:dashboard
```

## What works and what remains

| Capability | Status |
| --- | --- |
| Account registration/login, browser session revocation | Implemented; PostgreSQL integration tests |
| Official SDK Streamable HTTP endpoint | Implemented; real SDK-client tests |
| Separate client keys, expiry, revocation, deny-by-default grants | Implemented; two-client scenario tested |
| Per-account tool discovery and invocation | Implemented; deterministic keyword ranking |
| Encrypted credentials and serialized refresh | Implemented; synthetic refresh tests |
| GitHub, Google and Slack OAuth adapters | Implemented; credentials and live provider acceptance still required |
| Gmail search/read, Drive metadata search, Calendar list, GitHub repository read, Slack channels/send | Implemented adapters; synthetic HTTP tests; live coverage pending |
| External MCP public HTTPS, bearer/no-auth | Implemented; limited to 200 tools, one catalog page; all calls require approval |
| Durable human approvals and activity ledger | Implemented; replay and grant recheck tests |
| Eight dashboard views, responsive layout, light/dark | Implemented; browser QA |
| MCP OAuth authorization server / URL-only enrollment | Implemented; official SDK handlers, PKCE, consent, DCR/CIMD, rotating refresh, revocation |
| External MCP OAuth, stdio/process execution | Planned |
| Named reusable client profiles, semantic search, discovery cache | Planned |
| Periodic upstream health probes / proactive reconnect detection | Planned; current status changes on authentication failure |
| OTel exporter, key rotation/KMS, password recovery/MFA | Planned |
| Production security review and live principal acceptance scenario | Pending |

## MCP tools

The initial tool list is deliberately stable:

- `one_search_tools({query})`: returns only tools granted to the caller, with account and connection identifiers, ranked deterministically.
- `one_call_tool({connectionId, name, arguments})`: rechecks authorization, validates input and executes or creates a pending approval.
- `one_approval_status({id})`: returns the state of an approval belonging to that client.

Namespaces are the tuple `(connectionId, tool name)`, avoiding collisions between accounts and external servers. Untrusted upstream descriptions are data, never instructions. No client token is forwarded upstream.

Read [client configuration](docs/development/CLIENTS.md), [real-account acceptance](docs/development/LIVE-ACCEPTANCE.md), [provider setup](docs/development/PROVIDERS.md), [architecture/research](docs/architecture/DECISIONS.md), [threat model](docs/security/THREAT-MODEL.md), [deployment](docs/deployment/SELF-HOST.md) and [verification](docs/VERIFICATION.md).

## Tests

Use a disposable PostgreSQL database. Tests create synthetic users and clean up integration fixtures; browser tests leave identifiable `qa-…@example.test` accounts in the test database. Never run the suite against production.

```bash
npm ci
npm run setup
docker compose up -d db
npm run migrate
npm run typecheck
npm test
npm run build
npx playwright install chromium
# start API and dashboard in separate terminals, then:
npm run test:e2e
```

## Structure

`apps/api` owns HTTP authentication, MCP transport, connection lifecycle, OAuth and policy execution. `packages/core` owns encryption, network restrictions and the identity schema. `apps/dashboard` owns the browser application and same-origin streaming proxy. `infrastructure` contains versioned, advisory-locked SQL migrations and containers. Modules are split further only when they acquire a real independent responsibility.

## License

Apache-2.0 for original code. Dependency license inventory and lockfile are included. No Nango or other hosted integration engine is required. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
