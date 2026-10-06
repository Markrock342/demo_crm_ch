import { Check, PuzzlePiece } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { Switch, message } from "antd";
import { useEffect } from "react";
import { MODULE_KEYS, applyModulePreset, setModules, type ModuleKey, type ModulePreset, type ModuleSet, type ModulesState } from "../../api/modules.ts";
import { useStore } from "../../store";
import { IconBadge, Panel } from "../../v2/components";
import { useModules, useSetModulesCache } from "../../v2/hooks/useModules.ts";
import { MODULE_LOOK } from "../../v2/lib/moduleLook.ts";
import "./modules.css";

/** Same sets as server/domain/modules.ts MODULE_PRESETS (the server applies them). */
const PRESETS: { id: ModulePreset; on: ModuleKey[] }[] = [
  { id: "full", on: [...MODULE_KEYS] },
  { id: "marketing_cs", on: ["sales", "cs", "tracking", "automation"] },
];

/** Settings › Modules (admins): which parts of the system this company uses. */
export function ModulesSection() {
  const { tx } = useStore();
  const { modules, preset, ready } = useModules();
  const setCache = useSetModulesCache();

  // Arriving from the "module not enabled" page (/settings#settings-modules).
  useEffect(() => {
    if (window.location.hash === "#settings-modules") {
      const t = window.setTimeout(() => document.getElementById("settings-modules")?.scrollIntoView({ block: "start" }), 300);
      return () => window.clearTimeout(t);
    }
  }, []);

  const save = useMutation({
    mutationFn: (v: { preset: ModulePreset } | { modules: Partial<ModuleSet> }) => ("preset" in v ? applyModulePreset(v.preset) : setModules(v.modules)),
    onSuccess: (v: ModulesState) => {
      setCache(v);
      message.success(tx("md_saved"));
    },
    onError: () => message.error(tx("md_save_failed")),
  });

  const onCount = MODULE_KEYS.filter((k) => modules[k]).length;

  return (
    <div id="settings-modules" className="adm-anchor">
      <Panel
        title={
          <span className="fin-panel-title">
            <IconBadge icon={PuzzlePiece} tone="primary" size={30} />
            {tx("md_title")}
          </span>
        }
        extra={<span className="md-count">{tx("md_count", { n: onCount, total: MODULE_KEYS.length })}</span>}
      >
        <p className="md-label">{tx("md_presets")}</p>
        <div className="md-presets">
          {PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`md-preset${active ? " is-active" : ""}`}
                aria-pressed={active}
                disabled={!ready || save.isPending}
                onClick={() => !active && save.mutate({ preset: p.id })}
              >
                <span className="md-preset-head">
                  <strong>{tx(`md_preset_${p.id}`)}</strong>
                  {active ? (
                    <span className="md-preset-tag">
                      <Check size={12} weight="bold" aria-hidden />
                      {tx("md_in_use")}
                    </span>
                  ) : null}
                </span>
                <span className="md-preset-icons" aria-hidden>
                  {MODULE_KEYS.map((k) => {
                    const { icon: I } = MODULE_LOOK[k];
                    return (
                      <span key={k} className={`md-dot${p.on.includes(k) ? ` is-on is-${MODULE_LOOK[k].tone}` : ""}`} title={tx(`md_name_${k}`)}>
                        <I size={14} weight="fill" />
                      </span>
                    );
                  })}
                </span>
              </button>
            );
          })}
        </div>

        <ul className="md-grid">
          {MODULE_KEYS.map((k) => {
            const look = MODULE_LOOK[k];
            const on = modules[k];
            return (
              <li key={k} className={`md-card${on ? "" : " is-off"}`}>
                <IconBadge icon={look.icon} tone={on ? look.tone : "neutral"} size={40} />
                <span className="md-card-text">
                  <strong>{tx(`md_name_${k}`)}</strong>
                  <span className="md-card-desc">{tx(`md_desc_${k}`)}</span>
                </span>
                <Switch
                  checked={on}
                  disabled={!ready || save.isPending}
                  onChange={(v) => save.mutate({ modules: { [k]: v } })}
                  aria-label={tx(`md_name_${k}`)}
                  checkedChildren={tx("md_on")}
                  unCheckedChildren={tx("md_off")}
                />
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
