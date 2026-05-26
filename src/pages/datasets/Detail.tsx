import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DynamicSection, {
  DynamicSectionField,
} from "@/components/DynamicSection";
import DynamicTable from "@/components/DynamicTable";
import { Button, LinkButton } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { papiUrl } from "@/lib/papi";

type Dataset = {
  dataset_id: number;
  dataset_type_id: number;
  dataset_type_name: string;
  dataset_doi: string;
  dataset_name: string;
  active: boolean;
  when_created: string;
  when_updated: string;
  who_created: string;
  who_updated: string;
};

type DatasetResponse = {
  dataset?: Dataset;
  data?: Dataset;
  timestamp: string;
};

type DatasetRelease = {
  dataset_release_id: number;
  dataset_id: number;
  release_number: number;
  release_date: string;
  release_notes: string;
};

type DatasetReleasesResponse = {
  releases: DatasetRelease[];
  total: number;
  timestamp: string;
};

type DatasetRecordset = {
  recordset_id: number;
  recordset_doi: string | null;
  dataset_id: number;
  license_id: number;
  license_label: string;
  recordset_type_id: number;
  recordset_type_name: string;
  recordset_name: string;
  active: boolean;
  when_created?: string;
  when_updated?: string;
};

type DatasetRecordsetsResponse = {
  recordsets: DatasetRecordset[];
  total: number;
  timestamp: string;
};

type WpMap = {
  map_id: number;
  posda_object_type: string;
  posda_object_id: number;
  wp_object_type: string;
  wp_object_id: number;
  wp_edit_url: string | null;
  wp_view_url: string | null;
  parent_wp_object_id: number | null;
  when_synced: string | null;
};

type WpSearchResult = {
  id: number;
  title: string;
  type: string;
  status: string;
  view_url: string;
  edit_url: string;
};

function normalizeDatasetReleasesResponse(
  payload: unknown,
): DatasetReleasesResponse {
  const source = payload as
    | {
        releases?: DatasetRelease[];
        total?: number;
        timestamp?: string;
        data?: DatasetRelease[];
        meta?: { count?: number };
      }
    | undefined;

  const releases = Array.isArray(source?.releases)
    ? source.releases
    : Array.isArray(source?.data)
      ? source.data
      : [];

  return {
    releases,
    total:
      typeof source?.total === "number"
        ? source.total
        : typeof source?.meta?.count === "number"
          ? source.meta.count
          : releases.length,
    timestamp:
      typeof source?.timestamp === "string"
        ? source.timestamp
        : new Date().toISOString(),
  };
}

function normalizeDatasetRecordsetsResponse(
  payload: unknown,
): DatasetRecordsetsResponse {
  const source = payload as
    | {
        recordsets?: DatasetRecordset[];
        total?: number;
        timestamp?: string;
        data?: DatasetRecordset[];
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

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "-";
  }

  return new Date(parsed).toLocaleString();
}

