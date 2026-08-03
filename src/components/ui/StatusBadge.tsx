import classNames from "@/lib/classNames";

export type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "info";

const variantClasses: Record<BadgeVariant, string> = {
  success:
    "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400",
  warning:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  danger: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400",
  neutral: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
};

const dotClasses: Record<BadgeVariant, string> = {
  success: "bg-green-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  neutral: "bg-zinc-400",
  info: "bg-blue-500",
};

// Maps the model's status vocabularies (review / assignment / qc_status / flag)
// to a visual variant. Unknown statuses fall back to neutral.
const statusVariant: Record<string, BadgeVariant> = {
  // review lifecycle
  open: "info",
  ready: "success",
  complete: "success",
  cancelled: "neutral",
  stale: "warning",
  // assignment workflow
  needs_qc: "warning",
  in_progress: "info",
  // qc series decision
  pending: "neutral",
  approved: "success",
  rejected: "danger",
  flagged: "warning",
  // flags
  resolved: "success",
  // dataset release lifecycle (draft also covers the transfer vocabulary)
  draft: "neutral",
  released: "info",
  live: "success",
  retracted: "danger",
};

type StatusBadgeProps = {
  status: string;
  variant?: BadgeVariant;
  label?: string;
  dot?: boolean;
  className?: string;
};

/** Shared status pill. Auto-derives color from `status`; override via `variant`. */
export function StatusBadge({
  status,
  variant,
  label,
  dot = false,
  className,
}: StatusBadgeProps) {
  const resolved = variant ?? statusVariant[status] ?? "neutral";
  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        variantClasses[resolved],
        className,
      )}
    >
      {dot && (
        <span
          className={classNames("h-1.5 w-1.5 rounded-full", dotClasses[resolved])}
        />
      )}
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

export default StatusBadge;
