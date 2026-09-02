import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type ItemEnvelope, type ListEnvelope } from "@/lib/apiFetch";

/**
 * Hooks for a dataset release's transfers — the reads and writes shared by the
 * cycle's Transfer stage and `datasets/releases/transfers/*`.
 *
 * The orchestration here previously lived inline in `releases/transfers/List.tsx`
 * ("Sync with Default Config") as ~6 sequential fetches driven from the page.
 */

const BASE = "/papi/v1/distribution";

/** A destination configured on at least one recordset bundled into the release.
 *  The endpoint derives these *from* the release's recordsets, so every entry is
 *  backed by at least one recordset. */
export type ReleaseDestination = {
  destination_id: number;
  destination_name: string;
  destination_abbr: string;
};

export type ReleaseTransfer = {
  dataset_release_transfer_id: number;
  destination_id: number;
  destination_name: string;
  destination_abbr: string;
  transfer_name: string;
  transfer_status: string;
  transfer_notes: string | null;
  /** How many recordset releases the transfer currently carries. */
  recordset_count: number;
  /** How many it *should* carry, per its destination's current config. */
  expected_recordset_count: number;
  /** The two sets differ. Not derivable from the counts — Bundle swapping which
   *  version of a recordset is bundled leaves both counts equal while pointing
   *  the transfer at a superseded release. `useSyncTransferRecordsets` repairs it. */
  membership_drifted: boolean;
  /** Files the transfer will move, materialized at the queue transition. A
   *  draft transfer has none yet, so all three are 0 until it is queued. */
  file_count: number;
  completed_file_count: number;
  failed_file_count: number;
};

/** One recordset release carried by a transfer. The file counts come from the
 *  API's IDC predicates, and are what the stage groups by -- a recordset can
 *  feed both the imaging and clinical manifests, so this is not a category. */
export type TransferRecordset = {
  recordset_release_id: number;
  recordset_id: number;
  recordset_name: string;
  release_number: number;
  recordset_type_name: string;
  /** DICOM files, whatever the recordset type -- IDC ingests DICOM whether it
   *  depicts radiology, pathology or an annotation. */
  imaging_files: number;
  /** Non-DICOM files in a Clinical Data recordset. */
  clinical_files: number;
  /** Files matching neither predicate: no manifest can list them, so the
   *  transfer skips them. A routing mistake rather than a category. */
  unlistable_files: number;
  retriever_manifest_file_id: number | null;
  downloadable_file_id: number | null;
  security_hash: string | null;
};

export function releaseDestinationsKey(releaseId: number | undefined) {
  return ["release-destinations", releaseId ?? 0] as const;
}

export function releaseTransfersKey(releaseId: number | undefined) {
  return ["release-transfers", releaseId ?? 0] as const;
}

export function transferRecordsetsKey(transferId: number | undefined) {
  return ["transfer-recordsets", transferId ?? 0] as const;
}

/** Destinations the release *should* ship to, aggregated from its recordsets'
 *  `recordset_destination` config. */
export function useReleaseDestinations(releaseId: number | undefined) {
  return useQuery({
    queryKey: releaseDestinationsKey(releaseId),
    enabled: releaseId != null,
    queryFn: async () => {
      const json = await apiFetch<ListEnvelope<ReleaseDestination>>(
        `${BASE}/datasets/releases/${releaseId}/destinations`,
      );
      return json.data;
    },
  });
}

/** How often to re-poll while the daemon is working. Long enough that the file
 *  counts — which aggregate over `transfer_file`, potentially ~500k rows for a
 *  large transfer — are not recounted more often than the daemon flushes them,
 *  which it does in batches rather than per file. */
const TRANSFER_POLL_MS = 5000;

/** Transfers that actually exist for the release. Fetched separately from the
 *  cycle payload, whose `CycleTransfer` has no `destination_id` — which the
 *  stage needs to line transfers up against the destination rows. */
export function useReleaseTransfers(releaseId: number | undefined) {
  return useQuery({
    queryKey: releaseTransfersKey(releaseId),
    enabled: releaseId != null,
    queryFn: async () => {
      const json = await apiFetch<ListEnvelope<ReleaseTransfer>>(
        `${BASE}/datasets/releases/${releaseId}/transfers`,
      );
      return json.data;
    },
    // Poll only while something is actually in flight, and stop on its own once
    // everything reaches a terminal status. `queued` counts as in flight: the
    // daemon may not have claimed it yet, and the claim is precisely what we
    // are waiting to see. A page of drafts never polls at all.
    refetchInterval: (query) =>
      query.state.data?.some(
        (t) =>
          t.transfer_status === "queued" || t.transfer_status === "in_progress",
      )
        ? TRANSFER_POLL_MS
        : false,
  });
}

/** What a transfer currently carries. Lazily fetched — the stage only needs it
 *  for an expanded row. */
export function useTransferRecordsets(
  transferId: number | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: transferRecordsetsKey(transferId),
    enabled: enabled && transferId != null,
    queryFn: async () => {
      const json = await apiFetch<ListEnvelope<TransferRecordset>>(
        `${BASE}/transfers/${transferId}/recordsets`,
      );
      return json.data;
    },
  });
}

/** The name a transfer gets when the stage creates it. Derived, never typed —
 *  the dataset, the version and the destination are all already known. */
