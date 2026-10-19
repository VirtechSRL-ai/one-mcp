import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
test("onboarding, permissions, actual MCP call, activity, revocation and themes", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Make the connection." }),
  ).toBeVisible();
  await page
    .getByLabel("Email", { exact: true })
    .fill(`qa-${randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-qa-password");
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
  await page.getByRole("button", { name: "AI Clients", exact: true }).click();
  await page.getByLabel("Client name").fill("QA MCP client");
  await page.getByRole("button", { name: "Create client key" }).click();
  await expect(
    page.getByRole("heading", { name: "Save this key now" }),
  ).toBeVisible();
  const secret = await page.locator(".key").innerText();
  await page.getByRole("button", { name: "I saved the key" }).click();
  await page.getByLabel("demo.echo").click();
  await expect(page.getByLabel("demo.echo")).toBeChecked();
  const client = new Client({ name: "playwright-qa", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${secret}` } },
    }),
  );
  const search = await client.callTool({
    name: "one_search_tools",
    arguments: { query: "echo" },
  });
  const tools = JSON.parse((search.content as any)[0].text);
  expect(tools).toHaveLength(1);
  const call = await client.callTool({
    name: "one_call_tool",
    arguments: {
      connectionId: tools[0].connectionId,
      name: "demo.echo",
      arguments: { message: "QA SYNTHETIC" },
    },
  });
  expect(call.isError).toBeFalsy();
  await client.close();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByText("success", { exact: true })).toBeVisible();
  for (const view of [
    "Overview",
    "Connections",
    "AI Clients",
    "MCP Servers",
    "Tool Explorer",
    "Approvals",
    "Settings",
  ]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: `.impeccable/review/${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: `.impeccable/review/${info.project.name}-dark.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "AI Clients", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(page.getByText("revoked", { exact: true })).toBeVisible();
  const revoked = new Client({ name: "revoked-fixture", version: "1.0.0" });
  await expect(
    revoked.connect(
      new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"), {
        requestInit: { headers: { Authorization: `Bearer ${secret}` } },
      }),
    ),
  ).rejects.toThrow();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await expect(page.getByText("connected", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
