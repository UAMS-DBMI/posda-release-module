import { QueryClient } from "@tanstack/react-query";

/**
 * Shared TanStack Query client. Reference data (lookups, users) can opt into a
 * long staleTime per-query; the default below is a sensible middle ground for
 * the mutation-heavy QC/distribution views.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
