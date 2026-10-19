"use client";
import { useEffect, useState, type FormEvent } from "react";
type Row = Record<string, any>;
const pages = [
  "Overview",
  "Connections",
  "AI Clients",
  "MCP Servers",
  "Tool Explorer",
  "Activity",
  "Approvals",
  "Settings",
];
async function api(path: string, method = "GET", data?: unknown) {
  const r = await fetch(`/api${path}`, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(data ?? {}),
  });
  const v = await r.json();
  if (!r.ok) throw new Error(v.error?.replaceAll("_", " ") || "Request failed");
  return v;
}
function Mark() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 9h7v7H8zm9 7h7v7h-7zM15 12h5v4M12 16v4h5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export default function Dashboard() {
  const [me, setMe] = useState<Row | null>(null),
    [loading, setLoading] = useState(true),
    [view, setView] = useState("Overview"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [register, setRegister] = useState(true),
    [theme, setTheme] = useState("auto");
  const [connections, setConnections] = useState<Row[]>([]),
    [clients, setClients] = useState<Row[]>([]),
    [tools, setTools] = useState<Row[]>([]),
    [grants, setGrants] = useState<Row[]>([]),
    [activity, setActivity] = useState<Row[]>([]),
    [approvals, setApprovals] = useState<Row[]>([]),
    [providers, setProviders] = useState<Row[]>([]),
    [issued, setIssued] = useState<Row | null>(null),
    [search, setSearch] = useState(""),
    [review, setReview] = useState<Row | null>(null);
  async function load() {
    const m = await api("/me");
    setMe(m);
    const [c, cl, t, g, a, ap, p] = await Promise.all(
      [
        "/connections",
        "/clients",
        "/catalog",
        "/grants",
        "/activity",
        "/approvals",
        "/providers",
      ].map((x) => api(x)),
    );
    setConnections(c);
    setClients(cl);
    setTools(t);
    setGrants(g);
    setActivity(a);
    setApprovals(ap);
    setProviders(p);
  }
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("view");
    if (q && pages.includes(q)) setView(q);
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
    const t = localStorage.getItem("one-theme") || "auto";
    setTheme(t);
    document.documentElement.dataset.theme = t;
  }, []);
  useEffect(() => {
    if (!me) return;
    let active = true;
    Promise.all([api("/activity"), api("/approvals")])
      .then(([a, ap]) => {
        if (active) {
          setActivity(a);
          setApprovals(ap);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [view, me?.id]);
  async function act(fn: () => Promise<unknown>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const form = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    return Object.fromEntries(new FormData(e.currentTarget));
  };
  const chip = (status: string) => (
    <span
      className={`status ${["connected", "success", "executed", "active"].includes(status) ? "good" : ""}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
  const empty = (title: string, description: string) => (
    <div className="empty">
      <Mark />
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
  if (loading)
    return (
      <main className="loading" role="status">
        Opening your connection layer…
      </main>
    );
  if (!me)
    return (
      <main className="auth">
        <div className="auth-story">
          <div className="brand">
            <Mark /> ONE
          </div>
          <h1>
            One connection.
            <br />
            Every possibility.
          </h1>
          <p>
            Your services stay connected.
            <br />
            You decide which AI clients can use them.
          </p>
          <div className="statement">
            Self-hosted. Open source. Under your control.
          </div>
        </div>
        <section className="auth-form">
          <h2>{register ? "Make the connection." : "Welcome back."}</h2>
          <p>
            {register
              ? "Create your account on this ONE instance."
              : "Sign in to manage your connections."}
          </p>
          <form
            onSubmit={(e) => {
              const v = form(e);
              void act(async () => {
                await api(
                  `/auth/${register ? "register" : "login"}`,
                  "POST",
                  v,
                );
              });
            }}
          >
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={register ? 12 : 1}
                maxLength={200}
                required
              />
            </label>
            {register && <small>Use at least 12 characters.</small>}
            <button disabled={busy}>
              {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="link"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register
              ? "Already have an account? Sign in"
              : "Create an account"}
          </button>
        </section>
      </main>
    );
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="/" aria-label="ONE home">
          <Mark /> ONE
        </a>
        <p className="tagline">
          Connect once.
          <br />
          Use everywhere.
        </p>
        <nav aria-label="Main navigation">
          {pages.map((p) => (
            <button
              key={p}
              className={view === p ? "selected" : ""}
              aria-current={view === p ? "page" : undefined}
              onClick={() => {
                setView(p);
                setError("");
                setNotice("");
                history.replaceState(
                  null,
                  "",
                  `?view=${encodeURIComponent(p)}`,
                );
              }}
            >
              {p}
              {p === "Approvals" &&
                approvals.filter(
                  (a) =>
                    a.state === "pending" &&
                    new Date(a.expires_at) > new Date(),
                ).length > 0 && (
                  <span className="count">
                    {
                      approvals.filter(
                        (a) =>
                          a.state === "pending" &&
                          new Date(a.expires_at) > new Date(),
                      ).length
                    }
                  </span>
                )}
            </button>
          ))}
        </nav>
        <footer>
          <span className="status good">Local control</span>
          <small>ONE / v0.1 preview</small>
          <button
            className="link"
            onClick={() => {
              const t = theme === "dark" ? "light" : "dark";
              setTheme(t);
              localStorage.setItem("one-theme", t);
              document.documentElement.dataset.theme = t;
            }}
          >
            Switch to {theme === "dark" ? "light" : "dark"} theme
          </button>
        </footer>
      </aside>
      <main className="workspace">
        <header>
          <span>Your connection workspace</span>
          <div className="account">
            {me.email}
            <button
              className="link"
              onClick={() =>
                void act(async () => {
                  await api("/auth/logout", "POST");
                  setMe(null);
                })
              }
            >
              Sign out
            </button>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <h1>{view === "Overview" ? "Your AI, connected." : view}</h1>
              <p>
                {
                  (
                    {
                      Overview:
                        "One place for your services. A separate key for every client.",
                      Connections:
                        "Connect a service once, then share access on your terms.",
                      "AI Clients":
                        "Every client starts with no access. Add only what it needs.",
                      "MCP Servers":
                        "Bring trusted remote tools into your connection layer.",
                      "Tool Explorer":
                        "Find a tool, inspect its scope, and choose an account.",
                      Activity:
                        "A record of access. Message and document contents stay out.",
                      Approvals:
                        "Review the exact action before it leaves ONE.",
                      Settings: "Manage your account, configuration and data.",
                    } as Row
                  )[view]
                }
              </p>
            </div>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  setNotice("Workspace refreshed.");
                })
              }
            >
              Refresh
            </button>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}. Check your settings and try again.
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
          {view === "Overview" && (
            <>
              <section className="connection-line">
                <div>
                  <strong>
                    {connections.filter((c) => c.status === "connected").length}
                  </strong>
                  <span>connected services</span>
                </div>
                <div>
                  <strong>{clients.filter((c) => !c.revoked_at).length}</strong>
                  <span>AI clients</span>
                </div>
                <div>
                  <strong>{tools.length}</strong>
                  <span>available tools</span>
                </div>
              </section>
              <section>
                <div className="section-heading">
                  <h2>Connections</h2>
                  <button
                    className="link"
                    onClick={() => setView("Connections")}
                  >
                    Manage connections →
                  </button>
                </div>
                {connections.length ? (
                  <div className="ledger">
                    {connections.slice(0, 5).map((c) => (
                      <div className="row" key={c.id}>
                        <div>
                          <strong>
                            {c.provider === "google"
                              ? "Google Workspace"
                              : c.provider}
                          </strong>
                          <small>{c.account}</small>
                        </div>
                        {chip(c.status)}
                      </div>
                    ))}
                  </div>
                ) : (
                  empty(
                    "Your first connection starts here",
                    "Connect GitHub, Google or Slack, or add the built-in verification tool to try the complete MCP flow.",
                  )
                )}
                <button onClick={() => setView("Connections")}>
                  Add a connection
                </button>
              </section>
              <section>
                <div className="section-heading">
                  <h2>Recent activity</h2>
                  <button className="link" onClick={() => setView("Activity")}>
                    View activity →
                  </button>
                </div>
                {activity.length ? (
                  <Activity rows={activity.slice(0, 5)} />
                ) : (
                  empty(
                    "A clear record of every action",
                    "Activity will appear after you grant a client access and call a tool.",
                  )
                )}
              </section>
              <div className="endpoint">
                <span>Your universal MCP endpoint</span>
                <code>{me.endpoint}</code>
                <button
                  className="secondary"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(me.endpoint)
                      .then(() => setNotice("Endpoint copied."))
                      .catch(() =>
                        setError(
                          "Clipboard unavailable; select and copy the endpoint",
                        ),
                      );
                  }}
                >
                  Copy endpoint
                </button>
              </div>
            </>
          )}
          {view === "Connections" && (
            <>
              <div className="ledger">
                {providers.map((p) => (
                  <div className="row" key={p.id}>
                    <div>
                      <h2>
                        {p.id === "google"
                          ? "Google Workspace"
                          : p.id === "github"
                            ? "GitHub"
                            : "Slack"}
                      </h2>
                      <small>
                        {p.id === "google"
                          ? "Gmail, Drive metadata and Calendar"
                          : p.id === "github"
                            ? "Repository metadata"
                            : "Channels and approval-protected messages"}
                      </small>
                      <details>
                        <summary>Requested permissions</summary>
                        <ul>
                          {p.scopes.map((s: string) => (
                            <li key={s}>
                              <code>{s}</code>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </div>
                    <div>
                      <small>
                        {p.configured
                          ? "OAuth ready"
                          : "Instance credentials required"}
                      </small>
                      <button
                        disabled={busy || !p.configured}
                        onClick={() =>
                          void act(async () => {
                            const v = await api(`/oauth/${p.id}/start`, "POST");
                            location.assign(v.url);
                          })
                        }
                      >
                        Connect {p.id}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="muted">
                Provider credentials are configured by the instance operator.
                You can connect multiple accounts. GitHub’s classic OAuth repo
                scope is broad; ONE’s tools remain read only.
              </p>
              <div className="row">
                <div>
                  <h2>Built-in verification</h2>
                  <p>
                    A local echo tool for checking access and client revocation.
                  </p>
                </div>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(() => api("/connections/demo", "POST"))
                  }
                >
                  Enable verification tool
                </button>
              </div>
              <h2 className="spaced">Your accounts</h2>
              {connections.length
                ? connections.map((c) => (
                    <div className="row" key={c.id}>
                      <div>
                        <strong>{c.provider}</strong>
                        <small>{c.account}</small>
                        {chip(c.status)}
                      </div>
                      <button
                        className="danger"
                        disabled={busy || c.status === "disconnected"}
                        onClick={() => {
                          if (
                            confirm(
                              "Disconnect this account from ONE and remove its client grants?",
                            )
                          )
                            void act(() =>
                              api(`/connections/${c.id}`, "DELETE"),
                            );
                        }}
                      >
                        Disconnect
                      </button>
                    </div>
                  ))
                : empty(
                    "No accounts connected",
                    "Choose a provider above to begin.",
                  )}
            </>
          )}
          {view === "AI Clients" && (
            <>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  const v = form(e);
                  void act(async () => {
                    const issued = await api("/clients", "POST", v);
                    setIssued(issued);
                  });
                }}
              >
                <label>
                  Client name
                  <input
                    name="name"
                    placeholder="e.g. Codex on my laptop"
                    maxLength={80}
                    required
                  />
                </label>
                <button disabled={busy}>Create client key</button>
              </form>
              {issued && (
                <section className="secret">
                  <h2>Save this key now</h2>
                  <p>
                    It is displayed once. Expires after 90 days. Treat it as a
                    password.
                  </p>
                  <code className="key">{issued.token}</code>
                  <p>Streamable HTTP client configuration:</p>
                  <pre>
                    {JSON.stringify(
                      {
                        mcpServers: {
                          one: {
                            url: issued.endpoint,
                            headers: {
                              Authorization: `Bearer ${issued.token}`,
                            },
                          },
                        },
                      },
                      null,
                      2,
                    )}
                  </pre>
                  <p>
                    Cursor-style JSON. Check the client guide for Codex and
                    Claude Code formats.
                  </p>
                  <button className="secondary" onClick={() => setIssued(null)}>
                    I saved the key
                  </button>
                </section>
              )}
              {clients.length
                ? clients.map((c) => (
                    <section key={c.id}>
                      <div className="section-heading">
                        <div>
                          <h2>{c.name}</h2>
                          <small>
                            Expires{" "}
                            {new Date(c.expires_at).toLocaleDateString()}
                          </small>
                        </div>
                        {chip(c.revoked_at ? "revoked" : "active")}
                        <button
                          className="danger"
                          disabled={busy || !!c.revoked_at}
                          onClick={() => {
                            if (
                              confirm(
                                `Revoke ${c.name}? Its provider connections will stay available to other clients.`,
                              )
                            )
                              void act(() => api(`/clients/${c.id}`, "DELETE"));
                          }}
                        >
                          Revoke
                        </button>
                      </div>
                      {!c.revoked_at &&
                        (tools.length ? (
                          <div className="ledger">
                            {tools.map((t) => {
                              const g = grants.find(
                                (g) =>
                                  g.client_id === c.id &&
                                  g.connection_id === t.connectionId &&
                                  g.tool === t.name,
                              );
                              return (
                                <div
                                  className="row"
                                  key={t.connectionId + t.name}
                                >
                                  <label className="checkbox">
                                    <input
                                      type="checkbox"
                                      checked={!!g}
                                      disabled={busy}
                                      onChange={(e) =>
                                        void act(() =>
                                          api("/grants", "PUT", {
                                            clientId: c.id,
                                            connectionId: t.connectionId,
                                            tool: t.name,
                                            enabled: e.target.checked,
                                            approval: !!g?.approval,
                                          }),
                                        )
                                      }
                                    />
                                    <span>
                                      <strong>{t.name}</strong>
                                      <small>{t.account}</small>
                                    </span>
                                  </label>
                                  <label className="checkbox">
                                    <input
                                      type="checkbox"
                                      disabled={busy || !g || t.write}
                                      checked={t.write || !!g?.approval}
                                      onChange={(e) =>
                                        void act(() =>
                                          api("/grants", "PUT", {
                                            clientId: c.id,
                                            connectionId: t.connectionId,
                                            tool: t.name,
                                            enabled: true,
                                            approval: e.target.checked,
                                          }),
                                        )
                                      }
                                    />
                                    Human approval
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p>Connect a service to grant access to its tools.</p>
                        ))}
                    </section>
                  ))
                : empty(
                    "Give each client its own key",
                    "Create a key, configure your MCP client, then grant individual tools below.",
                  )}
            </>
          )}
          {view === "MCP Servers" && (
            <>
              <form
                className="form-grid"
                onSubmit={(e) => {
                  const v = form(e);
                  void act(() => api("/external", "POST", v));
                }}
              >
                <label>
                  Server name
                  <input name="name" required maxLength={80} />
                </label>
                <label>
                  Public HTTPS endpoint
                  <input
                    name="endpoint"
                    type="url"
                    placeholder="https://mcp.example.com/mcp"
                    required
                  />
                </label>
                <label>
                  Upstream bearer token (optional)
                  <input name="token" type="password" autoComplete="off" />
                </label>
                <button disabled={busy}>
                  {busy ? "Checking server…" : "Verify and add server"}
                </button>
              </form>
              <p className="muted">
                Only public HTTPS servers on port 443. This version supports
                independent bearer credentials or unauthenticated servers;
                external OAuth is planned. All external actions require human
                approval.
              </p>
              {connections
                .filter((c) => c.provider === "external")
                .map((c) => (
                  <div className="row" key={c.id}>
                    <div>
                      <h2>{c.account}</h2>
                      <code>{c.endpoint}</code>
                    </div>
                    {chip(c.status)}
                  </div>
                ))}
            </>
          )}
          {view === "Tool Explorer" && (
            <>
              <label className="search">
                Search tools
                <input
                  type="search"
                  placeholder="Search email, repository, files…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {tools
                .filter((t) =>
                  `${t.name} ${t.description}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((t) => (
                  <details className="tool" key={t.connectionId + t.name}>
                    <summary>
                      <strong>{t.name}</strong>
                      <span>{t.account}</span>
                      {chip(t.write ? "approval required" : "read")}
                    </summary>
                    <p>{t.description}</p>
                    <p>
                      Connection: <code>{t.connectionId}</code>
                    </p>
                    <pre>{JSON.stringify(t.inputSchema, null, 2)}</pre>
                    <p>
                      Use one_search_tools and one_call_tool from an authorized
                      MCP client to test this tool under its real permissions.
                    </p>
                  </details>
                ))}
              {!tools.length &&
                empty(
                  "No tools yet",
                  "Connect an account to inspect its tools and input schemas.",
                )}
            </>
          )}
          {view === "Activity" &&
            (activity.length ? (
              <Activity rows={activity} />
            ) : (
              empty(
                "No activity recorded",
                "Tool calls and permission changes will be recorded here.",
              )
            ))}
          {view === "Approvals" && (
            <>
              {approvals.length
                ? approvals.map((a) => (
                    <div className="row" key={a.id}>
                      <div>
                        <h2>{a.tool}</h2>
                        <small>
                          {a.client} · Expires{" "}
                          {new Date(a.expires_at).toLocaleString()}
                        </small>
                        {chip(
                          a.state === "pending" &&
                            new Date(a.expires_at) < new Date()
                            ? "expired"
                            : a.state,
                        )}
                      </div>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void act(async () =>
                            setReview(await api(`/approvals/${a.id}`)),
                          )
                        }
                      >
                        Review action
                      </button>
                    </div>
                  ))
                : empty(
                    "Nothing awaiting your approval",
                    "Sensitive actions remain suspended until you review them here.",
                  )}
              {review && (
                <section className="review">
                  <h2>Review {review.tool}</h2>
                  <p>
                    These are the immutable arguments stored for this request.
                  </p>
                  <pre>{JSON.stringify(review.args, null, 2)}</pre>
                  {review.state === "pending" && (
                    <div className="actions">
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await api(`/approvals/${review.id}`, "POST", {
                              approve: true,
                            });
                            setReview(null);
                            setNotice("Approved action executed.");
                          })
                        }
                      >
                        Approve and execute
                      </button>
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await api(`/approvals/${review.id}`, "POST", {
                              approve: false,
                            });
                            setReview(null);
                          })
                        }
                      >
                        Deny
                      </button>
                    </div>
                  )}
                  <button className="link" onClick={() => setReview(null)}>
                    Close review
                  </button>
                </section>
              )}
            </>
          )}
          {view === "Settings" && (
            <>
              <section>
                <h2>Appearance</h2>
                <p>
                  Choose a theme on any device, or follow your system setting.
                </p>
                <div className="actions" role="group" aria-label="Color theme">
                  {["auto", "light", "dark"].map((t) => (
                    <button
                      key={t}
                      className="secondary"
                      aria-pressed={theme === t}
                      onClick={() => {
                        setTheme(t);
                        localStorage.setItem("one-theme", t);
                        document.documentElement.dataset.theme = t;
                      }}
                    >
                      {t === "auto"
                        ? "System theme"
                        : t === "light"
                          ? "Light theme"
                          : "Dark theme"}
                    </button>
                  ))}
                </div>
                <h2 className="spaced">Instance</h2>
                <dl>
                  <dt>Account</dt>
                  <dd>{me.email}</dd>
                  <dt>MCP endpoint</dt>
                  <dd>
                    <code>{me.endpoint}</code>
                  </dd>
                  <dt>Credential policy</dt>
                  <dd>
                    Encrypted upstream secrets. Separate, revocable client keys.
                  </dd>
                </dl>
                <p>
                  Configure OAuth credentials, registration and activity
                  retention through your instance environment.
                </p>
              </section>
              <section>
                <h2>Your data</h2>
                <div className="actions">
                  <button
                    className="secondary"
                    onClick={() =>
                      void act(async () => {
                        const config = await api("/export");
                        const url = URL.createObjectURL(
                          new Blob([JSON.stringify(config, null, 2)], {
                            type: "application/json",
                          }),
                        );
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "one-configuration.json";
                        a.click();
                        URL.revokeObjectURL(url);
                      })
                    }
                  >
                    Export configuration
                  </button>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => {
                      if (confirm("Permanently delete your recorded activity?"))
                        void act(() => api("/activity", "DELETE"));
                    }}
                  >
                    Delete activity
                  </button>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Sign out all browser sessions? MCP client keys are managed separately.",
                        )
                      )
                        void act(async () => {
                          await api("/auth/revoke-sessions", "POST");
                          setMe(null);
                        });
                    }}
                  >
                    Revoke browser sessions
                  </button>
                </div>
                <p>
                  Exports contain configuration and grants, never tokens or
                  passwords.
                </p>
              </section>
            </>
          )}
        </div>
        <div className="workspace-foot">
          Your connections. Your permissions.{" "}
          <span>ONE is an independent open-source project.</span>
        </div>
      </main>
    </div>
  );
}
function Activity({ rows }: { rows: Row[] }) {
  return (
    <div className="ledger">
      {rows.map((a) => (
        <div className="row activity-row" key={a.id}>
          <time dateTime={a.created_at}>
            {new Date(a.created_at).toLocaleString()}
          </time>
          <div>
            <strong>{a.tool}</strong>
            <small>
              {a.client || "ONE"} · {a.account || "Configuration"} ·{" "}
              {a.duration_ms} ms
            </small>
          </div>
          <span className={`status ${a.status === "success" ? "good" : ""}`}>
            {a.status.replaceAll("_", " ")}
          </span>
        </div>
      ))}
    </div>
  );
}
