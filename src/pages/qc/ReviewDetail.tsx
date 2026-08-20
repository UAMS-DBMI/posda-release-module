import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQcReview, useUpdateQcReview } from "@/lib/useQc";
import { useUsers } from "@/lib/useUsers";
import QcAssignments from "@/components/qc/QcAssignments";
import { useQcReviewLifecycle } from "@/components/qc/QcReviewLifecycle";
import QcSeriesSummary from "@/components/qc/QcSeriesSummary";
import { Button } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import Modal from "@/components/ui/Modal";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";

function fmt(value?: string | null) {
  if (!value) return "—";
  const t = Date.parse(value);
  return Number.isNaN(t) ? "—" : new Date(t).toLocaleString();
}

export default function QcReviewDetail() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const userMap = useUsers();
  const { review_id: reviewId } = useParams<{ review_id: string }>();

  const detail = useQcReview(reviewId);
  const update = useUpdateQcReview(reviewId);

  const [showNotes, setShowNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  const review = detail.data?.review;
  const assignments = detail.data?.assignments ?? [];
  const byStatus = detail.data?.series_by_status ?? [];
  const byModality = detail.data?.series_by_modality ?? [];
  const stale = detail.data?.stale_breakdown ?? null;
  const seriesTotal = byStatus.reduce((sum, s) => sum + s.count, 0);
  const approvedCount =
    byStatus.find((s) => s.qc_status === "approved")?.count ?? 0;
  const allApproved = seriesTotal > 0 && approvedCount === seriesTotal;

  // A non-DICOM review's units are files, not series (the model calls both
  // `qc_unit`); "series" is only right for a DICOM review.
  const unitLabel =
    review?.review_type === "non_dicom"
      ? `${seriesTotal.toLocaleString()} file${seriesTotal === 1 ? "" : "s"}`
      : `${seriesTotal.toLocaleString()} series`;

  const metadataStrip = review
    ? [
        review.review_type === "partial"
          ? `partial · ${review.sample_percentage}%`
          : review.review_type === "non_dicom"
            ? "non-DICOM"
            : "full",
        unitLabel,
        review.cloned_from_review_id
          ? `cloned from #${review.cloned_from_review_id}`
          : null,
        review.when_updated ? `updated ${fmt(review.when_updated)}` : null,
        review.who_updated != null
          ? `by ${userMap.get(review.who_updated) ?? "—"}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  const lifecycle = useQcReviewLifecycle({
    reviewId: reviewId ?? "",
    review,
    allApproved,
    stale,
    onCloned: (id: number) => navigate(`/qc/reviews/${id}`),
  });

  async function saveNotes() {
    try {
      await update.mutateAsync({ review_notes: notesDraft.trim() || null });
      toastSuccess(addToast, "Notes updated.");
      setShowNotes(false);
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not save notes.");
    }
  }

  const active = review && review.review_status !== "cancelled";

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title={reviewId ? `Review #${reviewId}` : "QC Review"}
        breadcrumbs={
          review
            ? [
                { label: "Datasets", href: "/datasets" },
                ...(review.dataset_id != null
                  ? [
                      {
                        label: review.dataset_name ?? `Dataset ${review.dataset_id}`,
                        href: `/datasets/${review.dataset_id}`,
                      },
                    ]
                  : []),
                ...(review.recordset_id != null
                  ? [
                      {
                        label:
                          review.recordset_name ?? `Recordset ${review.recordset_id}`,
                        href: `/recordsets/${review.recordset_id}`,
                      },
                    ]
                  : []),
                {
                  label: review.draft_name ?? `Draft ${review.recordset_draft_id}`,
                  href: `/recordsets/drafts/${review.recordset_draft_id}`,
                },
              ]
            : [{ label: "Datasets", href: "/datasets" }]
        }
        subtitle={metadataStrip}
        badge={
          review
            ? {
                label: review.review_status,
                variant:
                  review.review_status === "complete"
                    ? "success"
                    : review.review_status === "stale"
                      ? "warning"
                      : review.review_status === "cancelled"
                        ? "neutral"
                        : "success",
              }
            : undefined
        }
        actions={
          active ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setNotesDraft(review.review_notes ?? "");
                  setShowNotes(true);
                }}
              >
                Edit Notes
              </Button>
              {lifecycle.actions}
            </>
          ) : undefined
        }
      />

      {lifecycle.banner && <div className="mt-1">{lifecycle.banner}</div>}
      {lifecycle.modals}

      {detail.isLoading && <LoadingState className="mt-4" />}

      {detail.isError && (
        <SectionCard className="mt-4">
          <p className="text-sm text-red-600 dark:text-red-400">
            Could not load this QC review.
          </p>
        </SectionCard>
      )}

      {review && reviewId && (
        <SectionCard className="mt-4">
          {review.review_notes && (
            <>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <p className="whitespace-pre-wrap text-sm">{review.review_notes}</p>
            </>
          )}

          <CardHeader className={review.review_notes ? "mt-6" : undefined}>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <div>
            <QcSeriesSummary byStatus={byStatus} byModality={byModality} />
          </div>

          <QcAssignments
            reviewId={reviewId}
            assignments={assignments}
            reviewType={review.review_type}
            reviewStatus={review.review_status}
            canManage={review.review_status !== "cancelled"}
          />
        </SectionCard>
      )}

      {/* Edit notes */}
      <Modal
        open={showNotes}
        onClose={() => setShowNotes(false)}
        title="Edit Notes"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowNotes(false)}
              disabled={update.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveNotes()} loading={update.isPending}>
              Save
            </Button>
          </>
        }
      >
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          rows={4}
          className="textarea mt-4 w-full"
          autoFocus
        />
      </Modal>
    </PageShell>
  );
}
