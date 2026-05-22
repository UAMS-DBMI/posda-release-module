import { FormEvent, ReactNode } from "react";

type DynamicFormValues = Record<string, unknown>;

export type DynamicFormOption = {
  value: string;
  label?: string;
};

export type DynamicFormField<T extends DynamicFormValues> = {
  key: keyof T & string;
  label: string;
  type?: "text" | "number" | "select" | "checkbox" | "date" | "textarea";
  options?: DynamicFormOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  inputMode?:
    | "text"
    | "search"
    | "email"
    | "tel"
    | "url"
    | "none"
    | "numeric"
    | "decimal";
  className?: string;
  controlClassName?: string;
  helperText?: string;
  srOnlyLabel?: boolean;
  rows?: number;
};

type DynamicFormProps<T extends DynamicFormValues> = {
  values: T;
  fields: Array<DynamicFormField<T>>;
  onChange: (next: T) => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  className?: string;
  actions?: ReactNode;
  idPrefix?: string;
  errors?: Record<string, string | undefined>;
};

export default function DynamicForm<T extends DynamicFormValues>({
  values,
  fields,
  onChange,
  onSubmit,
  className,
  actions,
  idPrefix = "form-field",
  errors = {},
}: DynamicFormProps<T>) {
  function getControlClassName(
    defaultClassName: string,
    errorClassName: string,
    customClassName?: string,
  ) {
    return [customClassName ?? defaultClassName, errorClassName]
      .filter(Boolean)
      .join(" ");
  }

  function getErrorStyle(hasError: boolean) {
    return hasError
      ? {
          borderColor: "#ef4444",
          borderWidth: 2,
          boxShadow: "0 0 0 1px #ef4444 inset",
        }
      : undefined;
  }

  function setValue(key: keyof T & string, nextValue: unknown) {
    onChange({
      ...values,
      [key]: nextValue,
    });
  }

  return (
    <form onSubmit={onSubmit} className={className} noValidate>
      {fields.map((field) => {
        const id = `${idPrefix}-${field.key}`;
        const rawValue = values[field.key];
        const fieldError = errors[field.key];
        const hasError = Boolean(fieldError);

        if (field.type === "checkbox") {
          return (
            <label
              key={field.key}
              htmlFor={id}
              className={
                field.className ?? "flex h-10 items-center gap-2 text-sm"
              }
            >
              <input
                id={id}
                type="checkbox"
                checked={Boolean(rawValue)}
                onChange={(event) => setValue(field.key, event.target.checked)}
                disabled={field.disabled}
                required={field.required}
                className={getControlClassName(
                  "checkbox",
                  hasError
                    ? "accent-red-600 ring-2 ring-red-500 ring-offset-1"
                    : "",
                  field.controlClassName,
                )}
                style={hasError ? { accentColor: "#ef4444" } : undefined}
              />
              <span className={hasError ? "text-red-600" : undefined}>
                {field.label}
              </span>
              {hasError && (
                <span className="ml-2 text-xs font-medium text-red-600">
                  {fieldError}
                </span>
              )}
            </label>
          );
        }

        if (field.type === "select") {
          return (
            <label
              key={field.key}
              htmlFor={id}
              className={field.className ?? "block"}
            >
              <span className={field.srOnlyLabel ? "sr-only" : "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted"}>
                {field.label}
                {field.required && !field.srOnlyLabel && (
                  <span className="ml-1 text-red-500">*</span>
                )}
              </span>
              <select
                id={id}
                value={String(rawValue ?? "")}
                onChange={(event) => setValue(field.key, event.target.value)}
                disabled={field.disabled}
                required={field.required}
                className={getControlClassName(
                  "mt-1 select",
                  hasError ? "border-2 border-red-500 focus:ring-red-400" : "",
                  field.controlClassName,
                )}
                style={getErrorStyle(hasError)}
              >
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label ?? option.value}
                  </option>
                ))}
              </select>
              {hasError ? (
                <p className="mt-1 text-xs font-medium text-red-600">
                  {fieldError}
                </p>
              ) : field.helperText ? (
                <p className="mt-1 text-xs text-zinc-500">{field.helperText}</p>
              ) : null}
            </label>
          );
        }

        if (field.type === "textarea") {
          return (
            <label
              key={field.key}
              htmlFor={id}
              className={field.className ?? "block"}
            >
              <span className={field.srOnlyLabel ? "sr-only" : "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted"}>
                {field.label}
                {field.required && !field.srOnlyLabel && (
                  <span className="ml-1 text-red-500">*</span>
                )}
              </span>
              <textarea
                id={id}
                value={String(rawValue ?? "")}
                onChange={(event) => setValue(field.key, event.target.value)}
                placeholder={field.placeholder}
                disabled={field.disabled}
                required={field.required}
                rows={field.rows}
                className={getControlClassName(
                  "mt-1 textarea",
                  hasError ? "border-2 border-red-500 focus:ring-red-400" : "",
                  field.controlClassName,
                )}
                style={getErrorStyle(hasError)}
              />
              {hasError ? (
                <p className="mt-1 text-xs font-medium text-red-600">
                  {fieldError}
                </p>
              ) : field.helperText ? (
                <p className="mt-1 text-xs text-zinc-500">{field.helperText}</p>
              ) : null}
            </label>
          );
        }

        return (
          <label
            key={field.key}
            htmlFor={id}
            className={field.className ?? "block"}
          >
            <span className={field.srOnlyLabel ? "sr-only" : "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted"}>
              {field.label}
              {field.required && !field.srOnlyLabel && (
                <span className="ml-1 text-red-500">*</span>
              )}
            </span>
            <input
              id={id}
              type={field.type ?? "text"}
              value={String(rawValue ?? "")}
              onChange={(event) => setValue(field.key, event.target.value)}
              placeholder={field.placeholder}
              disabled={field.disabled}
              required={field.required}
              inputMode={field.inputMode}
              className={getControlClassName(
                "mt-1 input",
                hasError
                  ? "border-2 border-red-500 focus:ring-red-400 dark:border-red-500"
                  : "",
                field.controlClassName,
              )}
              style={getErrorStyle(hasError)}
            />
            {hasError ? (
              <p className="mt-1 text-xs font-medium text-red-600">
                {fieldError}
              </p>
            ) : field.helperText ? (
              <p className="mt-1 text-xs text-zinc-500">{field.helperText}</p>
            ) : null}
          </label>
        );
      })}

      {actions}
    </form>
  );
}
