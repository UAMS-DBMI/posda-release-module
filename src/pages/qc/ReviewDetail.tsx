import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQcReview, useUpdateQcReview } from "@/lib/useQc";
import { useUsers } from "@/lib/useUsers";
import DynamicSection, {
  type DynamicSectionField,
} from "@/components/DynamicSection";
import QcAssignments from "@/components/qc/QcAssignments";
import QcReviewLifecycle from "@/components/qc/QcReviewLifecycle";
import QcSeriesSummary from "@/components/qc/QcSeriesSummary";
import { Button } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import Modal from "@/components/ui/Modal";
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

  const fields: DynamicSectionField[] = review
    ? [
        { label: "Type", value: review.review_type },
        {
          label: "Sample %",
          value:
            review.review_type === "partial"
              ? `${review.sample_percentage}%`
              : "—",
        },
        { label: "Series", value: seriesTotal.toLocaleString() },
        {
          label: "Cloned From",
          value: review.cloned_from_review_id
            ? `#${review.cloned_from_review_id}`
            : "—",
        },
        {
          label: "Notes",
          value: review.review_notes || "—",
          fullWidth: true,
          valueClassName: "whitespace-pre-wrap",
        },
      ]
    : [];

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
        title="QC Review"
        breadcrumbs={
          review
            ? [
                { label: "Recordsets", href: "/recordsets" },
                {
                  label: `Draft ${review.recordset_draft_id}`,
                  href: `/recordsets/drafts/${review.recordset_draft_id}`,
                },
              ]
            : [{ label: "Recordsets", href: "/recordsets" }]
        }
        subtitle={reviewId ? `Review #${reviewId}` : undefined}
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
            <Button
              variant="ghost"
              onClick={() => {
                setNotesDraft(review.review_notes ?? "");
                setShowNotes(true);
              }}
            >
              Edit Notes
            </Button>
          ) : undefined
        }
      />

      {review && reviewId && (
        <div className="mt-1">
          <QcReviewLifecycle
            reviewId={reviewId}
            review={review}
            allApproved={allApproved}
            stale={stale}
            onCloned={(id) => navigate(`/qc/reviews/${id}`)}
          />
        </div>
      )}

      <DynamicSection
        isLoading={detail.isLoading}
        error={detail.isError ? "Could not load this QC review." : null}
        fields={fields}
        actions={
          review ? (
            <div className="metadata-panel">
              <p>
                <strong>Created:</strong> {fmt(review.when_created)} by{" "}
                {review.who_created != null
                  ? (userMap.get(review.who_created) ?? "—")
                  : "—"}
              </p>
              <p>
                <strong>Updated:</strong> {fmt(review.when_updated)} by{" "}
                {review.who_updated != null
                  ? (userMap.get(review.who_updated) ?? "—")
                  : "—"}
              </p>
            </div>
          ) : undefined
        }
      />

      {review && reviewId && (
        <>
          <CardHeader className="mt-6 mb-0">
            <CardTitle>Series Status</CardTitle>
          </CardHeader>
          <SectionCard className="mt-1">
            <QcSeriesSummary byStatus={byStatus} byModality={byModality} />
          </SectionCard>

          <QcAssignments
            reviewId={reviewId}
            assignments={assignments}
            reviewType={review.review_type}
            canManage={review.review_status !== "cancelled"}
          />
        </>
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
