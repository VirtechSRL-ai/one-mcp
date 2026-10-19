# Provider configuration and live acceptance

Set `PUBLIC_URL` to the exact external origin (HTTPS outside localhost). Add operator-owned OAuth application IDs and secrets in `.env`, then recreate the API container. Never paste provider tokens in issues or commit them. Each connected account has its own encrypted credential record. A second MCP client reuses this record and never receives the upstream token.

## GitHub

Create an OAuth App with callback `PUBLIC_URL/api/oauth/github/callback`. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. Uses state and S256 PKCE. Current classic OAuth scopes are `repo read:user`: classic GitHub OAuth does not offer a general private-repository read-only scope. ONE exposes read-only repository tools, but the upstream token itself has broader privileges. For least-privilege deployment use a public-only account until a fine-grained GitHub App adapter is implemented. Expiring GitHub tokens are refreshed if the provider issues a refresh token.

[Official GitHub flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

## Google

Create a Web OAuth client with callback `PUBLIC_URL/api/oauth/google/callback`; configure consent-screen test users and enable Gmail, Drive and Calendar APIs. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Requested scopes: `openid`, `email`, Gmail readonly, Drive metadata readonly and Calendar events readonly. Gmail scopes may require Google verification/security assessment for a publicly distributed app; testing mode and token lifetime restrictions are provider-controlled.

Offline access and consent are requested. A missing refresh token is not invented. Scope filtering uses the granted scope response, not the requested scopes. The Drive tool searches metadata, not document contents. [Official Google web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server).

## Slack

Create an OAuth v2 app, callback `PUBLIC_URL/api/oauth/slack/callback`, bot scopes `channels:read` and `chat:write`. Set `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`; install into a test workspace and invite the app to a test channel. Slack v2 uses a confidential client and state; this adapter does not invent PKCE parameters for this endpoint. All sends require a dashboard approval. [Official Slack guide](https://docs.slack.dev/authentication/installing-with-oauth/).

## Disconnect and revoke

Disconnect removes ONE's credentials and tool grants immediately. It does not claim to revoke provider-issued tokens at the provider: remove ONE in the provider's authorized-app settings for provider-side invalidation. Revoking a client key affects only that client, not provider connections. Refresh failures and upstream 401 transition to reconnect-required; not all provider-specific revocation codes are currently normalized.

## Real acceptance checklist (not yet executed)

1. Connect GitHub and Google using test accounts through dashboard callbacks.
2. Create two separate MCP client keys and grant account-specific read tools.
3. From the first client read a GitHub repository; from the second read the same account without another upstream OAuth prompt.
4. Revoke the second client and prove its next request returns 401 while the first still works.
5. Connect a second Google account; verify explicit account routing and denied cross-account calls.
6. Allow an expiring test credential to refresh; invalidate it at the provider and verify guided reconnection.
7. For Slack send only to a synthetic QA channel after reviewing actual destination and message.

Do not mark Milestone 2 complete until these checks have provider-side evidence. Automated fixtures are not provider acceptance.
