import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildApp } from "../apps/api/src/app.js";
import { Service } from "../apps/api/src/service.js";
import { query, pool } from "../apps/api/src/db.js";
import { hash } from "../packages/core/src/security.js";
const base = "http://localhost:4179",
  service = new Service(base, "b".repeat(64));
let app: Awaited<ReturnType<typeof buildApp>>,
  userId: string,
  cookie: string,
  connection: string,
  first: any,
  second: any;
const origin = { origin: base, host: "localhost:4179" };
async function request(
  url: string,
  method = "GET",
  body?: unknown,
  c = cookie,
) {
  return app.inject({
    url,
    method: method as any,
    headers: { ...origin, ...(c ? { cookie: c } : {}) },
    payload: body as any,
  });
}
async function mcp(secret: string) {
  const c = new Client({ name: "integration-client", version: "1.0.0" });
  await c.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${secret}` } },
    }),
  );
  return c;
}
const result = (v: any) => JSON.parse(v.content[0].text);
beforeAll(async () => {
  app = await buildApp(service);
  await app.listen({ port: 4179, host: "127.0.0.1" });
  const r = await request(
    "/api/auth/register",
    "POST",
    {
      email: `test-${randomUUID()}@example.test`,
      password: "synthetic-test-password",
    },
    "",
  );
  expect(r.statusCode).toBe(200);
  cookie = r.headers["set-cookie"]!.toString().split(";")[0];
  userId = r.json().id;
  await request("/api/connections/demo", "POST");
  connection = (await request("/api/connections")).json()[0].id;
  first = (
    await request("/api/clients", "POST", { name: "Claude fixture" })
  ).json();
  second = (
    await request("/api/clients", "POST", { name: "Codex fixture" })
  ).json();
});
afterAll(async () => {
  vi.restoreAllMocks();
  await query("DELETE FROM users WHERE id=$1", [userId]);
  await app.close();
  await pool.end();
});
describe("real PostgreSQL + official MCP SDK", () => {
  it("authenticates and exposes stable discovery tools", async () => {
    const c = await mcp(first.token);
    try {
      const list = await c.listTools();
      expect(list.tools.map((t) => t.name)).toEqual([
        "one_search_tools",
        "one_call_tool",
        "one_approval_status",
      ]);
      expect(
        result(
          await c.callTool({
            name: "one_search_tools",
            arguments: { query: "" },
          }),
        ),
      ).toEqual([]);
    } finally {
      await c.close();
    }
  });
  it("enforces deny by default on direct invocation", async () => {
    const c = await mcp(first.token);
    try {
      const r = await c.callTool({
        name: "one_call_tool",
        arguments: {
          connectionId: connection,
          name: "demo.echo",
          arguments: { message: "hello" },
        },
      });
      expect(r.isError).toBe(true);
      expect(result(r).error).toBe("tool_not_granted");
    } finally {
      await c.close();
    }
  });
  it("shares one persistent connection across two separately granted clients", async () => {
    for (const key of [first, second]) {
      expect(
        (
          await request("/api/grants", "PUT", {
            clientId: key.id,
            connectionId: connection,
            tool: "demo.echo",
            enabled: true,
          })
        ).statusCode,
      ).toBe(200);
      const c = await mcp(key.token);
      try {
        expect(
          result(
            await c.callTool({
              name: "one_search_tools",
              arguments: { query: "echo" },
            }),
          )[0].connectionId,
        ).toBe(connection);
        expect(
          result(
            await c.callTool({
              name: "one_call_tool",
              arguments: {
                connectionId: connection,
                name: "demo.echo",
                arguments: { message: "synthetic QA" },
              },
            }),
          ),
        ).toEqual({ status: "success", result: { message: "synthetic QA" } });
      } finally {
        await c.close();
      }
    }
    expect((await request("/api/connections")).json()).toHaveLength(1);
  });
  it("revokes only the second client", async () => {
    await request(`/api/clients/${second.id}`, "DELETE");
    await expect(mcp(second.token)).rejects.toThrow();
    const c = await mcp(first.token);
    try {
      expect(
        result(
          await c.callTool({
            name: "one_search_tools",
            arguments: { query: "" },
          }),
        ),
      ).toHaveLength(1);
    } finally {
      await c.close();
    }
    expect((await request("/api/connections")).json()[0].status).toBe(
      "connected",
    );
  });
  it("rejects expired and unknown credentials", async () => {
    const expired = await service.issueClient(userId, "Expired");
    await query(
      "UPDATE clients SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [expired.id],
    );
    await expect(service.principal(expired.token)).rejects.toMatchObject({
      status: 401,
    });
    await expect(service.principal("unknown")).rejects.toMatchObject({
      status: 401,
    });
  });
  it("isolates another user and binds encrypted credentials to an account", async () => {
    const r = await request(
      "/api/auth/register",
      "POST",
      {
        email: `other-${randomUUID()}@example.test`,
        password: "another-test-password",
      },
      "",
    );
    const other = r.json().id,
      otherCookie = r.headers["set-cookie"]!.toString().split(";")[0];
    try {
      expect(
        (
          await request("/api/connections", "GET", undefined, otherCookie)
        ).json(),
      ).toEqual([]);
      expect(
        (
          await request(
            "/api/grants",
            "PUT",
            {
              clientId: first.id,
              connectionId: connection,
              tool: "demo.echo",
              enabled: true,
            },
            otherCookie,
          )
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await request(
            `/api/connections/${connection}`,
            "DELETE",
            undefined,
            otherCookie,
          )
        ).statusCode,
      ).toBe(404);
    } finally {
      await query("DELETE FROM users WHERE id=$1", [other]);
    }
  });
  it("prevents browser CSRF and hostile Host/Origin", async () => {
    expect(
      (
        await app.inject({
          url: "/api/clients",
          method: "POST",
          headers: {
            host: "localhost:4179",
            cookie,
            origin: "https://evil.example",
          },
          payload: { name: "evil" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/clients",
          method: "POST",
          headers: { host: "localhost:4179", cookie },
          payload: { name: "evil" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ url: "/health", headers: { host: "evil.example" } }))
        .statusCode,
    ).toBe(403);
  });
  it("requires immutable human approval and atomically prevents replay", async () => {
    await request("/api/grants", "PUT", {
      clientId: first.id,
      connectionId: connection,
      tool: "demo.echo",
      enabled: true,
      approval: true,
    });
    const p = await service.principal(first.token);
    const pending = (await service.call(p, connection, "demo.echo", {
      message: "private content",
    })) as any;
    expect(pending.status).toBe("approval_required");
    const [stored] = await query("SELECT args FROM approvals WHERE id=$1", [
      pending.approvalId,
    ]);
    expect(stored.args).not.toContain("private content");
    const results = await Promise.allSettled([
      service.decide(userId, pending.approvalId, true),
      service.decide(userId, pending.approvalId, true),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        await query("SELECT state FROM approvals WHERE id=$1", [
          pending.approvalId,
        ])
      )[0].state,
    ).toBe("executed");
  });
  it("rechecks grants when approving and rejects expired approvals", async () => {
    const p = await service.principal(first.token);
    const pending = (await service.call(p, connection, "demo.echo", {
      message: "hello",
    })) as any;
    await query("DELETE FROM grants WHERE client_id=$1", [first.id]);
    await expect(
      service.decide(userId, pending.approvalId, true),
    ).rejects.toMatchObject({ status: 403 });
    await query(
      "UPDATE approvals SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [pending.approvalId],
    );
    await expect(
      service.decide(userId, pending.approvalId, true),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("does not leak secrets through connection, export or activity APIs", async () => {
    const id = randomUUID(),
      secret = "NEVER_EXPOSE_THIS_UPSTREAM_TOKEN";
    await query(
      "INSERT INTO connections(id,user_id,provider,account,secret,scopes) VALUES($1,$2,'github','synthetic-account',$3,ARRAY['repo'])",
      [
        id,
        userId,
        service.vault.seal({ access_token: secret }, `${userId}:${id}`),
      ],
    );
    for (const path of ["/api/connections", "/api/export", "/api/activity"]) {
      const r = await request(path);
      expect(r.statusCode).toBe(200);
      expect(r.body).not.toContain(secret);
      expect(r.body).not.toContain("private content");
      expect(r.body).not.toContain("token_hash");
    }
  });
  it("serializes refresh and preserves rotated upstream tokens", async () => {
    const id = randomUUID();
    await query(
      "INSERT INTO connections(id,user_id,provider,account,secret,scopes) VALUES($1,$2,'google','refresh-test',$3,ARRAY['openid'])",
      [
        id,
        userId,
        service.vault.seal(
          {
            access_token: "old",
            refresh_token: "rotate-me",
            expires_at: Date.now() - 1000,
          },
          `${userId}:${id}`,
        ),
      ],
    );
    const refresh = vi.fn(async () => ({
      access_token: "fresh",
      refresh_token: "rotated",
      expires_at: Date.now() + 3600000,
    }));
    service.oauth = { exchange: vi.fn(), refresh };
    const c = await service.connection(userId, id);
    const values = await Promise.all([
      service.credentials(c),
      service.credentials(c),
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(values.every((v) => v.access_token === "fresh")).toBe(true);
    const reread = await service.connection(userId, id);
    expect(
      service.vault.open<any>(reread.secret, `${userId}:${id}`).refresh_token,
    ).toBe("rotated");
  });
  it("rejects unconfigured providers, OAuth state replay and SSRF endpoints", async () => {
    expect(
      (
        await request(
          "/api/oauth/google/callback?state=invalid-state-long-enough&code=bad",
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request("/api/external", "POST", {
          name: "private",
          endpoint: "https://127.0.0.1/mcp",
        })
      ).statusCode,
    ).toBe(400);
  });
  it("binds provider OAuth to the browser session, consumes state once and reuses the resulting connection across clients", async () => {
    const previousId = process.env.GITHUB_CLIENT_ID,
      previousSecret = process.env.GITHUB_CLIENT_SECRET;
    process.env.GITHUB_CLIENT_ID = "synthetic-client";
    process.env.GITHUB_CLIENT_SECRET = "synthetic-secret";
    const previousEngine = service.oauth;
    service.oauth = {
      exchange: vi.fn(async () => ({
        access_token: "synthetic-provider-token",
        scope: "repo",
      })),
      refresh: vi.fn(),
    };
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (url === "https://api.github.com/user")
          return new Response(
            JSON.stringify({ login: "oauth-fixture", id: 901 }),
          );
        if (url.startsWith("https://api.github.com/user/repos"))
          return new Response(JSON.stringify([{ name: "synthetic-repo" }]));
        return originalFetch(input, init);
      });
    try {
      const start = await request("/api/oauth/github/start", "POST");
      expect(start.statusCode).toBe(200);
      const authUrl = new URL(start.json().url);
      expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
      const state = authUrl.searchParams.get("state")!;
      const callback =
        "/api/oauth/github/callback?state=" +
        encodeURIComponent(state) +
        "&code=fixture-code";
      expect((await request(callback, "GET", undefined, "")).statusCode).toBe(
        401,
      );
      expect((await request(callback)).statusCode).toBe(302);
      expect((await request(callback)).statusCode).toBe(400);
      const upstream = (await request("/api/connections"))
        .json()
        .find((c: any) => c.account === "oauth-fixture (#901)");
      expect(upstream).toBeTruthy();
      const keys = await Promise.all([
        service.issueClient(userId, "Provider first client"),
        service.issueClient(userId, "Provider second client"),
      ]);
      for (const key of keys) {
        await request("/api/grants", "PUT", {
          clientId: key.id,
          connectionId: upstream.id,
          tool: "github.list_repositories",
          enabled: true,
        });
        const client = await mcp(key.token);
        try {
          const v = result(
            await client.callTool({
              name: "one_call_tool",
              arguments: {
                connectionId: upstream.id,
                name: "github.list_repositories",
                arguments: { limit: 5 },
              },
            }),
          );
          expect(v.result).toEqual([{ name: "synthetic-repo" }]);
        } finally {
          await client.close();
        }
      }
      expect(service.oauth.exchange).toHaveBeenCalledTimes(1);
      await request("/api/clients/" + keys[1].id, "DELETE");
      await expect(mcp(keys[1].token)).rejects.toThrow();
      expect((await service.connection(userId, upstream.id)).status).toBe(
        "connected",
      );
    } finally {
      fetchSpy.mockRestore();
      service.oauth = previousEngine;
      if (previousId === undefined) delete process.env.GITHUB_CLIENT_ID;
      else process.env.GITHUB_CLIENT_ID = previousId;
      if (previousSecret === undefined) delete process.env.GITHUB_CLIENT_SECRET;
      else process.env.GITHUB_CLIENT_SECRET = previousSecret;
    }
  });
  it("disconnects an account persistently and removes grants", async () => {
    expect(
      (await request(`/api/connections/${connection}`, "DELETE")).statusCode,
    ).toBe(200);
    await expect(service.connection(userId, connection)).rejects.toMatchObject({
      status: 404,
    });
  });
});
