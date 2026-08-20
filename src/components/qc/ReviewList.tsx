import { Fragment } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import QcSliceActions from "@/components/qc/QcSliceActions";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState } from "@/components/ui/Spinner";
import {
  useAssignmentQueue,
  useQcReviews,
  type QcQueueAssignment,
} from "@/lib/useQc";
import { useUsers } from "@/lib/useUsers";

/** Resolve a slice's assignee to a display name. */
function assigneeName(assignedTo: number | null, users: Map<number, string>): string {
  if (assignedTo == null) return "unclaimed";
  return users.get(assignedTo) ?? `User ${assignedTo}`;
}

const REVIEW_COLS =
  "minmax(4rem,auto) minmax(6rem,auto) minmax(4rem,auto) minmax(5rem,auto) auto";

/** The draft's reviews with their assignment slices, listed inline in the
 *  expanded row. Two lazy fetches (reviews + the draft's slices). Cancelled
 *  reviews sort to the bottom and show no slices (the slice query excludes
 *  them). Review lifecycle (complete / clone / cancel), split, and the series
 *  summary live in the Manage modal. */
export default function ReviewList({
  draftId,
  datasetId,
  onManage,
}: {
  draftId: number;
  datasetId: string | undefined;
  onManage: (reviewId: number) => void;
}) {
  const queryClient = useQueryClient();
  const reviews = useQcReviews(String(draftId));
  const slices = useAssignmentQueue({ recordsetDraftId: draftId });
  const users = useUsers();

  const invalidateCycle = () =>
    void queryClient.invalidateQueries({
      queryKey: ["dataset-cycle", datasetId ?? ""],
    });

  if (reviews.isLoading || slices.isLoading) return <LoadingState />;
  if (reviews.isError) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        Could not load QC reviews.
      </p>
    );
  }
  const allReviews = reviews.data ?? [];
  if (allReviews.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        No QC reviews yet.
      </p>
    );
  }

  const byReview = new Map<number, QcQueueAssignment[]>();
  for (const s of slices.data?.data ?? []) {
    const list = byReview.get(s.qc_review_id) ?? [];
    list.push(s);
    byReview.set(s.qc_review_id, list);
  }

  // Non-cancelled first, cancelled to the bottom (stable otherwise).
  const sorted = [...allReviews].sort(
    (a, b) =>
      (a.review_status === "cancelled" ? 1 : 0) -
      (b.review_status === "cancelled" ? 1 : 0),
  );

  const HEAD = "text-xs font-semibold uppercase tracking-wide";
  const MUTED = { color: "var(--muted)" };
  // One shared grid for header, review rows, and slice rows, so slice cells
  // line up under the review columns (assignee↔Review, status↔Status,
  // share↔Slices, progress↔Approved, actions↔Manage).
  return (
    <div
      className="grid w-full items-center gap-x-6 gap-y-2 text-sm"
      style={{ gridTemplateColumns: REVIEW_COLS }}
    >
      <div className={HEAD} style={MUTED}>Review</div>
      <div className={HEAD} style={MUTED}>Status</div>
      <div className={HEAD} style={MUTED}>Type</div>
      <div className={HEAD} style={MUTED}>Approved</div>
      <div />

      {sorted.map((rev, i) => {
        const cancelled = rev.review_status === "cancelled";
        const revSlices = byReview.get(rev.qc_review_id) ?? [];
        return (
          <Fragment key={rev.qc_review_id}>
            {/* full-width separator between review groups */}
            {i > 0 && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  borderTop: "1px solid var(--border)",
                }}
              />
            )}
            {/* review row */}
            <div className="font-medium">
              <Link
                to={`/qc/reviews/${rev.qc_review_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent"
                style={{ color: "var(--accent)" }}
              >
                #{rev.qc_review_id}
              </Link>
            </div>
            <div>
              <StatusBadge status={rev.review_status} />
              {rev.review_status === "stale" && (
                <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                  open to re-clone
                </span>
              )}
            </div>
            <div>
              {rev.review_type === "partial"
                ? `partial · ${rev.sample_percentage}%`
                : rev.review_type === "non_dicom"
                  ? "non-DICOM"
                  : "full"}
            </div>
            <div>
              {rev.series_approved.toLocaleString()}/
              {rev.series_total.toLocaleString()}
            </div>
            <div>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onManage(rev.qc_review_id)}
              >
                Manage
              </Button>
            </div>

            {/* slice rows (none for cancelled reviews) */}
            {!cancelled &&
              revSlices.map((s) => (
                <Fragment key={s.assignment_id}>
                  <div className="flex items-center gap-2 truncate pl-8 text-xs" style={MUTED}>
                    <span aria-hidden style={{ color: "var(--border-strong)" }}>
                      ↳
                    </span>
                    {assigneeName(s.assigned_to, users)}
                  </div>
                  <div>
                    <StatusBadge status={s.assignment_status} />
                  </div>
                  <div />
                  <div className="text-xs" style={MUTED}>
                    {s.series_approved}/{s.series_total}
                  </div>
                  <div>
                    <QcSliceActions
                      reviewId={String(rev.qc_review_id)}
                      assignment={s}
                      reviewType={rev.review_type}
                      reviewStatus={rev.review_status}
                      onChanged={invalidateCycle}
                    />
                  </div>
                </Fragment>
              ))}
          </Fragment>
        );
      })}
    </div>
  );
}
