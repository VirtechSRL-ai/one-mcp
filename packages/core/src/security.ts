import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { lookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as safeFetch } from "undici";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export function passwordHash(p: string) {
  const salt = token();
  return `${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
}
export function passwordMatches(p: string, stored: string) {
  const [salt, h] = stored.split(":");
  const b = Buffer.from(h, "hex");
  return b.length === 64 && timingSafeEqual(scryptSync(p, salt, 64), b);
}
export class Vault {
  private key: Buffer;
  constructor(key: string) {
    this.key = Buffer.from(key, "hex");
    if (this.key.length !== 32 || !/^[a-f0-9]{64}$/i.test(key))
      throw new Error("VAULT_KEY must be 32 random bytes in hex");
  }
  seal(value: unknown, owner: string) {
    const iv = randomBytes(12),
      c = createCipheriv("aes-256-gcm", this.key, iv);
    c.setAAD(Buffer.from(owner));
    const data = Buffer.concat([
      c.update(JSON.stringify(value), "utf8"),
      c.final(),
    ]);
    return [iv, c.getAuthTag(), data]
      .map((b) => b.toString("base64url"))
      .join(".");
  }
  open<T>(value: string, owner: string): T {
    const [iv, tag, data] = value
      .split(".")
      .map((s) => Buffer.from(s, "base64url"));
    const d = createDecipheriv("aes-256-gcm", this.key, iv);
    d.setAAD(Buffer.from(owner));
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString());
  }
}
// Reject non-global IPv4 and conservatively allow only IPv6 global unicast.
export function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0)
    );
  }
  return (
    isIP(address) === 6 &&
    /^[23][0-9a-f]{3}:/i.test(address) &&
    !/^2001:(0*:|db8:|10:|20:)/i.test(address) &&
    !/^2002:/i.test(address)
  );
}
export function validateEndpoint(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.hash ||
    (u.port && u.port !== "443") ||
    u.hostname.endsWith(".local") ||
    u.hostname === "localhost"
  )
    throw new Error("External MCP requires public HTTPS on port 443");
  const ip = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(ip) && !publicAddress(ip))
    throw new Error("Private addresses are forbidden");
  return u;
}
const dispatcher = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      lookup(hostname, { all: true }, (err, addresses) => {
        if (err) return callback(err, "", 4);
        if (
          !addresses.length ||
          addresses.some((a) => !publicAddress(a.address))
        )
          return callback(new Error("Blocked non-public DNS address"), "", 4);
        if ((options as { all?: boolean }).all)
          (callback as Function)(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      });
    },
  },
});
export const externalFetch: typeof fetch = async (input, init) => {
  validateEndpoint(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  const result = await safeFetch(input as string, {
    ...(init as any),
    dispatcher,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  return result as unknown as Response;
};
