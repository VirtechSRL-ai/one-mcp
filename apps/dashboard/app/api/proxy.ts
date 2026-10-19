import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
export async function proxy(request: Request) {
  const url = new URL(request.url),
    target = new URL(
      url.pathname + url.search,
      process.env.API_INTERNAL_URL || "http://localhost:4000",
    );
  const publicHost = new URL(process.env.PUBLIC_URL || "http://localhost:3000")
    .host;
  if (request.headers.get("host") !== publicHost)
    return Response.json({ error: "invalid_host" }, { status: 403 });
  const headers = Object.fromEntries(request.headers.entries());
  headers.host = publicHost;
  delete headers.connection;
  delete headers["content-length"];
  delete headers["transfer-encoding"];
  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : Buffer.from(await request.arrayBuffer());
  if (body) headers["content-length"] = String(body.length);
  return new Promise<Response>((resolve, reject) => {
    const upstream = (
      target.protocol === "https:" ? httpsRequest : httpRequest
    )(target, { method: request.method, headers, timeout: 60000 }, (res) => {
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(res.headers)) {
        if (
          value &&
          !["transfer-encoding", "connection", "content-length"].includes(key)
        ) {
          if (Array.isArray(value))
            value.forEach((v) => responseHeaders.append(key, v));
          else responseHeaders.set(key, value);
        }
      }
      resolve(
        new Response(
          [204, 304].includes(res.statusCode!)
            ? null
            : (Readable.toWeb(res) as ReadableStream),
          { status: res.statusCode, headers: responseHeaders },
        ),
      );
    });
    upstream.on("error", reject);
    upstream.on("timeout", () => upstream.destroy(new Error("API timeout")));
    if (body?.length) upstream.write(body);
    upstream.end();
  });
}
