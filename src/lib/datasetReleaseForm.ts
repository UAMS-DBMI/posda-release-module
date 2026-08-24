import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type ItemEnvelope, type ListEnvelope } from "@/lib/apiFetch";

const BASE = "/papi/v1/distribution";

/** One recordset release currently bundled into a dataset release. */
export type BundledRecordset = {
  recordset_id: number;
  recordset_release_id: number;
  recordset_name: string;
  release_number: number;
  release_date: string | null;
};

export function bundledKey(releaseId: number | undefined) {
  return ["dataset-release-recordsets", releaseId ?? 0] as const;
}

/** What the draft dataset release currently contains. The cycle payload only
 *  carries a per-recordset boolean, not *which* version is bundled. */
export function useBundledRecordsets(releaseId: number | undefined) {
  return useQuery({
    queryKey: bundledKey(releaseId),
    enabled: releaseId != null,
    queryFn: async () => {
      const json = await apiFetch<ListEnvelope<BundledRecordset>>(
        `${BASE}/datasets/releases/${releaseId}/recordsets`,
      );
      return json.data;
    },
  });
}

type BundleResult = {
  dataset_release_id: number;
  added_recordset_release_ids?: number[];
  replaced_recordset_release_ids?: number[];
  current_count: number;
};

/** Include a recordset release in the dataset release. The API evicts any other
 *  release of the same recordset, so this doubles as "switch to this version"
 *  and is safe to repeat. */
export function useIncludeRecordsetRelease(
  releaseId: number | undefined,
  datasetId: string | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recordsetReleaseId: number) => {
      const json = await apiFetch<ItemEnvelope<BundleResult>>(
        `${BASE}/datasets/releases/${releaseId}/recordsets/add`,
        {
          method: "POST",
          body: JSON.stringify({ recordset_release_ids: [recordsetReleaseId] }),
        },
      );
      return json.data;
    },
    onSuccess: () => invalidateBundle(queryClient, releaseId, datasetId),
  });
}

/** Drop a recordset release from the dataset release. */
export function useExcludeRecordsetRelease(
  releaseId: number | undefined,
  datasetId: string | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recordsetReleaseId: number) => {
      const json = await apiFetch<ItemEnvelope<BundleResult>>(
        `${BASE}/datasets/releases/${releaseId}/recordsets/remove`,
        {
          method: "POST",
          body: JSON.stringify({ recordset_release_ids: [recordsetReleaseId] }),
        },
      );
      return json.data;
    },
    onSuccess: () => invalidateBundle(queryClient, releaseId, datasetId),
  });
}

/** Notes and DOI collected when a draft release is finalized. */
export type FinalizeFormValues = {
  release_notes: string;
  release_doi: string;
};

export const emptyFinalizeForm: FinalizeFormValues = {
  release_notes: "",
  release_doi: "",
};

/** Finalize the draft dataset release: record notes/DOI and flip it to
 *  `released`. The API stamps `release_date` on that transition, so nothing
 *  here sends a date. */
export function useFinalizeDatasetRelease(
  releaseId: number | undefined,
  datasetId: string | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: FinalizeFormValues) => {
      const notes = values.release_notes.trim();
      const doi = values.release_doi.trim();
      const json = await apiFetch<ItemEnvelope<{ dataset_release_id: number }>>(
        `${BASE}/datasets/releases/${releaseId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            release_status: "released",
            ...(notes ? { release_notes: notes } : {}),
            ...(doi ? { release_doi: doi } : {}),
          }),
        },
      );
      return json.data;
    },
    onSuccess: () => invalidateBundle(queryClient, releaseId, datasetId),
  });
}

function invalidateBundle(
  queryClient: ReturnType<typeof useQueryClient>,
  releaseId: number | undefined,
  datasetId: string | undefined,
) {
  void queryClient.invalidateQueries({ queryKey: bundledKey(releaseId) });
  void queryClient.invalidateQueries({
    queryKey: ["dataset-cycle", datasetId ?? ""],
  });
}
