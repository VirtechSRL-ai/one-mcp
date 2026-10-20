# Connecting MCP clients

ONE now hosts an OAuth authorization server using the official MCP SDK handlers. An OAuth-capable Streamable HTTP client can start with just the ONE endpoint:

```text
http://localhost:3000/mcp
```

For remote/cloud applications use a reachable, operator-controlled HTTPS instance, for example `https://your-domain/mcp`. A cloud application cannot reach a laptop's localhost. Check the installed client's support for MCP OAuth, not merely remote HTTP transport. Actual Claude/Cursor/Codex product acceptance is separate from the official SDK tests recorded below.

## URL-only flow

1. Add the endpoint URL to the client, without an Authorization header or manually created key.
2. The client discovers protected-resource and authorization-server metadata.
3. It identifies itself through public HTTPS Client ID Metadata Documents (CIMD), or Dynamic Client Registration (DCR) when needed. Public `none` and confidential `client_secret_post` authentication are supported; other methods are rejected.
4. A browser opens ONE. Sign in and review the **application ID and full return destination**. Application names are developer-supplied, not verified identities.
5. Choose individual tools and accounts; nothing is selected by default. Approve or deny explicitly. New accounts/tools never gain access automatically.
6. ONE returns a single-use authorization code bound to S256 PKCE, the original redirect URI and this MCP resource. The client exchanges it and stores the credentials automatically.
7. In **AI Clients**, revoke the client or change tool grants. Provider connections stay available to other clients.

Each consent creates its own user-owned authorization. Read tools may be configured to require approval; sensitive and external actions always do. Approving without tools establishes identity but grants no provider access. GitHub/Google OAuth is separate and does not repeat when adding a client.

## Security and lifecycle

- Authorization review expires after ten minutes; codes after 60 seconds. Access tokens expire after 15 minutes. Refresh tokens rotate and cannot outlive the 90-day authorization.
- Replaying a code or used refresh token revokes the affected authorization/family. Refreshes are serialized per family; concurrent reuse is treated as compromise, not silently retried.
- `resource` must identify the exact ONE `/mcp` endpoint at authorization, code exchange and refresh. Tokens issued for another instance or resource are rejected.
- HTTP redirects are permitted only for loopback native callbacks. SDK registration matching allows native loopback port changes; exchange must still use the actual URI recorded at authorization. Other redirects must match exactly and use HTTPS, without credentials/fragments.
- Consent uses an authenticated browser session, exact Origin and an HttpOnly flow-binding cookie. Only one pending enrollment per browser is supported; starting a second supersedes the first cookie, so restart the earlier flow if needed.
- CIMD fetches are restricted to public HTTPS/443, no redirects, socket-time DNS restrictions, JSON up to 16 KiB and a one-hour persisted cache. Metadata document `client_id` must equal its requested URL; only public `none` authentication is accepted for CIMD.
- RFC 7009 revocation revokes the whole ONE authorization represented by the token, not upstream provider accounts. DCR registration itself grants nothing.
- Browser MCP requests with a foreign Origin require that exact origin to match the callback destination approved at consent. Preflight/discovery do not grant data access; cookies alone never authenticate MCP. Application metadata updates cannot change an existing authorization's approved browser origin.
- Old manual keys continue to work and remain individually revocable. Browser sessions cannot be used as MCP tokens; provider access tokens cannot be passed through.

## Advanced: existing manual clients

Manual keys are now an advanced fallback for clients supporting static headers only. Create a key in AI Clients and grant tools separately; it is displayed once and expires after 90 days.

Cursor-style static-header template:

```json
{"mcpServers":{"one":{"url":"http://localhost:3000/mcp","headers":{"Authorization":"Bearer REPLACE_WITH_CLIENT_KEY"}}}}
```

Existing Codex static-token TOML template:

```toml
[mcp_servers.one]
url = "http://localhost:3000/mcp"
bearer_token_env_var = "ONE_MCP_TOKEN"
```

Set the environment variable through the client's supported secret mechanism. Do not commit keys or paste them into shell history. These are manual-mode templates, not a requirement for the new OAuth flow, and must be checked against installed client versions.

## Verification

Automated PostgreSQL/HTTP tests cover discovery, DCR, confidential-client authentication, CIMD validation/cache, mandatory S256, issuer/state response, audience, redirects, explicit consent, no-grant denial, session/tenant isolation, expiry, rotation, code/refresh replay, concurrent refresh, revocation and leakage.

Playwright uses the actual official SDK OAuth client starting with only the endpoint URL, performs browser consent, authorizes two clients against the same stored account, refreshes automatically, invokes MCP, revokes the second and confirms the first continues working. No manual credential is copied into these OAuth tests. Provider tools in those browser tests use the clearly labelled built-in verification connection; they do not establish Google/GitHub acceptance.

Use [LIVE-ACCEPTANCE.md](LIVE-ACCEPTANCE.md) for real-account verification.
