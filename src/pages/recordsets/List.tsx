import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DynamicForm, { DynamicFormField } from "@/components/DynamicForm";
import DynamicTable from "@/components/DynamicTable";
import FavoriteStar from "@/components/FavoriteStar";
import { Button, LinkButton } from "@/components/ui/Button";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { SectionCard } from "@/components/ui/Card";
import { extractArray } from "@/lib/apiUtils";
import { useFavorites } from "@/lib/useFavorites";
import { LoadingState } from "@/components/ui/Spinner";

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
  who_created?: number;
  when_updated?: string;
  who_updated?: number;
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

const DEFAULT_LIMIT = 10;

function filtersFromParams(params: URLSearchParams): RecordsetFilters {
  return {
    search: params.get("search") ?? "",
    activeOnly: params.get("active") !== "false",
    datasetId: params.get("dataset") ?? "",
  };
}

function toSearchParams(
  filters: RecordsetFilters,
  page: number,
  limit: number,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.datasetId) params.set("dataset", filters.datasetId);
  if (!filters.activeOnly) params.set("active", "false");
  if (page !== 1) params.set("page", String(page));
  if (limit !== DEFAULT_LIMIT) params.set("limit", String(limit));
  return params;
}

function normalizeRecordsetsResponse(payload: unknown): RecordsetsResponse {
  const source = payload as
    | {
        recordsets?: Recordset[];
        total?: number;
        timestamp?: string;
        data?: Recordset[];
        meta?: { count?: number; total?: number };
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
      typeof source?.meta?.total === "number"
        ? source.meta.total
        : typeof source?.total === "number"
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
  const { favoriteKeys, toggle } = useFavorites();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = filtersFromParams(searchParams);
  const currentPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const itemsPerPage = Number(searchParams.get("limit")) || DEFAULT_LIMIT;

  const [filtersInput, setFiltersInput] = useState<RecordsetFilters>(filters);

  const [data, setData] = useState<RecordsetsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filterKey = `${filters.search}|${filters.activeOnly}|${filters.datasetId}`;
  useEffect(() => {
    setFiltersInput(filtersFromParams(searchParams));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

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

      const apiUrlStr = `/papi/v1/distribution/recordsets?${apiParams.toString()}`;

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
    setSearchParams(toSearchParams(filtersInput, 1, itemsPerPage));
  }

  function clearFilters() {
    const cleared = { search: "", activeOnly: false, datasetId: "" };
    setFiltersInput(cleared);
    setSearchParams(toSearchParams(cleared, 1, itemsPerPage));
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
  }, [searchParams]);

  useEffect(() => {
    async function loadDatasets() {
      try {
        const response = await fetch(`/papi/v1/distribution/datasets?limit=1000`, {
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
        {isLoading && <LoadingState />}

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
                {
                  key: "recordset_id",
                  label: "",
                  sortable: false,
                  render: (_value, row) => (
                    <FavoriteStar
                      size={20}
                      filled={favoriteKeys.has(`recordset:${row.recordset_id}`)}
                      onClick={() =>
                        void toggle(
                          "recordset",
                          row.recordset_id,
                          row.recordset_name,
                        )
                      }
                    />
                  ),
                },
              ]}
              excludeKeys={[]}
              pagination={{
                defaultItemsPerPage: 10,
                totalItems: data.total,
                page: currentPage,
                pageSize: itemsPerPage,
                pageSizeOptions: [4, 10, 25, 50],
                onPageChange: (nextPage) => {
                  setSearchParams(
                    toSearchParams(filters, nextPage, itemsPerPage),
                    { replace: true },
                  );
                },
                onPageSizeChange: (next) => {
                  setSearchParams(toSearchParams(filters, 1, next), {
                    replace: true,
                  });
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
