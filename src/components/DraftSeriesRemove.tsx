import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DraftSeriesFiles from "@/components/DraftSeriesFiles";
import { draftFilesKey } from "@/components/DraftFileList";
import { draftSummaryKey } from "@/components/DraftSummary";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { extractApiError } from "@/lib/apiUtils";

const LIMIT = 10;

type Series = {
  series_instance_uid: string;
  modality: string | null;
  series_number: number | null;
  series_description: string | null;
  patient_id: string | null;
  file_count: number;
};

type Criteria = {
  patient_id: string;
  study_instance_uid: string;
  series_instance_uid: string;
  sop_instance_uid: string;
  file_id: string;
};

const EMPTY: Criteria = {
  patient_id: "",
  study_instance_uid: "",
  series_instance_uid: "",
  sop_instance_uid: "",
  file_id: "",
};

const FIELDS: { key: keyof Criteria; label: string; placeholder: string }[] = [
  { key: "patient_id", label: "Patient", placeholder: "patient id" },
  { key: "study_instance_uid", label: "Study UID", placeholder: "study instance uid" },
  { key: "series_instance_uid", label: "Series UID", placeholder: "series instance uid" },
  { key: "sop_instance_uid", label: "SOP UID", placeholder: "sop instance uid" },
  { key: "file_id", label: "File ID", placeholder: "exact posda file id" },
];

function seriesLabel(s: Series): string {
  const head = [s.modality, s.series_number != null ? `#${s.series_number}` : null]
    .filter(Boolean)
    .join(" ");
  const name = head || "series";
  return s.series_description ? `${name} — ${s.series_description}` : name;
}

/** Search the draft's DICOM series by any combination of identifiers, then
 *  remove a whole series by UID. Nothing lists until a criterion is entered. */
