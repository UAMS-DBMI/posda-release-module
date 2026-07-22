import { useRef, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import classNames from "@/lib/classNames";
import type { CycleStageState } from "@/components/CycleStrip";

export type TabItem = {
  key: string;
  label: string;
  /** Short status text shown beside the label (e.g. "2 stale"). */
  detail?: ReactNode;
  /** Drives the leading dot. Shares CycleStrip's vocabulary. */
  state?: CycleStageState;
  /** When set, the tab is a router link to this path instead of a button. */
  href?: string;
};

type TabsProps = {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  /** Ties each tab to its panel for assistive tech. */
  idPrefix: string;
  className?: string;
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

export function tabId(prefix: string, key: string) {
  return `${prefix}-tab-${key}`;
}

export function tabPanelId(prefix: string, key: string) {
  return `${prefix}-panel-${key}`;
}

/** Tab bar where each tab carries its own status. Used as the cycle page's
 *  workflow strip: the pipeline stays legible while one stage is in view. */
export default function Tabs({
  tabs,
  active,
  onChange,
  idPrefix,
  className,
}: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();

    const index = tabs.findIndex((t) => t.key === active);
    if (index === -1) return;

    const offset = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + offset + tabs.length) % tabs.length];
    onChange(next.key);
    listRef.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(tabId(idPrefix, next.key))}`)
      ?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={handleKeyDown}
      className={classNames(
        "flex flex-wrap items-stretch gap-1 border-b",
        className,
      )}
      style={{ borderColor: "var(--border-strong)" }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        const state = tab.state ?? "pending";
        const className = classNames(
          "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
          isActive
            ? "border-accent font-semibold text-accent"
            : "border-transparent font-medium hover:text-foreground",
        );
        const style = isActive ? {} : { color: "var(--muted)" };
        const shared = {
          id: tabId(idPrefix, tab.key),
          role: "tab" as const,
          "aria-selected": isActive,
          "aria-controls": tabPanelId(idPrefix, tab.key),
          tabIndex: isActive ? 0 : -1,
          className,
          style,
        };
        const inner = (
          <>
            <span
              aria-hidden
              className={classNames(
                "h-2.5 w-2.5 shrink-0 rounded-full border-2",
                state === "blocked" ? "border-amber-500 bg-amber-500" : "",
              )}
              style={dotStyles[state]}
            />
            {tab.label}
            {tab.detail && (
              <span
                className={classNames(
                  "text-xs font-normal",
                  state === "blocked" ? "text-amber-600 dark:text-amber-400" : "",
                )}
                style={state === "blocked" ? {} : { color: "var(--muted)" }}
              >
                {tab.detail}
              </span>
            )}
          </>
        );

        // Routed mode: a Link navigates on click; the parent's onChange (wired
        // to navigate) still drives arrow-key movement.
        return tab.href ? (
          <Link key={tab.key} to={tab.href} {...shared}>
            {inner}
          </Link>
        ) : (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            {...shared}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
