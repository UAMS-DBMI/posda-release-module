import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ActivitySource } from "@/components/ActivitySourcePicker";
import { draftFilesKey } from "@/components/DraftFileList";
import { draftSummaryKey } from "@/components/DraftSummary";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { extractApiError } from "@/lib/apiUtils";

type Summary = {
  source_series_count: number;
  draft_series_count: number;
  matching_series_count: number;
  changed_series_count: number;
  unchanged_series_count: number;
  new_series_count: number;
  draft_only_series_count: number;
  source_dicom_file_count: number;
  draft_dicom_file_count: number;
  source_non_dicom_file_count: number;
  draft_non_dicom_file_count: number;
  non_dicom_to_add: number;
};

function files(n: number): string {
  return `${n.toLocaleString()} file${n === 1 ? "" : "s"}`;
}

type Op = "merge" | "replace-all";

const OPS: { key: Op; label: string }[] = [
  { key: "merge", label: "Merge" },
  { key: "replace-all", label: "Replace all" },
];

function summaryKey(draftId: number, timepointId: number) {
  return ["draft-series-summary", draftId, timepointId] as const;
}

/** Bring an activity timepoint into the draft as a bulk operation on series
 *  (matched by SeriesInstanceUID) -- counts-driven so it scales. Merge adds new
 *  series and/or updates matching ones; Replace-all resets the draft to the
 *  timepoint. (Replace-specific mapping lands in a follow-up.) */
export default function DraftSeriesReconcile({
  draftId,
  datasetId,
  source,
}: {
  draftId: number;
  datasetId: string | undefined;
  source: ActivitySource;
}) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [op, setOp] = useState<Op>("merge");
  const [addNew, setAddNew] = useState(true);
  const [updateMatching, setUpdateMatching] = useState(true);
  const [includeNonDicom, setIncludeNonDicom] = useState(true);
  const [confirmReplace, setConfirmReplace] = useState(false);

  useEffect(() => {
    if (!confirmReplace) return;
    const t = setTimeout(() => setConfirmReplace(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReplace]);

  const summary = useQuery({
    queryKey: summaryKey(draftId, source.timepointId),
    queryFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/series-summary?compare_activity_id=${source.activityId}&compare_timepoint_id=${source.timepointId}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Could not load the comparison.");
      const json = (await res.json()) as { data: Summary };
      return json.data;
    },
  });

  function invalidateAfter() {
    void queryClient.invalidateQueries({ queryKey: draftSummaryKey(draftId) });
    void queryClient.invalidateQueries({ queryKey: draftFilesKey(draftId) });
    void queryClient.invalidateQueries({ queryKey: ["dataset-cycle", datasetId ?? ""] });
    void queryClient.invalidateQueries({ queryKey: ["draft-series-search", draftId] });
    void summary.refetch();
  }

  const merge = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/series/merge`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            compare_activity_id: source.activityId,
            compare_timepoint_id: source.timepointId,
            add_new: addNew,
            update_matching: updateMatching,
            include_non_dicom: includeNonDicom,
          }),
        },
      );
      if (!res.ok) throw new Error(extractApiError(await res.json(), "Could not merge."));
      return (await res.json()) as {
        data: { files_added: number; files_removed: number };
      };
    },
    onSuccess: (json) => {
      toastSuccess(
        addToast,
        `Merged — ${json.data.files_added.toLocaleString()} added, ${json.data.files_removed.toLocaleString()} removed.`,
      );
      invalidateAfter();
    },
    onError: (e) => toastError(addToast, e instanceof Error ? e.message : "Could not merge."),
  });

  const replaceAll = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/content/replace-all`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            compare_activity_id: source.activityId,
            compare_timepoint_id: source.timepointId,
          }),
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
      setConfirmReplace(false);
      invalidateAfter();
    },
    onError: (e) => {
      setConfirmReplace(false);
      toastError(addToast, e instanceof Error ? e.message : "Could not replace.");
    },
  });

  if (summary.isLoading) return <LoadingState className="mt-3" />;
  if (summary.isError) {
    return (
      <p className="mt-3 text-sm text-red-600 dark:text-red-400">
        Could not load the comparison.
      </p>
    );
  }
  if (!summary.data) return null;

  const s = summary.data;
  const mergeEnabled =
    (addNew && s.new_series_count > 0) ||
    (updateMatching && s.changed_series_count > 0) ||
    (includeNonDicom && s.non_dicom_to_add > 0);
  const draftTotal = s.draft_dicom_file_count;

  return (
    <div className="mt-3 space-y-3">
      <div className="flex gap-1 rounded-md p-1" style={{ background: "var(--surface-alt)" }}>
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

      {op === "merge" && (
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={addNew}
              onChange={(e) => setAddNew(e.target.checked)}
            />
            Add {s.new_series_count.toLocaleString()} new series not in the draft
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={updateMatching}
              onChange={(e) => setUpdateMatching(e.target.checked)}
            />
            Replace {s.changed_series_count.toLocaleString()} changed series with the
            timepoint's files
            {s.unchanged_series_count > 0 && (
              <span style={{ color: "var(--muted)" }}>
                ({s.unchanged_series_count.toLocaleString()} identical, skipped)
              </span>
            )}
          </label>
          {s.non_dicom_to_add > 0 && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeNonDicom}
                onChange={(e) => setIncludeNonDicom(e.target.checked)}
              />
              Add {s.non_dicom_to_add.toLocaleString()} non-DICOM file
              {s.non_dicom_to_add === 1 ? "" : "s"}
            </label>
          )}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {s.draft_only_series_count.toLocaleString()} draft series remain untouched
            </p>
            <Button
              size="sm"
              onClick={() => merge.mutate()}
              disabled={!mergeEnabled}
              loading={merge.isPending}
            >
              Apply Merge
            </Button>
          </div>
        </div>
      )}

      {op === "replace-all" && (
        <div className="space-y-2 text-sm">
          <div className="space-y-0.5" style={{ color: "var(--muted)" }}>
            <p>Replace the draft's entire contents with this timepoint.</p>
            <p>
              New: {files(s.source_dicom_file_count)} across{" "}
              {s.source_series_count.toLocaleString()} series
              {s.source_non_dicom_file_count > 0
                ? ` + ${files(s.source_non_dicom_file_count)} non-DICOM`
                : " (no non-DICOM)"}
              .
            </p>
            <p>
              Removes the draft's current {files(draftTotal)}
              {s.draft_non_dicom_file_count > 0
                ? ` + ${files(s.draft_non_dicom_file_count)} non-DICOM`
                : ""}
              .
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 dark:text-red-400"
              onClick={() =>
                confirmReplace ? replaceAll.mutate() : setConfirmReplace(true)
              }
              loading={replaceAll.isPending}
            >
              {confirmReplace ? "Confirm — replace everything?" : "Replace Draft Contents"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
