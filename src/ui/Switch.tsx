type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
};

export function Switch({ checked, onChange, label, hint }: Props) {
  return (
    <label className="switch-row">
      <span>
        <span className="switch-label">{label}</span>
        {hint ? <span className="switch-hint">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className="switch"
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </label>
  );
}
