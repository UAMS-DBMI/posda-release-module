import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import QcReviewModal from "@/components/QcReviewModal";
import QcReviewManageModal from "@/components/QcReviewManageModal";
import QcSliceActions from "@/components/qc/QcSliceActions";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState } from "@/components/ui/Spinner";
import {
  useAssignmentQueue,
  useQcReviews,
  type QcQueueAssignment,
} from "@/lib/useQc";
import { isCycleActive, isPublishable, qcPercent, type CycleQc } from "@/lib/useCycle";
import { useUsers } from "@/lib/useUsers";
import { useCycleContext } from "./CycleLayout";

/** Recordset links leave the cycle, so they open in a new tab -- the only
 *  navigation allowed off a cycle page. */
function RecordsetLink({ id, name }: { id: number; name: string }) {
  return (
    <Link
      to={`/recordsets/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-accent"
      style={{ color: "var(--accent)" }}
    >
      {name}
    </Link>
  );
}

const TH = "px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-white";

/** The recordset's QC state as a single badge status. */
function qcStatus(qc: CycleQc): string {
  if (qc.stale > 0) return "stale";
  if (qc.open > 0) return "open";
  if (qc.complete > 0) return "complete";
  return "pending";
}

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
function ReviewList({
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

// A non-DICOM-only draft samples nothing (no series), so its "Add Review" opens
// the modal in non-DICOM mode. Mixed / DICOM drafts get the full/partial form.
type CreateTarget = { draftId: number; assignToCaller: boolean; nonDicom: boolean };

export default function VerifyStage() {
  const { cycle, datasetId } = useCycleContext();
  const queryClient = useQueryClient();

  const [createFor, setCreateFor] = useState<CreateTarget | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [manageReviewId, setManageReviewId] = useState<number | null>(null);

  const cycleActive = isCycleActive(cycle);
  const withDraft = cycle.recordsets.filter((r) => r.open_draft !== null);

  if (withDraft.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        No open drafts, so there is nothing to review.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="data-table min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-accent">
              <th className="w-10 px-2 py-1" />
              <th className={TH}>Recordset</th>
              <th className={TH}>Reviews</th>
              <th className={TH}>Approved</th>
              <th className={TH}>Status</th>
              <th className={TH}>Publish Gate</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {withDraft.map((r) => {
              const draft = r.open_draft;
              const draftId = draft?.recordset_draft_id ?? null;
              const qc = r.qc;
              const hasReviews = qc.reviews_total > 0;
              // No DICOM series to sample -> "Add Review" creates a non_dicom review.
              const nonDicomOnly =
                !!draft?.has_non_dicom && !draft?.has_dicom;
              const progress =
                qc.series_total === 0
                  ? "—"
                  : `${qc.series_approved.toLocaleString()}/${qc.series_total.toLocaleString()} (${qcPercent(qc)}%)`;
              const expanded =
                draftId != null && hasReviews && expandedId === draftId;

              return (
                <Fragment key={r.recordset_id}>
                  <tr className="table-row">
                    <td className="px-1 py-1">
                      {draftId != null && hasReviews && (
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : draftId)}
                          className="flex h-7 w-7 items-center justify-center rounded hover:bg-(--surface-alt)"
                          style={{ color: "var(--muted)" }}
                          title={expanded ? "Hide reviews" : "Show reviews"}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width={18}
                            height={18}
                            fill="currentColor"
                            aria-hidden
                            style={{
                              transform: expanded ? "rotate(90deg)" : "none",
                              transition: "transform 100ms",
                            }}
                          >
                            <path d="M5 3l14 9-14 9z" />
                          </svg>
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <RecordsetLink id={r.recordset_id} name={r.recordset_name} />
                    </td>
                    <td className="px-2 py-1">
                      {qc.reviews_total.toLocaleString()}
                    </td>
                    <td className="px-2 py-1">{progress}</td>
                    <td className="px-2 py-1">
                      <StatusBadge status={qcStatus(qc)} />
                    </td>
                    <td className="px-2 py-1">
                      {isPublishable(r) ? (
                        <span className="text-xs text-green-700 dark:text-green-400">
                          Ready
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          Blocked
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {draftId != null && cycleActive ? (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {hasReviews ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setCreateFor({
                                  draftId,
                                  assignToCaller: false,
                                  nonDicom: nonDicomOnly,
                                })
                              }
                            >
                              Add Review
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() =>
                                setCreateFor({
                                  draftId,
                                  assignToCaller: true,
                                  nonDicom: nonDicomOnly,
                                })
                              }
                            >
                              Start QC
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                  {expanded && draftId != null && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-3"
                        style={{
                          background: "var(--surface)",
                          borderTop: "1px solid var(--border-strong)",
                        }}
                      >
                        <ReviewList
                          draftId={draftId}
                          datasetId={datasetId}
                          onManage={setManageReviewId}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {!cycleActive && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No cycle is in progress — start one from the banner above to create
          reviews.
        </p>
      )}

      <QcReviewModal
        open={createFor !== null}
        onClose={() => setCreateFor(null)}
        draftId={createFor ? String(createFor.draftId) : undefined}
        defaultType="full"
        nonDicom={createFor?.nonDicom ?? false}
        assignToCaller={createFor?.assignToCaller ?? false}
        onCreated={() =>
          void queryClient.invalidateQueries({
            queryKey: ["dataset-cycle", datasetId ?? ""],
          })
        }
      />

      <QcReviewManageModal
        open={manageReviewId !== null}
        onClose={() => setManageReviewId(null)}
        reviewId={manageReviewId}
        datasetId={datasetId}
      />
    </div>
  );
}
