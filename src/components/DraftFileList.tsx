import { useQuery } from "@tanstack/react-query";
import { LoadingState } from "@/components/ui/Spinner";

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

/** Scrollable list of a draft's non-DICOM files by name -- DICOM files are
 *  covered by the summary's modality breakdown, not their (meaningless) names. */
export default function DraftFileList({ draftId }: { draftId: number }) {
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
        {files.data.map((f) => (
          <li
            key={f.recordset_draft_file_id}
            className="flex items-center justify-between gap-3 px-3 py-1.5"
          >
            <span className="truncate">{f.file_name ?? `file #${f.file_id}`}</span>
            <span className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
              {f.size != null ? formatBytes(f.size) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
