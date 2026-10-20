# Real Google + GitHub acceptance

This is an operator-run acceptance procedure, not a passed test record. Do not paste secrets into chat or public issues.

## Configure dedicated provider applications

Run `npm run providers:status` to print configured/not-configured flags and exact callback URLs, without secret values. For the default local instance:

| Provider | Callback |
| --- | --- |
| GitHub | `http://localhost:3000/api/oauth/github/callback` |
| Google | `http://localhost:3000/api/oauth/google/callback` |

For another `PUBLIC_URL`, use that exact origin. Provider apps belong to ONE and are separate from the MCP applications that enroll through ONE's own `/authorize` endpoint.

GitHub: register an OAuth App in your account/organization developer settings with ONE's home URL and the callback above. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the local `.env`.

Google: create/select a dedicated Google Cloud project, enable Gmail, Drive and Calendar APIs, configure consent-screen audience and test users, and create a **Web application** OAuth client with the callback above. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. Only authorize intended test accounts. Sensitive/restricted-scope verification and testing-mode limitations remain Google's responsibility. See [PROVIDERS.md](PROVIDERS.md) for scopes and official references.

Recreate the API to apply secrets without resetting PostgreSQL:

```bash
docker compose up -d --force-recreate api
```

Sign in to ONE and connect both providers through **Connections**. Complete each provider's consent in its own browser page. Never copy provider access/refresh tokens into ONE clients. GitHub's classic OAuth `repo` scope is broad; this preview's exposed GitHub tools are read-only.

## Verify URL-only discovery

```bash
npm run verify:live -- --check
```

This checks public OAuth resource discovery only. It does not authenticate any user or prove real provider connectivity.

## Execute the real two-client scenario

With both accounts connected:

```bash
npm run verify:live
```

The script opens your default browser for two separate synthetic **ONE LIVE QA** MCP applications. Sign in to ONE and select **the same existing accounts** for both. Grant `github.list_repositories` and `drive.search_files`; leave the per-read approval option off for this acceptance procedure. All other tools can remain unchecked.

The script uses the official SDK to discover/register/enroll each application, without manual keys. Callback state and issuer are validated before code exchange. Client tokens live in process memory and are not printed or exported. It then:

1. Makes a real GitHub repository-list request, limited to one result.
2. Makes a real Google Drive metadata search for a random `ONE QA` name, limited to one result. An empty result is valid authenticated search, not proof of reading an existing document.
3. Authorizes a second client and checks it routes through the exact same Google/GitHub connection IDs.
4. Runs both provider reads again from that second client.
5. Revokes the second authorization through RFC 7009 and checks its access receives 401.
6. Repeats the provider reads from the first client, proving its connections remain usable.
7. Revokes the script's own authorizations and closes callback servers on exit.

No communications are sent and no provider documents/repositories are created or modified. Provider response bodies and account names are not printed. A successful script prints `PASS` only after all actual calls and revocation checks succeed; any missing provider, grant, callback, scope or response fails the run. The browser and callback wait expire after ten minutes.

The script's OAuth clients are test harnesses using the official SDK; real Claude/Cursor/Codex product enrollment remains a separate interoperability check. Hosted clients need public HTTPS. Record provider acceptance and actual product acceptance separately in docs/VERIFICATION.md.
