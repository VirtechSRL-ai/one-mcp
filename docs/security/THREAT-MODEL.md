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

Residual risks: host/key compromise; malicious authorized agents; providers without idempotency; DNS/operator trust; lack of independent penetration testing. Local HTTP is allowed only on loopback; hosted deployment requires TLS. Manual capability credentials remain as a fallback; downstream OAuth is implemented by the extension below, with separate application registrations, user consent and scoped resource-bound tokens.

## Downstream OAuth extension — 2026-10-20, before implementation

Use official SDK OAuth handlers for protocol parsing, S256 PKCE verification, standard errors and DCR. The ONE provider persists applications, one-use authorization requests/codes and opaque access/rotating refresh tokens. Provider OAuth remains completely separate.

| New threat | Control / acceptance test |
| --- | --- |
| Redirect theft / open redirect | HTTPS or literal-loopback HTTP registration; exact registered redirect matching (SDK native-loopback port exception); code exchange exact original URI |
| Cross-instance token confusion | `resource` required at authorization, code exchange and refresh; exact `/mcp` audience persisted and checked at resource access |
| Code interception / replay | mandatory S256, 60-second hashed single-use code, transactional consume; replay revokes issued grant |
| Refresh replay | hash-only rotating tokens, row lock, reuse revokes entire family; no rollback of reuse revocation |
| Consent CSRF / tenant confusion | authenticated browser session + HttpOnly flow-binding cookie + exact Origin on decision; bind request to user/session on review; no automatic consent |
| Excess privilege | explicit per-account/tool selection, unchecked by default; no automatic grants for new connections; invocation still checks current policy |
| Malicious application metadata | application identity explicitly unverified, escaped text, show full callback and destination; reject unsafe redirects and unexpected auth methods |
| CIMD SSRF | HTTPS public /443 only, DNS socket guard, no redirects, JSON and body-size bounds, finite cache lifetime |
| Token leakage | never put tokens in URI; no query/body logging; consent API returns no tokens; client stores tokens automatically |
| Auth endpoint CORS confusion | permit uncredentialed cross-origin standard machine endpoints only; browser consent routes retain exact Origin and session checks |

Local loopback HTTP is an explicit development exception. Remote/cloud clients cannot reach a laptop's localhost; they require an operator-controlled public HTTPS origin. Compatibility must be demonstrated with the official SDK and actual client products separately.
