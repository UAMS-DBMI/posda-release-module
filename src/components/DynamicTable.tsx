import { ReactNode, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";

type RowLike = Record<string, unknown>;

export type DynamicTableColumn<T extends RowLike> = {
  key: keyof T & string;
  label?: string;
  render?: (value: unknown, row: T) => ReactNode;
  sortable?: boolean;
};

export type DynamicTablePagination = {
  defaultItemsPerPage?: number;
  totalItems?: number;
  page?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

export type DynamicTableScroll = {
  mode?: "none" | "content";
  maxVisibleRows?: number;
};

type DynamicTableProps<T extends RowLike> = {
  // Data
  rows: T[];
  // Columns
  columns?: Array<DynamicTableColumn<T>>;
  excludeKeys?: Array<keyof T & string>;
  // Appearance & Behavior
  emptyMessage?: string;
  formatters?: Partial<
    Record<keyof T & string, (value: unknown, row: T) => ReactNode>
  >;
  onRowClick?: (row: T) => void;
  getRowKey?: (row: T, index: number) => string | number;
  // Pagination & Scrolling
  // Pagination is enabled when the config is provided.
  pagination?: DynamicTablePagination;
  // Scrolling applies only when pagination is disabled.
  scroll?: DynamicTableScroll;
};

function toLabel(raw: string) {
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function defaultFormat(value: unknown): ReactNode {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function compareValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export default function DynamicTable<T extends RowLike>({
  rows,
  columns,
  emptyMessage = "No rows.",
  pagination,
  scroll,
  formatters,
  excludeKeys,
  onRowClick,
  getRowKey,
}: DynamicTableProps<T>) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">{emptyMessage}</p>;
  }

  const blocked = new Set<string>(excludeKeys ?? []);
  const inferredColumns: Array<DynamicTableColumn<T>> = (
    Object.keys(rows[0]).filter((key) => !blocked.has(key)) as Array<
      keyof T & string
    >
  ).map((key) => ({ key }));
  const resolvedColumns: Array<DynamicTableColumn<T>> =
    columns ?? inferredColumns;

  const safeDefaultItemsPerPage =
    Number.isFinite(pagination?.defaultItemsPerPage) &&
    (pagination?.defaultItemsPerPage ?? 0) > 0
      ? Math.floor(pagination?.defaultItemsPerPage ?? 4)
      : 4;

  const paginationEnabled = Boolean(pagination);
  const itemsPerPageOptions = pagination?.pageSizeOptions;
  const scrollMode = scroll?.mode ?? "none";
  const scrollMaxVisibleRows = scroll?.maxVisibleRows;

  const pageSizeOptions = useMemo(() => {
    const source =
      itemsPerPageOptions && itemsPerPageOptions.length > 0
        ? itemsPerPageOptions
        : [4, 10, 25, 50, 100];

    const cleaned = source
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.floor(value));

    const uniqueSorted = [...new Set(cleaned)].sort((a, b) => a - b);
    if (!uniqueSorted.includes(safeDefaultItemsPerPage)) {
      uniqueSorted.push(safeDefaultItemsPerPage);
      uniqueSorted.sort((a, b) => a - b);
    }

    return uniqueSorted;
  }, [itemsPerPageOptions, safeDefaultItemsPerPage]);

  const [internalItemsPerPage, setInternalItemsPerPage] = useState<number>(
    safeDefaultItemsPerPage,
  );
  const [internalCurrentPage, setInternalCurrentPage] = useState<number>(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const cmp = compareValues(a[sortKey], b[sortKey]);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const resolvedItemsPerPage = pagination?.pageSize ?? internalItemsPerPage;
  const resolvedCurrentPage = pagination?.page ?? internalCurrentPage;
  const resolvedTotalItems = pagination?.totalItems ?? sortedRows.length;
  const totalPages = paginationEnabled
    ? Math.max(1, Math.ceil(resolvedTotalItems / resolvedItemsPerPage))
    : 1;
  const currentPageSafe = paginationEnabled
    ? Math.min(resolvedCurrentPage, totalPages)
    : 1;
  const startIndex = paginationEnabled
    ? (currentPageSafe - 1) * resolvedItemsPerPage
    : 0;
  const endIndex = paginationEnabled
    ? startIndex + resolvedItemsPerPage
    : sortedRows.length;
  const isServerPaged =
    paginationEnabled &&
    typeof pagination?.totalItems === "number" &&
    pagination.totalItems > sortedRows.length;
  const visibleRows = paginationEnabled
    ? isServerPaged
      ? sortedRows
      : sortedRows.slice(startIndex, endIndex)
    : sortedRows;

  const showingStart =
    visibleRows.length > 0 ? (paginationEnabled ? startIndex + 1 : 1) : 0;
  const showingEnd = paginationEnabled
    ? Math.min(startIndex + visibleRows.length, resolvedTotalItems)
    : visibleRows.length;
  const showingTotal = paginationEnabled
    ? resolvedTotalItems
    : visibleRows.length;

  const hasScrollableRows =
    !paginationEnabled &&
    scrollMode === "content" &&
    typeof scrollMaxVisibleRows === "number" &&
    Number.isFinite(scrollMaxVisibleRows) &&
    scrollMaxVisibleRows > 0;
  const tableViewportMaxHeight = hasScrollableRows
    ? `${Math.floor(scrollMaxVisibleRows) * 41}px`
    : undefined;

  function updatePage(nextPage: number) {
    const clampedPage = Math.max(1, Math.min(totalPages, nextPage));
    setInternalCurrentPage(clampedPage);
    pagination?.onPageChange?.(clampedPage);
  }

  function updateItemsPerPage(nextItemsPerPage: number) {
    setInternalItemsPerPage(nextItemsPerPage);
    setInternalCurrentPage(1);
    pagination?.onPageSizeChange?.(nextItemsPerPage);
    pagination?.onPageChange?.(1);
  }

  function handleSortClick(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setInternalCurrentPage(1);
    pagination?.onPageChange?.(1);
  }

  function SortIndicator({ colKey }: { colKey: string }) {
    if (sortKey !== colKey) {
      return <span className="ml-1 opacity-30">↕</span>;
    }
    return (
      <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
    );
  }

  function renderHeader(column: DynamicTableColumn<T>) {
    const isSortable = column.sortable !== false;
    const label = column.label ?? toLabel(column.key);
    if (!isSortable) {
      return (
        <th
          key={column.key}
          className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-white"
        >
          {label}
        </th>
      );
    }
    return (
      <th
        key={column.key}
        className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-white"
      >
        <button
          type="button"
          onClick={() => handleSortClick(column.key)}
          className="inline-flex cursor-pointer items-center hover:opacity-80"
        >
          {label}
          <SortIndicator colKey={column.key} />
        </button>
      </th>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <p>
          Showing {showingStart}-{showingEnd} of {showingTotal}
        </p>

        {paginationEnabled && (
          <label className="inline-flex items-center gap-2 whitespace-nowrap">
            <span className="whitespace-nowrap">Items per page</span>
            <select
              value={resolvedItemsPerPage}
              onChange={(event) => {
                const nextSize = Number(event.target.value);
                updateItemsPerPage(nextSize);
              }}
              className="select select-sm w-auto! min-w-20 shrink-0"
              style={{ background: "var(--background)" }}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {hasScrollableRows ? (
        <div
          className="overflow-auto"
          style={{ maxHeight: tableViewportMaxHeight }}
        >
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="sticky top-0">
              <tr className="bg-accent">
                {resolvedColumns.map((column) => renderHeader(column))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr
                  title={onRowClick ? "Click to view details" : undefined}
                  key={
                    getRowKey
                      ? getRowKey(row, startIndex + index)
                      : startIndex + index
                  }
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={
                    onRowClick
                      ? "table-row-clickable border-b border-black/5 dark:border-white/5"
                      : "table-row border-b border-black/5 dark:border-white/5"
                  }
                >
                  {resolvedColumns.map((column) => {
                    const rawValue = row[column.key];
                    const formatter = column.render ?? formatters?.[column.key];

                    return (
                      <td key={column.key} className="px-2 py-2">
                        {formatter
                          ? formatter(rawValue, row)
                          : defaultFormat(rawValue)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-accent">
                {resolvedColumns.map((column) => renderHeader(column))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr
                  title={onRowClick ? "Click to view details" : undefined}
                  key={
                    getRowKey
                      ? getRowKey(row, startIndex + index)
                      : startIndex + index
                  }
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={
                    onRowClick
                      ? "table-row-clickable border-b border-black/5 dark:border-white/5"
                      : "table-row border-b border-black/5 dark:border-white/5"
                  }
                >
                  {resolvedColumns.map((column) => {
                    const rawValue = row[column.key];
                    const formatter = column.render ?? formatters?.[column.key];

                    return (
                      <td key={column.key} className="px-2 py-2">
                        {formatter
                          ? formatter(rawValue, row)
                          : defaultFormat(rawValue)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginationEnabled && totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted">
          <p>
            Page {currentPageSafe} of {totalPages}
          </p>

          <div className="inline-flex items-center gap-2">
            <Button
              type="button"
              onClick={() => updatePage(currentPageSafe - 1)}
              disabled={currentPageSafe <= 1}
              variant="ghost"
              size="sm"
            >
              Previous
            </Button>
            <Button
              type="button"
              onClick={() => updatePage(currentPageSafe + 1)}
              disabled={currentPageSafe >= totalPages}
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
