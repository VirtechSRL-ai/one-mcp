import { randomUUID } from "node:crypto";
import { query, transaction } from "./db.js";
import { Vault, hash, token } from "../../../packages/core/src/security.js";
import {
  nativeTools,
  externalClient,
  DirectOAuthEngine,
  ProviderError,
  type Connection,
  type Credential,
  type OAuthEngine,
  type OAuthProvider,
} from "./providers.js";
import { z } from "zod";
import { Ajv } from "ajv";
const ajv = new Ajv({ strict: false, validateFormats: false });
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export type Principal = { userId: string; clientId: string };
export class Service {
  vault: Vault;
  oauth: OAuthEngine;
  constructor(
    public base: string,
    key: string,
    oauth?: OAuthEngine,
  ) {
    this.vault = new Vault(key);
    this.oauth = oauth || new DirectOAuthEngine(base);
  }
  async principal(value: string): Promise<Principal> {
    const [c] = await query(
      "SELECT id,user_id FROM clients WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()",
      [hash(value)],
    );
    if (!c) throw new AppError(401, "invalid_client_token");
    return { userId: c.user_id, clientId: c.id };
  }
  async browser(value: string) {
    const [s] = await query(
      "SELECT user_id FROM sessions WHERE hash=$1 AND expires_at>now()",
      [hash(value)],
    );
    if (!s) throw new AppError(401, "sign_in_required");
    return s.user_id as string;
  }
  async issueClient(userId: string, name: string) {
    const id = randomUUID(),
      secret = token();
    await query(
      "INSERT INTO clients(id,user_id,name,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '90 days')",
      [id, userId, name, hash(secret)],
    );
    return { id, name, token: secret, endpoint: `${this.base}/mcp` };
  }
  async connection(userId: string, id: string): Promise<Connection> {
    const [c] = await query<Connection>(
      "SELECT * FROM connections WHERE id=$1 AND user_id=$2 AND status='connected'",
      [id, userId],
    );
    if (!c) throw new AppError(404, "connection_unavailable");
    return c;
  }
  async credentials(c: Connection): Promise<Credential> {
    return transaction(async (q) => {
      const [current] = await q<Connection>(
        "SELECT * FROM connections WHERE id=$1 AND user_id=$2 AND status='connected' FOR UPDATE",
        [c.id, c.user_id],
      );
      if (!current) throw new AppError(404, "connection_unavailable");
      let credential = current.secret
        ? this.vault.open<Credential>(current.secret, `${c.user_id}:${c.id}`)
        : { access_token: "" };
      if (credential.expires_at && credential.expires_at < Date.now() + 60000) {
        credential = await this.oauth.refresh(
          c.provider as OAuthProvider,
          credential,
        );
        await q("UPDATE connections SET secret=$1 WHERE id=$2", [
          this.vault.seal(credential, `${c.user_id}:${c.id}`),
          c.id,
        ]);
      }
      return credential;
    });
  }
  async catalog(userId: string) {
    const connections = await query<Connection>(
      "SELECT * FROM connections WHERE user_id=$1 AND status='connected'",
      [userId],
    );
    const out: any[] = [];
    for (const c of connections) {
      if (c.provider === "external") {
        for (const t of await query(
          "SELECT name,description,schema FROM external_tools WHERE connection_id=$1",
          [c.id],
        ))
          out.push({
            connectionId: c.id,
            account: c.account,
            provider: c.provider,
            name: t.name,
            description: t.description,
            inputSchema: t.schema,
            write: true,
          });
      } else
        for (const t of nativeTools.filter(
          (t) => t.provider === c.provider && c.scopes.includes(t.scope),
        ))
          out.push({
            connectionId: c.id,
            account: c.account,
            provider: c.provider,
            name: t.name,
            description: t.description,
            inputSchema: t.schema,
            write: t.write,
          });
    }
    return out;
  }
  async permitted(p: Principal) {
    const grants = await query(
      "SELECT connection_id,tool,approval FROM grants WHERE client_id=$1",
      [p.clientId],
    );
    return (await this.catalog(p.userId)).filter((t) =>
      grants.some(
        (g) => g.connection_id === t.connectionId && g.tool === t.name,
      ),
    );
  }
  async search(p: Principal, search: string) {
    const terms = search.toLowerCase().split(/\W+/).filter(Boolean);
    return (await this.permitted(p))
      .map((t) => ({
        ...t,
        score: terms.reduce(
          (n, w) =>
            n +
            (t.name.toLowerCase().includes(w) ? 5 : 0) +
            (t.description.toLowerCase().includes(w) ? 1 : 0),
          0,
        ),
      }))
      .filter((t) => !terms.length || t.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 20);
  }
  async authorize(p: Principal, connectionId: string, name: string) {
    await this.principalCheck(p);
    const c = await this.connection(p.userId, connectionId);
    const [grant] = await query(
      "SELECT approval FROM grants WHERE client_id=$1 AND connection_id=$2 AND tool=$3",
      [p.clientId, connectionId, name],
    );
    if (!grant) throw new AppError(403, "tool_not_granted");
    const t = (await this.catalog(p.userId)).find(
      (t) => t.connectionId === c.id && t.name === name,
    );
    if (!t) throw new AppError(403, "tool_or_scope_unavailable");
    return { c, t, approval: grant.approval || t.write };
  }
  async principalCheck(p: Principal) {
    const [c] = await query(
      "SELECT id FROM clients WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()",
      [p.clientId, p.userId],
    );
    if (!c) throw new AppError(401, "client_revoked");
  }
  async call(p: Principal, connectionId: string, name: string, args: unknown) {
    const { c, t, approval } = await this.authorize(p, connectionId, name);
    this.validate(t, args);
    if (approval) {
      const id = randomUUID();
      await query(
        "INSERT INTO approvals(id,user_id,client_id,connection_id,tool,args,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '15 minutes')",
        [
          id,
          p.userId,
          p.clientId,
          c.id,
          name,
          this.vault.seal(args, `${p.userId}:${id}`),
        ],
      );
      await this.audit(p, c.id, name, "approval_required", 0, id);
      return {
        status: "approval_required",
        approvalId: id,
        reviewUrl: `${this.base}/?view=Approvals`,
      };
    }
    return this.execute(p, c, name, args);
  }
  validate(t: any, args: unknown) {
    if (t.provider !== "external") {
      nativeTools.find((n) => n.name === t.name)!.parse(args);
    } else {
      z.json().parse(args);
      let valid;
      try {
        valid = ajv.compile(t.inputSchema)(args);
      } catch {
        throw new AppError(400, "invalid_external_schema");
      }
      if (!valid) throw new AppError(400, "invalid_tool_arguments");
    }
  }
  async execute(p: Principal, c: Connection, name: string, args: unknown) {
    const start = Date.now(),
      request = randomUUID();
    try {
      const credential = await this.credentials(c);
      let result: unknown;
      if (c.provider === "external") {
        const client = await externalClient(c, credential);
        try {
          result = await client.callTool({
            name,
            arguments: args as Record<string, unknown>,
          });
        } finally {
          await client.close();
        }
      } else {
        const tool = nativeTools.find((t) => t.name === name)!;
        result = await tool.run(tool.parse(args), credential);
      }
      if (JSON.stringify(result).length > 1000000)
        throw new AppError(502, "provider_result_too_large");
      await this.audit(p, c.id, name, "success", Date.now() - start, request);
      return { status: "success", result };
    } catch (e) {
      if (e instanceof ProviderError && e.status === 401)
        await query(
          "UPDATE connections SET status='reconnect_required' WHERE id=$1 AND user_id=$2",
          [c.id, p.userId],
        );
      await this.audit(p, c.id, name, "failed", Date.now() - start, request);
      throw e instanceof AppError
        ? e
        : new AppError(502, "provider_request_failed");
    }
  }
  async decide(userId: string, id: string, approve: boolean) {
    const [a] = await query(
      "SELECT * FROM approvals WHERE id=$1 AND user_id=$2 AND state='pending' AND expires_at>now()",
      [id, userId],
    );
    if (!a) throw new AppError(409, "approval_expired_or_consumed");
    const p = { userId, clientId: a.client_id };
    if (!approve) {
      await query(
        "UPDATE approvals SET state='denied' WHERE id=$1 AND state='pending'",
        [id],
      );
      return { status: "denied" };
    }
    await this.authorize(p, a.connection_id, a.tool);
    const [claimed] = await query(
      "UPDATE approvals SET state='executing' WHERE id=$1 AND user_id=$2 AND state='pending' AND expires_at>now() RETURNING id",
      [id, userId],
    );
    if (!claimed) throw new AppError(409, "approval_already_consumed");
    try {
      const { c, t } = await this.authorize(p, a.connection_id, a.tool);
      const args = this.vault.open(a.args, `${userId}:${id}`);
      this.validate(t, args);
      await this.execute(p, c, a.tool, args);
      await query("UPDATE approvals SET state='executed' WHERE id=$1", [id]);
      return { status: "executed" };
    } catch (e) {
      await query(
        "UPDATE approvals SET state='failed_indeterminate' WHERE id=$1",
        [id],
      );
      throw e;
    }
  }
  async audit(
    p: Principal,
    connectionId: string | null,
    name: string,
    status: string,
    duration: number,
    requestId = randomUUID(),
  ) {
    await query(
      "INSERT INTO audit(id,user_id,client_id,connection_id,tool,status,duration_ms,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        randomUUID(),
        p.userId,
        p.clientId,
        connectionId,
        name,
        status,
        duration,
        requestId,
      ],
    );
  }
}
