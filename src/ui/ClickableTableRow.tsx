import type { KeyboardEvent, ReactNode } from "react";

type Props = {
  onActivate: () => void;
  className?: string;
  children: ReactNode;
};

function onRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, onActivate: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onActivate();
  }
}

export function ClickableTableRow({ onActivate, className, children }: Props) {
  return (
    <tr
      className={["is-clickable", className].filter(Boolean).join(" ")}
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => onRowKeyDown(e, onActivate)}
    >
      {children}
    </tr>
  );
}
