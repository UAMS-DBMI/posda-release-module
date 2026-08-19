import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import ActivitySourcePicker, {
  type ActivitySource,
} from "@/components/ActivitySourcePicker";
import FilePicker from "@/components/FilePicker";
import ReleasePicker from "@/components/ReleasePicker";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { pullWpFileToDraft, uploadFilesToDraft } from "@/lib/draftUploads";
import { useCreateRecordsetDraft } from "@/lib/useCycle";

type Mode = "activity" | "release" | "upload" | "wordpress" | "empty";

type CreateDraftModalProps = {
  open: boolean;
  onClose: () => void;
  datasetId: string | undefined;
  recordsetId: number;
  recordsetName: string;
  wpLinked: boolean;
  /** Optional: for callers whose drafts list isn't react-query, so the
   *  `dataset-cycle` invalidation can't reach it. */
  onCreated?: () => void;
};

const BASE_MODES: { key: Mode; label: string }[] = [
  { key: "activity", label: "From Activity" },
  { key: "release", label: "From Release" },
  { key: "upload", label: "Upload" },
];

/** Create one recordset draft for the active cycle from any source -- an
 *  activity timepoint, a previous release (clone), a local upload, or empty.
 *  Assemble opens this per row. */
export default function CreateDraftModal({
  open,
  onClose,
  datasetId,
  recordsetId,
  recordsetName,
  wpLinked,
  onCreated,
}: CreateDraftModalProps) {
  const modes: { key: Mode; label: string }[] = [
    ...BASE_MODES,
    ...(wpLinked ? [{ key: "wordpress" as Mode, label: "WordPress" }] : []),
    { key: "empty", label: "Empty" },
  ];
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const create = useCreateRecordsetDraft(datasetId);
  const [mode, setMode] = useState<Mode>("activity");
  const [source, setSource] = useState<ActivitySource | null>(null);
  const [releaseId, setReleaseId] = useState<number | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function handleClose() {
    setMode("activity");
    setSource(null);
    setReleaseId(null);
    setUploadFiles([]);
    onClose();
  }

  const canCreate =
    mode === "empty" ||
    mode === "wordpress" ||
    (mode === "activity" && source !== null) ||
    (mode === "release" && releaseId !== null) ||
    (mode === "upload" && uploadFiles.length > 0);

  async function handleCreate() {
    if (!canCreate) return;
    setSubmitting(true);
    try {
      if (mode === "upload" || mode === "wordpress") {
        // Neither has a single-shot create source: make an empty draft, then
        // fill it (local import for upload, WP download object for wordpress).
        const draft = await create.mutateAsync({ recordset_id: recordsetId });
        if (mode === "upload") {
          await uploadFilesToDraft(draft.recordset_draft_id, uploadFiles);
        } else {
          await pullWpFileToDraft(draft.recordset_draft_id);
        }
        void queryClient.invalidateQueries({
          queryKey: ["dataset-cycle", datasetId ?? ""],
        });
      } else {
        await create.mutateAsync({
          recordset_id: recordsetId,
          activity_timepoint_id:
            mode === "activity" && source ? source.timepointId : undefined,
          cloned_from_release_id:
            mode === "release" && releaseId != null ? releaseId : undefined,
        });
      }
      toastSuccess(addToast, `Draft created for ${recordsetName}.`);
      onCreated?.();
      handleClose();
    } catch (e) {
      toastError(
        addToast,
        e instanceof Error ? e.message : "Could not create the draft.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="xl"
      title={`Create Draft — ${recordsetName}`}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleCreate()}
            disabled={!canCreate || submitting}
            loading={submitting}
          >
            Create Draft
          </Button>
        </>
      }
    >
      <div
        className="mt-3 flex gap-1 rounded-md p-1"
        style={{ background: "var(--surface-alt)" }}
      >
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className="flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors"
            style={
              mode === m.key
                ? { background: "var(--surface)", color: "var(--accent)" }
                : { color: "var(--muted)" }
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {mode === "activity" && (
          <>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Fill the draft from an activity timepoint's files.
            </p>
            <div className="mt-3">
              <ActivitySourcePicker value={source} onChange={setSource} />
            </div>
            {source && (
              <p className="mt-3 text-sm">
                {source.activityName} — {source.fileCount.toLocaleString()} files.
              </p>
            )}
          </>
        )}

        {mode === "release" && (
          <>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Clone the files from a previous release of this recordset.
            </p>
            <div className="mt-3">
              <ReleasePicker
                recordsetId={recordsetId}
                value={releaseId}
                onChange={setReleaseId}
                emptyMessage="This recordset has no releases to clone from."
              />
            </div>
          </>
        )}

        {mode === "upload" && (
          <>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Upload files from your machine to fill this draft.
            </p>
            <div className="mt-3">
              <FilePicker
                files={uploadFiles}
                onChange={setUploadFiles}
                disabled={submitting}
              />
            </div>
          </>
        )}

        {mode === "wordpress" && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Pull the file attached to this recordset's WordPress download object
          </p>
        )}

        {mode === "empty" && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Start with an empty draft — add files afterward from the draft.
          </p>
        )}
      </div>
    </Modal>
  );
}
