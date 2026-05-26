import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DynamicForm, { DynamicFormField } from "@/components/DynamicForm";
import DynamicTable from "@/components/DynamicTable";
import { Button } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";

type Dataset = {
  dataset_id: number;
  dataset_name: string;
  dataset_type_name: string;
  active: boolean;
};

type DatasetRelease = {
  dataset_release_id: number;
  dataset_id: number;
  release_number: number;
  release_date: string;
  release_notes: string;
};

type DatasetFilters = {
  search: string;
  activeOnly: boolean;
};

function extractArray<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== "object") return [];
  const source = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

export default function TransfersList() {
  const navigate = useNavigate();

  const [filtersInput, setFiltersInput] = useState<DatasetFilters>({
    search: "",
    activeOnly: true,
  });
  const [filters, setFilters] = useState<DatasetFilters>({
    search: "",
    activeOnly: true,
  });

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetTotal, setDatasetTotal] = useState(0);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(true);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [datasetPage, setDatasetPage] = useState(1);
  const [datasetPageSize, setDatasetPageSize] = useState(10);

  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [releases, setReleases] = useState<DatasetRelease[]>([]);
  const [isLoadingReleases, setIsLoadingReleases] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  async function loadDatasets() {
    setIsLoadingDatasets(true);
    setDatasetError(null);
    try {
      const params = new URLSearchParams();
      if (filters.search.trim()) params.set("search", filters.search.trim());
      if (filters.activeOnly) params.set("active_only", "true");
      params.set("page", String(datasetPage));
      params.set("limit", String(datasetPageSize));
      const res = await fetch(`/papi/v1/distribution/datasets?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Request failed");
      const json = (await res.json()) as unknown;
      const items = extractArray<Dataset>(json, ["datasets", "data"]);
      const total = (json as { total?: number })?.total ?? items.length;
      setDatasets(items);
      setDatasetTotal(total);
    } catch {
      setDatasetError("Could not load datasets.");
      setDatasets([]);
    } finally {
      setIsLoadingDatasets(false);
    }
  }

  async function loadReleases(datasetId: number) {
    setIsLoadingReleases(true);
    setReleaseError(null);
    setReleases([]);
    try {
      const res = await fetch(`/papi/v1/distribution/datasets/${datasetId}/releases`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Request failed");
      const json = (await res.json()) as unknown;
      const items = extractArray<DatasetRelease>(json, ["releases", "data"]);
      setReleases(items);
    } catch {
      setReleaseError("Could not load releases for this dataset.");
    } finally {
      setIsLoadingReleases(false);
    }
  }

  useEffect(() => {
    void loadDatasets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, datasetPage, datasetPageSize]);

  function applyFilters(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDatasetPage(1);
    setSelectedDataset(null);
    setReleases([]);
    setFilters(filtersInput);
  }

  function clearFilters() {
    const cleared = { search: "", activeOnly: false };
    setFiltersInput(cleared);
    setDatasetPage(1);
    setSelectedDataset(null);
    setReleases([]);
    setFilters(cleared);
  }

  function selectDataset(row: Dataset) {
    setSelectedDataset(row);
    void loadReleases(row.dataset_id);
  }

  const filterFields: Array<DynamicFormField<DatasetFilters>> = [
    {
      key: "search",
      label: "Search",
      placeholder: "Dataset name or DOI",
      srOnlyLabel: true,
      className: "text-sm",
      controlClassName: "input-transparent",
    },
    {
      key: "activeOnly",
      label: "Active only",
      type: "checkbox",
      className: "flex h-10 items-center gap-2 text-sm",
      controlClassName: "checkbox",
    },
  ];

  return (
    <PageShell size="6xl">
      <PageDetailHeader
        title="Transfers"
        subtitle="Select a dataset, then click a release to manage its transfers"
      />

      <SectionCard className="mt-6">
        <DynamicForm
          onSubmit={applyFilters}
          values={filtersInput}
          onChange={setFiltersInput}
          fields={filterFields}
          className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center"
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

      <CardHeader className="mt-6 mb-0">
        <CardTitle>Datasets</CardTitle>
      </CardHeader>
      <SectionCard className="mt-1">
        {isLoadingDatasets && <p className="text-sm">Loading...</p>}
        {!isLoadingDatasets && datasetError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {datasetError}
          </p>
        )}
        {!isLoadingDatasets && !datasetError && (
          <DynamicTable
            rows={datasets}
            pagination={{
              totalItems: datasetTotal,
              page: datasetPage,
              pageSize: datasetPageSize,
              defaultItemsPerPage: 10,
              onPageChange: setDatasetPage,
              onPageSizeChange: (next) => {
                setDatasetPageSize(next);
                setDatasetPage(1);
              },
            }}
            columns={[
              { key: "dataset_id", label: "ID" },
              { key: "dataset_name", label: "Name" },
              { key: "dataset_type_name", label: "Type" },
              { key: "active", label: "Active" },
            ]}
            onRowClick={selectDataset}
            getRowKey={(row) => row.dataset_id}
          />
        )}
      </SectionCard>

      {selectedDataset && (
        <>
          <CardHeader className="mt-6 mb-0">
            <CardTitle>{selectedDataset.dataset_name} — Releases</CardTitle>
          </CardHeader>
          <SectionCard className="mt-1">
            {isLoadingReleases && (
              <p className="text-sm">Loading releases...</p>
            )}
            {!isLoadingReleases && releaseError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {releaseError}
              </p>
            )}
            {!isLoadingReleases && !releaseError && releases.length === 0 && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No releases found for this dataset.
              </p>
            )}
            {!isLoadingReleases && releases.length > 0 && (
              <DynamicTable
                rows={releases}
                columns={[
                  { key: "dataset_release_id", label: "ID" },
                  { key: "release_number", label: "Version" },
                  { key: "release_date", label: "Date" },
                  { key: "release_notes", label: "Notes" },
                ]}
                formatters={{
                  release_date: (v) =>
                    v ? new Date(String(v)).toLocaleDateString() : "—",
                }}
                onRowClick={(row) =>
                  navigate(
                    `/datasets/releases/${row.dataset_release_id}/transfers`,
                  )
                }
                getRowKey={(row) => row.dataset_release_id}
              />
            )}
          </SectionCard>
        </>
      )}
    </PageShell>
  );
}
