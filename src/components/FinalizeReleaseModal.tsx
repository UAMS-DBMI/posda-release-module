import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import {
  emptyFinalizeForm,
  useFinalizeDatasetRelease,
  type BundledRecordset,
  type FinalizeFormValues,
} from "@/lib/datasetReleaseForm";

type FinalizeReleaseModalProps = {
  open: boolean;
  onClose: () => void;
  releaseId: number | undefined;
  datasetId: string | undefined;
  releaseNumber: number | undefined;
  /** What the release currently contains, for the confirm summary. */
  bundled: BundledRecordset[];
  /** Frozen recordsets not included — the last chance to notice an omission. */
  omittedCount: number;
};

/** Finalize the draft dataset release: record notes/DOI and flip it to
 *  `released`. Immutable afterwards, so the summary matters more than the form. */
export default function FinalizeReleaseModal({
  open,
  onClose,
  releaseId,
  datasetId,
  releaseNumber,
  bundled,
  omittedCount,
}: FinalizeReleaseModalProps) {
  const { addToast } = useToast();
  const finalize = useFinalizeDatasetRelease(releaseId, datasetId);
  const [values, setValues] = useState<FinalizeFormValues>(emptyFinalizeForm);

  function handleClose() {
    setValues(emptyFinalizeForm);
    onClose();
  }

  async function handleFinalize() {
    if (releaseId == null) return;
    try {
      await finalize.mutateAsync(values);
      toastSuccess(
        addToast,
        releaseNumber != null
          ? `Release v${releaseNumber} finalized.`
          : "Release finalized.",
      );
      handleClose();
    } catch (e) {
      toastError(
        addToast,
        e instanceof Error ? e.message : "Could not finalize the release.",
      );
    }
  }

  const nothingBundled = bundled.length === 0;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        releaseNumber != null ? `Finalize v${releaseNumber}` : "Finalize Release"
      }
      footer={
        <>
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={finalize.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleFinalize()}
            loading={finalize.isPending}
            disabled={nothingBundled}
            title={
              nothingBundled
                ? "Include at least one recordset before finalizing"
                : undefined
            }
          >
            Finalize
          </Button>
        </>
      }
    >
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        This marks the release as released and stamps its date. Its contents are
        fixed from that point — start a new cycle to change anything.
      </p>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
          Contents ({bundled.length})
        </p>
        {nothingBundled ? (
          <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
            Nothing is included yet — add at least one recordset first.
          </p>
        ) : (
          <ul
            className="mt-1 max-h-40 divide-y overflow-y-auto rounded-md text-sm"
            style={{
              borderColor: "var(--border)",
              border: "1px solid var(--border-strong)",
            }}
          >
            {bundled.map((b) => (
              <li
                key={b.recordset_release_id}
                className="flex items-baseline justify-between gap-3 px-3 py-1.5"
              >
                <span className="truncate">{b.recordset_name}</span>
                <span className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                  v{b.release_number}
                </span>
              </li>
            ))}
          </ul>
        )}

        {omittedCount > 0 && (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
            ⚠ {omittedCount} frozen recordset{omittedCount === 1 ? "" : "s"}{" "}
            {omittedCount === 1 ? "is" : "are"} not included and will not ship in
            this release.
          </p>
        )}
      </div>

      <label className="mt-4 block">
        <span className="block text-sm font-medium">
          Release Notes{" "}
          <span className="font-normal" style={{ color: "var(--muted)" }}>
            (optional)
          </span>
        </span>
        <textarea
          value={values.release_notes}
          onChange={(e) =>
            setValues((v) => ({ ...v, release_notes: e.target.value }))
          }
          rows={3}
          className="textarea mt-1 w-full"
          disabled={finalize.isPending}
        />
      </label>

      <label className="mt-3 block">
        <span className="block text-sm font-medium">
          DOI{" "}
          <span className="font-normal" style={{ color: "var(--muted)" }}>
            (optional)
          </span>
        </span>
        <input
          type="text"
          value={values.release_doi}
          onChange={(e) =>
            setValues((v) => ({ ...v, release_doi: e.target.value }))
          }
          className="input mt-1 w-full"
          disabled={finalize.isPending}
        />
      </label>
    </Modal>
  );
}
