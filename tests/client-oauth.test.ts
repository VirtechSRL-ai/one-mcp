import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
vi.mock("../packages/core/src/security.js", async (original) => ({
  ...(await original<typeof import("../packages/core/src/security.js")>()),
  externalFetch: vi.fn(),
}));
import { buildApp } from "../apps/api/src/app.js";
import { Service } from "../apps/api/src/service.js";
import { ClientOAuthProvider } from "../apps/api/src/client-oauth.js";
import { pool, query } from "../apps/api/src/db.js";
import { hash, token, externalFetch } from "../packages/core/src/security.js";
const base = "http://localhost:4192",
  resource = base + "/mcp";
const service = new Service(base, "d".repeat(64));
let app: Awaited<ReturnType<typeof buildApp>>,
  userId: string,
  cookie: string,
  connectionId: string;
const applicationIds: string[] = [];
async function request(
  path: string,
  method = "GET",
  data?: unknown,
  c = cookie,
) {
  const form = data instanceof URLSearchParams;
  return fetch(base + path, {
    method,
    headers: {
      ...(c ? { cookie: c } : {}),
      ...(path.startsWith("/api/") && method !== "GET" ? { origin: base } : {}),
      ...(data === undefined
        ? {}
        : {
            "Content-Type": form
              ? "application/x-www-form-urlencoded"
              : "application/json",
          }),
    },
    body:
      data === undefined
        ? undefined
        : form
          ? data.toString()
          : JSON.stringify(data),
    redirect: "manual",
  });
}
const cookieFrom = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
async function register(extra: Record<string, unknown> = {}) {
  const r = await request(
    "/register",
    "POST",
    {
      client_name: "Synthetic OAuth application",
      redirect_uris: ["http://127.0.0.1:4195/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      ...extra,
    },
    "",
  );
  const v = await r.json();
  if (r.status === 201) applicationIds.push(v.client_id);
  return { r, v };
}
async function begin(
  application?: any,
  overrides: Record<string, string> = {},
) {
  const a = application || (await register()).v;
  const verifier = token(),
    challenge = Buffer.from(hash(verifier), "hex").toString("base64url");
  const params = new URLSearchParams({
    client_id: a.client_id,
    redirect_uri: a.redirect_uris[0],
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource,
    scope: "one:mcp",
    state: "synthetic-state",
    ...overrides,
  });
  const r = await request("/authorize?" + params, "GET", undefined, "");
  const id = new URL(r.headers.get("location")!, base).searchParams.get(
    "oauth_request",
  );
  return {
    application: a,
    verifier,
    r,
    id,
    cookie: cookie + "; " + cookieFrom(r),
  };
}
async function consent(
  flow: Awaited<ReturnType<typeof begin>>,
  approve = true,
  grant = true,
) {
  expect(
    (
      await request(
        "/api/client-oauth/requests/" + flow.id,
        "GET",
        undefined,
        flow.cookie,
      )
    ).status,
  ).toBe(200);
  const r = await request(
    "/api/client-oauth/requests/" + flow.id,
    "POST",
    {
      approve,
      grants: grant
        ? [{ connectionId, tool: "demo.echo", approval: false }]
        : [],
    },
    flow.cookie,
  );
  expect(r.status).toBe(200);
  const redirect = new URL((await r.json()).redirectUrl);
  return { code: redirect.searchParams.get("code")!, redirect };
}
async function exchange(
  flow: Awaited<ReturnType<typeof begin>>,
  code: string,
  overrides: Record<string, string> = {},
) {
  return request(
    "/token",
    "POST",
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: flow.application.client_id,
      code,
      code_verifier: flow.verifier,
      redirect_uri: flow.application.redirect_uris[0],
      resource,
      ...overrides,
    }),
    "",
  );
}
async function authorized() {
  const flow = await begin();
  const { code } = await consent(flow);
  const r = await exchange(flow, code);
  expect(r.status).toBe(200);
  return { flow, code, tokens: await r.json() };
}
async function refresh(
  clientId: string,
  value: string,
  overrides: Record<string, string> = {},
) {
  return request(
    "/token",
    "POST",
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: value,
      resource,
      ...overrides,
    }),
    "",
  );
}
beforeAll(async () => {
  app = await buildApp(service);
  await app.listen({ port: 4192, host: "127.0.0.1" });
  const r = await request(
    "/api/auth/register",
    "POST",
    {
      email: `oauth-${randomUUID()}@example.test`,
      password: "synthetic-oauth-password",
    },
    "",
  );
  expect(r.status).toBe(200);
  cookie = cookieFrom(r);
  userId = (await r.json()).id;
  await request("/api/connections/demo", "POST");
  connectionId = (await (await request("/api/connections")).json())[0].id;
});
beforeEach(() => vi.mocked(externalFetch).mockReset());
afterAll(async () => {
  await query("DELETE FROM users WHERE id=$1", [userId]);
  await query(
    "DELETE FROM oauth_authorization_requests WHERE application_id=ANY($1::text[])",
    [applicationIds],
  );
  await query("DELETE FROM oauth_applications WHERE id=ANY($1::text[])", [
    applicationIds,
  ]);
  await app.close();
  await pool.end();
});
it("advertises resource/AS discovery in the MCP challenge and supports uncredentialed metadata CORS", async () => {
  const r = await request("/mcp", "GET", undefined, "");
  expect(r.status).toBe(401);
  expect(r.headers.get("www-authenticate")).toContain(
    base + "/.well-known/oauth-protected-resource/mcp",
  );
  const prm = await (
    await request("/.well-known/oauth-protected-resource/mcp")
  ).json();
  expect(prm.resource).toBe(resource);
  expect(prm.authorization_servers).toEqual([base + "/"]);
  const meta = await (
    await request("/.well-known/oauth-authorization-server")
  ).json();
  expect(meta.token_endpoint).toBe(base + "/token");
  expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
  expect(meta.client_id_metadata_document_supported).toBe(true);
  const cors = await fetch(base + "/.well-known/oauth-authorization-server", {
    headers: { origin: "https://client.example" },
  });
  expect(cors.status).toBe(200);
  expect(cors.headers.get("access-control-allow-origin")).toBe("*");
});
it("rejects unsafe redirect URIs and unsupported grant types", async () => {
  for (const uri of [
    "http://evil.example/callback",
    "javascript:alert(1)",
    "https://user:pass@example.com/callback",
    "https://example.com/callback#fragment",
  ]) {
    const { r } = await register({ redirect_uris: [uri] });
    expect(r.status).toBe(400);
  }
  expect(
    (await register({ grant_types: ["client_credentials"] })).r.status,
  ).toBe(400);
});
it("uses mandatory S256 and only redirects to registered destinations", async () => {
  const a = (await register()).v;
  const noPkce = await begin(a, { code_challenge_method: "plain" });
  expect(
    new URL(noPkce.r.headers.get("location")!).searchParams.get("error"),
  ).toBe("invalid_request");
  expect(
    new URL(noPkce.r.headers.get("location")!).searchParams.get("iss"),
  ).toBe(base + "/");
  expect(
    new URL(noPkce.r.headers.get("location")!).searchParams.get("state"),
  ).toBe("synthetic-state");
  const wrong = await begin(a, {
    redirect_uri: "https://evil.example/callback",
  });
  expect(wrong.r.status).toBe(400);
  expect(wrong.r.headers.get("location")).toBeNull();
  const invalidChallenge = await begin(a, { code_challenge: "bad" });
  expect(
    new URL(invalidChallenge.r.headers.get("location")!).searchParams.get(
      "error",
    ),
  ).toBe("invalid_request");
});
it("rejects missing/wrong resource and excessive scopes before consent", async () => {
  for (const override of [
    { resource: "" },
    { resource: "https://elsewhere.example/mcp" },
    { scope: "one:mcp admin" },
  ] as Record<string, string>[]) {
    const f = await begin(undefined, override);
    expect(f.id).toBeNull();
    expect(
      new URL(f.r.headers.get("location")!).searchParams.has("error"),
    ).toBe(true);
  }
});
it("requires the authenticated session and flow cookie; review never grants a tool", async () => {
  const f = await begin();
  expect(
    (await request("/api/client-oauth/requests/" + f.id, "GET", undefined, ""))
      .status,
  ).toBe(401);
  expect(
    (
      await request(
        "/api/client-oauth/requests/" + f.id,
        "GET",
        undefined,
        cookie,
      )
    ).status,
  ).toBe(404);
  const r = await request(
    "/api/client-oauth/requests/" + f.id,
    "GET",
    undefined,
    f.cookie,
  );
  expect(r.status).toBe(200);
  const review = await r.json();
  expect(review.identityVerified).toBe(false);
  expect(review.tools[0].connectionId).toBe(connectionId);
  expect(
    (
      await query(
        "SELECT id FROM clients WHERE user_id=$1 AND auth_mode='oauth'",
        [userId],
      )
    ).length,
  ).toBe(0);
});
it("requires explicit consent; denial preserves state/issuer and creates no authorization", async () => {
  const f = await begin();
  const { redirect } = await consent(f, false, false);
  expect(redirect.searchParams.get("error")).toBe("access_denied");
  expect(redirect.searchParams.get("state")).toBe("synthetic-state");
  expect(redirect.searchParams.get("iss")).toBe(base + "/");
  expect(
    (
      await query(
        "SELECT id FROM clients WHERE user_id=$1 AND auth_mode='oauth'",
        [userId],
      )
    ).length,
  ).toBe(0);
});
it("connects an OAuth SDK client and executes only the explicitly selected account/tool", async () => {
  const a = await authorized();
  const p = await service.principal(a.tokens.access_token);
  expect(p.userId).toBe(userId);
  const c = new Client({ name: "oauth-sdk-fixture", version: "1.0.0" });
  await c.connect(
    new StreamableHTTPClientTransport(new URL(resource), {
      requestInit: {
        headers: { Authorization: `Bearer ${a.tokens.access_token}` },
      },
    }),
  );
  try {
    const v = await c.callTool({
      name: "one_call_tool",
      arguments: {
        connectionId,
        name: "demo.echo",
        arguments: { message: "synthetic OAuth" },
      },
    });
    expect(v.isError).toBeFalsy();
    expect(JSON.parse((v.content as any)[0].text).result.message).toBe(
      "synthetic OAuth",
    );
  } finally {
    await c.close();
  }
  const [stored] = await query("SELECT * FROM oauth_tokens WHERE hash=$1", [
    hash(a.tokens.access_token),
  ]);
  expect(stored.resource).toBe(resource);
  expect(JSON.stringify(stored)).not.toContain(a.tokens.access_token);
  const consentReplay = await request(
    "/api/client-oauth/requests/" + a.flow.id,
    "POST",
    { approve: true, grants: [] },
    a.flow.cookie,
  );
  expect(consentReplay.status).toBe(409);
});
it("allows enrollment with no grants but denies tool invocation", async () => {
  const f = await begin();
  const { code } = await consent(f, true, false);
  const r = await exchange(f, code);
  const v = await r.json();
  const p = await service.principal(v.access_token);
  expect(await service.search(p, "")).toEqual([]);
  await expect(
    service.call(p, connectionId, "demo.echo", { message: "denied" }),
  ).rejects.toMatchObject({ status: 403 });
});
it("requires the original verifier, exact redirect URI, resource and registered application at token exchange", async () => {
  const f = await begin();
  const { code } = await consent(f);
  for (const override of [
    { code_verifier: token() },
    { redirect_uri: "http://127.0.0.1:4196/callback" },
    { resource: "https://wrong.example/mcp" },
    { resource: "" },
    { client_id: (await register()).v.client_id },
  ] as Record<string, string>[])
    expect((await exchange(f, code, override)).status).toBe(400);
  const ok = await exchange(f, code);
  expect(ok.status).toBe(200);
});
it("expires codes and consent requests", async () => {
  const f = await begin();
  const { code } = await consent(f);
  await query(
    "UPDATE oauth_codes SET expires_at=now()-interval '1 minute' WHERE hash=$1",
    [hash(code)],
  );
  expect((await exchange(f, code)).status).toBe(400);
  const pending = await begin();
  await query(
    "UPDATE oauth_authorization_requests SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [pending.id],
  );
  expect(
    (
      await request(
        "/api/client-oauth/requests/" + pending.id,
        "GET",
        undefined,
        pending.cookie,
      )
    ).status,
  ).toBe(404);
});
it("revokes the issued token family if a consumed authorization code is replayed", async () => {
  const a = await authorized();
  expect((await exchange(a.flow, a.code)).status).toBe(400);
  await expect(service.principal(a.tokens.access_token)).rejects.toMatchObject({
    status: 401,
  });
});
it("rotates refresh tokens and commits family revocation on replay", async () => {
  const a = await authorized();
  const next = await refresh(
    a.flow.application.client_id,
    a.tokens.refresh_token,
  );
  expect(next.status).toBe(200);
  const tokens = await next.json();
  expect(tokens.refresh_token).not.toBe(a.tokens.refresh_token);
  await service.principal(tokens.access_token);
  expect(
    (await refresh(a.flow.application.client_id, a.tokens.refresh_token))
      .status,
  ).toBe(400);
  await expect(service.principal(tokens.access_token)).rejects.toMatchObject({
    status: 401,
  });
  expect(
    (await refresh(a.flow.application.client_id, tokens.refresh_token)).status,
  ).toBe(400);
});
it("rejects simultaneous reuse and prevents descendants surviving a family replay", async () => {
  const a = await authorized();
  const outcomes = await Promise.all([
    refresh(a.flow.application.client_id, a.tokens.refresh_token),
    refresh(a.flow.application.client_id, a.tokens.refresh_token),
  ]);
  expect(outcomes.map((r) => r.status).sort()).toEqual([200, 400]);
  const valid = await outcomes.find((r) => r.status === 200)!.json();
  await expect(service.principal(valid.access_token)).rejects.toMatchObject({
    status: 401,
  });
  const b = await authorized();
  const child = await (
    await refresh(b.flow.application.client_id, b.tokens.refresh_token)
  ).json();
  const race = await Promise.all([
    refresh(b.flow.application.client_id, child.refresh_token),
    refresh(b.flow.application.client_id, b.tokens.refresh_token),
  ]);
  for (const r of race)
    if (r.status === 200)
      await expect(
        service.principal((await r.json()).access_token),
      ).rejects.toMatchObject({ status: 401 });
});
it("rejects refresh scope escalation, wrong audience and expired access credentials", async () => {
  const a = await authorized();
  expect(
    (
      await refresh(a.flow.application.client_id, a.tokens.refresh_token, {
        scope: "one:mcp offline_access",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await refresh(a.flow.application.client_id, a.tokens.refresh_token, {
        resource: "https://evil.example/mcp",
      })
    ).status,
  ).toBe(400);
  await query(
    "UPDATE oauth_tokens SET expires_at=now()-interval '1 minute' WHERE hash=$1",
    [hash(a.tokens.access_token)],
  );
  await expect(service.principal(a.tokens.access_token)).rejects.toMatchObject({
    status: 401,
  });
  expect(
    (await refresh(a.flow.application.client_id, a.tokens.refresh_token))
      .status,
  ).toBe(200);
});
it("revokes one OAuth client without removing upstream connections or another client grant", async () => {
  const first = await authorized(),
    second = await authorized();
  const p = await service.principal(second.tokens.access_token);
  expect((await request("/api/clients/" + p.clientId, "DELETE")).status).toBe(
    200,
  );
  await expect(
    service.principal(second.tokens.access_token),
  ).rejects.toMatchObject({ status: 401 });
  expect(
    (
      await refresh(
        second.flow.application.client_id,
        second.tokens.refresh_token,
      )
    ).status,
  ).toBe(400);
  await service.principal(first.tokens.access_token);
  expect((await service.connection(userId, connectionId)).status).toBe(
    "connected",
  );
});
it("supports RFC 7009 revocation with public clients and does not revoke an unrelated application", async () => {
  const a = await authorized(),
    other = (await register()).v;
  expect(
    (
      await request(
        "/revoke",
        "POST",
        new URLSearchParams({
          client_id: other.client_id,
          token: a.tokens.refresh_token,
        }),
        "",
      )
    ).status,
  ).toBe(200);
  await service.principal(a.tokens.access_token);
  expect(
    (
      await request(
        "/revoke",
        "POST",
        new URLSearchParams({
          client_id: a.flow.application.client_id,
          token: a.tokens.refresh_token,
        }),
        "",
      )
    ).status,
  ).toBe(200);
  await expect(service.principal(a.tokens.access_token)).rejects.toMatchObject({
    status: 401,
  });
});
it("stores confidential DCR credentials encrypted and lets the client manage them automatically", async () => {
  const { v: application, r } = await register({
    token_endpoint_auth_method: "client_secret_post",
  });
  expect(r.status).toBe(201);
  expect(application.client_secret).toBeTruthy();
  const [stored] = await query(
    "SELECT metadata,secret FROM oauth_applications WHERE id=$1",
    [application.client_id],
  );
  expect(JSON.stringify(stored)).not.toContain(application.client_secret);
  const f = await begin(application);
  const { code } = await consent(f);
  expect((await exchange(f, code)).status).toBe(400);
  expect(
    (await exchange(f, code, { client_secret: application.client_secret }))
      .status,
  ).toBe(200);
});
it("isolates users and rejects foreign-origin consent or cross-account selections", async () => {
  const f = await begin();
  await request(
    "/api/client-oauth/requests/" + f.id,
    "GET",
    undefined,
    f.cookie,
  );
  const other = await request(
    "/api/auth/register",
    "POST",
    {
      email: `other-oauth-${randomUUID()}@example.test`,
      password: "synthetic-other-password",
    },
    "",
  );
  const id = (await other.json()).id;
  try {
    expect(
      (
        await request(
          "/api/client-oauth/requests/" + f.id,
          "GET",
          undefined,
          cookieFrom(other) + "; " + cookieFrom(f.r),
        )
      ).status,
    ).toBe(404);
    const foreign = await fetch(base + "/api/client-oauth/requests/" + f.id, {
      method: "POST",
      headers: {
        cookie: f.cookie,
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ approve: true, grants: [] }),
    });
    expect(foreign.status).toBe(403);
    expect(
      (
        await request(
          "/api/client-oauth/requests/" + f.id,
          "POST",
          {
            approve: true,
            grants: [
              {
                connectionId: randomUUID(),
                tool: "demo.echo",
                approval: false,
              },
            ],
          },
          f.cookie,
        )
      ).status,
    ).toBe(400);
  } finally {
    await query("DELETE FROM users WHERE id=$1", [id]);
  }
});
it("loads and caches bounded public CIMD metadata and rejects mismatched identities", async () => {
  const id = `https://client-${randomUUID()}.example/oauth-metadata.json`;
  applicationIds.push(id);
  vi.mocked(externalFetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        client_id: id,
        client_name: "CIMD fixture",
        token_endpoint_auth_method: "none",
        redirect_uris: ["http://127.0.0.1:4195/callback"],
      }),
      { headers: { "content-type": "application/json" } },
    ),
  );
  const provider = new ClientOAuthProvider(service);
  expect((await provider.clientsStore.getClient(id))?.client_id).toBe(id);
  expect((await provider.clientsStore.getClient(id))?.client_name).toBe(
    "CIMD fixture",
  );
  expect(externalFetch).toHaveBeenCalledTimes(1);
  expect(
    await provider.clientsStore.getClient("http://127.0.0.1/metadata.json"),
  ).toBeUndefined();
  const bad = "https://bad-fixture.example/metadata.json";
  vi.mocked(externalFetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        client_id: "https://different.example",
        token_endpoint_auth_method: "none",
        redirect_uris: ["https://client.example/callback"],
      }),
      { headers: { "content-type": "application/json" } },
    ),
  );
  expect(await provider.clientsStore.getClient(bad)).toBeUndefined();
  vi.mocked(externalFetch).mockResolvedValueOnce(
    new Response("x".repeat(20000), {
      headers: { "content-type": "application/json" },
    }),
  );
  expect(await provider.clientsStore.getClient(bad)).toBeUndefined();
});
it("never exports OAuth tokens, application secrets or PKCE material in dashboard APIs", async () => {
  const a = await authorized();
  for (const path of ["/api/clients", "/api/export", "/api/activity"]) {
    const r = await request(path);
    const text = await r.text();
    expect(text).not.toContain(a.tokens.access_token);
    expect(text).not.toContain(a.tokens.refresh_token);
    expect(text).not.toContain(a.flow.verifier);
    expect(text).not.toContain("token_hash");
  }
});

