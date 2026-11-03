import DynamicTable from "@/components/DynamicTable";
import { Button } from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { LoadingState } from "@/components/ui/Spinner";
import { useManifestPreview, type ManifestFormat } from "@/lib/manifestPreview";

/** Look at a generated manifest without downloading it. A one-row CSV (the
 *  dataset manifest: many long fields) reads as a field/value list, a longer
 *  one as a paged table, and anything else (NBIA's .tcia) as plain text. Only
 *  the start of a big file is read, and the modal says so. */
export default function ManifestPreviewModal({
  url,
  title,
  format = "csv",
  onClose,
}: {
  /** The manifest to show; null keeps the modal closed. */
  url: string | null;
  title: string;
  format?: ManifestFormat;
  onClose: () => void;
}) {
  const preview = useManifestPreview(url, format);
  const data = preview.data;

  return (
    <Modal
      open={url !== null}
      onClose={onClose}
      size="2xl"
      title={title}
      footer={
        <>
          {url && (
            <a className="btn btn-ghost btn-md" href={url} download>
              Download
            </a>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="mt-3">
        {preview.isLoading && <LoadingState />}
        {preview.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Could not load this manifest.
          </p>
        )}

        {data?.format === "text" && (
          <pre
            className="max-h-[60vh] overflow-auto rounded-md p-3 font-mono text-xs"
            style={{ background: "var(--surface-alt)" }}
          >
            {data.text}
          </pre>
        )}

        {data?.format === "csv" && data.rows.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            This manifest has no rows.
          </p>
        )}

        {data?.format === "csv" && data.rows.length === 1 && (
          <dl className="grid max-h-[60vh] grid-cols-[auto_1fr] gap-x-6 gap-y-2 overflow-auto text-sm">
            {data.headers.map((header) => (
              <div key={header} className="contents">
                <dt className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                  {header}
                </dt>
                <dd className="whitespace-pre-wrap break-words">
                  {data.rows[0][header] || "—"}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {data?.format === "csv" && data.rows.length > 1 && (
          // One scrolling list rather than pages: the header stays pinned and
          // there's no pager to scroll down to.
          <DynamicTable
            rows={data.rows}
            getRowKey={(_row, index) => index}
            hideSummary
            scroll={{ mode: "content", maxVisibleRows: 16 }}
            columns={data.headers.map((header) => ({
              key: header,
              label: header,
              render: (value: unknown) => (
                <span className="block max-w-xs truncate" title={String(value)}>
                  {String(value) || "—"}
                </span>
              ),
            }))}
          />
        )}

        {data?.truncated ? (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            {data.format === "csv"
              ? `Showing the first ${data.rows.length.toLocaleString()} rows — download for the full file.`
              : "Showing the start of the file — download for the full file."}
          </p>
        ) : (
          data?.format === "csv" &&
          data.rows.length > 1 && (
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              {data.rows.length.toLocaleString()} rows
            </p>
          )
        )}
      </div>
    </Modal>
  );
}
