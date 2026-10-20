import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  auth,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
  OAuthClientMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";

const base = new URL(process.env.PUBLIC_URL || "http://localhost:3000").origin,
  resource = base + "/mcp";
class LiveClient implements OAuthClientProvider {
  info: OAuthClientInformationMixed | undefined;
  credentials: OAuthTokens | undefined;
  verifier = "";
  expectedState = randomUUID();
  discovery: OAuthDiscoveryState | undefined;
  constructor(
    readonly redirectUrl: string,
    readonly name: string,
  ) {}
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: this.name,
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "one:mcp",
    };
  }
  clientInformation() {
    return this.info;
  }
  saveClientInformation(v: OAuthClientInformationMixed) {
    this.info = v;
  }
  tokens() {
    return this.credentials;
  }
  saveTokens(v: OAuthTokens) {
    this.credentials = v;
  }
  codeVerifier() {
    return this.verifier;
  }
  saveCodeVerifier(v: string) {
    this.verifier = v;
  }
  state() {
    return this.expectedState;
  }
  saveDiscoveryState(v: OAuthDiscoveryState) {
    this.discovery = v;
  }
  discoveryState() {
    return this.discovery;
  }
  redirectToAuthorization(url: URL) {
    const program =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "rundll32"
          : "xdg-open";
    const args =
      process.platform === "win32"
        ? ["url.dll,FileProtocolHandler", url.href]
        : [url.href];
    execFile(program, args, (error) => {
      if (error)
        console.error(
          "Could not open a browser automatically. Restart this check on a computer with a browser.",
        );
    });
  }
  invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ) {
    if (scope === "all" || scope === "tokens") this.credentials = undefined;
    if (scope === "all" || scope === "client") this.info = undefined;
    if (scope === "all" || scope === "verifier") this.verifier = "";
    if (scope === "all" || scope === "discovery") this.discovery = undefined;
  }
}
async function connect(name: string) {
  let resolve!: (code: string) => void, reject!: (e: Error) => void;
  const callback = new Promise<string>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  let provider: LiveClient;
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      res.writeHead(404);
      res.end();
      return;
    }
    const expectedIssuer =
      provider.discovery?.authorizationServerMetadata?.issuer;
    if (
      url.searchParams.get("state") !== provider.expectedState ||
      url.searchParams.get("iss") !== expectedIssuer
    ) {
      res.writeHead(400);
      res.end("Invalid OAuth response.");
      return;
    }
    if (url.searchParams.has("error")) {
      res.writeHead(400);
      res.end("Authorization was denied.");
      reject(new Error("Client authorization denied"));
      return;
    }
    const code = url.searchParams.get("code");
    if (!code) {
      res.writeHead(400);
      res.end("Missing authorization code.");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
    });
    res.end("ONE client authorized. Return to the verification terminal.");
    resolve(code);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  provider = new LiveClient(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`,
    name,
  );
  const timer = setTimeout(
    () => reject(new Error("Authorization timed out after ten minutes")),
    600000,
  );
  try {
    console.log(
      `Opening browser for ${name}. Select the GitHub repository-list and Google Drive search tools.`,
    );
    if ((await auth(provider, { serverUrl: resource })) !== "REDIRECT")
      throw new Error("Expected interactive authorization");
    const code = await callback;
    if (
      (await auth(provider, {
        serverUrl: resource,
        authorizationCode: code,
      })) !== "AUTHORIZED"
    )
      throw new Error("Token exchange failed");
    const client = new Client({ name, version: "0.1.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        authProvider: provider,
      }),
    );
    return { client, provider };
  } finally {
    clearTimeout(timer);
    await new Promise<void>((r) => server.close(() => r()));
  }
}
const decoded = (value: any) => {
  if (value.isError) throw new Error("MCP tool failed");
  const parsed = JSON.parse(value.content[0].text);
  if (parsed.status && parsed.status !== "success")
    throw new Error("Expected a read operation without pending approval");
  return parsed;
};
async function selected(client: Client) {
  const list = decoded(
    await client.callTool({
      name: "one_search_tools",
      arguments: { query: "" },
    }),
  );
  const github = list.find((t: any) => t.name === "github.list_repositories"),
    google = list.find((t: any) => t.name === "drive.search_files");
  if (!github || !google)
    throw new Error(
      "Connect real Google/GitHub accounts and explicitly grant github.list_repositories and drive.search_files, then retry.",
    );
  return { github, google };
}
async function read(
  client: Client,
  tools: Awaited<ReturnType<typeof selected>>,
) {
  for (const [tool, args] of [
    [tools.github, { limit: 1 }],
    [tools.google, { query: "ONE QA " + randomUUID(), limit: 1 }],
  ] as const)
    decoded(
      await client.callTool({
        name: "one_call_tool",
        arguments: {
          connectionId: tool.connectionId,
          name: tool.name,
          arguments: args,
        },
      }),
    );
}
async function revoke(p: LiveClient) {
  if (!p.credentials?.refresh_token || !p.info) return;
  const meta = p.discovery?.authorizationServerMetadata;
  const endpoint =
    meta && "revocation_endpoint" in meta
      ? meta.revocation_endpoint
      : undefined;
  if (typeof endpoint !== "string")
    throw new Error("Missing revocation endpoint");
  if (new URL(endpoint).origin !== base)
    throw new Error("Unexpected revocation authority");
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: p.info.client_id,
      token: p.credentials.refresh_token,
    }),
  });
  if (!r.ok) throw new Error("Client revocation failed");
}
if (process.argv.includes("--check")) {
  const r = await fetch(base + "/.well-known/oauth-protected-resource/mcp");
  if (!r.ok) throw new Error("OAuth discovery unavailable");
  const v = (await r.json()) as any;
  if (v.resource !== resource) throw new Error("Resource mismatch");
  console.log(
    "OAuth protected-resource discovery is reachable and identifies this MCP endpoint. No account authorization was performed.",
  );
} else {
  let first: Awaited<ReturnType<typeof connect>> | undefined,
    second: Awaited<ReturnType<typeof connect>> | undefined;
  try {
    first = await connect("ONE LIVE QA first client");
    const tools = await selected(first.client);
    await read(first.client, tools);
    console.log(
      "First client: real GitHub and Google read requests succeeded. Provider response content is not printed.",
    );
    second = await connect("ONE LIVE QA second client");
    const shared = await selected(second.client);
    if (
      shared.github.connectionId !== tools.github.connectionId ||
      shared.google.connectionId !== tools.google.connectionId
    )
      throw new Error("Select the same existing accounts for both clients");
    await read(second.client, shared);
    await revoke(second.provider);
    const denied = await fetch(resource, {
      headers: {
        Authorization: `Bearer ${second.provider.credentials!.access_token}`,
      },
    });
    if (denied.status !== 401)
      throw new Error("Revoked second client was not denied");
    await read(first.client, tools);
    console.log(
      "PASS: two OAuth clients reused the same real connections; revoking the second denied it while the first still worked.",
    );
  } finally {
    await first?.client.close();
    await second?.client.close();
    if (first) await revoke(first.provider);
    if (second) await revoke(second.provider);
  }
}
