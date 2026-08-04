import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ActivitySourcePicker, {
  type ActivitySource,
} from "@/components/ActivitySourcePicker";
import FilePicker from "@/components/FilePicker";
import ReleasePicker from "@/components/ReleasePicker";
import DraftSeriesReconcile from "@/components/DraftSeriesReconcile";
import { draftFilesKey } from "@/components/DraftFileList";
import { draftSummaryKey } from "@/components/DraftSummary";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { extractApiError } from "@/lib/apiUtils";
import { pullWpFileToDraft, uploadFilesToDraft } from "@/lib/draftUploads";

type Mode = "activity" | "release" | "upload" | "wordpress";

const BASE_MODES: { key: Mode; label: string }[] = [
  { key: "activity", label: "From Activity" },
  { key: "release", label: "From Release" },
  { key: "upload", label: "Upload" },
];

type DiffResult = {
  removed_file_ids: number[];
  removed_count: number;
  unchanged_count: number;
  added_count: number;
};

// A draft diff reports, relative to a previous release: removed = in the release
// but not the draft (i.e. what "add" would pull in), unchanged = already in the
// draft, added = in the draft but not the release. (Activity sources use the
// series reconcile instead -- file-level add can't replace corrected series.)
function useDraftDiff(draftId: number, releaseId: number | null) {
  return useQuery({
    queryKey: ["draft-diff", draftId, releaseId],
    enabled: releaseId !== null,
    queryFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/diff?compare_release_id=${releaseId}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Could not load diff.");
      const json = (await res.json()) as { data: DiffResult } | DiffResult;
      return "data" in json ? json.data : json;
    },
  });
}

type DraftAddFilesProps = {
  draftId: number;
  recordsetId: number;
  datasetId: string | undefined;
  wpLinked: boolean;
};

/** Add files to an open draft from an activity timepoint, a previous release,
 *  or a local upload. Bulk only -- per-file selection is the (still-held) file
 *  browser. */
export default function DraftAddFiles({
  draftId,
  recordsetId,
  datasetId,
  wpLinked,
}: DraftAddFilesProps) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("activity");
  const [source, setSource] = useState<ActivitySource | null>(null);
  const [releaseId, setReleaseId] = useState<number | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);

  const modes: { key: Mode; label: string }[] = [
    ...BASE_MODES,
    ...(wpLinked ? [{ key: "wordpress" as Mode, label: "WordPress" }] : []),
  ];
  const isDiffMode = mode === "release";

  const diff = useDraftDiff(draftId, releaseId);
  const toAdd = diff.data?.removed_file_ids ?? [];

  function invalidateAfterChange() {
    void queryClient.invalidateQueries({ queryKey: draftSummaryKey(draftId) });
    void queryClient.invalidateQueries({ queryKey: draftFilesKey(draftId) });
    void queryClient.invalidateQueries({
      queryKey: ["dataset-cycle", datasetId ?? ""],
    });
  }

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/files/add`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ files: toAdd.map((file_id) => ({ file_id })) }),
        },
      );
      if (!res.ok) {
        throw new Error(extractApiError(await res.json(), "Could not add files."));
      }
    },
    onSuccess: () => {
      toastSuccess(addToast, `Added ${toAdd.length.toLocaleString()} files.`);
      invalidateAfterChange();
      void diff.refetch();
    },
    onError: (e) =>
      toastError(addToast, e instanceof Error ? e.message : "Could not add files."),
  });

  const upload = useMutation({
    mutationFn: () => uploadFilesToDraft(draftId, uploadFiles),
    onSuccess: (count) => {
      toastSuccess(addToast, `Uploaded ${count.toLocaleString()} files.`);
      setUploadFiles([]);
      invalidateAfterChange();
    },
    onError: (e) =>
      toastError(addToast, e instanceof Error ? e.message : "Could not upload files."),
  });

  const wpPull = useMutation({
    mutationFn: () => pullWpFileToDraft(draftId),
    onSuccess: () => {
      toastSuccess(addToast, "Pulled the WordPress file into the draft.");
      invalidateAfterChange();
    },
    onError: (e) =>
      toastError(
        addToast,
        e instanceof Error ? e.message : "Could not pull the WordPress file.",
      ),
  });

  return (
    <div
      className="rounded-md p-3"
      style={{ border: "1px solid var(--border-strong)" }}
    >
      <div
        className="flex gap-1 rounded-md p-1"
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

      <div className="mt-3">
        {mode === "activity" && (
          <>
            <ActivitySourcePicker value={source} onChange={setSource} />
            {source && (
              <DraftSeriesReconcile
                draftId={draftId}
                datasetId={datasetId}
                source={source}
              />
            )}
          </>
        )}
        {mode === "release" && (
          <ReleasePicker
            recordsetId={recordsetId}
            value={releaseId}
            onChange={setReleaseId}
            emptyMessage="This recordset has no releases to add from."
          />
        )}
        {mode === "upload" && (
          <FilePicker
            files={uploadFiles}
            onChange={setUploadFiles}
            disabled={upload.isPending}
          />
        )}
        {mode === "wordpress" && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Pull the file attached to this recordset's WordPress download object
          </p>
        )}
      </div>

      {isDiffMode && diff.isLoading && <LoadingState className="mt-3" />}
      {isDiffMode && diff.isError && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          Could not load diff.
        </p>
      )}
      {isDiffMode && diff.data && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {diff.data.removed_count.toLocaleString()} not in draft ·{" "}
            {diff.data.unchanged_count.toLocaleString()} already in
          </p>
          <Button
            size="sm"
            onClick={() => add.mutate()}
            disabled={toAdd.length === 0}
            loading={add.isPending}
          >
            Add {toAdd.length.toLocaleString()} Files
          </Button>
        </div>
      )}

      {mode === "upload" && (
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            onClick={() => upload.mutate()}
            disabled={uploadFiles.length === 0}
            loading={upload.isPending}
          >
            Upload {uploadFiles.length.toLocaleString()} File
            {uploadFiles.length === 1 ? "" : "s"}
          </Button>
        </div>
      )}

      {mode === "wordpress" && (
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            onClick={() => wpPull.mutate()}
            loading={wpPull.isPending}
          >
            Pull from WordPress
          </Button>
        </div>
      )}
    </div>
  );
}
