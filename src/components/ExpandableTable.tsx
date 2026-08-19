import { Fragment, type Key, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

const TH =
  "px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-white";

/** Controlled paging. The caller owns page state; rows may be either the whole
 *  list (windowed here) or one server-sent page (passed through), matching
 *  `DynamicTable`'s behaviour. */
export type ExpandableTablePagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
};

type ExpandableTableProps<T> = {
  /** Column headers, excluding the leading chevron column. */
  headers: ReactNode[];
  rows: T[];
  getRowKey: (row: T) => Key;
  /** Cells for one row, excluding the chevron cell. */
  renderCells: (row: T) => ReactNode;
  /** Contents of the full-width detail row when expanded. */
  renderExpanded: (row: T) => ReactNode;
  /** Rows without a chevron at all. Defaults to every row expandable. */
  canExpand?: (row: T) => boolean;
  /** Noun for the chevron tooltip: "contents" -> "Show contents". */
  expandLabel?: string;
  expandedKey: Key | null;
  onExpandedKeyChange: (key: Key | null) => void;
  pagination?: ExpandableTablePagination;
  emptyMessage?: ReactNode;
};

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="currentColor"
      aria-hidden
      style={{
        transform: expanded ? "rotate(90deg)" : "none",
        transition: "transform 100ms",
      }}
    >
      <path d="M5 3l14 9-14 9z" />
    </svg>
  );
}

/** A `.data-table` whose rows expand into a full-width detail row. Extracted
 *  from the Assemble and Verify stages, which hand-rolled the same chevron +
 *  expand-row scaffold; `DynamicTable` is column-config only and deliberately
 *  not taught row expansion (it is used app-wide). */
export default function ExpandableTable<T>({
  headers,
  rows,
  getRowKey,
  renderCells,
  renderExpanded,
  canExpand,
  expandLabel = "contents",
  expandedKey,
  onExpandedKeyChange,
  pagination,
  emptyMessage,
}: ExpandableTableProps<T>) {
  const colSpan = headers.length + 1;

  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.totalItems / pagination.pageSize))
    : 1;
  const page = pagination
    ? Math.min(Math.max(1, pagination.page), totalPages)
    : 1;

  // The server returns one page when it honours page/limit, and everything
  // when it doesn't -- window locally only in the latter case.
  const serverPaged = pagination
    ? pagination.totalItems > rows.length
    : false;
  const visibleRows =
    pagination && !serverPaged
      ? rows.slice((page - 1) * pagination.pageSize, page * pagination.pageSize)
      : rows;

  if (rows.length === 0 && emptyMessage) {
    return <p className="text-sm">{emptyMessage}</p>;
  }

  return (
    <div>
      {pagination?.onPageSizeChange && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-3 text-sm text-muted">
          <label className="inline-flex items-center gap-2 whitespace-nowrap">
            <span>Items per page</span>
            <select
              className="select"
              value={pagination.pageSize}
              onChange={(e) => pagination.onPageSizeChange?.(Number(e.target.value))}
            >
              {(pagination.pageSizeOptions ?? [4, 10, 25, 50]).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="data-table min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-accent">
              <th className="w-10 px-2 py-1" />
              {headers.map((h, i) => (
                <th key={i} className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const key = getRowKey(row);
              const expandable = canExpand ? canExpand(row) : true;
              const expanded = expandable && expandedKey === key;

              return (
                <Fragment key={key}>
                  <tr className="table-row">
                    <td className="px-1 py-1">
                      {expandable && (
                        <button
                          type="button"
                          onClick={() => onExpandedKeyChange(expanded ? null : key)}
                          className="flex h-7 w-7 items-center justify-center rounded hover:bg-(--surface-alt)"
                          style={{ color: "var(--muted)" }}
                          title={`${expanded ? "Hide" : "Show"} ${expandLabel}`}
                        >
                          <Chevron expanded={expanded} />
                        </button>
                      )}
                    </td>
                    {renderCells(row)}
                  </tr>
                  {expanded && (
                    <tr>
                      <td
                        colSpan={colSpan}
                        className="px-4 py-3"
                        style={{
                          background: "var(--surface)",
                          borderTop: "1px solid var(--border-strong)",
                        }}
                      >
                        {renderExpanded(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination && totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted">
          <p>
            Page {page} of {totalPages}
          </p>
          <div className="inline-flex items-center gap-2">
            <Button
              type="button"
              onClick={() => pagination.onPageChange(page - 1)}
              disabled={page <= 1}
              variant="ghost"
              size="sm"
            >
              Previous
            </Button>
            <Button
              type="button"
              onClick={() => pagination.onPageChange(page + 1)}
              disabled={page >= totalPages}
              variant="ghost"
              size="sm"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