export default function DatasetDetail() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { dataset_id: datasetId } = useParams<{ dataset_id: string }>();
  const [data, setData] = useState<DatasetResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordsetsPage, setRecordsetsPage] = useState(1);
  const [recordsetsItemsPerPage, setRecordsetsItemsPerPage] = useState(5);
  const [releasesPage, setReleasesPage] = useState(1);
  const [releasesItemsPerPage, setReleasesItemsPerPage] = useState(4);
  const [releasesData, setReleasesData] =
    useState<DatasetReleasesResponse | null>(null);
  const [isLoadingReleases, setIsLoadingReleases] = useState(false);
  const [releasesError, setReleasesError] = useState<string | null>(null);
  const [recordsetsData, setRecordsetsData] =
    useState<DatasetRecordsetsResponse | null>(null);
  const [isLoadingRecordsets, setIsLoadingRecordsets] = useState(false);
  const [recordsetsError, setRecordsetsError] = useState<string | null>(null);

  // WP link
  const [wpMap, setWpMap] = useState<WpMap | null | undefined>(undefined);
  const [isLoadingWpMap, setIsLoadingWpMap] = useState(false);
  const [showWpModal, setShowWpModal] = useState(false);
  const [wpSearchType, setWpSearchType] = useState<
    "collection" | "analysis_result"
  >("collection");
  const [wpSearchQuery, setWpSearchQuery] = useState("");
  const [wpResults, setWpResults] = useState<WpSearchResult[]>([]);
  const [isSearchingWp, setIsSearchingWp] = useState(false);
  const [isSavingWpMap, setIsSavingWpMap] = useState(false);
  const [wpModalError, setWpModalError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId) {
      setError("Could not load dataset id.");
      setData(null);
      setIsLoading(false);
      setReleasesData(null);
      setIsLoadingReleases(false);
      setRecordsetsData(null);
      setIsLoadingRecordsets(false);
      return;
    }

    let isMounted = true;

    async function loadDataset() {
      setIsLoading(true);
      setError(null);
      setIsLoadingReleases(true);
      setReleasesError(null);
      setIsLoadingRecordsets(true);
      setRecordsetsError(null);

      try {
        const response = await fetch(papiUrl(`distribution/datasets/${datasetId}`), {
          cache: "no-store",
        });

        if (!response.ok) {
          const fallbackMessage = `Could not load dataset ${datasetId}.`;

          try {
            const json = (await response.json()) as { error?: string };
            throw new Error(json.error ?? fallbackMessage);
          } catch {
            throw new Error(fallbackMessage);
          }
        }

        const json = (await response.json()) as DatasetResponse;

        if (!isMounted) {
          return;
        }

        setData({ ...json, dataset: json.dataset ?? json.data });

        try {
          const recordsetsQuery = new URLSearchParams({
            dataset_id: datasetId!,
            page: String(recordsetsPage),
            limit: String(recordsetsItemsPerPage),
          }).toString();
          const recordsetsResponse = await fetch(
            `${papiUrl("distribution/recordsets")}?${recordsetsQuery}`,
            {
              cache: "no-store",
            },
          );

          if (!recordsetsResponse.ok) {
            throw new Error(`Could not load recordsets for dataset ${datasetId}.`);
          }

          const recordsetsJson = (await recordsetsResponse.json()) as unknown;

          if (!isMounted) {
            return;
          }

          setRecordsetsData(normalizeDatasetRecordsetsResponse(recordsetsJson));
        } catch (caughtError) {
          if (!isMounted) {
            return;
          }

          setRecordsetsData(null);
          if (caughtError instanceof Error) {
            setRecordsetsError(caughtError.message);
          } else {
            setRecordsetsError(`Could not load recordsets for dataset ${datasetId}.`);
          }
        } finally {
          if (isMounted) {
            setIsLoadingRecordsets(false);
          }
        }

        const releasesQuery = new URLSearchParams({
          page: String(releasesPage),
          limit: String(releasesItemsPerPage),
        }).toString();
        const releasesResponse = await fetch(
          `${papiUrl(`distribution/datasets/${datasetId}/releases`)}?${releasesQuery}`,
          {
            cache: "no-store",
          },
        );

        if (!releasesResponse.ok) {
          throw new Error(`Could not load releases for dataset ${datasetId}.`);
        }

        const releasesJson = (await releasesResponse.json()) as unknown;

        if (!isMounted) {
          return;
        }

        setReleasesData(normalizeDatasetReleasesResponse(releasesJson));
      } catch (caughtError) {
        if (!isMounted) {
          return;
        }

        if (
          caughtError instanceof Error &&
          caughtError.message.includes("releases")
        ) {
          setReleasesData(null);
          setReleasesError(caughtError.message);
        } else if (
          caughtError instanceof Error &&
          caughtError.message.includes("recordsets")
        ) {
          setRecordsetsData(null);
          setRecordsetsError(caughtError.message);
        } else {
          if (caughtError instanceof Error) {
            setError(caughtError.message);
          } else {
            setError(`Could not load dataset ${datasetId}.`);
          }

          setData(null);
          setReleasesData(null);
          setRecordsetsData(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsLoadingReleases(false);
          setIsLoadingRecordsets(false);
        }
      }
    }

    void loadDataset();

    return () => {
      isMounted = false;
    };
  }, [
    datasetId,
    recordsetsPage,
    recordsetsItemsPerPage,
    releasesPage,
    releasesItemsPerPage,
  ]);

  useEffect(() => {
    if (!datasetId) return;
    let isMounted = true;
    setIsLoadingWpMap(true);
    fetch(papiUrl(`manager/posda/dataset/${datasetId}/wp-map`), { cache: "no-store" })
      .then(async (res) => {
        if (!isMounted) return;
        if (res.ok) {
          const json = (await res.json()) as { data: WpMap };
          setWpMap(json.data);
        } else {
          setWpMap(null);
        }
      })
      .catch(() => {
        if (isMounted) setWpMap(null);
      })
      .finally(() => {
        if (isMounted) setIsLoadingWpMap(false);
      });
    return () => {
      isMounted = false;
    };
  }, [datasetId]);

  async function searchWp() {
    if (!wpSearchQuery.trim()) return;
    setIsSearchingWp(true);
    setWpResults([]);
    try {
      const resource =
        wpSearchType === "collection" ? "manager/collections" : "manager/analysis-results";
      const res = await fetch(
        `${papiUrl(resource)}?search=${encodeURIComponent(wpSearchQuery.trim())}`,
      );
      if (res.ok) setWpResults((await res.json()) as WpSearchResult[]);
    } finally {
      setIsSearchingWp(false);
    }
  }

  async function saveWpLink(result: WpSearchResult) {
    if (!datasetId) return;
    setIsSavingWpMap(true);
    setWpModalError(null);
    try {
      const body = {
        wp_object_type: wpSearchType,
        wp_object_id: result.id,
        wp_edit_url: result.edit_url,
        wp_view_url: result.view_url,
      };
      const res = wpMap
        ? await fetch(papiUrl(`manager/wp-object-map/${wpMap.map_id}`), {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(papiUrl("manager/wp-object-map"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              posda_object_type: "dataset",
              posda_object_id: parseInt(datasetId, 10),
              ...body,
            }),
          });
      if (!res.ok) {
        const json = (await res.json()) as {
          error?: { message?: string } | string;
        };
        throw new Error(
          typeof json.error === "string"
            ? json.error
            : (json.error?.message ?? "Could not save link."),
        );
      }
      const json = (await res.json()) as { data: WpMap };
      setWpMap(json.data);
      setShowWpModal(false);
      setWpSearchQuery("");
      setWpResults([]);
      toastSuccess(addToast, "WordPress link saved.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save link.";
      setWpModalError(msg);
      toastError(addToast, msg);
    } finally {
      setIsSavingWpMap(false);
    }
  }

  const dataset = data?.dataset ?? data?.data ?? null;
  const datasetFields: DynamicSectionField[] = dataset
    ? [
        { label: "Dataset ID", value: dataset.dataset_id },
        { label: "Type", value: dataset.dataset_type_name },
        { label: "Name", value: dataset.dataset_name, fullWidth: true },
        { label: "DOI", value: dataset.dataset_doi },
        { label: "Active", value: dataset.active ? "Yes" : "No" },
      ]
    : [];

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title="Dataset Details"
        breadcrumb={{ label: "Datasets", href: "/datasets" }}
        subtitle={dataset?.dataset_name}
        badge={
          dataset
            ? {
                label: dataset.active ? "Active" : "Inactive",
                variant: dataset.active ? "success" : "neutral",
              }
            : undefined
        }
        actions={
          <LinkButton
            href={datasetId ? `/datasets/${datasetId}/edit` : "/datasets"}
          >
            Edit Dataset
          </LinkButton>
        }
      />

      <DynamicSection
        isLoading={isLoading}
        error={error}
        fields={datasetFields}
        actions={
          <div
            className="space-y-1 rounded-md px-3 py-2 text-xs"
            style={{
              background: "var(--surface-alt)",
              border: "1px solid var(--border-strong)",
              color: "var(--muted)",
            }}
          >
            <p>
              <span
                className="font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                Created:
              </span>{" "}
              {dataset ? new Date(dataset.when_created).toLocaleString() : "—"}{" "}
              by {dataset?.who_created}
            </p>
            <p>
              <span
                className="font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                Updated:
              </span>{" "}
              {dataset ? new Date(dataset.when_updated).toLocaleString() : "—"}{" "}
              by {dataset?.who_updated}
            </p>
          </div>
        }
      />

      {!isLoading && dataset && (
        <>
          <CardHeader className="mt-6 mb-0">
            <CardTitle>WordPress Object</CardTitle>
            <Button size="sm" onClick={() => setShowWpModal(true)}>
              {wpMap ? "Change Link" : "Link to WordPress"}
            </Button>
          </CardHeader>
          <SectionCard className="mt-1">
            {isLoadingWpMap && <p className="text-sm">Loading...</p>}
            {!isLoadingWpMap && wpMap === null && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No WordPress object linked.
              </p>
            )}
            {!isLoadingWpMap && wpMap && (
              <div className="space-y-1 text-sm">
                <p>
                  <span className="font-medium capitalize">
                    {wpMap.wp_object_type.replace("_", " ")}
                  </span>{" "}
                  <span style={{ color: "var(--muted)" }}>
                    ID {wpMap.wp_object_id}
                  </span>
                </p>
                <div className="flex gap-4 text-xs">
                  {wpMap.wp_view_url && (
                    <a
                      href={wpMap.wp_view_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--accent)" }}
                    >
                      View on site ↗
                    </a>
                  )}
                  {wpMap.wp_edit_url && (
                    <a
                      href={wpMap.wp_edit_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--accent)" }}
                    >
                      Edit in WordPress ↗
                    </a>
                  )}
                </div>
                {wpMap.when_synced && (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    Synced: {new Date(wpMap.when_synced).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </SectionCard>

          <CardHeader className="mt-6 mb-0">
            <CardTitle>Recordsets</CardTitle>
            <LinkButton
              href={
                datasetId
                  ? `/recordsets/create?dataset_id=${datasetId}`
                  : "/recordsets/create"
              }
              size="sm"
            >
              New Recordset
            </LinkButton>
          </CardHeader>
          <SectionCard className="mt-1">
            {isLoadingRecordsets && (
              <p className="text-sm">Loading recordsets...</p>
            )}

            {!isLoadingRecordsets && recordsetsError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {recordsetsError}
              </p>
            )}

            {!isLoadingRecordsets && !recordsetsError && recordsetsData && (
              <>
                {recordsetsData.recordsets.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    No recordsets were found for this dataset.
                  </p>
                ) : (
                  <DynamicTable
                    rows={recordsetsData.recordsets}
                    pagination={{
                      defaultItemsPerPage: 5,
                      totalItems: recordsetsData.total,
                      page: recordsetsPage,
                      pageSize: recordsetsItemsPerPage,
                      onPageChange: setRecordsetsPage,
                      onPageSizeChange: (nextItemsPerPage) => {
                        setRecordsetsItemsPerPage(nextItemsPerPage);
                        setRecordsetsPage(1);
                      },
                    }}
                    columns={[
                      { key: "recordset_id", label: "ID" },
                      { key: "recordset_name", label: "Name" },
                      { key: "recordset_type_name", label: "Type" },
                      { key: "license_label", label: "License" },
                      { key: "recordset_doi", label: "DOI" },
                      { key: "active", label: "Active" },
                      { key: "when_updated", label: "Updated" },
                    ]}
                    formatters={{
                      when_updated: (value) => formatDateTime(value as string),
                    }}
                    onRowClick={(row) =>
                      navigate(`/recordsets/${row.recordset_id}`)
                    }
                    getRowKey={(row) => row.recordset_id}
                  />
                )}
              </>
            )}
          </SectionCard>

          <CardHeader className="mt-6 mb-0">
            <CardTitle>Releases</CardTitle>
            <LinkButton
              href={
                datasetId
                  ? `/datasets/releases/create?dataset_id=${datasetId}`
                  : "/datasets/releases/create"
              }
              size="sm"
            >
              New Release
            </LinkButton>
          </CardHeader>
          <SectionCard className="mt-1">
            {isLoadingReleases && (
              <p className="text-sm">Loading releases...</p>
            )}

            {!isLoadingReleases && releasesError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {releasesError}
              </p>
            )}

            {!isLoadingReleases && !releasesError && releasesData && (
              <DynamicTable
                rows={releasesData.releases}
                pagination={{
                  defaultItemsPerPage: 4,
                  totalItems: releasesData.total,
                  page: releasesPage,
                  pageSize: releasesItemsPerPage,
                  onPageChange: setReleasesPage,
                  onPageSizeChange: (nextItemsPerPage) => {
                    setReleasesItemsPerPage(nextItemsPerPage);
                    setReleasesPage(1);
                  },
                }}
                columns={[
                  { key: "dataset_release_id", label: "ID" },
                  { key: "release_number", label: "Version" },
                  { key: "release_date", label: "Date" },
                  { key: "release_notes", label: "Notes" },
                ]}
                formatters={{
                  release_date: (value) =>
                    new Date(String(value)).toLocaleDateString(),
                }}
                onRowClick={(row) =>
                  navigate(`/datasets/releases/${row.dataset_release_id}`)
                }
                getRowKey={(row) => row.dataset_release_id}
              />
            )}
          </SectionCard>
        </>
      )}
      {showWpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="w-full max-w-lg rounded-lg p-6 shadow-xl"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
            }}
          >
            <h2 className="text-lg font-semibold">Link to WordPress Object</h2>
            {wpModalError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                {wpModalError}
              </p>
            )}
            <div className="mt-4 space-y-3">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <select
                    value={wpSearchType}
                    onChange={(e) => {
                      setWpSearchType(
                        e.target.value as "collection" | "analysis_result",
                      );
                      setWpResults([]);
                    }}
                    className="select"
                  >
                    <option value="collection">Collection</option>
                    <option value="analysis_result">Analysis Result</option>
                  </select>
                  <Button
                    onClick={() => void searchWp()}
                    disabled={isSearchingWp || !wpSearchQuery.trim()}
                  >
                    {isSearchingWp ? "…" : "Search"}
                  </Button>
                </div>
                <input
                  type="text"
                  value={wpSearchQuery}
                  onChange={(e) => setWpSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void searchWp();
                  }}
                  placeholder="Search by title..."
                  className="input w-full"
                  autoFocus
                />
              </div>
              {wpResults.length > 0 && (
                <ul
                  className="max-h-64 overflow-y-auto divide-y rounded"
                  style={{ border: "1px solid var(--border-strong)" }}
                >
                  {wpResults.map((r) => (
                    <li
                      key={r.id}
                      className="flex cursor-pointer items-center justify-between gap-4 px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      onClick={() => {
                        if (!isSavingWpMap) void saveWpLink(r);
                      }}
                    >
                      <span className="text-sm">
                        <span className="font-medium">{r.title}</span>
                        <span
                          className="ml-2 text-xs"
                          style={{ color: "var(--muted)" }}
                        >
                          {r.status}
                        </span>
                      </span>
                      <span
                        className="shrink-0 text-xs"
                        style={{ color: "var(--muted)" }}
                      >
                        ID {r.id}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!isSearchingWp && wpResults.length === 0 && wpSearchQuery && (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  No results.
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowWpModal(false);
                  setWpSearchQuery("");
                  setWpResults([]);
                  setWpModalError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
