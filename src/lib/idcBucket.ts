import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type ItemEnvelope } from "@/lib/apiFetch";

const BASE = "/papi/v1/distribution";

/** What a version's `status.json` says. `status` is "" with no status file yet,
 *  and null when the bucket can't be read. */
export type IdcBucketStatus = {
  status: string | null;
  unavailable_reason: string | null;
};

function idcBucketStatusKey(transferId: number | undefined) {
  return ["idc-bucket-status", transferId ?? null] as const;
}

/** Read live and kept fresh, because IDC changes it and the daemon sets Draft
 *  after a re-push is queued. */
export function useIdcBucketStatus(transferId: number | undefined) {
  return useQuery({
    queryKey: idcBucketStatusKey(transferId),
    enabled: transferId != null,
    refetchInterval: 60_000,
    queryFn: () =>
      apiFetch<ItemEnvelope<IdcBucketStatus>>(
        `${BASE}/transfers/${transferId}/idc/bucket-status`,
      ),
    select: (env) => env.data,
  });
}

/** The curator's hand-off: IDC may pick the version up from here on. */
export function useSetIdcReady(transferId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<ItemEnvelope<{ status: string }>>(
        `${BASE}/transfers/${transferId}/idc/set-ready`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: idcBucketStatusKey(transferId),
      });
    },
  });
}

export function idcBucketStatusLabel(idc: IdcBucketStatus | undefined): string {
  if (!idc) return "Checking IDC…";
  switch (idc.status) {
    case null:
      return "IDC Status Unknown";
    case "":
    case "Draft":
      return "Uploaded, Not Ready";
    case "Ready for processing":
      return "Ready for IDC";
    case "Processing":
      return "IDC Processing";
    case "Processed":
      return "Published by IDC";
    case "Errored":
      return "IDC Errors";
    default:
      return `IDC: ${idc.status}`;
  }
}

/** Waiting on the curator's Set to Ready. */
export function idcCanSetReady(idc: IdcBucketStatus | undefined): boolean {
  return idc?.status === "" || idc?.status === "Draft";
}

/** IDC has started, or holds a status we don't know: a change needs a new
 *  version. An unreadable status isn't closed, because the daemon checks again
 *  before it writes. Same rule as the server's Queue check. */
export function idcVersionClosed(idc: IdcBucketStatus | undefined): boolean {
  if (!idc || idc.status === null) return false;
  return !["", "Draft", "Ready for processing", "Errored"].includes(idc.status);
}
