import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Alert, Button, Input } from "antd";
import { ArrowRight, ShippingContainer, UserCircle } from "@phosphor-icons/react";
import { TEST_ACCOUNTS, TEST_PASSWORD, testAccountsEnabled } from "../auth/testAccounts";
import { useAuth } from "../auth/AuthProvider";
import { useStore } from "../store";
import { LangPicker } from "../ui/LangPicker";
import { IconBadge, RouteTrack, StageFlow, type StageKey } from "../v2/components/Graphics.tsx";
import { BrandMark } from "../v2/components/BrandMark.tsx";
import { useBrandHead, usePublicBranding } from "../v2/hooks/useBranding.ts";
import "../v2/pages/public.css";

const LOGIN_ERROR_KEY: Record<string, string> = {
  invalid_credentials: "pub_login_failed",
  too_many_attempts: "sm_tooMany",
  unreachable: "pub_login_no_api",
  no_organization: "pub_login_no_org",
  server_error: "pub_login_server_error",
};

export function LoginPage() {
  const { tx, locale, setLocale } = useStore();
  const { user, loading, error: sessionError, login, refresh } = useAuth();
  const navigate = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState<string | null>(null);
  const stageLabels = Object.fromEntries(
    (["booked", "gatein", "sailed", "arrived", "customs", "delivered"] as StageKey[]).map((k) => [k, tx(`stage_${k}`)]),
  ) as Record<StageKey, string>;
  const brand = usePublicBranding();
  useBrandHead(tx("pub_login_title"), brand);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function signIn(mail: string, pass: string) {
    setErr(null);
    await login(mail.trim(), pass);
    navigate("/", { replace: true });
  }

  async function quickSignIn(mail: string) {
    setQuick(mail);
    try {
      await signIn(mail, TEST_PASSWORD);
    } catch (ex) {
      const code = ex instanceof Error ? ex.message : "server_error";
      setErr(tx(LOGIN_ERROR_KEY[code] ?? "pub_login_server_error"));
    } finally {
      setQuick(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch (ex) {
      const code = ex instanceof Error ? ex.message : "server_error";
      setErr(tx(LOGIN_ERROR_KEY[code] ?? "pub_login_server_error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pub-login">
      <aside className="pub-login-brand">
        <div className="pub-login-brand-top">
          {brand.ready ? <BrandMark name={brand.name} logoUrl={brand.logoUrl} size={48} fit="auto" decorative /> : null}
          {brand.name ? (
            <span className="pub-login-brand-name is-org">
              <strong>{brand.name}</strong>
              <span className="pub-vendor">{tx("brand_vendor")}</span>
            </span>
          ) : brand.ready ? (
            <span className="pub-login-brand-name">
              <strong>{tx("brand")}</strong>
              <span>{tx("brandRoman")}</span>
            </span>
          ) : null}
        </div>
        <div className="pub-login-scene" aria-hidden>
          <div className="pub-login-ghost" />
          <div className="pub-login-shot">
            <div className="pub-login-shot-head">
              <strong>JOB-2026-000142</strong>
              <span className="pub-login-shot-boxes">
                <ShippingContainer size={20} weight="duotone" />
                <ShippingContainer size={20} weight="duotone" />
                <em>40HC × 2</em>
              </span>
            </div>
            <RouteTrack from="CNSHA" to="THLCH" fromName={tx("pub_login_demo_from")} toName={tx("pub_login_demo_to")} progress={62} size="lg" />
            <StageFlow current={2} labels={stageLabels} size="sm" />
          </div>
        </div>
        <p className="pub-login-tagline">{tx("pub_login_tagline")}</p>
      </aside>

      <main className="pub-login-main">
        <div className="pub-login-bar">
          <LangPicker value={locale} onChange={setLocale} />
        </div>

        <div className="pub-login-body">
          <header className="pub-login-head">
            <h1>{tx("pub_login_title")}</h1>
          </header>

          <section className="login-remote" aria-label={tx("pub_login_title")}>
            <form className="pub-form" onSubmit={(e) => void onSubmit(e)}>
              {sessionError === "unreachable" && !err ? (
                <Alert
                  type="warning"
                  showIcon
                  message={tx("pub_login_no_api")}
                  action={
                    <Button size="small" onClick={() => void refresh()}>
                      {tx("pub_login_retry")}
                    </Button>
                  }
                />
              ) : null}
              <label className="pub-field">
                <span>{tx("pub_login_email")}</span>
                <Input
                  size="large"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </label>
              <label className="pub-field">
                <span>{tx("pub_login_password")}</span>
                <Input.Password
                  size="large"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              {err ? <Alert type="error" showIcon message={err} role="alert" /> : null}
              <Button type="primary" htmlType="submit" size="large" block loading={busy}>
                {busy ? tx("pub_login_busy") : tx("pub_login_submit")}
              </Button>
            </form>
          </section>

          {testAccountsEnabled ? (
            <section className="pub-test" aria-labelledby="pub-test-title">
              <div className="pub-test-head">
                <h2 id="pub-test-title">{tx("test_title")}</h2>
                <p>{tx("test_hint")}</p>
              </div>
              <div className="pub-test-grid">
                {TEST_ACCOUNTS.map((a) => (
                  <button
                    key={a.role}
                    type="button"
                    className="pub-test-btn"
                    disabled={Boolean(quick) || busy}
                    aria-busy={quick === a.email}
                    onClick={() => void quickSignIn(a.email)}
                  >
                    <IconBadge icon={a.icon} tone={a.tone} size={36} />
                    <span className="pub-test-text">
                      <strong>{tx(`test_role_${a.role}`)}</strong>
                      <span>{a.name[locale]}</span>
                    </span>
                    {quick === a.email ? <span className="pub-test-spin" aria-hidden /> : <ArrowRight size={14} aria-hidden />}
                  </button>
                ))}
                <Link to="/portal?test=1" className="pub-test-btn">
                  <IconBadge icon={UserCircle} tone="neutral" size={36} />
                  <span className="pub-test-text">
                    <strong>{tx("test_role_customer")}</strong>
                    <span>hai@huayun-sz.cn</span>
                  </span>
                  <ArrowRight size={14} aria-hidden />
                </Link>
              </div>
            </section>
          ) : null}

          <Link to="/portal" className="pub-login-portal">
            {tx("pub_login_portal_link")}
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </main>
    </div>
  );
}
