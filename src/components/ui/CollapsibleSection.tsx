import { ReactNode, useState } from "react";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";

type CollapsibleSectionProps = {
  title: string;
  summary?: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

export default function CollapsibleSection({
  title,
  summary,
  actions,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <CardHeader className="mt-6 mb-0">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex items-center gap-2 text-left"
        >
          <span
            aria-hidden
            className="text-xs"
            style={{ color: "var(--muted)" }}
          >
            {open ? "▾" : "▸"}
          </span>
          <CardTitle>{title}</CardTitle>
          {summary != null && (
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              {summary}
            </span>
          )}
        </button>
        {actions}
      </CardHeader>
      {open && <SectionCard className="mt-1">{children}</SectionCard>}
    </>
  );
}
