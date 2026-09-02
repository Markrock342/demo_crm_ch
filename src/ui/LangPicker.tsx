import { CaretUp, GlobeHemisphereWest } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { locales, type Locale } from "../i18n";
import { useMedia } from "./useMedia";

type Props = {
  value: Locale;
  onChange: (v: Locale) => void;
};

export function LangPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const mobile = useMedia("(max-width: 1024px)");
  const current = locales.find((l) => l.id === value) ?? locales[0];

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!open || !mobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, mobile]);

  return (
    <div className={`lang-pick${open ? " is-open" : ""}`} ref={root}>
      <button
        type="button"
        className="lang-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <GlobeHemisphereWest size={18} weight="regular" aria-hidden />
        <span>{current.code}</span>
        <CaretUp size={14} weight="bold" aria-hidden className={open ? "" : "lang-chev-down"} />
      </button>
      {open ? (
        <>
          {mobile ? (
            <button type="button" className="lang-backdrop" aria-label="Close" onClick={() => setOpen(false)} />
          ) : null}
          <ul className="lang-menu" role="listbox" aria-label="Language">
            {locales.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={l.id === value}
                  className={l.id === value ? "is-on" : ""}
                  onClick={() => {
                    onChange(l.id);
                    setOpen(false);
                  }}
                >
                  <span>{l.full}</span>
                  <span className="lang-code">{l.code}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
