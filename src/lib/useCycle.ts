import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ItemEnvelope } from "@/lib/apiFetch";
import type { TransferChipTransfer } from "@/components/TransferChip";
import type { CycleStageState } from "@/components/CycleStrip";

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

/** The chip's fields plus the transfer's name, which the cycle payload carries. */
export type CycleTransfer = TransferChipTransfer & {
  transfer_name: string;
};

export type CycleDatasetRelease = {
  dataset_release_id: number;
  release_number: number;
  release_date: string;
  release_doi: string | null;
  release_status: DatasetReleaseStatus;
  transfers: CycleTransfer[];
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

export type StageKey = "draft" | "qc" | "release" | "distribute";

export type StageSummary = {
  state: CycleStageState;
  detail: string;
};

/** Percent of a recordset's sampled series that have been decided. */
export function qcPercent(qc: CycleQc): number {
  if (qc.series_total === 0) return 0;
  return Math.round(((qc.series_total - qc.series_pending) / qc.series_total) * 100);
}

function draftStage(cycle: DatasetCycle): StageSummary {
  if (cycle.recordsets.length === 0) {
    return { state: "pending", detail: "No recordsets" };
  }
  const open = cycle.recordsets.filter((r) => r.open_draft !== null);
  if (open.length > 0) {
    return { state: "active", detail: `${open.length} open` };
  }
  const frozen = cycle.recordsets.filter((r) => r.latest_release !== null);
  return frozen.length > 0
    ? { state: "done", detail: "All frozen" }
    : { state: "pending", detail: "No drafts" };
}

function qcStage(cycle: DatasetCycle): StageSummary {
  const withDraft = cycle.recordsets.filter((r) => r.open_draft !== null);
  if (withDraft.length === 0) return { state: "pending", detail: "—" };

  const sum = (pick: (qc: CycleQc) => number) =>
    withDraft.reduce((n, r) => n + pick(r.qc), 0);

  const stale = sum((q) => q.stale);
  if (stale > 0) return { state: "blocked", detail: `${stale} stale` };

  const open = sum((q) => q.open);
  const total = sum((q) => q.series_total);
  const pending = sum((q) => q.series_pending);
  if (open > 0) {
    const percent = total === 0 ? 0 : Math.round(((total - pending) / total) * 100);
    return { state: "active", detail: `${percent}% reviewed` };
  }

  return sum((q) => q.complete) > 0
    ? { state: "done", detail: "Complete" }
    : { state: "pending", detail: "No QC yet" };
}

function releaseStage(cycle: DatasetCycle): StageSummary {
  const release = cycle.latest_dataset_release;
  const unbundled = unbundledRecordsets(cycle);

  if (!release) {
    return unbundled.length > 0
      ? { state: "active", detail: "Ready to cut" }
      : { state: "pending", detail: "None yet" };
  }
  if (unbundled.length > 0) {
    return { state: "blocked", detail: `${unbundled.length} not bundled` };
  }
  if (release.release_status === "retracted") {
    return { state: "blocked", detail: "Retracted" };
  }
  if (release.release_status === "draft") {
    return { state: "active", detail: `v${release.release_number} draft` };
  }
  return { state: "done", detail: `v${release.release_number} ${release.release_status}` };
}

function distributeStage(cycle: DatasetCycle): StageSummary {
  const release = cycle.latest_dataset_release;
  if (!release) return { state: "pending", detail: "—" };
  if (release.release_status === "draft") {
    return { state: "pending", detail: "Release is a draft" };
  }

  const transfers = release.transfers;
  if (transfers.length === 0) return { state: "pending", detail: "None" };

  const failed = transfers.filter((t) => t.transfer_status === "failed").length;
  if (failed > 0) return { state: "blocked", detail: `${failed} failed` };

  const running = transfers.filter(
    (t) => t.transfer_status === "queued" || t.transfer_status === "in_progress",
  ).length;
  if (running > 0) return { state: "active", detail: `${running} in flight` };

  return transfers.every((t) => t.transfer_status === "success")
    ? { state: "done", detail: "Delivered" }
    : { state: "pending", detail: `${transfers.length} draft` };
}

/** Per-stage rollups across every recordset, in pipeline order. */
export function stageSummaries(
  cycle: DatasetCycle,
): Record<StageKey, StageSummary> {
  return {
    draft: draftStage(cycle),
    qc: qcStage(cycle),
    release: releaseStage(cycle),
    distribute: distributeStage(cycle),
  };
}

export const STAGE_ORDER: StageKey[] = ["draft", "qc", "release", "distribute"];

/** Opens the page where the cycle actually is: the earliest stage not done. */
export function firstUnfinishedStage(
  summaries: Record<StageKey, StageSummary>,
): StageKey {
  return STAGE_ORDER.find((key) => summaries[key].state !== "done") ?? "draft";
}
