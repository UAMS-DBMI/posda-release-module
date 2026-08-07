import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DynamicTable from "@/components/DynamicTable";
import LatestReleaseCard from "@/components/LatestReleaseCard";
import WpLinkModal from "@/components/WpLinkModal";
import DatasetEditModal from "@/components/DatasetEditModal";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import { Button, LinkButton } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useUsers } from "@/lib/useUsers";
import type { DatasetReleaseStatus } from "@/lib/useCycle";
import { useFavorites } from "@/lib/useFavorites";
import { useWpMap, wpTypeOptionForDataset } from "@/lib/wpObjectMap";
import { useDataset } from "@/lib/datasetForm";
import FavoriteStar from "@/components/FavoriteStar";
import { LoadingState } from "@/components/ui/Spinner";

type DatasetRelease = {
  dataset_release_id: number;
  dataset_id: number;
  release_number: number;
  /** Null while draft -- set when release_status transitions to released. */
  release_date: string | null;
  release_notes: string;
  release_status: DatasetReleaseStatus;
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
  const userMap = useUsers();
  const { favoriteKeys, toggle: toggleFavorite } = useFavorites();
  const { dataset_id: datasetId } = useParams<{ dataset_id: string }>();
  const {
    data: dataset,
    isLoading,
    isError,
    error: datasetError,
  } = useDataset(datasetId);
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

  const [showWpModal, setShowWpModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Recordsets and releases only need the id -- independent of the dataset
  // record itself, which now comes from the shared `useDataset` query (kept
  // in sync with `DatasetEditModal`'s save via its cache invalidation).
  useEffect(() => {
    if (!datasetId) {
      setReleasesData(null);
      setIsLoadingReleases(false);
      setRecordsetsData(null);
      setIsLoadingRecordsets(false);
      return;
    }

    let isMounted = true;

    async function loadRecordsetsAndReleases() {
      setIsLoadingReleases(true);
      setReleasesError(null);
      setIsLoadingRecordsets(true);
      setRecordsetsError(null);

      try {
        const recordsetsQuery = new URLSearchParams({
          dataset_id: datasetId!,
          page: String(recordsetsPage),
          limit: String(recordsetsItemsPerPage),
        }).toString();
        const recordsetsResponse = await fetch(
          `/papi/v1/distribution/recordsets?${recordsetsQuery}`,
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
        setRecordsetsError(
          caughtError instanceof Error
            ? caughtError.message
            : `Could not load recordsets for dataset ${datasetId}.`,
        );
      } finally {
        if (isMounted) {
          setIsLoadingRecordsets(false);
        }
      }

      try {
        const releasesQuery = new URLSearchParams({
          page: String(releasesPage),
          limit: String(releasesItemsPerPage),
        }).toString();
        const releasesResponse = await fetch(
          `/papi/v1/distribution/datasets/${datasetId}/releases?${releasesQuery}`,
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

        setReleasesData(null);
        setReleasesError(
          caughtError instanceof Error
            ? caughtError.message
            : `Could not load releases for dataset ${datasetId}.`,
        );
      } finally {
        if (isMounted) {
          setIsLoadingReleases(false);
        }
      }
    }

    void loadRecordsetsAndReleases();

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

  const { data: wpMap, isLoading: isLoadingWpMap } = useWpMap(
    "dataset",
    datasetId ? Number(datasetId) : undefined,
  );

  // "Latest" = highest release_number that isn't retracted. Must match the
  // server-side NOT_RETRACTED rule in distribution.py.
  const latestRelease =
    releasesData?.releases
      .filter((r) => r.release_status !== "retracted")
      .reduce<DatasetRelease | null>(
        (latest, r) =>
          latest == null || r.release_number > latest.release_number ? r : latest,
        null,
      ) ?? null;

  const metadataStrip = dataset
    ? [
        dataset.dataset_doi,
        dataset.dataset_type_name,
        `updated ${new Date(dataset.when_updated).toLocaleDateString()}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title={dataset?.dataset_name ?? "Dataset Details"}
        breadcrumb={{ label: "Datasets", href: "/datasets" }}
        subtitle={metadataStrip}
        badge={
          dataset
            ? {
                label: dataset.active ? "Active" : "Inactive",
                variant: dataset.active ? "success" : "neutral",
              }
            : undefined
        }
        actions={
          <>
            <FavoriteStar
              disabled={!dataset}
              filled={favoriteKeys.has(`dataset:${datasetId}`)}
              onClick={() => {
                if (datasetId && dataset) {
                  void toggleFavorite(
                    "dataset",
                    parseInt(datasetId, 10),
                    dataset.dataset_name,
                  );
                }
              }}
            />
            <LinkButton
              href={datasetId ? `/datasets/${datasetId}/cycle` : "/datasets"}
            >
              Release Cycle
            </LinkButton>
            <Button
              variant="ghost"
              onClick={() => setShowEditModal(true)}
              disabled={!datasetId}
            >
              Edit Dataset
            </Button>
          </>
        }
      />

      {isLoading && (
        <SectionCard className="mt-4">
          <LoadingState />
        </SectionCard>
      )}

      {!isLoading && isError && (
        <SectionCard className="mt-4">
          <p className="text-sm text-red-600 dark:text-red-400">
            {datasetError instanceof Error
              ? datasetError.message
              : `Could not load dataset ${datasetId}.`}
          </p>
        </SectionCard>
      )}

      {!isLoading && dataset && datasetId && (
        <>
          <LatestReleaseCard
            datasetId={datasetId}
            isLoading={isLoadingReleases}
            release={latestRelease}
          />

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
                  {
                    key: "release_status",
                    label: "Status",
                    render: (value) => <StatusBadge status={String(value)} />,
                  },
                  { key: "release_date", label: "Date" },
                  { key: "release_notes", label: "Notes" },
                ]}
                formatters={{
                  release_date: (value) =>
                    value ? new Date(String(value)).toLocaleDateString() : "—",
                }}
                onRowClick={(row) =>
                  navigate(`/datasets/releases/${row.dataset_release_id}`)
                }
                getRowKey={(row) => row.dataset_release_id}
              />
            )}
          </SectionCard>

          <CollapsibleSection
            title="WordPress Object"
            summary={
              isLoadingWpMap ? undefined : wpMap ? "mapped ✓" : "not linked"
            }
            actions={
              <Button size="sm" onClick={() => setShowWpModal(true)}>
                {wpMap ? "Change Link" : "Link to WordPress"}
              </Button>
            }
          >
            {isLoadingWpMap && <LoadingState />}
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
          </CollapsibleSection>

          <CollapsibleSection title="Record Details">
            <div className="space-y-1 text-sm" style={{ color: "var(--muted)" }}>
              <p>
                <span
                  className="font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  Dataset ID:
                </span>{" "}
                {dataset.dataset_id}
              </p>
              <p>
                <span
                  className="font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  Created:
                </span>{" "}
                {new Date(dataset.when_created).toLocaleString()} by{" "}
                {userMap.get(dataset.who_created) ?? "—"}
              </p>
              <p>
                <span
                  className="font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  Updated:
                </span>{" "}
                {new Date(dataset.when_updated).toLocaleString()} by{" "}
                {userMap.get(dataset.who_updated) ?? "—"}
              </p>
            </div>
          </CollapsibleSection>
        </>
      )}
      <WpLinkModal
        open={showWpModal}
        onClose={() => setShowWpModal(false)}
        posdaObjectType="dataset"
        posdaObjectId={datasetId ? Number(datasetId) : undefined}
        typeOptions={[wpTypeOptionForDataset(dataset?.dataset_type_name ?? "")]}
      />
      <DatasetEditModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        datasetId={datasetId}
      />
    </PageShell>
  );
}
