import { useEffect, useState } from "react";
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
import {
  pullWpFileToDraft,
  uploadFilesToDraft,
  type DraftAddMode,
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
 *  merge into the draft or replace its entire contents; uploads and the WP
 *  pull can also replace draft files that share a name. Bulk only -- per-file
 *  selection is the (still-held) file browser. */
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
  const [replaceSameName, setReplaceSameName] = useState(true);
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

  // Folder uploads carry a relative subpath; that is the name they're stored under.
  const uploadNames = uploadFiles.map((f) => f.webkitRelativePath || f.name);
  const nameMatches = useNameMatches(draftId, mode === "upload" ? uploadNames : []);
  const sameNameCount = nameMatches.data?.length ?? 0;
  const wpPreview = useWpPreview(draftId, mode === "wordpress");

  // The mode for an upload / WP pull, from the Merge / Replace-all choice.
  function addMode(sameNameAvailable: boolean): DraftAddMode {
    if (op === "replace-all") return "replace_all";
    return replaceSameName && sameNameAvailable ? "replace_same_name" : "add";
  }

  function chooseMode(m: Mode) {
    setMode(m);
    setOp("merge");
  }

  function invalidateAfterChange() {
    void queryClient.invalidateQueries({ queryKey: draftSummaryKey(draftId) });
    void queryClient.invalidateQueries({ queryKey: draftFilesKey(draftId) });
    void queryClient.invalidateQueries({
      queryKey: ["dataset-cycle", datasetId ?? ""],
    });
    void queryClient.invalidateQueries({ queryKey: ["draft-name-matches", draftId] });
    void queryClient.invalidateQueries({ queryKey: ["draft-wp-preview", draftId] });
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
      void diff.refetch();
    },
    onError: (e) =>
      toastError(addToast, e instanceof Error ? e.message : "Could not replace."),
  });

  const upload = useMutation({
    mutationFn: () => uploadFilesToDraft(draftId, uploadFiles, addMode(sameNameCount > 0)),
    onSuccess: (count) => {
      toastSuccess(addToast, `Uploaded ${count.toLocaleString()} files.`);
      setUploadFiles([]);
      invalidateAfterChange();
    },
    onError: (e) =>
      toastError(addToast, e instanceof Error ? e.message : "Could not upload files."),
  });

  const wpPull = useMutation({
    mutationFn: () =>
      pullWpFileToDraft(draftId, addMode(!!wpPreview.data?.same_name_in_draft)),
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
    (mode === "release" && !!diff.data) ||
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

      {isDiffMode && diff.isLoading && <LoadingState className="mt-3" />}
      {isDiffMode && diff.isError && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          Could not load diff.
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

      {isDiffMode && diff.data && op === "merge" && (
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
      {isDiffMode && diff.data && op === "replace-all" && (
        <div className="mt-3 space-y-2 text-sm">
          <div className="space-y-0.5" style={{ color: "var(--muted)" }}>
            <p>Replace the draft's entire contents with this release.</p>
            <p>
              New: {files(diff.data.removed_count + diff.data.unchanged_count)}.
            </p>
            <p>
              Removes the draft's current{" "}
              {files(diff.data.unchanged_count + diff.data.added_count)}.
            </p>
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
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={replaceSameName}
                onChange={(e) => setReplaceSameName(e.target.checked)}
              />
              Replace {sameNameCount.toLocaleString()} same-name file
              {sameNameCount === 1 ? "" : "s"} in the draft
            </label>
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
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={replaceSameName}
                onChange={(e) => setReplaceSameName(e.target.checked)}
              />
              Replace the draft's {wpPreview.data.file_name}
            </label>
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
