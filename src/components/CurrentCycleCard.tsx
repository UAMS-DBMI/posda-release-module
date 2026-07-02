import { useQuery } from "@tanstack/react-query";
import CycleStrip, { type CycleStage } from "@/components/CycleStrip";
import { LinkButton } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { apiFetch } from "@/lib/apiFetch";
import { useQcReviews } from "@/lib/useQc";

export type CycleDraft = {
  recordset_draft_id: number;
  draft_name: string;
  draft_status: string;
  file_count: number;
};

export type CycleRelease = {
  recordset_release_id: number;
  release_number: number;
  release_date: string;
};

type DraftDiff = {
  draft_id: number;
  compare_type: string;
  compare_id: number;
  added_count: number;
  removed_count: number;
  unchanged_count: number;
};

type CurrentCycleCardProps = {
  recordsetId: string;
  isLoading: boolean;
  openDraft: CycleDraft | null;
  latestRelease: CycleRelease | null;
};

export default function CurrentCycleCard({
  recordsetId,
  isLoading,
  openDraft,
  latestRelease,
}: CurrentCycleCardProps) {
  const draftId = openDraft ? String(openDraft.recordset_draft_id) : undefined;
  const reviews = useQcReviews(draftId);

  // Bare diff call compares against the recordset's latest release.
  const diff = useQuery({
    queryKey: ["draft-diff", draftId ?? ""],
    enabled: Boolean(draftId) && latestRelease != null,
    queryFn: () =>
      apiFetch<DraftDiff>(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/diff`,
      ),
  });

  const draftUrl = openDraft
    ? `/recordsets/drafts/${openDraft.recordset_draft_id}`
    : undefined;

  const activeReviews = (reviews.data ?? []).filter(
    (r) => r.review_status !== "cancelled",
  );
  const staleCount = activeReviews.filter(
    (r) => r.review_status === "stale",
  ).length;
  const blockingCount = activeReviews.filter(
    (r) => r.review_status === "open" || r.review_status === "stale",
  ).length;
  const seriesTotal = activeReviews.reduce((n, r) => n + r.series_total, 0);
  const seriesPending = activeReviews.reduce((n, r) => n + r.series_pending, 0);
  const reviewedPercent =
    seriesTotal > 0
      ? Math.round(((seriesTotal - seriesPending) / seriesTotal) * 100)
      : 0;

  const qcStage: CycleStage = (() => {
    if (activeReviews.length === 0) {
      return { key: "qc", label: "QC", state: "pending", detail: "No QC yet", href: draftUrl };
    }
    if (staleCount > 0) {
      return {
        key: "qc",
        label: "QC",
        state: "blocked",
        detail: `${reviewedPercent}% · ${staleCount} stale`,
        href: draftUrl,
      };
    }
    if (blockingCount > 0) {
      return {
        key: "qc",
        label: "QC",
        state: "active",
        detail: `${reviewedPercent}% reviewed`,
        href: draftUrl,
      };
    }
    return { key: "qc", label: "QC", state: "done", detail: "Complete", href: draftUrl };
  })();

  // Publishing requires at least one complete review and none open/stale.
  const completeCount = activeReviews.filter(
    (r) => r.review_status === "complete",
  ).length;
  const canPublish = blockingCount === 0 && completeCount > 0;

  const stages: CycleStage[] = openDraft
    ? [
        {
          key: "draft",
          label: "Draft",
          state: activeReviews.length > 0 ? "done" : "active",
          detail: `${openDraft.file_count} files`,
          href: draftUrl,
        },
        qcStage,
        {
          key: "publish",
          label: "Publish",
          state: canPublish ? "active" : "pending",
          detail: canPublish
            ? "Ready"
            : activeReviews.length === 0
              ? "Requires QC"
              : "Awaiting QC",
          href: draftUrl,
        },
      ]
    : [];

  return (
    <>
      <CardHeader className="mt-6 mb-0">
        <CardTitle>Current Cycle</CardTitle>
        {openDraft ? (
          <LinkButton size="sm" href={draftUrl ?? "#"}>
            Open Draft
          </LinkButton>
        ) : (
          <LinkButton
            size="sm"
            href={`/recordsets/drafts/create?recordset_id=${recordsetId}`}
          >
            New Draft
          </LinkButton>
        )}
      </CardHeader>
      <SectionCard className="mt-1">
        {isLoading && <p className="text-sm">Loading...</p>}

        {!isLoading && !openDraft && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {latestRelease
              ? `No open draft. Last release v${latestRelease.release_number} (${new Date(latestRelease.release_date).toLocaleDateString()}).`
              : "No open draft and no releases yet. Start a draft to begin the first cycle."}
          </p>
        )}

        {!isLoading && openDraft && (
          <div className="space-y-3">
            <CycleStrip stages={stages} />
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              <span
                className="font-medium"
                style={{ color: "var(--foreground)" }}
              >
                {openDraft.draft_name}
              </span>{" "}
              · {openDraft.file_count} files
              {diff.data && latestRelease
                ? ` · +${diff.data.added_count} / −${diff.data.removed_count} vs v${latestRelease.release_number}`
                : ""}
            </p>
            {staleCount > 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                ⚠ {staleCount} review{staleCount === 1 ? "" : "s"} stale — the
                draft changed since sampling. Open the draft to re-clone.
              </p>
            )}
          </div>
        )}
      </SectionCard>
    </>
  );
}