export default function DraftSeriesRemove({
  draftId,
  datasetId,
}: {
  draftId: number;
  datasetId: string | undefined;
}) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<Criteria>(EMPTY);
  const [applied, setApplied] = useState<Criteria>(EMPTY);
  const [page, setPage] = useState(1);
  const [confirmUid, setConfirmUid] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ uid: string; label: string } | null>(null);

  // Debounce edits into the applied criteria; reset to page 1 on a new search.
  useEffect(() => {
    const t = setTimeout(() => {
      setApplied(fields);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [fields]);

  useEffect(() => {
    if (confirmUid === null) return;
    const t = setTimeout(() => setConfirmUid(null), 4000);
    return () => clearTimeout(t);
  }, [confirmUid]);

  const fileIdInvalid = applied.file_id !== "" && !/^\d+$/.test(applied.file_id.trim());
  const params = useMemo(() => {
    const p = new URLSearchParams({ scope: "draft", page: String(page), limit: String(LIMIT) });
    if (applied.patient_id) p.set("patient_id", applied.patient_id.trim());
    if (applied.study_instance_uid) p.set("study_instance_uid", applied.study_instance_uid.trim());
    if (applied.series_instance_uid) p.set("series_instance_uid", applied.series_instance_uid.trim());
    if (applied.sop_instance_uid) p.set("sop_instance_uid", applied.sop_instance_uid.trim());
    if (applied.file_id && !fileIdInvalid) p.set("file_id", applied.file_id.trim());
    return p;
  }, [applied, page, fileIdInvalid]);

  const hasCriteria =
    Object.values(applied).some((v) => v.trim() !== "") && !fileIdInvalid;

  const search = useQuery({
    queryKey: ["draft-series-search", draftId, params.toString()],
    enabled: hasCriteria,
    queryFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/series-search?${params.toString()}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Could not search series.");
      return (await res.json()) as { data: Series[]; meta: { total: number } };
    },
  });

  const remove = useMutation({
    mutationFn: async (uid: string) => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/series/remove`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ series_uids: [uid] }),
        },
      );
      if (!res.ok) {
        throw new Error(extractApiError(await res.json(), "Could not remove the series."));
      }
      return (await res.json()) as { data: { files_removed: number } };
    },
    onSuccess: (json) => {
      toastSuccess(
        addToast,
        `Series removed — ${json.data.files_removed.toLocaleString()} files.`,
      );
      setConfirmUid(null);
      void queryClient.invalidateQueries({ queryKey: draftSummaryKey(draftId) });
      void queryClient.invalidateQueries({ queryKey: draftFilesKey(draftId) });
      void queryClient.invalidateQueries({
        queryKey: ["dataset-cycle", datasetId ?? ""],
      });
      void queryClient.invalidateQueries({ queryKey: ["draft-series-search", draftId] });
    },
    onError: (e) => {
      setConfirmUid(null);
      toastError(addToast, e instanceof Error ? e.message : "Could not remove the series.");
    },
  });

  const total = search.data?.meta.total ?? 0;
  const rows = search.data?.data ?? [];
  const lastPage = Math.max(1, Math.ceil(total / LIMIT));

  if (detail) {
    return (
      <DraftSeriesFiles
        draftId={draftId}
        datasetId={datasetId}
        seriesUid={detail.uid}
        seriesLabel={detail.label}
        onBack={() => setDetail(null)}
        onChanged={() =>
          void queryClient.invalidateQueries({ queryKey: ["draft-series-search", draftId] })
        }
      />
    );
  }

  return (
    <div
      className="overflow-hidden rounded-md text-sm"
      style={{ border: "1px solid var(--border-strong)" }}
    >
      <div
        className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--muted)", background: "var(--surface-alt)" }}
      >
        Find & Remove DICOM Series
      </div>

      <div className="grid grid-cols-1 gap-x-3 gap-y-2 p-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-2">
            <span
              className="w-16 shrink-0 text-xs"
              style={{ color: "var(--muted)" }}
            >
              {f.label}
            </span>
            <input
              className="input h-8 min-w-0 flex-1 text-sm"
              placeholder={f.placeholder}
              value={fields[f.key]}
              onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
            />
          </label>
        ))}
      </div>

      {fileIdInvalid && (
        <p className="px-3 pb-2 text-xs text-red-600 dark:text-red-400">
          Posda File ID must be a number.
        </p>
      )}

      {!hasCriteria && (
        <p className="px-3 pb-3 text-sm" style={{ color: "var(--muted)" }}>
          Enter one or more identifiers above to find series. Matches on any
          combination; identifiers narrow the results.
        </p>
      )}

      {hasCriteria && (
        <>
          {search.isLoading && <LoadingState className="p-3" />}
          {search.isError && (
            <p className="p-3 text-sm text-red-600 dark:text-red-400">
              Could not search series.
            </p>
          )}
          {search.data && rows.length === 0 && (
            <p className="p-3 text-sm" style={{ color: "var(--muted)" }}>
              No series match your search.
            </p>
          )}

          {rows.length > 0 && (
            <ul className="divide-y border-t" style={{ borderColor: "var(--border)" }}>
              {rows.map((s) => {
                const removing =
                  remove.isPending && remove.variables === s.series_instance_uid;
                const armed = confirmUid === s.series_instance_uid;
                return (
                  <li
                    key={s.series_instance_uid}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setDetail({ uid: s.series_instance_uid, label: seriesLabel(s) })
                      }
                      className="min-w-0 flex-1 text-left"
                      title="View files in this series"
                    >
                      <div className="truncate hover:underline" style={{ color: "var(--accent)" }}>
                        {seriesLabel(s)}
                      </div>
                      <div className="truncate text-xs" style={{ color: "var(--muted)" }}>
                        {s.patient_id ? `patient ${s.patient_id} · ` : ""}
                        {s.file_count.toLocaleString()} files
                      </div>
                      <div
                        className="truncate text-xs"
                        style={{ color: "var(--muted)" }}
                        title={s.series_instance_uid}
                      >
                        Series: {s.series_instance_uid}
                      </div>
                    </button>
                    <button
                      type="button"
                      disabled={removing}
                      onClick={() =>
                        armed
                          ? remove.mutate(s.series_instance_uid)
                          : setConfirmUid(s.series_instance_uid)
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
                Page {page} of {lastPage} · {total.toLocaleString()} series
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
        </>
      )}
    </div>
  );
}
