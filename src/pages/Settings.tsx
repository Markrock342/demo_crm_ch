import { Cpu, Database, PlugsConnected } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { aiHealth } from "../ai/client";
import { locales, type Locale } from "../i18n";
import { useStore } from "../store";
import { Button } from "../ui/Button";
import { Segment } from "../ui/Segment";
import { Switch } from "../ui/Switch";

export function SettingsPage() {
  const { tx, locale, setLocale, reset, compact, setCompact, motion, setMotion } = useStore();
  const [ok, setOk] = useState<boolean | null>(null);
  const [model, setModel] = useState("");

  useEffect(() => {
    aiHealth()
      .then((h) => {
        setOk(h.ok);
        setModel(h.model ?? "");
      })
      .catch(() => setOk(false));
  }, []);

  const langOptions = locales.map((l) => ({ value: l.id as Locale, label: l.label }));

  return (
    <div className="page page--settings">
      <div className="page-head">
        <div>
          <h1>{tx("settingsTitle")}</h1>
          <p>{tx("settingsHint")}</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-card">
          <header className="settings-card-head">
            <PlugsConnected size={20} weight="regular" aria-hidden />
            <h2>{tx("settingsSystem")}</h2>
          </header>
          <ul className="settings-status">
            <li>
              <span className="settings-status-label">Gemini</span>
              <span className={`settings-pill ${ok ? "is-ok" : ok === false ? "is-off" : "is-pending"}`}>
                {ok === null ? "…" : ok ? tx("geminiOn") : tx("geminiOff")}
              </span>
            </li>
            <li>
              <span className="settings-status-label">Model</span>
              <span className="settings-value mono">{model || "—"}</span>
            </li>
            <li>
              <span className="settings-status-label">{tx("sealNote")}</span>
              <span className="settings-value mono">cangzhan-demo-v3</span>
            </li>
          </ul>
        </section>

        <section className="settings-card">
          <header className="settings-card-head">
            <Cpu size={20} weight="regular" aria-hidden />
            <h2>{tx("settingsDisplay")}</h2>
          </header>
          <p className="settings-card-hint">{tx("kitHint")}</p>
          <Switch checked={compact} onChange={setCompact} label={tx("density")} hint={tx("densityHint")} />
          <Switch checked={motion} onChange={setMotion} label={tx("motion")} hint={tx("motionHint")} />
        </section>

        <section className="settings-card">
          <header className="settings-card-head">
            <Database size={20} weight="regular" aria-hidden />
            <h2>{tx("settingsLanguage")}</h2>
          </header>
          <p className="settings-card-hint">{tx("settingsLangHint")}</p>
          <Segment value={locale} onChange={setLocale} options={langOptions} label={tx("settingsLanguage")} />
        </section>

        <section className="settings-card settings-card--reset">
          <p className="settings-reset-copy">{tx("resetHint")}</p>
          <Button variant="danger" className="settings-reset-btn" onClick={reset}>
            {tx("resetDemo")}
          </Button>
        </section>
      </div>
    </div>
  );
}
