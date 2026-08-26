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
  /** Whether the draft has any DICOM series / any non-DICOM files. Lets Verify
   *  offer the right review kind (a non-DICOM draft's "Add Review" creates a
   *  review_type='non_dicom' review that flows through the same QC UI). */
  has_dicom: boolean;
  has_non_dicom: boolean;
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
  /** The draft the QC rollup came from: the open draft while one exists, else
   *  the published draft it became. Use this (not `open_draft`) to reach a
   *  recordset's reviews, so they stay available after freezing. */
  qc_draft_id: number | null;
  qc: CycleQc;
  latest_release: CycleRecordsetRelease | null;
  /** False when the recordset is frozen but not yet bundled — the fan-in signal. */
  in_dataset_release: boolean;
  /** Whether this cycle worked on the recordset: a draft was created for a
   *  release that is in this dataset release's membership. Stays true after the
   *  draft publishes -- same draft, same release, same membership row -- which
   *  is what keeps Verify from emptying out the moment its work completes. */
  worked_this_cycle: boolean;
  /** The version of this recordset the dataset release currently carries --
   *  the draft release while it is being worked, the carried-forward published
   *  one otherwise, and null when the recordset is not in the release at all.
   *  Distinct from `in_dataset_release`, which only says whether a *finished*
   *  version is in. */
  release_in_cycle: {
    recordset_release_id: number;
    release_number: number | null;
    release_status: string;
  } | null;
  /** Highest dataset release number any of this recordset's releases were
   *  ever bundled into. Distinct from in_dataset_release, which only
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
  /** When the cycle started. `release_date` is null while draft, so this is the
   *  marker for "frozen during this cycle". */
  when_created: string | null;
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
  /** The release this rollup describes -- the pinned one when the cycle URL
   *  names a release, otherwise the dataset's latest. */
  dataset_release: CycleDatasetRelease | null;
  /** The dataset's latest release, whatever this rollup is pinned to. Lets a
   *  caller tell "current cycle" from "an older release still being viewed"
   *  without a second fetch. */
  latest_dataset_release_id: number | null;
};

/** Release-cycle rollup for one dataset: every recordset's pipeline position
 *  plus the dataset release they fan into. One call, no per-recordset fetches.
 *
 *  `releaseId` pins the rollup to a specific release; omitted, the API returns
 *  the latest. It is part of the query key -- without that, two releases of the
 *  same dataset would share one cache entry. */
