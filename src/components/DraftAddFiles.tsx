import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ActivitySourcePicker, {
  type ActivitySource,
} from "@/components/ActivitySourcePicker";
import FilePicker from "@/components/FilePicker";
import ReleasePicker from "@/components/ReleasePicker";
import DraftSeriesReconcile from "@/components/DraftSeriesReconcile";
import NameConflictPicker from "@/components/NameConflictPicker";
import { draftFilesKey } from "@/components/DraftFileList";
import { draftSummaryKey } from "@/components/DraftSummary";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { extractApiError } from "@/lib/apiUtils";
import {
  pullWpFileToDraft,
  uploadFilesToDraft,
  type DraftAddMode,
  type NameConflictChoice,
} from "@/lib/draftUploads";

type Mode = "activity" | "release" | "upload" | "wordpress";

const BASE_MODES: { key: Mode; label: string }[] = [
  { key: "activity", label: "From Activity" },
  { key: "release", label: "From Release" },
  { key: "upload", label: "Upload" },
];

// Same Merge / Replace-all split as the activity reconcile.
type Op = "merge" | "replace-all";

const OPS: { key: Op; label: string }[] = [
  { key: "merge", label: "Merge" },
  { key: "replace-all", label: "Replace all" },
];

type ReleaseMergePreview = {
  to_add: number;
  already_in: number;
  name_conflicts: number;
  release_total: number;
  draft_total: number;
};

// What bringing a release in would do: Merge adds its memberships (with the
// release's names) the draft lacks; Replace all swaps the totals.
function useReleaseMergePreview(draftId: number, releaseId: number | null) {
  return useQuery({
    queryKey: ["draft-release-merge", draftId, releaseId],
    enabled: releaseId !== null,
    queryFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/content/merge-release/preview?compare_release_id=${releaseId}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Could not compare with the release.");
      const json = (await res.json()) as { data: ReleaseMergePreview };
      return json.data;
    },
  });
}

/** Which of the chosen upload names the draft already holds. */
function useNameMatches(draftId: number, names: string[]) {
  return useQuery({
    queryKey: ["draft-name-matches", draftId, names],
    enabled: names.length > 0,
    queryFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/files/name-matches`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ names }),
        },
      );
      if (!res.ok) throw new Error("Could not check file names.");
      const json = (await res.json()) as { data: { matches: string[] } };
      return json.data.matches;
    },
  });
}

/** The WP download's filename, and whether the draft holds that name already. */
function useWpPreview(draftId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["draft-wp-preview", draftId],
    enabled,
    queryFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/files/from-wp/preview`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        throw new Error(
          extractApiError(
            await res.json().catch(() => ({})),
            "Could not read the WordPress download.",
          ),
        );
      }
      const json = (await res.json()) as {
        data: { file_name: string; same_name_in_draft: boolean };
      };
      return json.data;
    },
  });
}

function files(n: number): string {
  return `${n.toLocaleString()} file${n === 1 ? "" : "s"}`;
}

/** Destructive action behind a second click, which lapses after 4 s -- the
 *  activity reconcile's Replace Draft Contents pattern. */
function ConfirmReplaceButton({
  label,
  onConfirm,
  loading,
  disabled,
}: {
  label: string;
  onConfirm: () => void;
  loading: boolean;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-red-600 dark:text-red-400"
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
      loading={loading}
      disabled={disabled}
    >
      {armed ? "Confirm — replace everything?" : label}
    </Button>
  );
}

type DraftAddFilesProps = {
  draftId: number;
  recordsetId: number;
  datasetId: string | undefined;
  wpLinked: boolean;
};

/** Add files to an open draft from an activity timepoint, a previous release,
 *  a local upload, or the recordset's WordPress download. Each source can
 *  merge into the draft or replace its entire contents. A draft never holds
 *  two different non-DICOM files under one name, so a merge that collides
 *  replaces the draft's file (default) or skips the incoming one. Bulk only --
 *  per-file selection is the (still-held) file browser. */
