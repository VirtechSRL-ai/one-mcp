import { assertExternalSchema } from "../packages/core/src/external-schema.js";
import { describe, it, expect } from "vitest";
import {
  Vault,
  publicAddress,
  validateEndpoint,
  passwordHash,
  passwordMatches,
} from "../packages/core/src/security.js";
import { nativeTools } from "../apps/api/src/providers.js";
describe("credential boundaries", () => {
  const vault = new Vault("a".repeat(64));
  it("authenticates ciphertext and owner AAD", () => {
    const box = vault.seal({ access_token: "secret" }, "alice:connection");
    expect(box).not.toContain("secret");
    expect(vault.open(box, "alice:connection")).toEqual({
      access_token: "secret",
    });
    expect(() => vault.open(box, "bob:connection")).toThrow();
    const parts = box.split(".");
    parts[1] = Buffer.alloc(16).toString("base64url");
    expect(() => vault.open(parts.join("."), "alice:connection")).toThrow();
  });
  it("uses salted password hashing", () => {
    const a = passwordHash("long-enough-password");
    expect(passwordMatches("long-enough-password", a)).toBe(true);
    expect(passwordMatches("wrong", a)).toBe(false);
    expect(passwordHash("long-enough-password")).not.toBe(a);
  });
  it("rejects malformed keys", () => expect(() => new Vault("bad")).toThrow());
});
describe("SSRF guard", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "2002:7f00:1::",
  ])("blocks %s", (ip) => expect(publicAddress(ip)).toBe(false));
  it.each([
    "http://example.com/mcp",
    "https://127.0.0.1/mcp",
    "https://[::1]/mcp",
    "https://a:b@example.com/mcp",
    "https://example.com:444/mcp",
    "https://localhost/mcp",
    "https://machine.local/mcp",
  ])("rejects endpoint %s", (value) =>
    expect(() => validateEndpoint(value)).toThrow(),
  );
  it("accepts public addresses", () => {
    expect(publicAddress("8.8.8.8")).toBe(true);
    expect(publicAddress("2606:4700:4700::1111")).toBe(true);
    expect(validateEndpoint("https://example.com/mcp").hostname).toBe(
      "example.com",
    );
  });
});
describe("input schemas", () => {
  it("rejects extra arguments and path traversal", () => {
    expect(() =>
      nativeTools[0].parse({ message: "hello", token: "leak" }),
    ).toThrow();
    const tool = nativeTools.find((t) => t.name === "github.get_repository")!;
    expect(() => tool.parse({ owner: "../alice", repository: "x" })).toThrow();
  });
});

it("bounds untrusted upstream schemas and rejects executable complexity", () => {
  expect(() =>
    assertExternalSchema({
      type: "object",
      properties: { value: { type: "integer" } },
    }),
  ).not.toThrow();
  for (const schema of [
    { pattern: "(a+)+$" },
    { $ref: "https://internal/schema" },
    { anyOf: [{}, {}] },
  ])
    expect(() => assertExternalSchema(schema)).toThrow();
  let deep: any = {};
  for (let i = 0; i < 30; i++) deep = { properties: deep };
  expect(() => assertExternalSchema(deep)).toThrow();
});
