import { useQueryClient } from "@tanstack/react-query";
import { useQcReview } from "@/lib/useQc";
import QcAssignments from "@/components/qc/QcAssignments";
import { useQcReviewLifecycle } from "@/components/qc/QcReviewLifecycle";
import QcSeriesSummary from "@/components/qc/QcSeriesSummary";
import { Button } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import { LoadingState } from "@/components/ui/Spinner";

type QcReviewManageModalProps = {
  open: boolean;
  onClose: () => void;
  reviewId: number | null;
  datasetId: string | undefined;
};

/** Manage one QC review from inside the cycle: the review lifecycle, its series
 *  summary, and its assignment slices — the same components the review-detail
 *  page renders. Mutations refresh the cycle rollup via `onChanged`. */
export default function QcReviewManageModal({
  open,
  onClose,
  reviewId,
  datasetId,
}: QcReviewManageModalProps) {
  const queryClient = useQueryClient();
  const idStr = reviewId != null ? String(reviewId) : undefined;
  const detail = useQcReview(idStr);

  function invalidateCycle() {
    void queryClient.invalidateQueries({
      queryKey: ["dataset-cycle", datasetId ?? ""],
    });
  }

  const review = detail.data?.review;
  const byStatus = detail.data?.series_by_status ?? [];
  const byModality = detail.data?.series_by_modality ?? [];
  const assignments = detail.data?.assignments ?? [];
  const stale = detail.data?.stale_breakdown ?? null;
  const seriesTotal = byStatus.reduce((sum, s) => sum + s.count, 0);
  const approvedCount =
    byStatus.find((s) => s.qc_status === "approved")?.count ?? 0;
  const allApproved = seriesTotal > 0 && approvedCount === seriesTotal;

  const lifecycle = useQcReviewLifecycle({
    reviewId: idStr ?? "",
    review,
    allApproved,
    stale,
    onChanged: () => invalidateCycle(),
    onCloned: () => {
      invalidateCycle();
      onClose();
    },
  });


  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={reviewId != null ? `Manage QC — Review #${reviewId}` : "Manage QC"}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      {detail.isLoading && <LoadingState className="mt-4" />}
      {detail.isError && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">
          Could not load this QC review.
        </p>
      )}

      {review && idStr && (
        <div className="mt-2">
          {lifecycle.banner}
          <div className="flex flex-wrap gap-2">{lifecycle.actions}</div>
          {lifecycle.modals}

          <SectionCard className="mt-4">
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <div>
              <QcSeriesSummary byStatus={byStatus} byModality={byModality} />
            </div>

            <QcAssignments
              reviewId={idStr}
              assignments={assignments}
              reviewType={review.review_type}
              reviewStatus={review.review_status}
              canManage={review.review_status !== "cancelled"}
              onChanged={invalidateCycle}
            />
          </SectionCard>
        </div>
      )}
    </Modal>
  );
}
