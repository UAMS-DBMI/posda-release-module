import { useEffect, useState } from "react";
import { useCreateQcReview, type QcReviewType } from "@/lib/useQc";
import { Button } from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";

type QcReviewModalProps = {
  open: boolean;
  onClose: () => void;
  draftId: string | undefined;
  /** Pre-selected review type (default "full" — the cycle's common path). */
  defaultType?: QcReviewType;
  /** Non-DICOM mode: no sampling (there are no series to sample), creates a
   *  review_type='non_dicom' review covering every non-DICOM file in the draft. */
  nonDicom?: boolean;
  /** Claim the initial slice for the caller (first review on a draft). */
  assignToCaller?: boolean;
  /** Fired after a successful create, in addition to the hook's own list
   *  invalidation — Verify uses it to refresh the cycle rollup. */
  onCreated?: () => void;
};

/** Create-a-QC-review form as a single-purpose modal, shared by the draft's
 *  QcReviewsCard and the cycle's Verify stage. A partial review samples the
 *  chosen percentage of series per modality; a full review includes every one. */
export default function QcReviewModal({
  open,
  onClose,
  draftId,
  defaultType = "full",
  nonDicom = false,
  assignToCaller = false,
  onCreated,
}: QcReviewModalProps) {
  const { addToast } = useToast();
  const create = useCreateQcReview(draftId);

  const [reviewType, setReviewType] = useState<QcReviewType>(defaultType);
  const [percentage, setPercentage] = useState("20");
  const [notes, setNotes] = useState("");

  // Reset to the caller's defaults each time the modal opens.
  useEffect(() => {
    if (open) {
      setReviewType(nonDicom ? "non_dicom" : defaultType);
      setPercentage("20");
      setNotes("");
    }
  }, [open, defaultType, nonDicom]);

  const pctNum = Number(percentage);
  const pctValid =
    reviewType !== "partial" ||
    (Number.isFinite(pctNum) && pctNum > 0 && pctNum <= 100);

  async function handleSubmit() {
    try {
      await create.mutateAsync({
        review_type: reviewType,
        sample_percentage: reviewType === "partial" ? pctNum : null,
        review_notes: notes.trim() || null,
        assign_to_caller: assignToCaller,
      });
      toastSuccess(addToast, "QC review created.");
      onCreated?.();
      onClose();
    } catch (e) {
      toastError(
        addToast,
        e instanceof Error ? e.message : "Could not create QC review.",
      );
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={nonDicom ? "New Non-DICOM Review" : "New QC Review"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!pctValid || !draftId}
            loading={create.isPending}
          >
            Create Review
          </Button>
        </>
      }
    >
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        {nonDicom
          ? "This review covers every non-DICOM file in the draft. Mirabelle is DICOM-only, so these are reviewed by downloading the files and marking them approved."
          : "A partial review samples the chosen percentage of series per modality; a full review includes every series."}
      </p>

      <div className="mt-4 space-y-4">
        {!nonDicom && (
          <div>
            <label className="block text-sm font-medium">Type</label>
            <select
              value={reviewType}
              onChange={(e) => setReviewType(e.target.value as QcReviewType)}
              className="select mt-1 w-full"
            >
              <option value="full">Full (all series)</option>
              <option value="partial">Partial (sampled)</option>
            </select>
          </div>
        )}

        {reviewType === "partial" && (
          <div>
            <label className="block text-sm font-medium">
              Sample percentage (per modality)
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              className="input mt-1 w-full"
            />
            {!pctValid && (
              <p className="mt-1 text-xs text-red-600">
                Enter a percentage between 1 and 100.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium">
            Notes{" "}
            <span className="font-normal text-neutral-500">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="textarea mt-1 w-full"
          />
        </div>
      </div>
    </Modal>
  );
}
