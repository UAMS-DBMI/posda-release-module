import DynamicTable from "@/components/DynamicTable";
import { DownloadIcon } from "@/components/icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState } from "@/components/ui/Spinner";
import { qcFileDownloadUrl, useReviewFiles } from "@/lib/useQc";

/** A non-DICOM review's files with their status and a download link: one
 *  slice's in the Review modal, the whole review's (with a Slice column) in the
 *  Manage modal and on the review-detail page. */
export default function QcFileList({
  reviewId,
  assignmentId,
  showSlice = false,
}: {
  reviewId: string;
  assignmentId?: number;
  showSlice?: boolean;
}) {
  const files = useReviewFiles(reviewId, assignmentId);

  if (files.isLoading) return <LoadingState />;
  if (files.isError) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">Could not load files.</p>
    );
  }
  const rows = files.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        No files.
      </p>
    );
  }

  return (
    <DynamicTable
      rows={rows}
      getRowKey={(row) => row.qc_unit_id}
      hideSummary
      columns={[
        {
          key: "file_name",
          label: "File",
          render: (v, row) => (v ? String(v) : `File ${row.file_id}`),
        },
        ...(showSlice
          ? [
              {
                key: "assignment_id" as const,
                label: "Slice",
                render: (v: unknown) => (v != null ? `#${v}` : "—"),
              },
            ]
          : []),
        {
          key: "qc_status",
          label: "Status",
          render: (v) => <StatusBadge status={String(v)} />,
        },
        {
          key: "file_id",
          label: "",
          sortable: false,
          render: (_v, row) => (
            // Plain anchor: `download` on a same-origin href saves the file,
            // and its value names it (the raw route sends no filename).
            <a
              className="btn btn-sm btn-ghost px-2"
              href={qcFileDownloadUrl(row.file_id)}
              download={row.file_name ?? ""}
              aria-label={`Download ${row.file_name ?? "file"}`}
              title="Download"
            >
              <DownloadIcon />
            </a>
          ),
        },
      ]}
    />
  );
}
