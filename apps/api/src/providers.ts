import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  externalFetch,
  validateEndpoint,
} from "../../../packages/core/src/security.js";
export type Credential = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  scope?: string;
};
export type Connection = {
  id: string;
  user_id: string;
  provider: string;
  account: string;
  status: string;
  secret: string;
  scopes: string[];
  endpoint?: string;
};
export type Tool = {
  name: string;
  provider: string;
  description: string;
  scope: string;
  write: boolean;
  schema: Record<string, unknown>;
  parse: (v: unknown) => any;
  run: (v: any, credential: Credential) => Promise<unknown>;
};
const schema = (shape: Record<string, z.ZodType>) => {
  const v = z.object(shape).strict();
  return {
    schema: z.toJSONSchema(v) as Record<string, unknown>,
    parse: (x: unknown) => v.parse(x),
  };
};
async function api(url: string, c: Credential, method = "GET", body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${c.access_token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!r.ok) throw new ProviderError(r.status);
  return r.status === 204 ? {} : r.json();
}
export class ProviderError extends Error {
  constructor(public status: number) {
    super("Provider request failed");
  }
}
const text = z.string().min(1).max(1000),
  limit = z.number().int().min(1).max(50).default(20);
export const nativeTools: Tool[] = [
  {
    name: "demo.echo",
    provider: "demo",
    description:
      "Echo a short message. Built-in verification tool; no external service.",
    scope: "demo",
    write: false,
    ...schema({ message: text }),
    run: async (v) => ({ message: v.message }),
  },
  {
    name: "github.list_repositories",
    provider: "github",
    description:
      "List repositories accessible to the connected GitHub account.",
    scope: "repo",
    write: false,
    ...schema({ limit }),
    run: (v, c) =>
      api(
        `https://api.github.com/user/repos?sort=updated&per_page=${v.limit}`,
        c,
      ),
  },
  {
    name: "github.get_repository",
    provider: "github",
    description: "Read repository metadata from GitHub.",
    scope: "repo",
    write: false,
    ...schema({
      owner: z.string().regex(/^[\w.-]+$/),
      repository: z.string().regex(/^[\w.-]+$/),
    }),
    run: (v, c) =>
      api(
        `https://api.github.com/repos/${encodeURIComponent(v.owner)}/${encodeURIComponent(v.repository)}`,
        c,
      ),
  },
  {
    name: "gmail.search_messages",
    provider: "google",
    description:
      "Search Gmail messages using Gmail query syntax. Returns message identifiers.",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    write: false,
    ...schema({ query: text, limit }),
    run: (v, c) =>
      api(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(v.query)}&maxResults=${v.limit}`,
        c,
      ),
  },
  {
    name: "gmail.get_message",
    provider: "google",
    description: "Read a Gmail message by identifier.",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    write: false,
    ...schema({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/) }),
    run: (v, c) =>
      api(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${v.id}?format=full`,
        c,
      ),
  },
  {
    name: "drive.search_files",
    provider: "google",
    description:
      "Search Google Drive filenames. Returns file metadata, not file contents.",
    scope: "https://www.googleapis.com/auth/drive.metadata.readonly",
    write: false,
    ...schema({ query: text, limit }),
    run: (v, c) =>
      api(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("trashed = false and name contains '" + v.query.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'")}&pageSize=${v.limit}&fields=files(id,name,mimeType,webViewLink)`,
        c,
      ),
  },
  {
    name: "calendar.list_events",
    provider: "google",
    description: "List upcoming events from the primary Google Calendar.",
    scope: "https://www.googleapis.com/auth/calendar.events.readonly",
    write: false,
    ...schema({ limit }),
    run: (v, c) =>
      api(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(new Date().toISOString())}&maxResults=${v.limit}`,
        c,
      ),
  },
  {
    name: "slack.list_channels",
    provider: "slack",
    description: "List public Slack channels visible to the connected app.",
    scope: "channels:read",
    write: false,
    ...schema({ limit }),
    run: (v, c) =>
      api(
        `https://slack.com/api/conversations.list?limit=${v.limit}&types=public_channel`,
        c,
      ).then(checkSlack),
  },
  {
    name: "slack.send_message",
    provider: "slack",
    description:
      "Send a message to a Slack channel. Always requires human approval.",
    scope: "chat:write",
    write: true,
    ...schema({
      channel: z.string().regex(/^[A-Z0-9]{2,100}$/),
      text: z.string().min(1).max(4000),
    }),
    run: (v, c) =>
      api("https://slack.com/api/chat.postMessage", c, "POST", v).then(
        checkSlack,
      ),
  },
];
function checkSlack(v: any) {
  if (!v.ok) throw new ProviderError(v.error === "invalid_auth" ? 401 : 400);
  return v;
}
export async function externalClient(connection: Connection, c: Credential) {
  validateEndpoint(connection.endpoint!);
  const transport = new StreamableHTTPClientTransport(
    new URL(connection.endpoint!),
    {
      fetch: externalFetch,
      requestInit: {
        headers: c.access_token
          ? { Authorization: `Bearer ${c.access_token}` }
          : {},
      },
    },
  );
  const client = new Client({ name: "one-upstream", version: "0.1.0" });
  try {
    await client.connect(transport);
    return client;
  } catch (e) {
    await transport.close().catch(() => {});
    throw e;
  }
}
export const oauthProviders = {
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "read:user"],
    pkce: true,
  },
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scopes: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
      "https://www.googleapis.com/auth/calendar.events.readonly",
    ],
    pkce: true,
  },
  slack: {
    authorize: "https://slack.com/oauth/v2/authorize",
    token: "https://slack.com/api/oauth.v2.access",
    scopes: ["channels:read", "chat:write"],
    pkce: false,
  },
};
export type OAuthProvider = keyof typeof oauthProviders;
export interface OAuthEngine {
  exchange(
    provider: OAuthProvider,
    code: string,
    verifier: string,
  ): Promise<Credential>;
  refresh(provider: OAuthProvider, credential: Credential): Promise<Credential>;
}
export class DirectOAuthEngine implements OAuthEngine {
  constructor(private base: string) {}
  async request(
    provider: OAuthProvider,
    params: Record<string, string>,
  ): Promise<Credential> {
    const prefix = provider.toUpperCase();
    const r = await fetch(oauthProviders[provider].token, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: process.env[`${prefix}_CLIENT_ID`]!,
        client_secret: process.env[`${prefix}_CLIENT_SECRET`]!,
        ...params,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    const v = (await r.json()) as any;
    if (!r.ok || v.error || !v.access_token) throw new ProviderError(401);
    return {
      access_token: v.access_token,
      refresh_token: v.refresh_token,
      expires_at: v.expires_in ? Date.now() + v.expires_in * 1000 : undefined,
      scope: v.scope,
    };
  }
  exchange(provider: OAuthProvider, code: string, verifier: string) {
    return this.request(provider, {
      grant_type: "authorization_code",
      code,
      redirect_uri: `${this.base}/api/oauth/${provider}/callback`,
      ...(oauthProviders[provider].pkce ? { code_verifier: verifier } : {}),
    });
  }
  async refresh(provider: OAuthProvider, c: Credential) {
    if (!c.refresh_token) throw new ProviderError(401);
    const v = await this.request(provider, {
      grant_type: "refresh_token",
      refresh_token: c.refresh_token,
    });
    return { ...v, refresh_token: v.refresh_token || c.refresh_token };
  }
}
export async function accountIdentity(
  provider: OAuthProvider,
  c: Credential,
): Promise<string> {
  if (provider === "github") {
    const u = (await api("https://api.github.com/user", c)) as any;
    return `${u.login} (#${u.id})`;
  }
  if (provider === "google") {
    const u = (await api(
      "https://openidconnect.googleapis.com/v1/userinfo",
      c,
    )) as any;
    return `${u.email} (${u.sub})`;
  }
  const u = checkSlack(await api("https://slack.com/api/auth.test", c));
  return `${u.team} / ${u.user_id}`;
}
