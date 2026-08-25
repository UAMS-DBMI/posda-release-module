import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { useQueueTransfer, type ReleaseTransfer } from "@/lib/transferForm";
import { useTransferSettings } from "@/lib/transferSettings";

/** Confirm before handing a transfer to the delivery daemon.
 *
 *  ⚠ Queueing is one-way: setting `queued` fires `notify_transfer_queued()`,
 *  which starts real uploads to an external destination, and `transfer_status`
 *  has no route back. So this is a deliberate per-transfer act with its own
 *  confirmation — never part of a bulk action. */
export default function QueueTransferModal({
  open,
  onClose,
  transfer,
  releaseId,
  datasetId,
}: {
  open: boolean;
  onClose: () => void;
  transfer: ReleaseTransfer | null;
  releaseId: number | undefined;
  datasetId: string | undefined;
}) {
  const { addToast } = useToast();
  const queue = useQueueTransfer(releaseId, datasetId);

  // IDC reads a submission from its manifests, so it cannot be queued until they
  // exist. `missing_manifests` comes from the API, which derives what this
  // transfer actually needs from what it carries -- the same check it enforces
  // on the queue transition, so the button matches the rule exactly rather than
  // re-deriving it here.
  const isIdc = transfer?.destination_abbr === "idc";
  const settings = useTransferSettings(
    transfer?.dataset_release_transfer_id,
    transfer?.destination_abbr,
    open && isIdc,
  );
  const missing = isIdc ? (settings.data?.missing_manifests ?? []) : [];

  const drifted = transfer?.membership_drifted ?? false;
  const waiting = isIdc && settings.isLoading;
  const blocked = drifted || missing.length > 0 || waiting;

  function blockedReason(): string | undefined {
    if (drifted) return "Sync this transfer's recordsets first";
    if (missing.length > 0) return "Generate this transfer's manifests first";
    return undefined;
  }

  async function handleQueue() {
    if (!transfer) return;
    try {
      await queue.mutateAsync(transfer.dataset_release_transfer_id);
      toastSuccess(addToast, `Queued for ${transfer.destination_name}.`);
      onClose();
    } catch (e) {
      toastError(
        addToast,
        e instanceof Error ? e.message : "Could not queue the transfer.",
      );
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Queue for ${transfer?.destination_name ?? "destination"}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={queue.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleQueue()}
            loading={queue.isPending}
            disabled={blocked}
            title={blockedReason()}
          >
            Queue Transfer
          </Button>
        </>
      }
    >
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        This hands the transfer to the delivery daemon, which begins uploading to{" "}
        {transfer?.destination_name ?? "the destination"}.{" "}
        <strong>There is no un-queue</strong> — once it starts there is no route
        back through the transfer&apos;s status.
      </p>

      {transfer && (
        <p className="mt-3 text-sm">
          <span className="font-medium">{transfer.transfer_name}</span>
          <span style={{ color: "var(--muted)" }}>
            {" "}
            · {transfer.recordset_count} recordset
            {transfer.recordset_count === 1 ? "" : "s"}
          </span>
        </p>
      )}

      {drifted && (
        <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
          ⚠ This transfer no longer matches what the release bundles (it carries{" "}
          {transfer?.recordset_count}, the release has{" "}
          {transfer?.expected_recordset_count}). Sync it before queueing, or it
          ships the wrong contents.
        </p>
      )}

      {!drifted && missing.length > 0 && (
        <div className="mt-3 text-sm text-amber-600 dark:text-amber-400">
          <p>
            ⚠ Generate the {missing.join(", ")} manifest
            {missing.length === 1 ? "" : "s"} before queueing — IDC reads the
            submission from its manifests.
          </p>
          {missing.includes("clinical") && (
            <p className="mt-1">
              The clinical manifest needs this release&apos;s WordPress transfer
              to have delivered first, so Collection Manager holds the current
              files rather than the previous version.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
