import classNames from "@/lib/classNames";

export type SpinnerSize = "sm" | "md" | "lg";

const sizeClasses: Record<SpinnerSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-6 w-6",
};

type SpinnerProps = {
  size?: SpinnerSize;
  className?: string;
};

/** Indeterminate spinner. Draws in `currentColor`, so it inherits the
 *  surrounding text color (button label, muted body text, etc.). */
export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <svg
      className={classNames("animate-spin shrink-0", sizeClasses[size], className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

type LoadingStateProps = {
  label?: string;
  size?: SpinnerSize;
  className?: string;
};

/** Announced loading placeholder — the shared replacement for the inline
 *  loading-text sites. */
export function LoadingState({
  label = "Loading...",
  size = "md",
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={classNames(
        "flex items-center gap-2 text-sm text-muted",
        className,
      )}
    >
      <Spinner size={size} />
      <span>{label}</span>
    </div>
  );
}

export default Spinner;
