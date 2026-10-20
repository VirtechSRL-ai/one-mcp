export async function api(path: string, method = "GET", data?: unknown) {
  const r = await fetch(`/api${path}`, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(data ?? {}),
  });
  const v = await r.json();
  if (!r.ok) throw new Error(v.error?.replaceAll("_", " ") || "Request failed");
  return v;
}
