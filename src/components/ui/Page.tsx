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

type PageDetailHeaderProps = {
  title: string;
  breadcrumb?: { label: string; href: string };
  subtitle?: ReactNode;
  badge?: { label: string; variant: BadgeVariant };
  actions?: ReactNode;
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
  subtitle,
  badge,
  actions,
}: PageDetailHeaderProps) {
  return (
    <div>
      {breadcrumb && (
        <nav
          className="mb-2 flex items-center gap-1.5 text-sm"
          style={{ color: "var(--muted)" }}
        >
          <span className="opacity-40">←</span>
          <Link
            to={breadcrumb.href}
            className="transition-colors hover:text-accent"
          >
            {breadcrumb.label}
          </Link>
        </nav>
      )}
      <PageHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
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
            {subtitle && (
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-3">{actions}</div>
          )}
        </div>
      </PageHeader>
    </div>
  );
}
