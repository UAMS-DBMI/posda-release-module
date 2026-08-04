import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { draftSummaryKey } from "@/components/DraftSummary";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { extractApiError } from "@/lib/apiUtils";

type DraftFile = {
  recordset_draft_file_id: number;
  file_id: number;
  file_name: string | null;
  size: number | null;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Query key for a draft's non-DICOM file list -- exported so file mutations can
 *  invalidate it alongside the summary. */
export function draftFilesKey(draftId: number) {
  return ["draft-files", draftId, "non-dicom"] as const;
}

/** Scrollable, editable list of a draft's non-DICOM files by name. DICOM files
 *  are covered by the summary's modality breakdown, not their (meaningless)
 *  names -- and DICOM edits are per-series, handled elsewhere. Replace a file by
 *  removing it here, then adding its replacement below. */
export default function DraftFileList({
  draftId,
  datasetId,
}: {
  draftId: number;
  datasetId: string | undefined;
}) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<number | null>(null);

  // A primed remove reverts on its own so a stray first click can't linger.
  useEffect(() => {
    if (confirmId === null) return;
    const t = setTimeout(() => setConfirmId(null), 4000);
    return () => clearTimeout(t);
  }, [confirmId]);

  const files = useQuery({
    queryKey: draftFilesKey(draftId),
    queryFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/files?dicom=false`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Could not load files.");
      const json = (await res.json()) as { data: DraftFile[] };
      return json.data;
    },
  });

  const remove = useMutation({
    mutationFn: async (recordsetDraftFileId: number) => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/files/remove`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            recordset_draft_file_ids: [recordsetDraftFileId],
          }),
        },
      );
      if (!res.ok) {
        throw new Error(
          extractApiError(await res.json(), "Could not remove the file."),
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: draftFilesKey(draftId) });
      void queryClient.invalidateQueries({ queryKey: draftSummaryKey(draftId) });
      void queryClient.invalidateQueries({
        queryKey: ["dataset-cycle", datasetId ?? ""],
      });
      setConfirmId(null);
      toastSuccess(addToast, "File removed.");
    },
    onError: (e) => {
      setConfirmId(null);
      toastError(addToast, e instanceof Error ? e.message : "Could not remove the file.");
    },
  });

  if (files.isLoading) return <LoadingState />;
  if (files.isError) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        Could not load the file list.
      </p>
    );
  }
  if (!files.data || files.data.length === 0) return null;

  return (
    <div
      className="overflow-hidden rounded-md text-sm"
      style={{ border: "1px solid var(--border-strong)" }}
    >
      <div
        className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--muted)", background: "var(--surface-alt)" }}
      >
        Non-DICOM Files ({files.data.length.toLocaleString()})
      </div>
      <ul className="max-h-52 divide-y overflow-y-auto" style={{ borderColor: "var(--border)" }}>
        {files.data.map((f) => {
          const removing =
            remove.isPending && remove.variables === f.recordset_draft_file_id;
          const armed = confirmId === f.recordset_draft_file_id;
          return (
            <li
              key={f.recordset_draft_file_id}
              className="flex items-center justify-between gap-3 px-3 py-1.5"
            >
              <span className="truncate">{f.file_name ?? `file #${f.file_id}`}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {f.size != null ? formatBytes(f.size) : "—"}
                </span>
                <button
                  type="button"
                  disabled={removing}
                  onClick={() =>
                    armed
                      ? remove.mutate(f.recordset_draft_file_id)
                      : setConfirmId(f.recordset_draft_file_id)
                  }
                  className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                >
                  {removing ? "Removing…" : armed ? "Confirm remove?" : "Remove"}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
