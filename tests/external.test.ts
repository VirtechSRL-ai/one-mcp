import { it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
// Replace only the network boundary. Production endpoint validation remains active;
// synthetic public DNS name is routed to the local SDK fixture in this test only.
vi.mock("../packages/core/src/security.js", async (original) => {
  const actual =
    await original<typeof import("../packages/core/src/security.js")>();
  return {
    ...actual,
    externalFetch: async (input: any, init: any) => {
      const u = new URL(
        typeof input === "string" ? input : input.url || input.href,
      );
      if (u.hostname !== "fixture.example.com")
        throw new Error("unexpected upstream");
      return fetch("http://127.0.0.1:4180" + u.pathname, {
        ...init,
        redirect: "error",
      });
    },
  };
});
import { Service } from "../apps/api/src/service.js";
import { buildApp } from "../apps/api/src/app.js";
import { query, pool } from "../apps/api/src/db.js";
const service = new Service("http://localhost:4181", "c".repeat(64));
let upstream: ReturnType<typeof Fastify>,
  app: Awaited<ReturnType<typeof buildApp>>,
  owner: string,
  cookie: string,
  connectionId: string,
  calls = 0;
beforeAll(async () => {
  upstream = Fastify();
  upstream.all("/mcp", async (req: any, reply: any) => {
    if (req.headers.authorization !== "Bearer fixture-upstream") {
      reply.code(401).send();
      return;
    }
    const server = new McpServer({
      name: "external-fixture",
      version: "1.0.0",
    });
    server.registerTool(
      "fixture_add",
      {
        description: "A synthetic upstream write",
        inputSchema: { value: z.number().int().max(100) },
      },
      async ({ value }) => {
        calls++;
        return { content: [{ type: "text", text: String(value + 1) }] };
      },
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    reply.hijack();
    reply.raw.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
  await upstream.listen({ host: "127.0.0.1", port: 4180 });
  app = await buildApp(service);
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { host: "localhost:4181", origin: "http://localhost:4181" },
    payload: {
      email: `external-${randomUUID()}@example.test`,
      password: "fixture-long-password",
    },
  });
  owner = r.json().id;
  cookie = r.headers["set-cookie"]!.toString().split(";")[0];
});
afterAll(async () => {
  await query("DELETE FROM users WHERE id=$1", [owner]);
  await app.close();
  await upstream.close();
  await pool.end();
});
it("registers through real upstream SDK discovery, validates schema and executes an approved action once", async () => {
  const r = await app.inject({
    method: "POST",
    url: "/api/external",
    headers: {
      host: "localhost:4181",
      origin: "http://localhost:4181",
      cookie,
    },
    payload: {
      name: "Synthetic external MCP",
      endpoint: "https://fixture.example.com/mcp",
      token: "fixture-upstream",
    },
  });
  expect(r.statusCode).toBe(200);
  expect(r.json().tools).toBe(1);
  connectionId = r.json().id;
  const client = await service.issueClient(owner, "External fixture client");
  const p = await service.principal(client.token);
  await query(
    "INSERT INTO grants(client_id,connection_id,tool) VALUES($1,$2,$3)",
    [client.id, connectionId, "fixture_add"],
  );
  expect((await service.search(p, "synthetic"))[0].name).toBe("fixture_add");
  await expect(
    service.call(p, connectionId, "fixture_add", { value: "invalid" }),
  ).rejects.toMatchObject({ status: 400 });
  const pending = (await service.call(p, connectionId, "fixture_add", {
    value: 3,
  })) as any;
  expect(pending.status).toBe("approval_required");
  expect(calls).toBe(0);
  await service.decide(owner, pending.approvalId, true);
  expect(calls).toBe(1);
  await expect(
    service.decide(owner, pending.approvalId, true),
  ).rejects.toMatchObject({ status: 409 });
  expect(calls).toBe(1);
});
it("returns a safe failure when an external server becomes unavailable", async () => {
  await upstream.close();
  const client = await service.issueClient(
    owner,
    "Unavailable upstream client",
  );
  await query(
    "INSERT INTO grants(client_id,connection_id,tool) VALUES($1,$2,$3)",
    [client.id, connectionId, "fixture_add"],
  );
  const pending = (await service.call(
    await service.principal(client.token),
    connectionId,
    "fixture_add",
    { value: 4 },
  )) as any;
  await expect(
    service.decide(owner, pending.approvalId, true),
  ).rejects.toMatchObject({ code: "provider_request_failed" });
});
