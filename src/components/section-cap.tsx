import type { ReactNode } from "react";

export function SectionCap({
  children,
  note,
}: {
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="section-cap">
      <span>{children}</span>
      {note && <span className="note">{note}</span>}
      <span className="rule" />
    </div>
  );
}