export function transferName(
  datasetName: string,
  releaseNumber: number,
  destinationAbbr: string,
): string {
  return `${datasetName} v${releaseNumber} — ${destinationAbbr}`;
}

/** The recordset releases in this release that are configured for one
 *  destination — the membership a transfer to that destination should carry. */
async function fetchDestinationRecordsetIds(
  releaseId: number,
  destinationId: number,
): Promise<number[]> {
  const json = await apiFetch<ListEnvelope<{ recordset_release_id: number }>>(
    `${BASE}/datasets/releases/${releaseId}/recordsets?destination_id=${destinationId}`,
  );
  return json.data.map((r) => r.recordset_release_id);
}

export type CreateTransferInput = {
  destination: ReleaseDestination;
  datasetName: string;
  releaseNumber: number;
};

/** Create the draft transfer for one destination, with its name, mode and
 *  membership all derived. Leaves it at `transfer_status = 'draft'` — queueing
 *  is always a separate, deliberate act (see `useQueueTransfer`). */
export function useCreateTransfer(
  releaseId: number | undefined,
  datasetId: string | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      destination,
      datasetName,
      releaseNumber,
    }: CreateTransferInput) => {
      if (releaseId == null) throw new Error("No dataset release.");

      const recordsetReleaseIds = await fetchDestinationRecordsetIds(
        releaseId,
        destination.destination_id,
      );
      // An empty list is not "no recordsets" to the API -- it falls through to
      // "every recordset in the release", which for a destination-scoped
      // transfer would ship the wrong data. Reachable if a recordset's
      // destination is removed between loading the page and clicking Create.
      if (recordsetReleaseIds.length === 0) {
        throw new Error(
          `No recordsets in this release are configured for ${destination.destination_name}.`,
        );
      }

      const json = await apiFetch<ItemEnvelope<ReleaseTransfer>>(
        `${BASE}/datasets/releases/${releaseId}/transfers`,
        {
          method: "POST",
          body: JSON.stringify({
            destination_id: destination.destination_id,
            transfer_name: transferName(
              datasetName,
              releaseNumber,
              destination.destination_abbr,
            ),
            transfer_status: "draft",
            recordset_release_ids: recordsetReleaseIds,
          }),
        },
      );
      return json.data;
    },
    onSuccess: () => invalidateTransfers(queryClient, releaseId, datasetId),
  });
}

export type SyncResult = { added: number; removed: number };

/** Reconcile an existing transfer's membership against its destination's
 *  current config — what "Sync with Default Config" did inline in the page.
 *  Returns the counts so the caller can say what changed (or that nothing did). */
export function useSyncTransferRecordsets(
  releaseId: number | undefined,
  datasetId: string | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      transferId,
      destinationId,
    }: {
      transferId: number;
      destinationId: number;
    }): Promise<SyncResult> => {
      if (releaseId == null) throw new Error("No dataset release.");

      const [expected, current] = await Promise.all([
        fetchDestinationRecordsetIds(releaseId, destinationId),
        apiFetch<ListEnvelope<TransferRecordset>>(
          `${BASE}/transfers/${transferId}/recordsets`,
        ).then((json) => json.data.map((r) => r.recordset_release_id)),
      ]);

      const expectedSet = new Set(expected);
      const currentSet = new Set(current);
      const toAdd = expected.filter((id) => !currentSet.has(id));
      const toRemove = current.filter((id) => !expectedSet.has(id));

      if (toAdd.length > 0) {
        await apiFetch(`${BASE}/transfers/${transferId}/recordsets/add`, {
          method: "POST",
          body: JSON.stringify({ recordset_release_ids: toAdd }),
        });
      }
      if (toRemove.length > 0) {
        await apiFetch(`${BASE}/transfers/${transferId}/recordsets/remove`, {
          method: "POST",
          body: JSON.stringify({ recordset_release_ids: toRemove }),
        });
      }

      void queryClient.invalidateQueries({
        queryKey: transferRecordsetsKey(transferId),
      });
      return { added: toAdd.length, removed: toRemove.length };
    },
    onSuccess: () => invalidateTransfers(queryClient, releaseId, datasetId),
  });
}

/** Hand a transfer to the Go daemon. ⚠ One-way: setting `queued` fires
 *  `notify_transfer_queued()`, which starts real uploads to an external bucket,
 *  and `transfer_status` has no un-queue path back. Callers must confirm first,
 *  and this must never be folded into a bulk action. */
export function useQueueTransfer(
  releaseId: number | undefined,
  datasetId: string | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transferId: number) => {
      const json = await apiFetch<ItemEnvelope<ReleaseTransfer>>(
        `${BASE}/transfers/${transferId}`,
        {
          method: "PUT",
          body: JSON.stringify({ transfer_status: "queued" }),
        },
      );
      return json.data;
    },
    onSuccess: () => invalidateTransfers(queryClient, releaseId, datasetId),
  });
}

function invalidateTransfers(
  queryClient: ReturnType<typeof useQueryClient>,
  releaseId: number | undefined,
  datasetId: string | undefined,
) {
  void queryClient.invalidateQueries({
    queryKey: releaseTransfersKey(releaseId),
  });
  // The cycle rollup embeds the release's transfer chips, so it goes stale too.
  void queryClient.invalidateQueries({
    queryKey: ["dataset-cycle", datasetId ?? ""],
  });
}
