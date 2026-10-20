import express, { type Response } from "express";
import { randomUUID } from "node:crypto";
import {
  mcpAuthRouter,
  createOAuthMetadata,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import {
  OAuthClientMetadataSchema,
  type OAuthClientInformationFull,
  type OAuthTokens,
  type OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  InvalidClientMetadataError,
  UnauthorizedClientError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidRequestError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import {
  hash,
  token,
  externalFetch,
} from "../../../packages/core/src/security.js";
import { query, transaction } from "./db.js";
import { Service, AppError } from "./service.js";

const FLOW_COOKIE = "one_oauth_flow";
const ACCESS_SECONDS = 900;
const ALLOWED_SCOPES = new Set(["one:mcp", "offline_access"]);
type RequestParams = {
  redirectUri: string;
  state?: string;
  challenge: string;
  resource: string;
  scopes: string[];
  applicationName: string;
  source: string;
};
export const machineOAuthPath = (path: string) =>
  [
    "/token",
    "/register",
    "/revoke",
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
  ].includes(path);
export const oauthPath = (path: string) =>
  machineOAuthPath(path) || path === "/authorize";

export function validRedirect(value: string) {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new InvalidClientMetadataError("Invalid redirect URI");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (
    value.length > 2048 ||
    u.username ||
    u.password ||
    u.hash ||
    !(u.protocol === "https:" || (u.protocol === "http:" && loopback))
  )
    throw new InvalidClientMetadataError(
      "Redirect URI requires HTTPS or loopback HTTP and no credentials or fragment",
    );
  return value;
}
function scopes(value?: string[]) {
  const list = [...new Set(value?.length ? value : ["one:mcp"])];
  if (
    list.length > 2 ||
    list.some((s) => !ALLOWED_SCOPES.has(s)) ||
    !list.includes("one:mcp")
  )
    throw new InvalidScopeError(
      "Only one:mcp and optional offline_access are supported",
    );
  return list;
}

/** Official SDK protocol handlers; ONE owns only durable consent/grant state. */
export class ClientOAuthProvider implements OAuthServerProvider {
  readonly resource: string;
  readonly issuer: string;
  readonly clientsStore: OAuthRegisteredClientsStore;
  constructor(readonly service: Service) {
    this.resource = new URL("/mcp", service.base).href;
    this.issuer = new URL(service.base).href;
    this.clientsStore = {
      getClient: (id) => this.getClient(id),
      registerClient: (info) => this.registerClient(info),
    };
  }
  private resourceFor(value?: URL) {
    if (!value || value.href !== this.resource)
      throw new InvalidTargetError(
        "The resource must identify this ONE MCP endpoint",
      );
    return this.resource;
  }
  private normalize(info: OAuthClientInformationFull) {
    if (!info.redirect_uris.length || info.redirect_uris.length > 5)
      throw new InvalidClientMetadataError(
        "Register between one and five redirect URIs",
      );
    info.redirect_uris.forEach(validRedirect);
    if (info.client_name && info.client_name.length > 100)
      throw new InvalidClientMetadataError("Application name is too long");
    if (
      !["none", "client_secret_post"].includes(
        info.token_endpoint_auth_method || "client_secret_post",
      )
    )
      throw new InvalidClientMetadataError(
        "Unsupported client authentication method",
      );
    if (
      info.response_types?.some((t) => t !== "code") ||
      info.grant_types?.some(
        (t) => !["authorization_code", "refresh_token"].includes(t),
      )
    )
      throw new InvalidClientMetadataError(
        "Only authorization code and refresh grants are supported",
      );
    if (info.scope) scopes(info.scope.split(" "));
    return {
      ...info,
      grant_types: info.grant_types || ["authorization_code", "refresh_token"],
      response_types: ["code"],
    };
  }
  private async registerClient(
    input: Omit<
      OAuthClientInformationFull,
      "client_id" | "client_id_issued_at"
    >,
  ): Promise<OAuthClientInformationFull> {
    const info = this.normalize({
      ...input,
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    });
    const { client_secret, ...metadata } = info;
    await query(
      "INSERT INTO oauth_applications(id,metadata,secret,source) VALUES($1,$2,$3,'dcr')",
      [
        info.client_id,
        JSON.stringify(metadata),
        client_secret
          ? this.service.vault.seal(
              client_secret,
              `oauth-app:${info.client_id}`,
            )
          : null,
      ],
    );
    return info;
  }
  private async getClient(
    id: string,
  ): Promise<OAuthClientInformationFull | undefined> {
    const [stored] = await query(
      "SELECT * FROM oauth_applications WHERE id=$1",
      [id],
    );
    if (
      stored &&
      (stored.source === "dcr" ||
        new Date(stored.metadata_expires_at).getTime() > Date.now())
    )
      return {
        ...stored.metadata,
        ...(stored.secret
          ? {
              client_secret: this.service.vault.open<string>(
                stored.secret,
                `oauth-app:${id}`,
              ),
            }
          : {}),
      };
    if (!id.startsWith("https://")) return undefined;
    try {
      const r = await externalFetch(id, {
        headers: { Accept: "application/json" },
      });
      if (
        !r.ok ||
        !r.headers
          .get("content-type")
          ?.match(/application\/(json|oauth-client-metadata\+json)/i) ||
        !r.body
      )
        return undefined;
      const reader = r.body.getReader();
      const parts: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const v = await reader.read();
          if (v.done) break;
          length += v.value.length;
          if (length > 16384) {
            await reader.cancel();
            return undefined;
          }
          parts.push(v.value);
        }
      } finally {
        reader.releaseLock();
      }
      const raw = JSON.parse(Buffer.concat(parts).toString("utf8"));
      if (
        raw.client_id !== id ||
        raw.token_endpoint_auth_method !== "none" ||
        raw.client_secret
      )
        return undefined;
      const info = this.normalize({
        ...OAuthClientMetadataSchema.parse(raw),
        client_id: id,
      });
      await query(
        "INSERT INTO oauth_applications(id,metadata,source,metadata_expires_at) VALUES($1,$2,'cimd',now()+interval '1 hour') ON CONFLICT(id) DO UPDATE SET metadata=EXCLUDED.metadata,metadata_expires_at=EXCLUDED.metadata_expires_at",
        [id, JSON.stringify(info)],
      );
      return info;
    } catch {
      return undefined;
    }
  }
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ) {
    if (!client.grant_types?.includes("authorization_code"))
      throw new UnauthorizedClientError(
        "Authorization code grant not registered",
      );
    const resource = this.resourceFor(params.resource),
      selectedScopes = scopes(params.scopes);
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge) ||
      (params.state && params.state.length > 2048)
    )
      throw new InvalidRequestError("Invalid authorization parameters");
    const id = randomUUID(),
      binding = token();
    const record: RequestParams = {
      redirectUri: params.redirectUri,
      state: params.state,
      challenge: params.codeChallenge,
      resource,
      scopes: selectedScopes,
      applicationName: client.client_name || "Unnamed MCP application",
      source: client.client_id.startsWith("https://") ? "cimd" : "dcr",
    };
    await query(
      "INSERT INTO oauth_authorization_requests(id,application_id,binding_hash,params,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",
      [
        id,
        client.client_id,
        hash(binding),
        this.service.vault.seal(record, `oauth-request:${id}`),
      ],
    );
    res.cookie(FLOW_COOKIE, binding, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(this.issuer).protocol === "https:",
      path: "/",
      maxAge: 600000,
    });
    res.redirect(302, `${this.service.base}/?oauth_request=${id}`);
  }
  async review(
    id: string,
    userId: string,
    sessionValue: string,
    binding: string,
  ) {
    const [r] = await query(
      "UPDATE oauth_authorization_requests SET owner_id=COALESCE(owner_id,$2),session_hash=COALESCE(session_hash,$3) WHERE id=$1 AND binding_hash=$4 AND (owner_id IS NULL OR owner_id=$2 AND session_hash=$3) AND expires_at>now() AND consumed_at IS NULL RETURNING *",
      [id, userId, hash(sessionValue), hash(binding)],
    );
    if (!r) throw new AppError(404, "authorization_expired_or_unavailable");
    const p = this.service.vault.open<RequestParams>(
      r.params,
      `oauth-request:${id}`,
    );
    return {
      id,
      applicationName: p.applicationName,
      applicationId: r.application_id,
      identityVerified: false,
      source: p.source,
      redirectUri: p.redirectUri,
      resource: p.resource,
      scopes: p.scopes,
      expiresAt: r.expires_at,
      tools: await this.service.catalog(userId),
    };
  }
  async consent(
    id: string,
    userId: string,
    sessionValue: string,
    binding: string,
    approve: boolean,
    selected: { connectionId: string; tool: string; approval: boolean }[],
  ) {
    const available = await this.service.catalog(userId);
    const unique = new Set<string>();
    for (const g of selected) {
      const key = JSON.stringify([g.connectionId, g.tool]);
      if (
        unique.has(key) ||
        !available.some(
          (t) => t.connectionId === g.connectionId && t.name === g.tool,
        )
      )
        throw new AppError(400, "invalid_tool_selection");
      unique.add(key);
    }
    return transaction(async (q) => {
      const [r] = await q(
        "SELECT * FROM oauth_authorization_requests WHERE id=$1 AND owner_id=$2 AND session_hash=$3 AND binding_hash=$4 AND expires_at>now() AND consumed_at IS NULL FOR UPDATE",
        [id, userId, hash(sessionValue), hash(binding)],
      );
      if (!r) throw new AppError(409, "authorization_expired_or_consumed");
      const p = this.service.vault.open<RequestParams>(
          r.params,
          `oauth-request:${id}`,
        ),
        redirect = new URL(p.redirectUri);
      await q(
        "UPDATE oauth_authorization_requests SET consumed_at=now() WHERE id=$1",
        [id],
      );
      if (p.state !== undefined) redirect.searchParams.set("state", p.state);
      redirect.searchParams.set("iss", this.issuer);
      if (!approve) {
        redirect.searchParams.set("error", "access_denied");
        return { redirectUrl: redirect.href };
      }
      // Recheck the owner and connection while claiming consent; disconnects cannot create cross-tenant grants.
      const clientId = randomUUID();
      await q(
        "INSERT INTO clients(id,user_id,name,token_hash,expires_at,auth_mode,oauth_application_id,oauth_origin) VALUES($1,$2,$3,$4,now()+interval '90 days','oauth',$5,$6)",
        [
          clientId,
          userId,
          p.applicationName,
          hash(token()),
          r.application_id,
          new URL(p.redirectUri).origin,
        ],
      );
      for (const g of selected) {
        const [connection] = await q(
          "SELECT id FROM connections WHERE id=$1 AND user_id=$2 AND status='connected' FOR SHARE",
          [g.connectionId, userId],
        );
        if (!connection)
          throw new AppError(409, "connection_changed_review_again");
        await q(
          "INSERT INTO grants(client_id,connection_id,tool,approval) VALUES($1,$2,$3,$4)",
          [clientId, g.connectionId, g.tool, g.approval],
        );
      }
      const code = token();
      await q(
        "INSERT INTO oauth_codes(hash,application_id,client_id,redirect_uri,challenge,resource,scopes,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '60 seconds')",
        [
          hash(code),
          r.application_id,
          clientId,
          p.redirectUri,
          p.challenge,
          p.resource,
          p.scopes,
        ],
      );
      await q(
        "INSERT INTO audit(id,user_id,client_id,tool,status,request_id) VALUES($1,$2,$3,'oauth.consent','client_authorized',$4)",
        [randomUUID(), userId, clientId, id],
      );
      redirect.searchParams.set("code", code);
      return { redirectUrl: redirect.href };
    });
  }
  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
  ) {
    const [r] = await query(
      "SELECT challenge,consumed_at,client_id FROM oauth_codes WHERE hash=$1 AND application_id=$2",
      [hash(code), client.client_id],
    );
    if (!r) throw new InvalidGrantError("Authorization code is invalid");
    // Do not hide consumed codes from the SDK: a valid-verifier replay must reach atomic replay handling.
    return r.challenge as string;
  }
  private async mint(
    q: typeof query,
    applicationId: string,
    clientId: string,
    familyId: string,
    resource: string,
    selectedScopes: string[],
  ): Promise<OAuthTokens> {
    const access = token(),
      refresh = token();
    await q(
      "INSERT INTO oauth_tokens(hash,application_id,client_id,family_id,kind,resource,scopes,expires_at) VALUES($1,$2,$3,$4,'access',$5,$6,now()+interval '15 minutes'),($7,$2,$3,$4,'refresh',$5,$6,(SELECT expires_at FROM clients WHERE id=$3))",
      [
        hash(access),
        applicationId,
        clientId,
        familyId,
        resource,
        selectedScopes,
        hash(refresh),
      ],
    );
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer",
      expires_in: ACCESS_SECONDS,
      scope: selectedScopes.join(" "),
    };
  }
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _verifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    this.resourceFor(resource);
    const outcome = await transaction(async (q) => {
      const [r] = await q(
        "SELECT * FROM oauth_codes WHERE hash=$1 AND application_id=$2 FOR UPDATE",
        [hash(code), client.client_id],
      );
      if (!r || r.redirect_uri !== redirectUri || r.resource !== resource!.href)
        return { error: true } as const;
      if (r.consumed_at) {
        await q(
          "UPDATE oauth_token_families SET revoked_at=now() WHERE client_id=$1",
          [r.client_id],
        );
        await q("UPDATE clients SET revoked_at=now() WHERE id=$1", [
          r.client_id,
        ]);
        return { error: true } as const;
      }
      const [active] = await q(
        "SELECT id FROM clients WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() FOR SHARE",
        [r.client_id],
      );
      if (!active || new Date(r.expires_at).getTime() <= Date.now())
        return { error: true } as const;
      await q("UPDATE oauth_codes SET consumed_at=now() WHERE hash=$1", [
        hash(code),
      ]);
      const familyId = randomUUID();
      await q("INSERT INTO oauth_token_families(id,client_id) VALUES($1,$2)", [
        familyId,
        r.client_id,
      ]);
      return {
        tokens: await this.mint(
          q,
          client.client_id,
          r.client_id,
          familyId,
          r.resource,
          r.scopes,
        ),
      };
    });
    if ("error" in outcome)
      throw new InvalidGrantError(
        "Authorization code is expired, used or invalid",
      );
    return outcome.tokens;
  }
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refresh: string,
    requested?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    if (!client.grant_types?.includes("refresh_token"))
      throw new UnauthorizedClientError("Refresh grant not registered");
    this.resourceFor(resource);
    const outcome = await transaction(async (q) => {
      const [candidate] = await q(
        "SELECT family_id FROM oauth_tokens WHERE hash=$1 AND application_id=$2 AND kind='refresh'",
        [hash(refresh), client.client_id],
      );
      if (!candidate) return { error: "invalid" } as const;
      const [family] = await q(
        "SELECT * FROM oauth_token_families WHERE id=$1 FOR UPDATE",
        [candidate.family_id],
      );
      const [r] = await q(
        "SELECT * FROM oauth_tokens WHERE hash=$1 AND application_id=$2 AND kind='refresh' FOR UPDATE",
        [hash(refresh), client.client_id],
      );
      if (!family || family.revoked_at) return { error: "invalid" } as const;
      if (!r || r.resource !== resource!.href)
        return { error: "invalid" } as const;
      if (r.consumed_at) {
        await q(
          "UPDATE oauth_token_families SET revoked_at=now() WHERE id=$1",
          [r.family_id],
        );
        await q("UPDATE clients SET revoked_at=now() WHERE id=$1", [
          r.client_id,
        ]);
        return { error: "replay" } as const;
      }
      const [active] = await q(
        "SELECT id FROM clients WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() FOR SHARE",
        [r.client_id],
      );
      if (
        !active ||
        r.revoked_at ||
        new Date(r.expires_at).getTime() <= Date.now()
      )
        return { error: "invalid" } as const;
      const selectedScopes = scopes(requested || r.scopes);
      if (selectedScopes.some((s) => !r.scopes.includes(s)))
        return { error: "scope" } as const;
      await q("UPDATE oauth_tokens SET consumed_at=now() WHERE hash=$1", [
        hash(refresh),
      ]);
      return {
        tokens: await this.mint(
          q,
          client.client_id,
          r.client_id,
          r.family_id,
          r.resource,
          selectedScopes,
        ),
      };
    });
    if ("error" in outcome) {
      if (outcome.error === "scope")
        throw new InvalidScopeError("Refresh may only narrow scopes");
      throw new InvalidGrantError(
        "Refresh token is expired, revoked or reused",
      );
    }
    return outcome.tokens;
  }
  async verifyAccessToken(value: string): Promise<AuthInfo> {
    const [r] = await query(
      "SELECT t.*,c.user_id FROM oauth_tokens t JOIN clients c ON c.id=t.client_id JOIN oauth_token_families f ON f.id=t.family_id WHERE f.revoked_at IS NULL AND t.hash=$1 AND t.kind='access' AND t.resource=$2 AND t.revoked_at IS NULL AND t.expires_at>now() AND c.revoked_at IS NULL AND c.expires_at>now()",
      [hash(value), this.resource],
    );
    if (!r) throw new InvalidTokenError("Access token is expired or revoked");
    return {
      token: value,
      clientId: r.application_id,
      scopes: r.scopes,
      expiresAt: Math.floor(new Date(r.expires_at).getTime() / 1000),
      resource: new URL(r.resource),
      extra: { userId: r.user_id, authorizationId: r.client_id },
    };
  }
  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ) {
    await transaction(async (q) => {
      const [credential] = await q(
        "SELECT family_id,client_id FROM oauth_tokens WHERE hash=$1 AND application_id=$2",
        [hash(request.token), client.client_id],
      );
      if (!credential) return;
      await q("SELECT id FROM oauth_token_families WHERE id=$1 FOR UPDATE", [
        credential.family_id,
      ]);
      await q("UPDATE oauth_token_families SET revoked_at=now() WHERE id=$1", [
        credential.family_id,
      ]);
      await q("UPDATE clients SET revoked_at=now() WHERE id=$1", [
        credential.client_id,
      ]);
    });
  }

  router() {
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", false);
    app.use(express.json({ limit: "16kb" }));
    app.use(
      express.urlencoded({
        extended: false,
        limit: "16kb",
        parameterLimit: 25,
      }),
    );
    const options = {
      provider: this,
      issuerUrl: new URL(this.issuer),
      resourceServerUrl: new URL(this.resource),
      scopesSupported: ["one:mcp", "offline_access"],
    };
    app.get("/.well-known/oauth-authorization-server", (_req, res) =>
      res.set("Access-Control-Allow-Origin", "*").json({
        ...createOAuthMetadata(options),
        client_id_metadata_document_supported: true,
        authorization_response_iss_parameter_supported: true,
        revocation_endpoint_auth_methods_supported: [
          "none",
          "client_secret_post",
        ],
      }),
    );
    app.get("/.well-known/oauth-protected-resource", (_req, res) =>
      res.set("Access-Control-Allow-Origin", "*").json({
        resource: this.resource,
        authorization_servers: [this.issuer],
        scopes_supported: ["one:mcp"],
        bearer_methods_supported: ["header"],
        resource_name: "ONE",
      }),
    );
    // The SDK emits standard redirect errors. Add RFC 9207 issuer (and a valid
    // request state on validation errors) consistently with our advertised metadata.
    app.use("/authorize", (req, res, next) => {
      const redirect = res.redirect.bind(res);
      res.redirect = ((statusOrUrl: number | string, maybeUrl?: string) => {
        const status = typeof statusOrUrl === "number" ? statusOrUrl : 302;
        const target = new URL(
          typeof statusOrUrl === "string" ? statusOrUrl : maybeUrl!,
          this.issuer,
        );
        if (
          target.searchParams.has("error") ||
          target.searchParams.has("code")
        ) {
          target.searchParams.set("iss", this.issuer);
          const state = (req.method === "POST" ? req.body : req.query)?.state;
          if (
            !target.searchParams.has("state") &&
            typeof state === "string" &&
            state.length <= 2048
          )
            target.searchParams.set("state", state);
        }
        return redirect(status, target.href);
      }) as typeof res.redirect;
      next();
    });
    app.use(
      mcpAuthRouter({
        ...options,
        clientRegistrationOptions: { rateLimit: { max: 60 } },
        tokenOptions: { rateLimit: { max: 120 } },
      }),
    );
    app.use((_req, res) => res.status(404).json({ error: "invalid_request" }));
    app.use(
      (
        _err: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => res.status(400).json({ error: "invalid_request" }),
    );
    return app;
  }
}
