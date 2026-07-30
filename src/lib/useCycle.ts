import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export type CycleRecordsetDestination = {
  destination_id: number;
  destination_abbr: string;
  default_display: boolean;
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
  /** Highest dataset release number any of this recordset's releases were
   *  ever bundled into. Distinct from in_latest_dataset_release, which only
   *  checks the dataset's *current* latest release -- can be ahead of or
   *  behind the recordset's own latest_release since recordsets don't move
   *  together (carry-forward). Null if never bundled. */
  last_bundled_dataset_release_number: number | null;
  destinations: CycleRecordsetDestination[];
  wp_linked: boolean;
  wp_edit_url: string | null;
  wp_download_object_id: number | null;
};

export type DatasetReleaseStatus = "draft" | "released" | "live" | "retracted";

/** The chip's fields plus the transfer's name, which the cycle payload carries. */
export type CycleTransfer = TransferChipTransfer & {
  transfer_name: string;
};

export type CycleDatasetRelease = {
  dataset_release_id: number;
  release_number: number;
  /** Null while draft -- set when release_status transitions to released. */
  release_date: string | null;
  release_doi: string | null;
  release_status: DatasetReleaseStatus;
  transfers: CycleTransfer[];
};

export type DatasetCycle = {
  dataset_id: number;
  dataset_name: string;
  dataset_type_name: string;
  recordsets: CycleRecordset[];
  /** Whether the dataset has a WordPress page linked. */
  dataset_wp_linked: boolean;
  /** Downloads listed on the dataset's WordPress page that aren't the
   *  current download for any recordset here (excludes trashed downloads). */
  orphaned_download_count: number;
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

/** Starts the next release cycle: creates a draft `dataset_release` for this
 *  dataset (auto-assigned release_number, release_date null until published).
 *  This is what gives a cycle its identity from the start -- membership
 *  (which recordset releases go in) is still decided later, at Bundle. */
export function useStartNextCycle(datasetId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const json = await apiFetch<ItemEnvelope<{ dataset_release_id: number; release_number: number }>>(
        `${BASE}/datasets/${datasetId}/releases`,
        { method: "POST", body: JSON.stringify({}) },
      );
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dataset-cycle", datasetId ?? ""] });
    },
  });
}

export type CycleDraftRequestItem = {
  recordset_id: number;
  activity_timepoint_id: number;
};

export type CreatedCycleDraft = {
  recordset_id: number;
  recordset_draft_id: number;
  draft_name: string;
  draft_status: string;
  activity_timepoint_id: number;
  file_count: number;
};

/** Starts a cycle: one transaction that creates a draft per recordset and
 *  populates it from the chosen timepoint. All-or-nothing on the server. */
export function useStartCycleDrafts(datasetId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (items: CycleDraftRequestItem[]) => {
      const json = await apiFetch<ItemEnvelope<{ drafts: CreatedCycleDraft[] }>>(
        `${BASE}/datasets/${datasetId}/cycle/drafts`,
        { method: "POST", body: JSON.stringify({ items }) },
      );
      return json.data.drafts;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dataset-cycle", datasetId ?? ""] });
    },
  });
}

/** True when a draft dataset_release exists -- this is what "a cycle is in
 *  progress" means. Assemble/Verify gate their working controls on this;
 *  when false, they show read-only state for the last completed release
 *  instead (started via CycleNextAction's "Start Next Cycle"). */
