import type { CSSProperties } from "react";
import { Link } from "react-router-dom";

export type CycleStageState = "done" | "active" | "blocked" | "pending";

export type CycleStage = {
  key: string;
  label: string;
  state: CycleStageState;
  detail?: string;
  href?: string;
};

const dotStyles: Record<CycleStageState, CSSProperties> = {
  done: { background: "var(--accent)", borderColor: "var(--accent)" },
  active: {
    background: "var(--accent)",
    borderColor: "var(--accent)",
    boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent)",
  },
  blocked: {},
  pending: { background: "transparent", borderColor: "var(--border-strong)" },
};

const labelClasses: Record<CycleStageState, string> = {
  done: "",
  active: "text-accent",
  blocked: "text-amber-600 dark:text-amber-400",
  pending: "",
};

function StageNode({ stage }: { stage: CycleStage }) {
  const content = (
    <span className="flex items-start gap-2">
      <span
        className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${
          stage.state === "blocked" ? "border-amber-500 bg-amber-500" : ""
        }`}
        style={dotStyles[stage.state]}
      />
      <span>
        <span
          className={`block text-sm font-medium ${labelClasses[stage.state]}`}
          style={stage.state === "pending" ? { color: "var(--muted)" } : {}}
        >
          {stage.label}
        </span>
        {stage.detail && (
          <span className="block text-xs" style={{ color: "var(--muted)" }}>
            {stage.detail}
          </span>
        )}
      </span>
    </span>
  );

  if (stage.href) {
    return (
      <Link to={stage.href} className="transition-opacity hover:opacity-75">
        {content}
      </Link>
    );
  }
  return content;
}

export default function CycleStrip({ stages }: { stages: CycleStage[] }) {
  return (
    <div className="flex flex-wrap items-start">
      {stages.map((stage, index) => (
        <div key={stage.key} className="flex items-start">
          {index > 0 && (
            <div
              aria-hidden
              className="mx-2 mt-[9px] h-0.5 w-8"
              style={{ background: "var(--border-strong)" }}
            />
          )}
          <StageNode stage={stage} />
        </div>
      ))}
    </div>
  );
}
