import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { homePathFor } from "../shell/nav.ts";
import { useShellSession } from "../shell/session.tsx";
import type { Department } from "../shell/types.ts";
import { DEPARTMENTS } from "../shell/types.ts";
import { useStore } from "../store";

const deptLabelKey: Record<Department, string> = {
  sales: "deptSales",
  ops: "deptOps",
  finance: "deptFinance",
  admin: "deptAdmin",
};

export function LoginPage() {
  const { tx } = useStore();
  const { user, loading, mode, login } = useAuth();
  const { shellUser, enterAs } = useShellSession();
  const navigate = useNavigate();
  const [busyDept, setBusyDept] = useState<Department | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState("admin@cangzhan.com");
  const [password, setPassword] = useState("demo123");
  const [remoteBusy, setRemoteBusy] = useState(false);
  const production = mode === "production";

  if (!loading && (user || shellUser)) {
    const dest = shellUser ? homePathFor(shellUser.department) : "/";
    return <Navigate to={dest} replace />;
  }

  async function pickDept(department: Department) {
    setBusyDept(department);
    setErr(null);
    try {
      await enterAs(department);
      navigate(homePathFor(department), { replace: true });
    } catch {
      setErr(tx("loginFailed"));
    } finally {
      setBusyDept(null);
    }
  }

  async function onRemote(e: FormEvent) {
    e.preventDefault();
    if (!production) return;
    setRemoteBusy(true);
    setErr(null);
    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch {
      setErr(tx("loginFailed"));
    } finally {
      setRemoteBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-card">
          <header className="login-head">
            <span className="bar-mark login-mark" aria-hidden>
              栈
            </span>
            <div>
              <h1>{tx("brand")}</h1>
              <p>{tx("loginDeptHint")}</p>
            </div>
          </header>

          <div className="login-dept-grid" role="group" aria-label={tx("loginPickDept")}>
            {DEPARTMENTS.map((d) => (
              <button
                key={d}
                type="button"
                className="btn btn-primary login-dept-btn"
                disabled={busyDept !== null}
                onClick={() => void pickDept(d)}
              >
                {busyDept === d ? tx("loginBusy") : tx(deptLabelKey[d])}
              </button>
            ))}
          </div>

          {err ? (
            <p className="field-err" role="alert">
              {err}
            </p>
          ) : null}

          <section className="login-remote" aria-labelledby="login-remote-title">
            <h2 id="login-remote-title" className="login-remote-title">
              {tx("loginRemoteTitle")}
            </h2>
            {production ? (
              <form className="form form-stack" onSubmit={(e) => void onRemote(e)}>
                <label>
                  Email
                  <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
                <button type="submit" className="btn btn-ghost login-submit" disabled={remoteBusy}>
                  {remoteBusy ? tx("loginBusy") : tx("loginSubmit")}
                </button>
              </form>
            ) : (
              <>
                <p className="meta">{tx("loginRemoteTodo")}</p>
                <button type="button" className="btn btn-ghost login-submit" disabled title={tx("apiNotConfigured")}>
                  {tx("loginSubmit")} — {tx("apiNotConfigured")}
                </button>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