export function isCycleActive(cycle: DatasetCycle): boolean {
  return cycle.latest_dataset_release?.release_status === "draft";
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

// Stage names are activities; the data keeps its own names — assemble creates
// drafts, verify runs QC reviews, bundle publishes releases.
export type StageKey =
  | "setup"
  | "assemble"
  | "verify"
  | "bundle"
  | "transfer"
  | "disseminate";

export type StageSummary = {
  state: CycleStageState;
  detail: string;
};

export const STAGE_LABELS: Record<StageKey, string> = {
  setup: "Setup",
  assemble: "Assemble",
  verify: "Verify",
  bundle: "Bundle",
  transfer: "Transfer",
  disseminate: "Disseminate",
};

/** One-line explanation shown under the tab strip for the active stage. */
export const STAGE_BLURBS: Partial<Record<StageKey, string>> = {
  setup: "Add recordsets, configure their destinations, and link everything to WordPress before starting a cycle.",
};

/** Route path for a stage, under `/datasets/:id/cycle`. */
export function stagePath(datasetId: string | undefined, stage: StageKey): string {
  return `/datasets/${datasetId}/cycle/${stage}`;
}

/** Percent of a recordset's sampled series that have been decided. */
export function qcPercent(qc: CycleQc): number {
  if (qc.series_total === 0) return 0;
  return Math.round(((qc.series_total - qc.series_pending) / qc.series_total) * 100);
}

/** Recordsets missing a WordPress download link. */
export function unlinkedRecordsets(cycle: DatasetCycle): CycleRecordset[] {
  return cycle.recordsets.filter((r) => !r.wp_linked);
}

/** Recordsets with no destination configured. */
export function recordsetsMissingDestinations(cycle: DatasetCycle): CycleRecordset[] {
  return cycle.recordsets.filter((r) => r.destinations.length === 0);
}

// Done once: the dataset has recordsets, is linked to a WordPress collection
// page, every recordset has a destination and a WordPress download link, and
// there are no orphaned WordPress downloads left dangling on the collection
// page. The dataset link comes before recordset links -- recordsets can't be
// linked until it exists.
function setupStage(cycle: DatasetCycle): StageSummary {
  if (cycle.recordsets.length === 0) {
    return { state: "active", detail: "No recordsets" };
  }
  if (!cycle.dataset_wp_linked) {
    return { state: "active", detail: "Collection not linked" };
  }
  const missingDestinations = recordsetsMissingDestinations(cycle);
  if (missingDestinations.length > 0) {
    return { state: "active", detail: `${missingDestinations.length} no destination` };
  }
  const unlinked = unlinkedRecordsets(cycle);
  if (unlinked.length > 0) {
    return { state: "active", detail: `${unlinked.length} not linked` };
  }
  if (cycle.orphaned_download_count > 0) {
    return { state: "active", detail: `${cycle.orphaned_download_count} orphaned` };
  }
  return { state: "done", detail: `${cycle.recordsets.length} recordsets` };
}

function assembleStage(cycle: DatasetCycle): StageSummary {
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

function verifyStage(cycle: DatasetCycle): StageSummary {
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

function bundleStage(cycle: DatasetCycle): StageSummary {
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

function transferStage(cycle: DatasetCycle): StageSummary {
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

// Placeholder until step 7 wires WordPress state into the cycle payload. Stays
// `pending` so it never hijacks the next-action banner before it's built.
function disseminateStage(_cycle: DatasetCycle): StageSummary {
  return { state: "pending", detail: "—" };
}

/** Per-stage rollups across every recordset, in pipeline order. */
export function stageSummaries(
  cycle: DatasetCycle,
): Record<StageKey, StageSummary> {
  return {
    setup: setupStage(cycle),
    assemble: assembleStage(cycle),
    verify: verifyStage(cycle),
    bundle: bundleStage(cycle),
    transfer: transferStage(cycle),
    disseminate: disseminateStage(cycle),
  };
}

export const STAGE_ORDER: StageKey[] = [
  "setup",
  "assemble",
  "verify",
  "bundle",
  "transfer",
  "disseminate",
];

export type NextAction = {
  stage: StageKey;
  /** What the cycle needs, in plain language. */
  message: string;
  /** Label for the action that addresses it. */
  actionLabel: string;
  /** True when something is wrong rather than merely in progress. */
  blocked: boolean;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function stageMessage(cycle: DatasetCycle, stage: StageKey): string {
  const withDraft = cycle.recordsets.filter((r) => r.open_draft !== null);
  const release = cycle.latest_dataset_release;

  switch (stage) {
    case "setup": {
      if (cycle.recordsets.length === 0) {
        return "This dataset has no recordsets — add at least one to begin.";
      }
      if (!cycle.dataset_wp_linked) {
        return "The dataset has no WordPress page linked yet.";
      }
      const missingDestinations = recordsetsMissingDestinations(cycle);
      if (missingDestinations.length > 0) {
        return `${plural(missingDestinations.length, "recordset")} has no destination configured.`;
      }
      const unlinked = unlinkedRecordsets(cycle);
      if (unlinked.length > 0) {
        return `${plural(unlinked.length, "recordset")} not linked to a WordPress download page.`;
      }
      if (cycle.orphaned_download_count > 0) {
        return `${plural(cycle.orphaned_download_count, "download")} on the WordPress page ${cycle.orphaned_download_count === 1 ? "isn't" : "aren't"} linked to any recordset here.`;
      }
      return `${plural(cycle.recordsets.length, "recordset")} ready.`;
    }
    case "assemble": {
      const ready = withDraft.filter((r) => isPublishable(r.qc)).length;
      if (ready > 0) {
        return `${plural(ready, "draft")} ready to freeze.`;
      }
      return `${plural(withDraft.length, "draft")} open — add files, then set up QC.`;
    }
    case "verify": {
      const stale = withDraft.reduce((n, r) => n + r.qc.stale, 0);
      if (stale > 0) {
        return `${plural(stale, "QC review")} went stale — the draft changed after sampling, so re-clone to pick up the new files.`;
      }
      const noReviews = withDraft.filter((r) => r.qc.reviews_total === 0).length;
      if (noReviews > 0) {
        return `${plural(noReviews, "draft")} has no QC review yet — publishing is blocked until one completes.`;
      }
      const total = withDraft.reduce((n, r) => n + r.qc.series_total, 0);
      const pending = withDraft.reduce((n, r) => n + r.qc.series_pending, 0);
      const percent = total === 0 ? 0 : Math.round(((total - pending) / total) * 100);
      return `QC is ${percent}% reviewed — ${plural(pending, "series")} still to decide.`;
    }
    case "bundle": {
      const unbundled = unbundledRecordsets(cycle);
      if (unbundled.length > 0) {
        return `${plural(unbundled.length, "recordset")} frozen but not in a dataset release — cut a release to distribute ${unbundled.length === 1 ? "it" : "them"}.`;
      }
      if (release?.release_status === "draft") {
        return `v${release.release_number} is still a draft — mark it released when the contents are final.`;
      }
      return "Freeze a recordset before cutting a dataset release.";
    }
    case "transfer": {
      if (!release) return "Nothing to transfer until a dataset release exists.";
      const failed = release.transfers.filter((t) => t.transfer_status === "failed");
      if (failed.length > 0) {
        return `${plural(failed.length, "transfer")} failed — ${failed.map((t) => t.destination_abbr).join(", ")}.`;
      }
      if (release.transfers.length === 0) {
        return `v${release.release_number} has no transfers yet — set up a destination.`;
      }
      const running = release.transfers.filter(
        (t) => t.transfer_status === "queued" || t.transfer_status === "in_progress",
      ).length;
      return `${plural(running, "transfer")} in flight.`;
    }
    case "disseminate":
      return "Publish the landing pages when the release is ready.";
  }
}

const ACTION_LABELS: Record<StageKey, string> = {
  setup: "Open Setup",
  assemble: "Assemble",
  verify: "Review QC",
  bundle: "Bundle Release",
  transfer: "Review Transfers",
  disseminate: "Publish Pages",
};

/** The single thing this cycle most needs next: anything blocked, in pipeline
 *  order, otherwise the earliest stage still in progress. Null when nothing is
 *  outstanding. */
export function nextAction(cycle: DatasetCycle): NextAction | null {
  const summaries = stageSummaries(cycle);

  const blocked = STAGE_ORDER.find((key) => summaries[key].state === "blocked");
  const stage = blocked ?? STAGE_ORDER.find((key) => summaries[key].state === "active");
  if (!stage) return null;

  return {
    stage,
    message: stageMessage(cycle, stage),
    actionLabel: ACTION_LABELS[stage],
    blocked: blocked != null,
  };
}

/** Opens the page where the cycle actually is: the earliest stage not done. */
export function firstUnfinishedStage(
  summaries: Record<StageKey, StageSummary>,
): StageKey {
  return STAGE_ORDER.find((key) => summaries[key].state !== "done") ?? "setup";
}
