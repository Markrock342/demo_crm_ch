import { useEffect, useState } from "react";
import { aiHealth } from "../ai/client";
import { useStore } from "../store";
import { Button } from "../ui/Button";
import { LangPicker } from "../ui/LangPicker";
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

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{tx("settingsTitle")}</h1>
          <p>{tx("settingsHint")}</p>
        </div>
        <Button variant="danger" onClick={reset}>
          {tx("resetDemo")}
        </Button>
      </div>

      <section className="block kit-block">
        <h2>{tx("kitTitle")}</h2>
        <p className="hint">{tx("kitHint")}</p>
        <Switch checked={compact} onChange={setCompact} label={tx("density")} hint={tx("densityHint")} />
        <Switch checked={motion} onChange={setMotion} label={tx("motion")} hint={tx("motionHint")} />
        <div className="kit-row">
          <LangPicker value={locale} onChange={setLocale} />
        </div>
      </section>

      <dl className="settings-dl">
        <dt>Gemini</dt>
        <dd className={ok ? "ok" : "off"}>{ok ? tx("geminiOn") : tx("geminiOff")}</dd>
        <dt>Model</dt>
        <dd className="mono">{model || "—"}</dd>
        <dt>{tx("sealNote")}</dt>
        <dd>cangzhan-demo-v3</dd>
      </dl>
    </div>
  );
}
