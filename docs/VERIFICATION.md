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

A real Claude GUI session has not been exercised. OAuth-based MCP enrollment is now implemented (2026-10-20 extension below); installed Claude/Cursor/Codex product interoperability is still a separate check. Provider-side app registration, Google verification and target-domain TLS are external prerequisites. The 12-step master scenario with real GitHub and Google remains **not passed** until those prerequisites and explicit live evidence exist.

## Recorded final local checks

- TypeScript checks: passed for API/core/tests and dashboard.
- Vitest: **48 tests passed**, four files, real local PostgreSQL plus isolated synthetic provider/external-server fixtures.
- Next production build: passed (Next.js 16.4.2).
- Docker: both images built; PostgreSQL and API health checks passed; dashboard runs from the production image at localhost:3000.
- Playwright against the production Compose deployment: **2 passed**, Chromium desktop and mobile; actual MCP calls pass through the same dashboard proxy used by clients. Four settled light/dark screenshots are captured under `.impeccable/review/` (local, intentionally not committed).
- `npm audit --omit=dev`: zero known vulnerabilities at the time checked. This is not an independent security audit.
- Generated local VAULT_KEY and PostgreSQL password checked against staged source: absent; `.env` is ignored.

These checks establish the Milestone 1 verification flow. The synthetic GitHub OAuth callback test also proves one code exchange followed by two separately authorized SDK clients reusing the same stored connection, with state/session binding and replay rejection. This still does not establish the live-provider Milestone 2 acceptance gate.

Independent visual fix-list review: **ship within reviewed scope** after mobile theme access, selected-navigation contrast and stable production captures were corrected. Evidence covers populated Overview on desktop/mobile in light/dark. This is not an accessibility, security or whole-product certification. Design tokens and component previews are recorded in DESIGN.md and `.impeccable/design.json`.

## Downstream OAuth extension — 2026-10-20

Implemented with official SDK OAuth handlers, persisted application registration and explicit browser consent: RFC 9728/8414 metadata, S256, DCR, restricted public CIMD, exact resource and redirect binding, short-lived access tokens, refresh rotation, family replay revocation, RFC 7009 and individually revocable user authorizations. Consent has an HttpOnly browser binding plus authenticated session/Origin checks; tool grants start empty. Migration versions 2 through 4 preserve existing users, manual keys and upstream accounts.

Initial extension checks: 68 PostgreSQL/security/HTTP tests and four browser scenarios passed locally, including URL-only official SDK enrollment from desktop/mobile, explicit per-account grant, automatic refresh, two clients reusing one verification connection, and independent revocation. Real Google/GitHub remain **not tested**: both provider application configurations were absent when checked. `npm run providers:status` reports this without values; `npm run verify:live` is the operator's real-account acceptance harness described in LIVE-ACCEPTANCE.md. `--check` verifies discovery only.

The initial release's 48-test record above is historical. Final extension checks/remote CI are recorded separately below.

Final local extension checks: **69 tests passed** in five files; **4 Playwright scenarios passed** against the rebuilt production Docker deployment (desktop/mobile baseline and URL-only OAuth). TypeScript, Next production builds, controlled schema migrations, OAuth-discovery CLI check and dependency audit passed. The independent visual reviewer returned **ship within the changed consent-flow scope**, using desktop/mobile light/dark captures. Design documentation review confirmed reuse of the existing system; pre-existing detector advisories were left untouched. Remote PR CI is reported separately, not inferred from these local results.
