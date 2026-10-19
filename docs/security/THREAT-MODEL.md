# Threat model — before implementation

2026-10-19. Assets: upstream credentials, user sessions, client grants, operation arguments, audit metadata. Boundaries: browser → API; MCP client → resource server; API → PostgreSQL; API → provider; API → untrusted MCP.

| Threat | Required mitigation | Verification |
|---|---|---|
| Tenant confusion / IDOR | derive owner from hashed session or client credential; scope every query | two-user negative tests |
| Stolen MCP token | random opaque resource-bound token, hash only, expiry and revocation checked per call | expired/revoked tests |
| Provider credential disclosure | AES-256-GCM with owner/connection AAD; env key; no credential read API | wrong-owner decrypt, response tests |
| OAuth CSRF / code theft | one-use state bound to browser session, ten-minute TTL, S256 PKCE where supported, fixed redirect | state replay / mismatch tests |
| Browser CSRF | HttpOnly SameSite Lax cookie, exact Origin for mutations; no CORS | foreign origin test |
| Tool privilege escalation | deny by default; explicit connection+tool grant; recheck at invocation and approval execution | denied tool tests |
| Confused deputy | never forward inbound credential; upstream credentials selected by owner+connection | fixture assertions |
| SSRF / rebinding / redirect | HTTPS only, public DNS validation at socket lookup, no redirects, restricted port, no ambient proxy | blocked-address tests |
| Malicious external tools | untrusted descriptions, schema validation, conservative write classification, explicit grants, bounded results/timeouts | simulated external MCP |
| Approval replay / argument substitution | immutable stored arguments; owner/client binding; expiry; atomic claim; recheck policy | concurrent execution test |
| Remote effect then crash | no blind retry after claim; mark indeterminate on restart; upstream idempotency where supported | document residual risk |
| Credential refresh races | transaction lock per connection; preserve rotated refresh token | simulated OAuth refresh |
| Resource exhaustion | body/rate/result/tool limits, timeout, bounded pagination | input tests |
| Audit leakage | metadata only; no args, results, tokens or provider error bodies | log assertions |

Residual risks: host/key compromise; malicious authorized agents; providers without idempotency; DNS/operator trust; lack of independent penetration testing. Local HTTP is allowed only on loopback; hosted deployment requires TLS. Tokens are capability credentials for explicitly configured clients, not an implementation of an OAuth authorization server. URL-only OAuth clients require a future external authorization-server integration; do not advertise that mode as complete.
