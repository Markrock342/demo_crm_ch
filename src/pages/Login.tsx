import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useStore } from "../store";

export function LoginPage() {
  const { tx } = useStore();
  const { user, mode, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@cangzhan.com");
  const [password, setPassword] = useState("demo123");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && mode === "demo") return <Navigate to="/" replace />;
  if (!loading && user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (ex) {
      const code = ex instanceof Error ? ex.message : "login_failed";
      setErr(tx(code === "invalid_credentials" ? "loginBadCreds" : "loginFailed"));
    } finally {
      setBusy(false);
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
              <p>{tx("loginHint")}</p>
            </div>
          </header>

          <form className="form login-form" onSubmit={submit}>
            <label>
              {tx("loginEmail")}
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </label>
            <label>
              {tx("loginPassword")}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {err ? (
              <p className="field-err" role="alert">
                {err}
              </p>
            ) : null}
            <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
              {busy ? tx("loginBusy") : tx("loginSubmit")}
            </button>
          </form>

          <p className="login-demo meta">{tx("loginDemoAccounts")}</p>
        </div>
      </div>
    </div>
  );
}
