import type { ComponentPropsWithoutRef } from "react";
import { Link } from "react-router-dom";
import classNames from "@/lib/classNames";

type ButtonVariant = "primary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type ButtonBaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  wide?: boolean;
  className?: string;
};

type ButtonProps = ButtonBaseProps & ComponentPropsWithoutRef<"button">;

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
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={buildButtonClassName({ variant, size, wide, className })}
    />
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
