import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { homePathFor } from "../shell/nav.ts";
import { useShellSession } from "../shell/session.tsx";
import type { Department } from "../shell/types.ts";
import { DEPARTMENTS } from "../shell/types.ts";
import { useStore } from "../store";

const deptLabelKey: Record<Department, string> = {
  sales: "deptSales",
  finance: "deptFinance",
  admin: "deptAdmin",
};

export function LoginPage() {
  const { tx } = useStore();
  const { user, loading } = useAuth();
  const { shellUser, enterAs } = useShellSession();
  const navigate = useNavigate();
  const [busyDept, setBusyDept] = useState<Department | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
            <p className="meta">{tx("loginRemoteTodo")}</p>
            <button type="button" className="btn btn-ghost login-submit" disabled title={tx("apiNotConfigured")}>
              {tx("loginSubmit")} — {tx("apiNotConfigured")}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
