export function extractApiError(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const body = json as Record<string, unknown>;
  const detail = body.detail as Record<string, unknown> | undefined;
  const error = detail?.error as Record<string, unknown> | undefined;
  if (typeof error?.message !== "string") return fallback;
  const details = error.details as Record<string, unknown> | undefined;
  const extra = typeof details?.message === "string" ? `: ${details.message}` : "";
  return `${error.message}${extra}`;
}

export function extractArray<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const source = payload as Record<string, unknown>;

  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value as T[];
    }
  }

  return [];
}
