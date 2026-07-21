import type { ComponentPropsWithoutRef } from "react";
import { Link } from "react-router-dom";
import classNames from "@/lib/classNames";
import { Spinner } from "@/components/ui/Spinner";

type ButtonVariant = "primary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type ButtonBaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  wide?: boolean;
  className?: string;
};

type ButtonProps = ButtonBaseProps &
  ComponentPropsWithoutRef<"button"> & {
    /** Shows a spinner beside the label and disables the button. */
    loading?: boolean;
  };

type LinkButtonProps = ButtonBaseProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, "className" | "to"> & {
    href: string;
  };

const variantClasses: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  ghost: "btn-ghost",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "btn-md",
  lg: "btn-lg",
};

function buildButtonClassName({
  variant = "primary",
  size = "md",
  wide,
  className,
}: ButtonBaseProps) {
  return classNames(
    "btn",
    variantClasses[variant],
    sizeClasses[size],
    wide ? "btn-wide" : undefined,
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  wide,
  className,
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buildButtonClassName({
        variant,
        size,
        wide,
        className: classNames(loading ? "gap-2" : undefined, className),
      })}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "primary",
  size = "md",
  wide,
  className,
  href,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      {...props}
      to={href}
      className={buildButtonClassName({ variant, size, wide, className })}
    />
  );
}
