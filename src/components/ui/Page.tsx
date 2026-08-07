import type { HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import classNames from "@/lib/classNames";

type PageShellSize = "3xl" | "5xl" | "6xl";

type PageShellProps = HTMLAttributes<HTMLElement> & {
  size?: PageShellSize;
};

type PageTitleProps = {
  children: ReactNode;
  className?: string;
};

type PageSubtitleProps = {
  children: ReactNode;
  className?: string;
};

const shellSizeClasses: Record<PageShellSize, string> = {
  "3xl": "page-shell-3xl",
  "5xl": "page-shell-5xl",
  "6xl": "page-shell-6xl",
};

export function PageShell({
  size = "5xl",
  className,
  ...props
}: PageShellProps) {
  return (
    <main
      {...props}
      className={classNames(
        "page-shell content-width",
        shellSizeClasses[size],
        className,
      )}
    />
  );
}

export function PageHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={classNames("page-header", className)} />;
}

export function PageTitle({ className, children }: PageTitleProps) {
  return <h1 className={classNames("page-title", className)}>{children}</h1>;
}

export function PageSubtitle({ className, children }: PageSubtitleProps) {
  return <p className={classNames("page-subtitle", className)}>{children}</p>;
}

type BadgeVariant = "success" | "neutral" | "warning" | "danger";

type Breadcrumb = { label: string; href: string };

type PageDetailHeaderProps = {
  title: string;
  breadcrumb?: Breadcrumb;
  breadcrumbs?: Breadcrumb[];
  subtitle?: ReactNode;
  badge?: { label: string; variant: BadgeVariant };
  actions?: ReactNode;
  /** Second-row actions, rendered on the subtitle's line so the two line up. */
  subActions?: ReactNode;
};

const badgeClasses: Record<BadgeVariant, string> = {
  success:
    "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400",
  neutral: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  warning:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  danger: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400",
};

const badgeDotClasses: Record<BadgeVariant, string> = {
  success: "bg-green-500",
  neutral: "bg-zinc-400",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

export function PageDetailHeader({
  title,
  breadcrumb,
  breadcrumbs,
  subtitle,
  badge,
  actions,
  subActions,
}: PageDetailHeaderProps) {
  const trail = breadcrumbs ?? (breadcrumb ? [breadcrumb] : []);
  return (
    <div>
      {trail.length > 0 && (
        <nav
          className="mb-1 flex flex-wrap items-center gap-1.5 text-sm"
          style={{ color: "var(--muted)" }}
        >
          <span className="opacity-40">←</span>
          {trail.map((crumb, index) => (
            <span key={crumb.href} className="flex items-center gap-1.5">
              {index > 0 && <span className="opacity-40">/</span>}
              <Link
                to={crumb.href}
                className="transition-colors hover:text-accent"
              >
                {crumb.label}
              </Link>
            </span>
          ))}
        </nav>
      )}
      <PageHeader>
        {/* Two-row grid so `subActions` sits on the subtitle's line -- a plain
            column of actions would stack below the taller button row. */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1">
          <div className="flex items-center gap-3">
            <h1 className="page-title">{title}</h1>
            {badge && (
              <span
                className={classNames(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                  badgeClasses[badge.variant],
                )}
              >
                <span
                  className={classNames(
                    "h-1.5 w-1.5 rounded-full",
                    badgeDotClasses[badge.variant],
                  )}
                />
                {badge.label}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-3">
            {actions}
          </div>

          {(subtitle || subActions) && (
            <>
              {subtitle ? (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {subtitle}
                </p>
              ) : (
                <div />
              )}
              <div className="flex shrink-0 items-center justify-end gap-3">
                {subActions}
              </div>
            </>
          )}
        </div>
      </PageHeader>
    </div>
  );
}
