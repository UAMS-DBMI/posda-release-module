import { useState } from "react";
import {
  useCancelQcReview,
  useCloneQcReview,
  useUpdateQcReview,
  type QcReviewRow,
  type QcStaleBreakdown,
} from "@/lib/useQc";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";

/** Review-level lifecycle for a QC review: the stale "clone to refresh" banner
 *  plus Mark Complete / Clone / Cancel, owning the Clone and Cancel modals.
 *  Shared by the review-detail page and the cycle's Verify Manage modal.
 *  `onChanged` lets a host refresh its own rollup after a mutation; `onCloned`
 *  hands back the new review id (the page navigates to it). */
export default function QcReviewLifecycle({
  reviewId,
  review,
  allApproved,
  stale,
  onChanged,
  onCloned,
}: {
  reviewId: string;
  review: QcReviewRow;
  allApproved: boolean;
  stale: QcStaleBreakdown | null;
  onChanged?: () => void;
  onCloned?: (newReviewId: number) => void;
}) {
  const { addToast } = useToast();
  const update = useUpdateQcReview(reviewId);
  const cancel = useCancelQcReview(reviewId);
  const clone = useCloneQcReview(reviewId);

  const [showClone, setShowClone] = useState(false);
  const [cloneMode, setCloneMode] = useState<"carry_forward" | "resample">(
    "carry_forward",
  );
  const [showCancel, setShowCancel] = useState(false);

  const active = review.review_status !== "cancelled";
  if (!active) return null;

  async function handleMarkComplete() {
    try {
      await update.mutateAsync({ review_status: "complete" });
      toastSuccess(addToast, "Review marked complete.");
      onChanged?.();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not complete review.");
    }
  }

  async function handleClone() {
    try {
      const res = await clone.mutateAsync({ mode: cloneMode });
      toastSuccess(addToast, "Review cloned.");
      setShowClone(false);
      onChanged?.();
      onCloned?.(res.data.review.qc_review_id);
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not clone review.");
    }
  }

  async function handleCancel() {
    try {
      await cancel.mutateAsync();
      toastSuccess(addToast, "Review cancelled.");
      setShowCancel(false);
      onChanged?.();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not cancel review.");
    }
  }

  return (
    <>
      {review.review_status === "stale" && stale && (
        <SectionCard className="mt-1">
          <div
            className="rounded-md px-4 py-3 text-sm"
            style={{
              background: "var(--surface-alt)",
              borderLeft: "4px solid var(--accent)",
            }}
          >
            <p className="font-medium">
              The draft changed since this review was sampled.
            </p>
            <p className="mt-1" style={{ color: "var(--muted)" }}>
              {stale.changed} changed · {stale.would_add} to add ·{" "}
              {stale.would_drop} to drop. Clone (carry-forward) to refresh while
              preserving decisions.
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => {
                setCloneMode("carry_forward");
                setShowClone(true);
              }}
            >
              Clone to refresh
            </Button>
          </div>
        </SectionCard>
      )}

      <div className="flex flex-wrap gap-2">
        {review.review_status !== "complete" && (
          <Button
            onClick={() => void handleMarkComplete()}
            disabled={!allApproved || update.isPending}
            title={
              allApproved
                ? undefined
                : "All series must be approved before completing"
            }
          >
            Mark Complete
          </Button>
        )}
        <Button variant="ghost" onClick={() => setShowClone(true)}>
          Clone
        </Button>
        <Button variant="ghost" onClick={() => setShowCancel(true)}>
          Cancel Review
        </Button>
      </div>

      {/* Clone */}
      <Modal
        open={showClone}
        onClose={() => setShowClone(false)}
        title="Clone QC Review"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowClone(false)}
              disabled={clone.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleClone()} loading={clone.isPending}>
              Clone
            </Button>
          </>
        }
      >
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="clone-mode"
              checked={cloneMode === "carry_forward"}
              onChange={() => setCloneMode("carry_forward")}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Carry forward</span> — re-sample the
              current draft with the same seed and keep prior decisions (changed
              series reset to pending).
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="clone-mode"
              checked={cloneMode === "resample"}
              onChange={() => setCloneMode("resample")}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Resample</span> — a fresh draw with a
              new seed; no decisions carried.
            </span>
          </label>
        </div>
      </Modal>

      {/* Cancel confirm */}
      <Modal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        title="Cancel this QC review?"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowCancel(false)}
              disabled={cancel.isPending}
            >
              Keep
            </Button>
            <Button onClick={() => void handleCancel()} loading={cancel.isPending}>
              Cancel Review
            </Button>
          </>
        }
      >
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          The review and its series are kept for audit, but it's marked cancelled.
        </p>
      </Modal>
    </>
  );
}
