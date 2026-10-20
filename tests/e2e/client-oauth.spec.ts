import { test, expect, type Page } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { MemoryOAuthClient } from "../helpers/memory-oauth.js";
const base = "http://localhost:3000";
async function authorize(page: Page, name: string, screenshot?: string) {
  let callback: URL | undefined;
  const server = createServer((req, res) => {
    callback = new URL(req.url!, "http://127.0.0.1");
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OAuth callback received by the synthetic MCP client.");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const callbackUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
  const provider = new MemoryOAuthClient(callbackUrl, name);
  try {
    // No pre-issued keys or application IDs: official SDK performs metadata discovery and DCR.
    expect(await auth(provider, { serverUrl: base + "/mcp" })).toBe("REDIRECT");
    expect(provider.authorizationUrl?.pathname).toBe("/authorize");
    await page.goto(provider.authorizationUrl!.href);
    await expect(
      page.getByRole("heading", { name: `Connect ${name}`, exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("demo.echo")).not.toBeChecked();
    await page.getByLabel("demo.echo").check();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (screenshot)
      await page.screenshot({
        path: screenshot,
        fullPage: true,
        animations: "disabled",
      });
    await page
      .getByRole("button", { name: "Authorize 1 tool", exact: true })
      .click();
    await page.waitForURL(callbackUrl + "?**");
    expect(callback!.searchParams.get("state")).toBe(provider.expectedState);
    expect(callback!.searchParams.get("iss")).toBe(base + "/");
    expect(callback!.searchParams.get("code")).toBeTruthy();
    expect(
      await auth(provider, {
        serverUrl: base + "/mcp",
        authorizationCode: callback!.searchParams.get("code")!,
      }),
    ).toBe("AUTHORIZED");
    const client = new Client({ name, version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
        authProvider: provider,
      }),
    );
    return { provider, client };
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
}
test("URL-only OAuth: two clients reuse a connection, rotate credentials automatically and revoke independently", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page
    .getByLabel("Email", { exact: true })
    .fill(`qa-oauth-${randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-oauth-qa-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your AI, connected." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.getByRole("button", { name: "Enable verification tool" }).click();
  await expect(
    page.getByText("Built-in verification", { exact: true }),
  ).toHaveCount(2);
  const first = await authorize(
    page,
    "QA first OAuth client",
    `.impeccable/review/oauth-${info.project.name}.png`,
  );
  let second: Awaited<ReturnType<typeof authorize>> | undefined;
  try {
    const discovered = await first.client.callTool({
      name: "one_search_tools",
      arguments: { query: "echo" },
    });
    const tools = JSON.parse((discovered.content as any)[0].text);
    expect(tools).toHaveLength(1);
    const connectionId = tools[0].connectionId;
    expect(
      (
        await first.client.callTool({
          name: "one_call_tool",
          arguments: {
            connectionId,
            name: "demo.echo",
            arguments: { message: "QA OAuth first" },
          },
        })
      ).isError,
    ).toBeFalsy();
    const oldRefresh = first.provider.savedTokens!.refresh_token;
    expect(await auth(first.provider, { serverUrl: base + "/mcp" })).toBe(
      "AUTHORIZED",
    );
    expect(first.provider.savedTokens!.refresh_token).not.toBe(oldRefresh);
    await page.goto(base + "/?view=Settings");
    await page.getByRole("button", { name: "Dark theme", exact: true }).click();
    second = await authorize(
      page,
      "QA second OAuth client",
      `.impeccable/review/oauth-${info.project.name}-dark.png`,
    );
    const secondTools = JSON.parse(
      (
        (
          await second.client.callTool({
            name: "one_search_tools",
            arguments: { query: "echo" },
          })
        ).content as any
      )[0].text,
    );
    expect(secondTools[0].connectionId).toBe(connectionId);
    expect(
      (
        await second.client.callTool({
          name: "one_call_tool",
          arguments: {
            connectionId,
            name: "demo.echo",
            arguments: { message: "QA OAuth second" },
          },
        })
      ).isError,
    ).toBeFalsy();
    await page.goto(base + "/?view=AI%20Clients");
    await expect(
      page.getByRole("heading", { name: "Connect with your MCP URL" }),
    ).toBeVisible();
    const secondSection = page.locator("section").filter({
      has: page.getByRole("heading", {
        name: "QA second OAuth client",
        exact: true,
      }),
    });
    page.once("dialog", (d) => d.accept());
    await secondSection
      .getByRole("button", { name: "Revoke", exact: true })
      .click();
    await expect(
      secondSection.getByText("revoked", { exact: true }),
    ).toBeVisible();
    await expect(second.client.listTools()).rejects.toThrow();
    expect(
      (
        await first.client.callTool({
          name: "one_call_tool",
          arguments: {
            connectionId,
            name: "demo.echo",
            arguments: { message: "QA first still connected" },
          },
        })
      ).isError,
    ).toBeFalsy();
    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await expect(page.getByText("connected", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await first.client.close();
    await second?.client.close();
  }
});
