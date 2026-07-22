import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ItemEnvelope } from "@/lib/apiFetch";
import type { TransferChipTransfer } from "@/components/TransferChip";

const BASE = "/papi/v1/distribution";

export type CycleOpenDraft = {
  recordset_draft_id: number;
  draft_name: string;
  draft_status: string;
  file_count: number;
};

export type CycleQc = {
  reviews_total: number;
  open: number;
  stale: number;
  complete: number;
  series_total: number;
  series_pending: number;
  series_approved: number;
};

export type CycleRecordsetRelease = {
  recordset_release_id: number;
  release_number: number;
  release_date: string;
};

export type CycleRecordset = {
  recordset_id: number;
  recordset_name: string;
  recordset_type_name: string;
  open_draft: CycleOpenDraft | null;
  qc: CycleQc;
  latest_release: CycleRecordsetRelease | null;
  /** False when the recordset is frozen but not yet bundled — the fan-in signal. */
  in_latest_dataset_release: boolean;
};

export type DatasetReleaseStatus = "draft" | "released" | "live" | "retracted";

export type CycleDatasetRelease = {
  dataset_release_id: number;
  release_number: number;
  release_date: string;
  release_doi: string | null;
  release_status: DatasetReleaseStatus;
  transfers: TransferChipTransfer[];
};

export type DatasetCycle = {
  dataset_id: number;
  dataset_name: string;
  dataset_type_name: string;
  recordsets: CycleRecordset[];
  latest_dataset_release: CycleDatasetRelease | null;
};

/** Release-cycle rollup for one dataset: every recordset's pipeline position
 *  plus the dataset release they fan into. One call, no per-recordset fetches. */
export function useDatasetCycle(datasetId: string | undefined) {
  return useQuery({
    queryKey: ["dataset-cycle", datasetId ?? ""],
    enabled: Boolean(datasetId),
    queryFn: async () => {
      const json = await apiFetch<ItemEnvelope<DatasetCycle>>(
        `${BASE}/datasets/${datasetId}/cycle`,
      );
      return json.data;
    },
  });
}

/** True when a recordset's draft has passed the publish gate: at least one
 *  complete review and nothing open or stale. Mirrors the draft-detail gate. */
export function isPublishable(qc: CycleQc): boolean {
  return qc.complete > 0 && qc.open === 0 && qc.stale === 0;
}

/** Recordsets that are frozen but not in the latest dataset release. */
export function unbundledRecordsets(cycle: DatasetCycle): CycleRecordset[] {
  return cycle.recordsets.filter(
    (r) => r.latest_release !== null && !r.in_latest_dataset_release,
  );
}
