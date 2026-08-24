import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import {
  emptyPublishForm,
  usePublishDraft,
  type PublishFormValues,
  type PublishedRelease,
} from "@/lib/publishForm";

type PublishDraftModalProps = {
  open: boolean;
  onClose: () => void;
  draftId: number | undefined;
  datasetId?: string | undefined;
  /** Draft name, for the confirm copy. */
  draftName?: string;
  /** Where the caller wants to go afterwards -- the hook doesn't navigate. */
  onPublished?: (release: PublishedRelease) => void;
};

/** Freeze a draft into an immutable recordset release. The version number and
 *  date are server-assigned, so this only collects notes. */
export default function PublishDraftModal({
  open,
  onClose,
  draftId,
  datasetId,
  draftName,
  onPublished,
}: PublishDraftModalProps) {
  const { addToast } = useToast();
  const publish = usePublishDraft(draftId, datasetId);
  const [values, setValues] = useState<PublishFormValues>(emptyPublishForm);

  function handleClose() {
    setValues(emptyPublishForm);
    onClose();
  }

  async function handlePublish() {
    if (draftId == null) return;
    try {
      const release = await publish.mutateAsync(values);
      toastSuccess(addToast, "Draft published.");
      onPublished?.(release);
      handleClose();
    } catch (e) {
      toastError(
        addToast,
        e instanceof Error ? e.message : "Could not publish the draft.",
      );
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="sm"
      title={draftName ? `Publish ${draftName}` : "Publish Draft"}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={publish.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handlePublish()}
            loading={publish.isPending}
          >
            Publish
          </Button>
        </>
      }
    >
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        This freezes the current draft files into an immutable release. The
        version number is assigned automatically.
      </p>

      <label className="mt-4 block">
        <span className="block text-sm font-medium">
          Release Notes{" "}
          <span className="font-normal" style={{ color: "var(--muted)" }}>
            (optional)
          </span>
        </span>
        <textarea
          value={values.release_notes}
          onChange={(e) => setValues({ release_notes: e.target.value })}
          rows={3}
          className="textarea mt-1 w-full"
          disabled={publish.isPending}
        />
      </label>
    </Modal>
  );
}
