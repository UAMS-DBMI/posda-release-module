import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DynamicForm, { DynamicFormField } from "@/components/DynamicForm";
import DynamicTable from "@/components/DynamicTable";
import { Button, LinkButton } from "@/components/ui/Button";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { SectionCard } from "@/components/ui/Card";
import { papiUrl } from "@/lib/papi";

type Recordset = {
  recordset_id: number;
  recordset_doi: string | null;
  dataset_id: number;
  dataset_name?: string;
  license_id: number;
  license_label?: string;
  license_url?: string;
  is_public_access?: boolean;
  recordset_type_id: number;
  recordset_type_name?: string;
  recordset_name?: string;
  active: boolean;
  when_created?: string;
  who_created?: string;
  when_updated?: string;
  who_updated?: string;
};

type RecordsetsResponse = {
  recordsets: Recordset[];
  total: number;
  timestamp: string;
};

type RecordsetFilters = {
  search: string;
  activeOnly: boolean;
  datasetId: string;
};

type Dataset = {
  dataset_id: number;
  dataset_name: string;
};

function extractArray<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const source = payload as Record<string, unknown>;

  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value as T[];
    }
  }

  return [];
}

function normalizeRecordsetsResponse(payload: unknown): RecordsetsResponse {
  const source = payload as
    | {
        recordsets?: Recordset[];
        total?: number;
        timestamp?: string;
        data?: Recordset[];
        meta?: { count?: number };
      }
    | undefined;

  const recordsets = Array.isArray(source?.recordsets)
    ? source.recordsets
    : Array.isArray(source?.data)
      ? source.data
      : [];

  return {
    recordsets,
    total:
      typeof source?.total === "number"
        ? source.total
        : typeof source?.meta?.count === "number"
          ? source.meta.count
          : recordsets.length,
    timestamp:
      typeof source?.timestamp === "string"
        ? source.timestamp
        : new Date().toISOString(),
  };
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }

  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return "-";
  }

  return new Date(time).toLocaleString();
}

export default function RecordsetsList() {
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [filtersInput, setFiltersInput] = useState<RecordsetFilters>({
    search: "",
    activeOnly: true,
    datasetId: "",
  });

  const [filters, setFilters] = useState<RecordsetFilters>({
    search: "",
    activeOnly: true,
    datasetId: "",
  });

  const [data, setData] = useState<RecordsetsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  async function loadRecordsets() {
    setIsLoading(true);
    setError(null);

    try {
      const apiParams = new URLSearchParams();

      if (filters.search.trim()) {
        apiParams.set("search", filters.search.trim());
      }

      if (filters.activeOnly) {
        apiParams.set("active_only", "true");
      }

      if (filters.datasetId) {
        apiParams.set("dataset_id", filters.datasetId);
      }

      apiParams.set("page", String(currentPage));
      apiParams.set("limit", String(itemsPerPage));

      const apiUrlStr = `${papiUrl("distribution/recordsets")}?${apiParams.toString()}`;

      const response = await fetch(apiUrlStr, { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Request failed");
      }

      const json = (await response.json()) as unknown;
      const normalized = normalizeRecordsetsResponse(json);
      setData(normalized);
    } catch {
      setError("Could not load recordsets.");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCurrentPage(1);
    setFilters(filtersInput);
  }

  function clearFilters() {
    setFiltersInput({ search: "", activeOnly: false, datasetId: "" });
    setCurrentPage(1);
    setFilters({ search: "", activeOnly: false, datasetId: "" });
  }

  const filterFields: Array<DynamicFormField<RecordsetFilters>> = [
    {
      key: "search",
      label: "Search",
      placeholder: "DOI, title, or type",
      srOnlyLabel: true,
      className: "text-sm",
      controlClassName: "input-transparent",
    },
    {
      key: "datasetId",
      label: "Dataset",
      srOnlyLabel: true,
      type: "select",
      options: [
        { value: "", label: "--- Select a Dataset ---" },
        ...datasets.map((dataset) => ({
          value: String(dataset.dataset_id),
          label: `${dataset.dataset_id} - ${dataset.dataset_name}`,
        })),
      ],
      className: "text-sm",
      controlClassName: `select ${
        filtersInput.datasetId
          ? "text-zinc-900 dark:text-zinc-100"
          : "text-zinc-500 dark:text-zinc-400"
      }`,
    },
    {
      key: "activeOnly",
      label: "active_only",
      type: "checkbox",
      className: "flex h-10 items-center gap-2 text-sm",
      controlClassName: "checkbox",
    },
  ];

  useEffect(() => {
    void loadRecordsets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, currentPage, itemsPerPage]);

  useEffect(() => {
    async function loadDatasets() {
      try {
        const response = await fetch(`${papiUrl("distribution/datasets")}?limit=1000`, {
          cache: "no-store",
        });

        if (!response.ok) {
          setDatasets([]);
          return;
        }

        const json = (await response.json()) as unknown;
        const datasetsArray = extractArray<Dataset>(json, [
          "datasets",
          "data",
          "items",
          "results",
        ]);
        setDatasets(datasetsArray);
      } catch {
        setDatasets([]);
      }
    }

    void loadDatasets();
  }, []);

  return (
    <PageShell size="6xl">
      <PageDetailHeader
        title="Recordsets"
        actions={
          <LinkButton href="/recordsets/create">New Recordset</LinkButton>
        }
      />

      <SectionCard>
        <DynamicForm
          onSubmit={applyFilters}
          values={filtersInput}
          onChange={setFiltersInput}
          fields={filterFields}
          className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto_auto_auto] md:items-center"
          actions={
            <>
              <Button type="submit">Search</Button>

              <Button type="button" onClick={clearFilters} variant="ghost">
                Clear
              </Button>
            </>
          }
        />
      </SectionCard>

      <SectionCard>
        {isLoading && <p className="text-sm">Loading...</p>}

        {!isLoading && error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {!isLoading && data && (
          <div className="space-y-3">
            <DynamicTable
              rows={data.recordsets}
              columns={[
                { key: "recordset_id", label: "ID" },
                { key: "dataset_name", label: "Dataset" },
                { key: "license_label", label: "License" },
                { key: "recordset_type_name", label: "Type" },
                { key: "recordset_name", label: "Name" },
                { key: "active", label: "Active" },
                { key: "when_updated", label: "Updated" },
              ]}
              excludeKeys={[]}
              pagination={{
                defaultItemsPerPage: 10,
                totalItems: data.total,
                page: currentPage,
                pageSize: itemsPerPage,
                pageSizeOptions: [4, 10, 25, 50],
                onPageChange: setCurrentPage,
                onPageSizeChange: (next) => {
                  setItemsPerPage(next);
                  setCurrentPage(1);
                },
              }}
              formatters={{
                when_updated: (value) => formatDateTime(value as string),
              }}
              onRowClick={(row) =>
                navigate(`/recordsets/${row.recordset_id}`)
              }
              getRowKey={(row) => row.recordset_id}
            />
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
