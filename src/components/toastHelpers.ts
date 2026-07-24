export type ToastVariant = "info" | "success" | "error" | "warning";

export type ToastNotifier = (
  payload: { message: string; variant?: ToastVariant } | string,
) => string;

export function toastSuccess(addToast: ToastNotifier, message: string) {
  return addToast({ message, variant: "success" });
}

export function toastError(addToast: ToastNotifier, message: string) {
  return addToast({ message, variant: "error" });
}

export function toastWarning(addToast: ToastNotifier, message: string) {
  return addToast({ message, variant: "warning" });
}
