"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
type Grant = { connectionId: string; tool: string; approval: boolean };
type Tool = {
  connectionId: string;
  name: string;
  account: string;
  description: string;
  write: boolean;
};
type Review = {
  applicationName: string;
  applicationId: string;
  redirectUri: string;
  resource: string;
  expiresAt: string;
  tools: Tool[];
};
export function OAuthConsent({
  requestId,
  email,
}: {
  requestId: string;
  email: string;
}) {
  const [review, setReview] = useState<Review | null>(null),
    [grants, setGrants] = useState<Grant[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api(`/client-oauth/requests/${requestId}`)
      .then((v) => {
        if (active) setReview(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [requestId]);
  async function decide(approve: boolean) {
    setBusy(true);
    setError("");
    try {
      const v = await api(`/client-oauth/requests/${requestId}`, "POST", {
        approve,
        grants: approve ? grants : [],
      });
      location.assign(v.redirectUrl);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="consent">
      <a href="/" className="brand" aria-label="ONE home">
        ONE
      </a>
      <header>
        <h1>
          {review
            ? `Connect ${review.applicationName}`
            : "Review client access"}
        </h1>
        <p>
          Signed in as <strong>{email}</strong>
        </p>
      </header>
      {error && (
        <div className="error" role="alert">
          {error}. If this request expired or another connection was started in
          this browser, restart the connection from your MCP client.
        </div>
      )}
      {!review && !error && <p role="status">Loading authorization request…</p>}
      {review && (
        <>
          <section>
            <h2>Check the application</h2>
            <p>
              Application names are supplied by their developers. ONE has not
              verified this application's identity. Only authorize a connection
              you started.
            </p>
            <dl>
              <dt>Application ID</dt>
              <dd>
                <code>{review.applicationId}</code>
              </dd>
              <dt>Return destination</dt>
              <dd>
                <code>{review.redirectUri}</code>
              </dd>
              <dt>ONE endpoint</dt>
              <dd>
                <code>{review.resource}</code>
              </dd>
            </dl>
            <p>
              This client can stay connected for up to 90 days. You can revoke
              it at any time in AI Clients. Your provider credentials remain in
              ONE.
            </p>
          </section>
          <section>
            <h2>Choose tools and accounts</h2>
            <p>
              Nothing is selected automatically. New accounts and tools will
              require a separate grant. Sensitive actions always need human
              approval.
            </p>
            {review.tools.length ? (
              <div className="ledger">
                {review.tools.map((t) => {
                  const g = grants.find(
                    (g) =>
                      g.connectionId === t.connectionId && g.tool === t.name,
                  );
                  return (
                    <div
                      className="row"
                      key={JSON.stringify([t.connectionId, t.name])}
                    >
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={!!g}
                          disabled={busy}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setGrants((current) =>
                              checked
                                ? [
                                    ...current,
                                    {
                                      connectionId: t.connectionId,
                                      tool: t.name,
                                      approval: t.write,
                                    },
                                  ]
                                : current.filter(
                                    (g) =>
                                      g.connectionId !== t.connectionId ||
                                      g.tool !== t.name,
                                  ),
                            );
                          }}
                        />
                        <span>
                          <strong>{t.name}</strong>
                          <small>{t.account}</small>
                          <small>{t.description}</small>
                        </span>
                      </label>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={t.write || !!g?.approval}
                          disabled={busy || !g || t.write}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setGrants((current) =>
                              current.map((g) =>
                                g.connectionId === t.connectionId &&
                                g.tool === t.name
                                  ? { ...g, approval: checked }
                                  : g,
                              ),
                            );
                          }}
                        />
                        Require approval
                      </label>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="consent-empty">
                You have no connected tools yet. You can authorize this client
                now and grant tools later in AI Clients, after connecting a
                provider.
              </p>
            )}
          </section>
          <div className="actions">
            <button disabled={busy} onClick={() => void decide(true)}>
              {busy
                ? "Completing authorization…"
                : grants.length
                  ? `Authorize ${grants.length} ${grants.length === 1 ? "tool" : "tools"}`
                  : "Authorize without tools"}
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void decide(false)}
            >
              Deny access
            </button>
          </div>
          <p className="muted consent-expiry">
            Request expires {new Date(review.expiresAt).toLocaleString()}.
            Authorization does not reconnect Google, GitHub or other providers.
          </p>
        </>
      )}
      <a className="consent-back" href="/">
        Return to workspace
      </a>
    </main>
  );
}
