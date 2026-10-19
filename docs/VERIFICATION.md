# Verification record

2026-10-19. Evidence is local unless a remote run is explicitly recorded below.

## Automated scope

- Real PostgreSQL 17 (Docker), schema migrations and real Fastify routes.
- Official MCP SDK clients initialize, list tools, search, invoke, reconnect and receive denial after client revocation.
- One provider-independent connection is used by two clients; revoking one leaves the connection and first client intact.
- Cross-tenant attempts, expired/revoked/unknown credentials, browser Origin/Host restrictions, encrypted secrets and argument storage, approval concurrency/expiry/grant recheck, refresh serialization and output leakage.
- Synthetic OAuth token exchange and connector HTTP responses. These do not authenticate a real Google/GitHub/Slack account.
- Real external SDK fixture at an overridden test network boundary: discovery, schema rejection, approval, one execution, no replay, unavailable upstream. Production SSRF restrictions remain covered separately; no private-address override ships in production.
- Playwright desktop/mobile: account creation, verification connection, client key, tool grant, actual SDK call through Next proxy, activity, navigation, themes and revocation. Screenshots contain synthetic QA data.

## Milestones

1. Foundation: complete for the scoped, header-authenticated verification flow; evidence below.
2. Real connections: adapters implemented, live two-client GitHub+Google scenario pending operator OAuth application credentials and consenting test accounts.
3. Aggregation: public HTTPS bearer/no-auth implemented and tested with a synthetic upstream. External OAuth, pagination and proactive availability probes remain open.
4. Differentiation: lexical discovery, approvals, audit and dashboard implemented. Semantic search, cache, reusable named profiles and proactive health checks remain open.
5. Release: source, license, docs, containers and CI prepared. Publishing and CI state recorded separately; no production-readiness claim.

## Remaining acceptance

A real Claude GUI session has not been exercised. Static-header clients are the supported bootstrap mode, not full OAuth-based MCP enrollment. Provider-side app registration, Google verification and target-domain TLS are external prerequisites. The 12-step master scenario with real GitHub and Google remains **not passed** until those prerequisites and explicit live evidence exist.

## Recorded final local checks

- TypeScript checks: passed for API/core/tests and dashboard.
- Vitest: **48 tests passed**, four files, real local PostgreSQL plus isolated synthetic provider/external-server fixtures.
- Next production build: passed (Next.js 16.4.2).
- Docker: both images built; PostgreSQL and API health checks passed; dashboard runs from the production image at localhost:3000.
- Playwright against the production Compose deployment: **2 passed**, Chromium desktop and mobile; actual MCP calls pass through the same dashboard proxy used by clients. Four settled light/dark screenshots are captured under `.impeccable/review/` (local, intentionally not committed).
- `npm audit --omit=dev`: zero known vulnerabilities at the time checked. This is not an independent security audit.
- Generated local VAULT_KEY and PostgreSQL password checked against staged source: absent; `.env` is ignored.

These checks establish the Milestone 1 verification flow. The synthetic GitHub OAuth callback test also proves one code exchange followed by two separately authorized SDK clients reusing the same stored connection, with state/session binding and replay rejection. This still does not establish the live-provider Milestone 2 acceptance gate.
