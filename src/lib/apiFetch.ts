import { extractApiError } from "@/lib/apiUtils";

/**
 * Thin fetch wrapper for PAPI calls: sets JSON headers, checks `res.ok`,
 * parses the body, and throws an Error with a user-facing message
 * (via extractApiError) on failure. Used as the TanStack queryFn/mutationFn body.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const json =
    res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(extractApiError(json, `Request failed (${res.status}).`));
  }

  return json as T;
}

/** Standard PAPI list envelope: `{ data, meta: { count, total, page?, limit? } }`. */
export type ListEnvelope<T> = {
  data: T[];
  meta: { count: number; total: number; page?: number; limit?: number };
};

/** Standard PAPI single envelope: `{ data }`. */
export type ItemEnvelope<T> = { data: T };