export default function DraftAddFiles({
  draftId,
  recordsetId,
  datasetId,
  wpLinked,
}: DraftAddFilesProps) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("activity");
  const [op, setOp] = useState<Op>("merge");
  const [onNameConflict, setOnNameConflict] = useState<NameConflictChoice>("replace");
  const [source, setSource] = useState<ActivitySource | null>(null);
  const [releaseId, setReleaseId] = useState<number | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);

  const modes: { key: Mode; label: string }[] = [
    ...BASE_MODES,
    ...(wpLinked ? [{ key: "wordpress" as Mode, label: "WordPress" }] : []),
  ];
  const isDiffMode = mode === "release";

  const releasePreview = useReleaseMergePreview(draftId, releaseId);

  // Folder uploads carry a relative subpath; that is the name they're stored under.
  const uploadNames = uploadFiles.map((f) => f.webkitRelativePath || f.name);
  const nameMatches = useNameMatches(draftId, mode === "upload" ? uploadNames : []);
  const sameNameCount = nameMatches.data?.length ?? 0;
  const wpPreview = useWpPreview(draftId, mode === "wordpress");

  const addMode: DraftAddMode = op === "replace-all" ? "replace_all" : "add";

  function chooseMode(m: Mode) {
    setMode(m);
    setOp("merge");
    setOnNameConflict("replace");
  }

  function invalidateAfterChange() {
    void queryClient.invalidateQueries({ queryKey: draftSummaryKey(draftId) });
    void queryClient.invalidateQueries({ queryKey: draftFilesKey(draftId) });
    void queryClient.invalidateQueries({
      queryKey: ["dataset-cycle", datasetId ?? ""],
    });
    void queryClient.invalidateQueries({ queryKey: ["draft-name-matches", draftId] });
    void queryClient.invalidateQueries({ queryKey: ["draft-wp-preview", draftId] });
    void queryClient.invalidateQueries({ queryKey: ["draft-release-merge", draftId] });
  }

  const mergeRelease = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/content/merge-release`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            compare_release_id: releaseId,
            on_name_conflict: onNameConflict,
          }),
        },
      );
      if (!res.ok) {
        throw new Error(extractApiError(await res.json(), "Could not add files."));
      }
      return (await res.json()) as {
        data: { files_added: number; files_removed: number };
      };
    },
    onSuccess: (json) => {
      const replaced = json.data.files_removed;
      toastSuccess(
        addToast,
        `Added ${json.data.files_added.toLocaleString()} files${replaced > 0 ? ` (${replaced.toLocaleString()} replaced)` : ""}.`,
      );
      invalidateAfterChange();
    },
    onError: (e) =>
      toastError(addToast, e instanceof Error ? e.message : "Could not add files."),
  });

  const replaceFromRelease = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/content/replace-all`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ compare_release_id: releaseId }),
        },
      );
      if (!res.ok) throw new Error(extractApiError(await res.json(), "Could not replace."));
      return (await res.json()) as {
        data: { files_added: number; files_removed: number };
      };
    },
    onSuccess: (json) => {
      toastSuccess(
        addToast,
        `Draft replaced — ${json.data.files_added.toLocaleString()} files (${json.data.files_removed.toLocaleString()} removed).`,
      );
      invalidateAfterChange();
    },
    onError: (e) =>
      toastError(addToast, e instanceof Error ? e.message : "Could not replace."),
  });

  const upload = useMutation({
    mutationFn: () => uploadFilesToDraft(draftId, uploadFiles, addMode, onNameConflict),
    onSuccess: (count) => {
      toastSuccess(addToast, `Uploaded ${count.toLocaleString()} files.`);
      setUploadFiles([]);
      invalidateAfterChange();
    },
    onError: (e) =>
      toastError(addToast, e instanceof Error ? e.message : "Could not upload files."),
  });

  const wpPull = useMutation({
    mutationFn: () => pullWpFileToDraft(draftId, addMode, onNameConflict),
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

  // The Merge / Replace-all toggle shows once there's something to bring in.
  const hasSource =
    (mode === "release" && !!releasePreview.data) ||
    (mode === "upload" && uploadFiles.length > 0) ||
    (mode === "wordpress" && !!wpPreview.data);

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
            onClick={() => chooseMode(m.key)}
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
            {wpPreview.data && (
              <>
                : <span className="font-medium">{wpPreview.data.file_name}</span>
              </>
            )}
          </p>
        )}
      </div>

      {isDiffMode && releasePreview.isLoading && <LoadingState className="mt-3" />}
      {isDiffMode && releasePreview.isError && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          {releasePreview.error.message}
        </p>
      )}
      {mode === "wordpress" && wpPreview.isLoading && <LoadingState className="mt-3" />}
      {mode === "wordpress" && wpPreview.isError && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          {wpPreview.error.message}
        </p>
      )}

      {hasSource && (
        <div
          className="mt-3 flex gap-1 rounded-md p-1"
          style={{ background: "var(--surface-alt)" }}
        >
          {OPS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setOp(o.key)}
              className="flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors"
              style={
                op === o.key
                  ? { background: "var(--surface)", color: "var(--accent)" }
                  : { color: "var(--muted)" }
              }
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {isDiffMode && releasePreview.data && op === "merge" && (
        <div className="mt-3 space-y-2 text-sm">
          {releasePreview.data.name_conflicts > 0 && (
            <NameConflictPicker
              count={releasePreview.data.name_conflicts}
              value={onNameConflict}
              onChange={setOnNameConflict}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p style={{ color: "var(--muted)" }}>
              {releasePreview.data.to_add.toLocaleString()} not in draft ·{" "}
              {releasePreview.data.already_in.toLocaleString()} already in
            </p>
            <Button
              size="sm"
              onClick={() => mergeRelease.mutate()}
              disabled={releasePreview.data.to_add === 0}
              loading={mergeRelease.isPending}
            >
              Add {releasePreview.data.to_add.toLocaleString()} Files
            </Button>
          </div>
        </div>
      )}
      {isDiffMode && releasePreview.data && op === "replace-all" && (
        <div className="mt-3 space-y-2 text-sm">
          <div className="space-y-0.5" style={{ color: "var(--muted)" }}>
            <p>Replace the draft's entire contents with this release.</p>
            <p>New: {files(releasePreview.data.release_total)}.</p>
            <p>Removes the draft's current {files(releasePreview.data.draft_total)}.</p>
          </div>
          <div className="flex justify-end">
            <ConfirmReplaceButton
              label="Replace Draft Contents"
              onConfirm={() => replaceFromRelease.mutate()}
              loading={replaceFromRelease.isPending}
            />
          </div>
        </div>
      )}

      {mode === "upload" && uploadFiles.length > 0 && op === "merge" && (
        <div className="mt-3 space-y-2 text-sm">
          {sameNameCount > 0 && (
            <NameConflictPicker
              count={sameNameCount}
              value={onNameConflict}
              onChange={setOnNameConflict}
            />
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => upload.mutate()}
              loading={upload.isPending}
            >
              Upload {files(uploadFiles.length)}
            </Button>
          </div>
        </div>
      )}
      {mode === "upload" && uploadFiles.length > 0 && op === "replace-all" && (
        <div className="mt-3 space-y-2 text-sm">
          <p style={{ color: "var(--muted)" }}>
            Replace the draft's entire contents with these{" "}
            {files(uploadFiles.length)}. Everything currently in the draft is
            removed.
          </p>
          <div className="flex justify-end">
            <ConfirmReplaceButton
              label="Replace Draft Contents"
              onConfirm={() => upload.mutate()}
              loading={upload.isPending}
            />
          </div>
        </div>
      )}

      {mode === "wordpress" && wpPreview.data && op === "merge" && (
        <div className="mt-3 space-y-2 text-sm">
          {wpPreview.data.same_name_in_draft && (
            <NameConflictPicker
              count={1}
              value={onNameConflict}
              onChange={setOnNameConflict}
            />
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={() => wpPull.mutate()} loading={wpPull.isPending}>
              Pull from WordPress
            </Button>
          </div>
        </div>
      )}
      {mode === "wordpress" && wpPreview.data && op === "replace-all" && (
        <div className="mt-3 space-y-2 text-sm">
          <p style={{ color: "var(--muted)" }}>
            Replace the draft's entire contents with {wpPreview.data.file_name}.
            Everything currently in the draft is removed.
          </p>
          <div className="flex justify-end">
            <ConfirmReplaceButton
              label="Replace Draft Contents"
              onConfirm={() => wpPull.mutate()}
              loading={wpPull.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
}