it("permits browser OAuth clients only from their consented callback origin and exposes discovery challenges", async () => {
  const preflight = await fetch(base + "/mcp", {
    method: "OPTIONS",
    headers: {
      Origin: "https://browser.example",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
  expect(preflight.status).toBe(204);
  const challenge = await fetch(base + "/mcp", {
    headers: { Origin: "https://browser.example" },
  });
  expect(challenge.status).toBe(401);
  expect(challenge.headers.get("access-control-expose-headers")).toContain(
    "WWW-Authenticate",
  );
  const a = await authorized();
  const c = new Client({ name: "browser-fixture", version: "1.0.0" });
  await c.connect(
    new StreamableHTTPClientTransport(new URL(resource), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${a.tokens.access_token}`,
          Origin: "http://127.0.0.1:4195",
        },
      },
    }),
  );
  try {
    expect((await c.listTools()).tools).toHaveLength(3);
  } finally {
    await c.close();
  }
  await query(
    "UPDATE oauth_applications SET metadata=jsonb_set(metadata,'{redirect_uris}',$1::jsonb) WHERE id=$2",
    [
      JSON.stringify(["https://evil.example/callback"]),
      a.flow.application.client_id,
    ],
  );
  const denied = await fetch(base + "/mcp", {
    headers: {
      Authorization: `Bearer ${a.tokens.access_token}`,
      Origin: "https://evil.example",
    },
  });
  expect(denied.status).toBe(403);
});
