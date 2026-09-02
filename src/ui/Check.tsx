type Props = {
  checked: boolean;
  onChange: () => void;
  label: string;
};

export function Check({ checked, onChange, label }: Props) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="check-box" aria-hidden />
      <span>{label}</span>
    </label>
  );
}
