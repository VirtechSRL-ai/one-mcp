import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DirectOAuthEngine,
  nativeTools,
  ProviderError,
} from "../apps/api/src/providers.js";
afterEach(() => vi.restoreAllMocks());
describe("provider HTTP adapters — synthetic responses, no live accounts", () => {
  it("exchanges authorization codes with fixed redirect and PKCE, and normalizes expiry", async () => {
    process.env.GOOGLE_CLIENT_ID = "fixture-client";
    process.env.GOOGLE_CLIENT_SECRET = "fixture-secret";
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "fixture-token",
            refresh_token: "fixture-refresh",
            expires_in: 3600,
            scope: "openid email",
          }),
          { status: 200 },
        ),
      );
    const engine = new DirectOAuthEngine("http://localhost:3000");
    const c = await engine.exchange(
      "google",
      "fixture-code",
      "fixture-verifier",
    );
    const [url, options] = spy.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const params = options!.body as URLSearchParams;
    expect(params.get("code_verifier")).toBe("fixture-verifier");
    expect(params.get("redirect_uri")).toBe(
      "http://localhost:3000/api/oauth/google/callback",
    );
    expect(c.refresh_token).toBe("fixture-refresh");
    expect(c.expires_at).toBeGreaterThan(Date.now());
  });
  it("preserves refresh tokens omitted by the provider", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "new", expires_in: 3600 }), {
        status: 200,
      }),
    );
    const c = await new DirectOAuthEngine("http://localhost:3000").refresh(
      "google",
      { access_token: "old", refresh_token: "keep" },
    );
    expect(c.refresh_token).toBe("keep");
  });
  it("does not expose provider error bodies", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "invalid_grant", private_detail: "secret" }),
        { status: 400 },
      ),
    );
    await expect(
      new DirectOAuthEngine("http://localhost:3000").exchange(
        "google",
        "code",
        "verifier",
      ),
    ).rejects.toThrow("Provider request failed");
  });
  it("uses upstream token only for native GitHub calls", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify([{ name: "fixture-repository" }])),
      );
    const t = nativeTools.find((t) => t.name === "github.list_repositories")!;
    const v = await t.run(t.parse({ limit: 5 }), {
      access_token: "upstream-only",
    });
    expect(v).toEqual([{ name: "fixture-repository" }]);
    expect(spy.mock.calls[0][0]).toBe(
      "https://api.github.com/user/repos?sort=updated&per_page=5",
    );
    expect((spy.mock.calls[0][1]!.headers as any).Authorization).toBe(
      "Bearer upstream-only",
    );
  });
  it("returns a safe error for revoked provider access", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("sensitive error", { status: 401 }),
    );
    const t = nativeTools.find((t) => t.name === "gmail.get_message")!;
    await expect(
      t.run({ id: "abc" }, { access_token: "revoked" }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
