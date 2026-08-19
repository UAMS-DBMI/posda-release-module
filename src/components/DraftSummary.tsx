import { Fragment, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import DraftFileList from "@/components/DraftFileList";
import { LoadingState } from "@/components/ui/Spinner";

type FileTypeSummary = {
  file_type: string;
  file_count: number;
  total_size_bytes: number;
};

type ModalitySummary = {
  modality: string;
  series_count: number;
  file_count: number;
};

export type DraftSummaryData = {
  draft_id: number;
  total_files: number;
  total_size_bytes: number;
  by_file_type: FileTypeSummary[];
  dicom: {
    patient_count: number;
    study_count: number;
    series_count: number;
    by_modality: ModalitySummary[];
  };
};

/** "1 File" / "2 Files" -- the stat line reads as prose, so a bare plural on a
 *  count of one looks wrong. Pass `plural` for irregular forms. */
function pluralize(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Query key for a draft's file summary -- exported so file mutations elsewhere
 *  can invalidate it. */
export function draftSummaryKey(draftId: number) {
  return ["draft-summary", draftId] as const;
}

export function useDraftSummary(draftId: number, enabled = true) {
  return useQuery({
    queryKey: draftSummaryKey(draftId),
    enabled,
    queryFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}/summary`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Could not load draft summary.");
      const json = (await res.json()) as { data: DraftSummaryData };
      return json.data;
    },
  });
}

/** One breakdown entry as a compact pill: bold label + muted detail. Chips wrap,
 *  so a long modality list stays a few lines tall with no inner scrollbar. */
function Chip({ label, detail }: { label: string; detail: string }) {
  return (
    <span
      className="inline-flex items-baseline gap-1.5 rounded-full px-2.5 py-1 text-xs"
      style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}
    >
      <span className="font-semibold">{label}</span>
      <span style={{ color: "var(--muted)" }}>{detail}</span>
    </span>
  );
}

/** Fixed-width label column + a wrapping chip area, so chips that wrap align
 *  under the first chip rather than flowing back under the label. */
function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span
        className="w-24 shrink-0 pt-1.5 text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** File / DICOM breakdown for a draft. Self-contained (fetches its own summary);
 *  rendered in the Assemble row's expanded detail. */
export default function DraftSummary({
  draftId,
  enabled = true,
}: {
  draftId: number;
  enabled?: boolean;
}) {
  const summary = useDraftSummary(draftId, enabled);

  if (summary.isLoading) return <LoadingState />;
  if (summary.isError) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        Could not load the file summary.
      </p>
    );
  }
  if (!summary.data) return null;

  const s = summary.data;
  const hasDicom = s.dicom.series_count > 0;

  const stats: [string, string][] = [
    [s.total_files.toLocaleString(), pluralize(s.total_files, "File")],
    [formatBytes(s.total_size_bytes), "Size"],
  ];
  if (hasDicom) {
    stats.push([
      s.dicom.patient_count.toLocaleString(),
      pluralize(s.dicom.patient_count, "Patient"),
    ]);
    stats.push([
      s.dicom.study_count.toLocaleString(),
      pluralize(s.dicom.study_count, "Study", "Studies"),
    ]);
    // "Series" is already both singular and plural.
    stats.push([s.dicom.series_count.toLocaleString(), "Series"]);
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-baseline">
        {stats.map(([value, label], i) => (
          <Fragment key={label}>
            {i > 0 && (
              <span className="mx-2" style={{ color: "var(--border-strong)" }}>
                ·
              </span>
            )}
            <span className="font-semibold">{value}</span>
            <span
              className="ml-1 text-xs uppercase tracking-wide"
              style={{ color: "var(--muted)" }}
            >
              {label}
            </span>
          </Fragment>
        ))}
      </div>

      {s.by_file_type.length > 0 && (
        <ChipRow label="File types">
          {s.by_file_type.map((ft) => (
            <Chip
              key={ft.file_type}
              label={ft.file_type}
              detail={`${ft.file_count.toLocaleString()} · ${formatBytes(ft.total_size_bytes)}`}
            />
          ))}
        </ChipRow>
      )}

      {hasDicom && s.dicom.by_modality.length > 0 && (
        <ChipRow label="Modalities">
          {s.dicom.by_modality.map((m) => (
            <Chip
              key={m.modality}
              label={m.modality}
              detail={`${m.series_count.toLocaleString()} series · ${m.file_count.toLocaleString()}`}
            />
          ))}
        </ChipRow>
      )}

      {/* Non-DICOM files have no modality/series to summarize by, so the name is
       *  the only identifier -- list them. Renders nothing when there are none,
       *  which is why it isn't gated on a count (the summary payload has no
       *  reliable non-DICOM count to gate on). */}
      <DraftFileList draftId={draftId} readOnly />
    </div>
  );
}