export function useDatasetCycle(
  datasetId: string | undefined,
  releaseId?: string | undefined,
) {
  return useQuery({
    queryKey: ["dataset-cycle", datasetId ?? "", releaseId ?? ""],
    enabled: Boolean(datasetId),
    queryFn: async () => {
      const json = await apiFetch<ItemEnvelope<DatasetCycle>>(
        `${BASE}/datasets/${datasetId}/cycle` +
          (releaseId ? `?release_id=${releaseId}` : ""),
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

export type CreateRecordsetDraftInput = {
  recordset_id: number;
  /** A single source, or neither for an empty draft. Mutually exclusive. */
  activity_timepoint_id?: number;
  cloned_from_release_id?: number;
  draft_name?: string;
};

/** Creates one recordset draft from any source (activity timepoint, release
 *  clone, or empty). The per-row action in Assemble; server auto-names and
 *  enforces one open draft per recordset. */
export function useCreateRecordsetDraft(datasetId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ recordset_id, ...body }: CreateRecordsetDraftInput) => {
      const json = await apiFetch<
        ItemEnvelope<{ recordset_draft_id: number; draft_name: string; file_count: number }>
      >(`${BASE}/recordsets/${recordset_id}/drafts`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dataset-cycle", datasetId ?? ""] });
    },
  });
}

/** Flip one draft between `open` and `ready` -- the Assemble lifecycle action,
 *  also offered on the standalone draft detail page. Toasts stay at the call
 *  site (per the other hooks here). */
export function useSetDraftStatus(datasetId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { draftId: number; status: "ready" | "open" }) => {
      await apiFetch(`${BASE}/recordsets/drafts/${v.draftId}`, {
        method: "PUT",
        body: JSON.stringify({ draft_status: v.status }),
      });
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
  return cycle.dataset_release?.release_status === "draft";
}

/** True while the latest release still has outstanding work -- through
 *  transfers and dissemination, not just composition.
 *
 *  Distinct from `isCycleActive`, and the two must not be conflated: finalizing
 *  in Bundle closes *composition* (draft -> released) but the release still has
 *  to ship and go live. Treating `released` as "cycle over" made the banner
 *  announce "no cycle in progress" while transfers sat unsent. Gate *controls*
 *  on `isCycleActive`; gate *"is there still work?"* on this. */
export function isCycleInProgress(cycle: DatasetCycle): boolean {
  const status = cycle.dataset_release?.release_status;
  return status === "draft" || status === "released";
}

/** True when a recordset's open draft has passed the publish gate: at least one
 *  complete QC review, with none open or stale. Non-DICOM reviews count here too
 *  (they flow through the same qc rollup), so the gate is uniform across content
 *  kinds. */
export function isPublishable(r: CycleRecordset): boolean {
  if (!r.open_draft) return false;
  const qc = r.qc;
  return qc.complete > 0 && qc.open === 0 && qc.stale === 0;
}

/** Recordsets in play this cycle: an open draft to work, or one already
 *  published during it.
 *
 *  `worked_this_cycle` comes from the API and is structural -- a draft exists
 *  for a release in this dataset release's membership. It replaced a test that
 *  compared the release date against the cycle's start: that had no upper bound
 *  (once the cycle can be pinned, viewing an older release counted newer work as
 *  its own) and silently returned false whenever `when_created` was null, which
 *  is nullable. */
export function cycleRecordsets(cycle: DatasetCycle): CycleRecordset[] {
  return cycle.recordsets.filter(
    (r) => r.open_draft !== null || r.worked_this_cycle,
  );
}

/** Recordsets with a published version that the release does not carry at all.
 *
 *  Keyed on `release_in_cycle`, not `in_dataset_release`: the latter is true
 *  only for a *released* member, so a recordset mid-draft -- which is already in
 *  the release, as its draft version -- would otherwise be reported as missing
 *  from it. */
export function unbundledRecordsets(cycle: DatasetCycle): CycleRecordset[] {
  return cycle.recordsets.filter(
    (r) => r.latest_release !== null && r.release_in_cycle === null,
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
  bundle:
    "The release already carries a version of every recordset -- carried forward from the last release, or the one being drafted this cycle. Review what it contains, publish the drafts that are ready, then finalize.",
};

/** Route path for a stage. Pinned to a release when one is known, so a cycle
 *  URL keeps meaning the same thing after the next cycle starts; the bare
 *  `/datasets/:id/cycle` form is an entry point that redirects to the latest. */
export function stagePath(
  datasetId: string | undefined,
  releaseId: string | number | undefined,
  stage: StageKey,
): string {
  return releaseId === undefined
    ? `/datasets/${datasetId}/cycle/${stage}`
    : `/datasets/${datasetId}/releases/${releaseId}/cycle/${stage}`;
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
    const ready = open.filter(
      (r) => r.open_draft?.draft_status === "ready",
    ).length;
    // Every open draft marked ready fulfils Assemble -- hand off to Verify.
    if (ready === open.length) {
      return { state: "done", detail: `${ready} ready` };
    }
    return {
      state: "active",
      detail: ready > 0 ? `${ready}/${open.length} ready` : `${open.length} open`,
    };
  }

  // No open drafts. With no cycle in progress the tabs reflect the last
  // completed release, so show that historical state rather than nudging.
  if (!isCycleActive(cycle)) {
    const frozen = cycle.recordsets.filter((r) => r.latest_release !== null);
    return frozen.length > 0
      ? { state: "done", detail: "All frozen" }
      : { state: "pending", detail: "No drafts" };
  }

  // Cycle active, nothing open: hand off to Bundle when something is frozen and
  // waiting; otherwise nudge -- nothing is changing yet, which wouldn't warrant
  // a new release. Never a hard gate: a never-released recordset left without a
  // draft simply won't be available to bundle.
  const unbundled = unbundledRecordsets(cycle);
  if (unbundled.length > 0) {
    return { state: "done", detail: `${unbundled.length} ready to bundle` };
  }
  if (cycle.recordsets.some((r) => r.in_dataset_release)) {
    return { state: "done", detail: "Bundled" };
  }
  return { state: "active", detail: "No drafts" };
}

function verifyStage(cycle: DatasetCycle): StageSummary {
  // Includes recordsets frozen this cycle -- their QC is what justified
  // freezing, so the stage must not fall back to "pending" once they publish.
  const inCycle = cycleRecordsets(cycle);
  if (inCycle.length === 0) return { state: "pending", detail: "—" };

  const sum = (pick: (qc: CycleQc) => number) =>
    inCycle.reduce((n, r) => n + pick(r.qc), 0);

  const stale = sum((q) => q.stale);
  if (stale > 0) return { state: "blocked", detail: `${stale} stale` };

  const open = sum((q) => q.open);
  const total = sum((q) => q.series_total);
  const pending = sum((q) => q.series_pending);
  if (open > 0) {
    const percent = total === 0 ? 0 : Math.round(((total - pending) / total) * 100);
    return { state: "active", detail: `${percent}% reviewed` };
  }

  if (sum((q) => q.complete) > 0) return { state: "done", detail: "Complete" };

  // A draft waiting on its first review is work to do, not a stage to sit
  // behind. Reporting `pending` here meant nextAction() found no active stage
  // anywhere and concluded the cycle was finished -- with drafts still open.
  return cycle.recordsets.some((r) => r.open_draft !== null)
    ? { state: "active", detail: "No QC yet" }
    : { state: "pending", detail: "No QC yet" };
}

function bundleStage(cycle: DatasetCycle): StageSummary {
  const release = cycle.dataset_release;
  if (!release) {
    return { state: "pending", detail: "None yet" };
  }

  const unbundled = unbundledRecordsets(cycle);

  if (release.release_status === "retracted") {
    return { state: "blocked", detail: "Retracted" };
  }

  if (release.release_status === "draft") {
    // The draft dataset_release exists from cycle start, so its mere existence
    // isn't Bundle's turn. An empty draft waits on Assemble.
    //
    // Publishing happens here, so a draft that has cleared QC is Bundle's work
    // -- and the first of it. Without this the stage reported "pending" while
    // holding the only button that could move the cycle on, and nextAction()
    // (which only sees blocked/active) concluded there was nothing to do.
    const publishable = cycle.recordsets.filter(isPublishable).length;
    if (publishable > 0) {
      return { state: "active", detail: `${publishable} to publish` };
    }
    if (unbundled.length > 0) {
      return { state: "active", detail: `${unbundled.length} to add` };
    }
    if (cycle.recordsets.some((r) => r.in_dataset_release)) {
      return { state: "active", detail: `v${release.release_number} finalize` };
    }
    return { state: "pending", detail: "Nothing to bundle yet" };
  }

  // Released / live: content frozen after the cut isn't in the release.
  if (unbundled.length > 0) {
    return { state: "blocked", detail: `${unbundled.length} not bundled` };
  }
  return { state: "done", detail: `v${release.release_number} ${release.release_status}` };
}

function transferStage(cycle: DatasetCycle): StageSummary {
  const release = cycle.dataset_release;
  if (!release) return { state: "pending", detail: "—" };
  if (release.release_status === "draft") {
    return { state: "pending", detail: "Release is a draft" };
  }

  const transfers = release.transfers;
  // The release is out of draft, so its data is meant to ship: an absent or
  // unsent transfer is outstanding work, not something to wait on. `pending`
  // would hide it from nextAction(), which only surfaces blocked/active.
  if (transfers.length === 0) return { state: "active", detail: "None yet" };

  const failed = transfers.filter((t) => t.transfer_status === "failed").length;
  if (failed > 0) return { state: "blocked", detail: `${failed} failed` };

  const running = transfers.filter(
    (t) => t.transfer_status === "queued" || t.transfer_status === "in_progress",
  ).length;
  if (running > 0) return { state: "active", detail: `${running} in flight` };

  return transfers.every((t) => t.transfer_status === "success")
    ? { state: "done", detail: "Delivered" }
    : { state: "active", detail: `${transfers.length} to queue` };
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
  const release = cycle.dataset_release;

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
      if (withDraft.length === 0) {
        return "No recordsets are being changed yet — open a draft for each recordset that's changing this release.";
      }
      const ready = withDraft.filter(
        (r) => r.open_draft?.draft_status === "ready",
      ).length;
      if (ready === withDraft.length) {
        return `All ${plural(withDraft.length, "draft")} marked ready.`;
      }
      return `${ready}/${withDraft.length} drafts ready — mark the rest ready once their files are set.`;
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
      const publishable = cycle.recordsets.filter(isPublishable).length;
      if (publishable > 0) {
        return `${plural(publishable, "draft")} passed QC and can be published into v${release?.release_number ?? "?"}.`;
      }
      const unbundled = unbundledRecordsets(cycle);
      if (unbundled.length > 0) {
        return `${plural(unbundled.length, "recordset")} frozen and ready to add to v${release?.release_number ?? "?"}.`;
      }
      if (release?.release_status === "draft") {
        return `v${release.release_number} is a draft — finalize it once its contents are complete.`;
      }
      return "Nothing to bundle yet — freeze a recordset in Assemble first.";
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
      if (running > 0) return `${plural(running, "transfer")} in flight.`;
      const drafts = release.transfers.filter(
        (t) => t.transfer_status === "draft",
      ).length;
      if (drafts > 0) {
        return `${plural(drafts, "transfer")} ready to queue for v${release.release_number}.`;
      }
      return "All transfers delivered.";
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
