import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import DynamicTable from "@/components/DynamicTable";
import CreateRecordsetModal from "@/components/CreateRecordsetModal";
import RecordsetEditModal from "@/components/RecordsetEditModal";
import { EditIcon } from "@/components/icons";
import WpLinkPill from "@/components/WpLinkPill";
import DatasetEditModal from "@/components/DatasetEditModal";
import { Button, LinkButton } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useUsers } from "@/lib/useUsers";
import type { DatasetReleaseStatus } from "@/lib/useCycle";
import { useFavorites } from "@/lib/useFavorites";
import { wpTypeOptionForDataset } from "@/lib/wpObjectMap";
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
  const [releasesData, setReleasesData] =
    useState<DatasetReleasesResponse | null>(null);
  const [isLoadingReleases, setIsLoadingReleases] = useState(false);
  // Link the cycle button straight at the latest release rather than at the
  // bare /cycle entry point, which would only redirect here anyway. Falls back
  // to the bare form while the release list is still loading, or when the
  // dataset has no release yet.
  const latestRelease = (releasesData?.releases ?? []).reduce<
    DatasetRelease | null
  >((best, r) => (best && best.release_number >= r.release_number ? best : r), null);
  const [releasesError, setReleasesError] = useState<string | null>(null);
  const [recordsetsData, setRecordsetsData] =
    useState<DatasetRecordsetsResponse | null>(null);
  const [isLoadingRecordsets, setIsLoadingRecordsets] = useState(false);
  const [recordsetsError, setRecordsetsError] = useState<string | null>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateRecordset, setShowCreateRecordset] = useState(false);
  const [editRecordsetId, setEditRecordsetId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
        // Unpaginated: the table lists every recordset in the dataset.
        const recordsetsQuery = new URLSearchParams({
          dataset_id: datasetId!,
          limit: "1000",
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
        // Unpaginated, like the recordsets table above.
        const releasesQuery = new URLSearchParams({
          limit: "1000",
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
    // Bumped after a modal create -- this list isn't react-query, so the
    // modal's cache invalidation can't refresh it.
    refreshKey,
  ]);

  const metadataStrip = dataset
    ? [
        `#${dataset.dataset_id}`,
        dataset.dataset_doi,
        dataset.dataset_type_name,
        `updated ${new Date(dataset.when_updated).toLocaleDateString()} by ${
          userMap.get(dataset.who_updated) ?? "—"
        }`,
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
              href={
                !datasetId
                  ? "/datasets"
                  : latestRelease
                    ? `/datasets/${datasetId}/releases/${latestRelease.dataset_release_id}/cycle`
                    : `/datasets/${datasetId}/cycle`
              }
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
        subActions={
          <WpLinkPill
            posdaObjectType="dataset"
            posdaObjectId={datasetId ? Number(datasetId) : undefined}
            typeOptions={[
              wpTypeOptionForDataset(dataset?.dataset_type_name ?? ""),
            ]}
          />
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
        <SectionCard className="mt-4">
          <CardHeader>
            <CardTitle>Recordsets</CardTitle>
            <Button size="sm" onClick={() => setShowCreateRecordset(true)}>
              New Recordset
            </Button>
          </CardHeader>
          <div>
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
                    hideSummary
                    columns={[
                      {
                        key: "recordset_name",
                        label: "Name",
                        render: (_v, row) => (
                          // Row click navigates in-tab, so both controls here
                          // stop propagation to keep their own behavior.
                          <div
                            className="flex items-center gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              className="px-2"
                              aria-label="Edit Recordset"
                              title="Edit Recordset"
                              onClick={() =>
                                setEditRecordsetId(row.recordset_id)
                              }
                            >
                              <EditIcon />
                            </Button>
                            <Link
                              to={`/recordsets/${row.recordset_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-accent"
                              style={{ color: "var(--accent)" }}
                            >
                              {row.recordset_name}
                            </Link>
                          </div>
                        ),
                      },
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
          </div>

          <CardHeader className="mt-6">
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
          <div>
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
                hideSummary
                columns={[
                  { key: "release_number", label: "Version" },
                  {
                    key: "release_status",
                    label: "Status",
                    render: (value) => <StatusBadge status={String(value)} />,
                  },
                  { key: "release_date", label: "Date" },
                  { key: "release_notes", label: "Notes" },
                  {
                    // Each release owns a cycle now that the workspace is
                    // pinned, so this is how an older release still being
                    // shipped stays reachable. Row click opens the release
                    // itself, so the button stops propagation.
                    key: "dataset_release_id",
                    label: "",
                    render: (_v, row) => (
                      <div onClick={(e) => e.stopPropagation()}>
                        <LinkButton
                          size="sm"
                          variant="ghost"
                          href={`/datasets/${datasetId}/releases/${row.dataset_release_id}/cycle`}
                        >
                          Cycle
                        </LinkButton>
                      </div>
                    ),
                  },
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
          </div>
        </SectionCard>
      )}
      <RecordsetEditModal
        open={editRecordsetId !== null}
        onClose={() => setEditRecordsetId(null)}
        recordsetId={editRecordsetId ?? undefined}
        onSaved={() => setRefreshKey((n) => n + 1)}
      />
      <CreateRecordsetModal
        open={showCreateRecordset}
        onClose={() => setShowCreateRecordset(false)}
        datasetId={datasetId}
        onCreated={() => setRefreshKey((n) => n + 1)}
      />
      <DatasetEditModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        datasetId={datasetId}
      />
    </PageShell>
  );
}
