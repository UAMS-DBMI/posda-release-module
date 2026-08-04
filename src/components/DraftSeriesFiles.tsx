import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { draftFilesKey } from "@/components/DraftFileList";
import { draftSummaryKey } from "@/components/DraftSummary";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { extractApiError } from "@/lib/apiUtils";

const LIMIT = 10;

type FileRow = {
  recordset_draft_file_id: number;
  file_id: number;
  sop_instance_uid: string | null;
};

/** Detail pane of the series drill-in: the files of one draft series, each
 *  removable individually. Swaps in over the series results (no nested list),
 *  so the modal stays compact. */
export default function DraftSeriesFiles({
  draftId,
  datasetId,
  seriesUid,
  seriesLabel,
  onBack,
  onChanged,
}: {
  draftId: number;
  datasetId: string | undefined;
  seriesUid: string;
  seriesLabel: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  useEffect(() => {
    if (confirmId === null) return;
    const t = setTimeout(() => setConfirmId(null), 4000);
    return () => clearTimeout(t);
  }, [confirmId]);

  const filesKey = ["draft-series-files", draftId, seriesUid, page] as const;
  const files = useQuery({
    queryKey: filesKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        scope: "draft",
        granularity: "files",
        series_instance_uid: seriesUid,
        page: String(page),
        limit: String(LIMIT),
      });
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/series-search?${params.toString()}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Could not load series files.");
      return (await res.json()) as { data: FileRow[]; meta: { total: number } };
    },
  });

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: draftSummaryKey(draftId) });
    void queryClient.invalidateQueries({ queryKey: draftFilesKey(draftId) });
    void queryClient.invalidateQueries({ queryKey: ["dataset-cycle", datasetId ?? ""] });
    void queryClient.invalidateQueries({ queryKey: ["draft-series-files", draftId, seriesUid] });
    onChanged();
  }

  const removeFile = useMutation({
    mutationFn: async (rdfId: number) => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/files/remove`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ recordset_draft_file_ids: [rdfId] }),
        },
      );
      if (!res.ok) {
        throw new Error(extractApiError(await res.json(), "Could not remove the file."));
      }
    },
    onSuccess: () => {
      toastSuccess(addToast, "File removed.");
      setConfirmId(null);
      invalidateAll();
    },
    onError: (e) => {
      setConfirmId(null);
      toastError(addToast, e instanceof Error ? e.message : "Could not remove the file.");
    },
  });

  const removeSeries = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/series/remove`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ series_uids: [seriesUid] }),
        },
      );
      if (!res.ok) {
        throw new Error(extractApiError(await res.json(), "Could not remove the series."));
      }
      return (await res.json()) as { data: { files_removed: number } };
    },
    onSuccess: (json) => {
      toastSuccess(addToast, `Series removed — ${json.data.files_removed.toLocaleString()} files.`);
      invalidateAll();
      onBack();
    },
    onError: (e) =>
      toastError(addToast, e instanceof Error ? e.message : "Could not remove the series."),
  });

  const total = files.data?.meta.total ?? 0;
  const rows = files.data?.data ?? [];
  const lastPage = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div
      className="overflow-hidden rounded-md text-sm"
      style={{ border: "1px solid var(--border-strong)" }}
    >
      <div
        className="flex items-center justify-between gap-3 px-3 py-1.5"
        style={{ background: "var(--surface-alt)" }}
      >
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 text-xs font-medium hover:underline"
          style={{ color: "var(--accent)" }}
        >
          ← Back to results
        </button>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600 dark:text-red-400"
          onClick={() => removeSeries.mutate()}
          loading={removeSeries.isPending}
        >
          Remove entire series
        </Button>
      </div>

      <div className="truncate px-3 py-2" title={seriesLabel}>
        {seriesLabel}
        <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
          {total.toLocaleString()} files
        </span>
      </div>

      {files.isLoading && <LoadingState className="p-3" />}
      {files.isError && (
        <p className="p-3 text-sm text-red-600 dark:text-red-400">
          Could not load series files.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="divide-y border-t" style={{ borderColor: "var(--border)" }}>
          {rows.map((f) => {
            const removing =
              removeFile.isPending && removeFile.variables === f.recordset_draft_file_id;
            const armed = confirmId === f.recordset_draft_file_id;
            return (
              <li
                key={f.recordset_draft_file_id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate" title={f.sop_instance_uid ?? undefined}>
                    SOP: {f.sop_instance_uid ?? "—"}
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    File: {f.file_id}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={removing}
                  onClick={() =>
                    armed
                      ? removeFile.mutate(f.recordset_draft_file_id)
                      : setConfirmId(f.recordset_draft_file_id)
                  }
                  className="shrink-0 text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                >
                  {removing ? "Removing…" : armed ? "Confirm remove?" : "Remove"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {total > LIMIT && (
        <div
          className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs"
          style={{ color: "var(--muted)", borderTop: "1px solid var(--border)" }}
        >
          <span>
            Page {page} of {lastPage}
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= lastPage}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}
