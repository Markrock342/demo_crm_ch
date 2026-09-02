import type { CSSProperties } from "react";

type Opt<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  value: T;
  onChange: (v: T) => void;
  options: Opt<T>[];
  label: string;
};

export function Segment<T extends string>({ value, onChange, options, label }: Props<T>) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      className="seg"
      role="radiogroup"
      aria-label={label}
      style={{ "--seg-n": options.length, "--seg-i": i } as CSSProperties}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
