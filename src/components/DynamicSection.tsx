import { ReactNode } from "react";
import { SectionCard } from "@/components/ui/Card";

export type DynamicSectionField = {
  label: string;
  value: ReactNode;
  fullWidth?: boolean;
  valueClassName?: string;
};

type DynamicSectionProps = {
  isLoading: boolean;
  error?: string | null;
  fields?: DynamicSectionField[];
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export default function DynamicSection({
  isLoading,
  error,
  fields,
  actions,
  children,
  className,
}: DynamicSectionProps) {
  return (
    <SectionCard className={className}>
      {isLoading && <p className="text-sm">Loading...</p>}

      {!isLoading && error && (
        <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
      )}

      {!isLoading && !error && fields && fields.length > 0 && (
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          {fields.map((field) => (
            <div
              key={field.label}
              className={field.fullWidth ? "col-span-full" : undefined}
            >
              <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{field.label}</dt>
              <dd
                className={`min-h-[2.25rem] rounded px-2.5 py-1.5 text-sm ${field.valueClassName ?? ""}`}
                style={{ background: "var(--background)", border: "1px solid var(--border-strong)" }}
              >
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {!isLoading && actions && <div className="mt-4 flex flex-wrap gap-3">{actions}</div>}

      {children}
    </SectionCard>
  );
}
