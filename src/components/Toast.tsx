import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type Toast = {
  id: string;
  title?: string;
  message: string;
  variant?: "info" | "success" | "error" | "warning";
};

type ToastContextType = {
  addToast: (payload: Omit<Toast, "id"> | string) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

export const ToastProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [toast, setToast] = useState<Toast | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);

  const addToast = useCallback((payload: Omit<Toast, "id"> | string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextToast: Toast =
      typeof payload === "string"
        ? { id, message: payload }
        : { id, ...payload };

    setIsDismissing(false);
    setToast(nextToast);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToast((currentToast) => {
      if (!currentToast || currentToast.id !== id) {
        return currentToast;
      }

      return currentToast;
    });
    setIsDismissing(true);
  }, []);

  const clearAll = useCallback(() => {
    setIsDismissing(false);
    setToast(null);
  }, []);

  useEffect(() => {
    if (!toast || !isDismissing) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setToast(null);
      setIsDismissing(false);
    }, 180);

    return () => clearTimeout(timeout);
  }, [isDismissing, toast]);

  useEffect(() => {
    if (!toast || isDismissing) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      removeToast(toast.id);
    }, 3000);

    return () => clearTimeout(timeout);
  }, [isDismissing, removeToast, toast]);

  // one toast is shown at a time; new toasts replace the current one.

  return (
    <ToastContext.Provider value={{ addToast, removeToast, clearAll }}>
      {children}

      <div className="toast-container" aria-live="polite">
        {toast && (
          <div
            key={toast.id}
            className={`toast toast-${toast.variant ?? "info"} ${
              isDismissing ? "toast-exit" : "toast-enter"
            }`}
            role="status"
          >
            <div className="toast-content">
              <div className="toast-message">{toast.message}</div>
              <button
                aria-label="Dismiss"
                className="toast-dismiss"
                onClick={() => removeToast(toast.id)}
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
