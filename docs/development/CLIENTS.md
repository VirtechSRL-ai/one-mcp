# Connecting MCP clients

This preview supports clients that allow a Streamable HTTP endpoint with an explicit Authorization header. Client formats change; these are templates to inspect against your installed version, not a claim that every product/version has been run here. No actual Claude/Cursor/Codex GUI acceptance has been performed.

Create a client key in ONE, save it once, and grant each tool separately. New keys expire after 90 days. ONE's API validates opaque tokens against its own client store for this instance: they are not JWTs or provider OAuth access tokens. A URL alone does not authorize access. OAuth-only clients cannot yet enroll in this preview.

## Cursor-style JSON

```json
{"mcpServers":{"one":{"url":"http://localhost:3000/mcp","headers":{"Authorization":"Bearer REPLACE_WITH_CLIENT_KEY"}}}}
```

## Claude Code CLI

```bash
claude mcp add --transport http one http://localhost:3000/mcp --header 'Authorization: Bearer REPLACE_WITH_CLIENT_KEY'
```

Avoid putting real keys in shell history. Configure the header using the client's supported secret mechanism when available. Claude Desktop remote connector OAuth enrollment is a separate integration and is not supported by this static-token preview.

## Codex TOML

```toml
[mcp_servers.one]
url = "http://localhost:3000/mcp"
bearer_token_env_var = "ONE_MCP_TOKEN"
```

Set `ONE_MCP_TOKEN` in the environment inherited by the client. Do not commit the value. Hosted ONE uses `https://your-domain/mcp`; loopback HTTP is for local development only.

## Official SDK verification

Automated integration and browser tests use `Client` + `StreamableHTTPClientTransport` from the pinned official SDK, perform initialize/list/call and test post-revocation denial. No dynamic list-change capability is required. The server intentionally uses stateless transport; persistent identity lives in PostgreSQL, not an MCP session ID.
