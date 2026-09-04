import { useEffect, useState } from "react";

/** Reveals text character-by-character for a typing effect. */
export function useTypewriter(text: string, active: boolean, msPerChar = 10) {
  const [out, setOut] = useState("");

  useEffect(() => {
    if (!active || !text) {
      setOut(text);
      return;
    }
    setOut("");
    let i = 0;
    const tick = () => {
      i += 1;
      setOut(text.slice(0, i));
      if (i < text.length) timer = window.setTimeout(tick, msPerChar);
    };
    let timer = window.setTimeout(tick, msPerChar);
    return () => window.clearTimeout(timer);
  }, [text, active, msPerChar]);

  return out;
}
