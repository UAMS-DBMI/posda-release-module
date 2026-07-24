import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DynamicTable from "@/components/DynamicTable";
import CurrentCycleCard from "@/components/CurrentCycleCard";
import RecordsetDestinationModal from "@/components/RecordsetDestinationModal";
import WpLinkModal from "@/components/WpLinkModal";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import { Button, LinkButton } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { extractApiError } from "@/lib/apiUtils";
import { useUsers } from "@/lib/useUsers";
import { useFavorites } from "@/lib/useFavorites";
import { useDestinationLookups } from "@/lib/recordsetForm";
import {
  useRecordsetDestinations,
  type RecordsetDestination,
} from "@/lib/recordsetDestinations";
import { useWpMap } from "@/lib/wpObjectMap";
import FavoriteStar from "@/components/FavoriteStar";
import { LoadingState } from "@/components/ui/Spinner";

type Recordset = {
  recordset_id: number;
  recordset_doi: string;
  dataset_id: number;
  dataset_name: string;
  license_id: number;
  license_label: string;
  recordset_type_id: number;
  recordset_type_name: string;
  recordset_name: string;
  active: boolean;
  when_created: string;
  who_created: number;
  when_updated: string;
  who_updated: number;
};

type RecordsetResponse = {
  recordset?: Recordset;
  data?: Recordset;
  timestamp: string;
};

type RecordsetRelease = {
  recordset_release_id: number;
  recordset_id: number;
  release_number: number;
  release_date: string;
  release_notes: string;
  file_count: number;
};

type RecordsetReleasesResponse = {
  releases: RecordsetRelease[];
  total: number;
  timestamp: string;
};

type RecordsetDraft = {
  recordset_draft_id: number;
  recordset_id: number;
  cloned_from_release_id: number | null;
  draft_name: string;
  draft_status: string;
  draft_notes: string;
  file_count: number;
};

type RecordsetDraftsResponse = {
  drafts: RecordsetDraft[];
  total: number;
  timestamp: string;
};

function normalizeRecordsetReleasesResponse(
  payload: unknown,
): RecordsetReleasesResponse {
  const source = payload as
    | {
        releases?: RecordsetRelease[];
        total?: number;
        timestamp?: string;
        data?: RecordsetRelease[];
        meta?: { count?: number };
      }
    | undefined;

  const releases = (Array.isArray(source?.releases)
    ? source.releases
    : Array.isArray(source?.data)
      ? source.data
      : []
  ).slice().sort((a, b) => b.release_number - a.release_number);

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

function normalizeRecordsetDraftsResponse(
  payload: unknown,
): RecordsetDraftsResponse {
  const source = payload as
    | {
        drafts?: RecordsetDraft[];
        total?: number;
        timestamp?: string;
        data?: RecordsetDraft[];
        meta?: { count?: number };
      }
    | undefined;

  const drafts = (Array.isArray(source?.drafts)
    ? source.drafts
    : Array.isArray(source?.data)
      ? source.data
      : []
  ).slice().sort((a, b) => b.recordset_draft_id - a.recordset_draft_id);

  return {
    drafts,
    total:
      typeof source?.total === "number"
        ? source.total
        : typeof source?.meta?.count === "number"
          ? source.meta.count
          : drafts.length,
    timestamp:
      typeof source?.timestamp === "string"
        ? source.timestamp
        : new Date().toISOString(),
  };
}

export default function RecordsetDetail() {
  const navigate = useNavigate();
  const userMap = useUsers();
  const { favoriteKeys, toggle: toggleFavorite } = useFavorites();
  const { recordset_id: recordsetId } = useParams<{ recordset_id: string }>();
  const [data, setData] = useState<RecordsetResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftsPage, setDraftsPage] = useState(1);
  const [draftsItemsPerPage, setDraftsItemsPerPage] = useState(4);
  const [releasesPage, setReleasesPage] = useState(1);
  const [releasesItemsPerPage, setReleasesItemsPerPage] = useState(4);
  const [destinationsPage, setDestinationsPage] = useState(1);
  const [destinationsItemsPerPage, setDestinationsItemsPerPage] = useState(4);
  const [releasesData, setReleasesData] =
    useState<RecordsetReleasesResponse | null>(null);
  const [isLoadingReleases, setIsLoadingReleases] = useState(false);
  const [releasesError, setReleasesError] = useState<string | null>(null);
  const [draftsData, setDraftsData] = useState<RecordsetDraftsResponse | null>(
    null,
  );
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);

  const [showDestModal, setShowDestModal] = useState(false);
  const [editingDestinationId, setEditingDestinationId] = useState<number | null>(
    null,
  );

  const [showWpModal, setShowWpModal] = useState(false);

  useEffect(() => {
    if (!recordsetId) {
      setError("Could not load recordset id.");
      setData(null);
      setIsLoading(false);
      setReleasesData(null);
      setDraftsData(null);
      setIsLoadingReleases(false);
      setIsLoadingDrafts(false);
      return;
    }

    let isMounted = true;

    async function loadRecordset() {
      setIsLoading(true);
      setError(null);
      setIsLoadingReleases(true);
      setReleasesError(null);
      setIsLoadingDrafts(true);
      setDraftsError(null);

      try {
        const response = await fetch(`/papi/v1/distribution/recordsets/${recordsetId}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          const fallbackMessage = `Could not load recordset ${recordsetId}.`;
          const json = (await response.json()) as unknown;
          throw new Error(extractApiError(json, fallbackMessage));
        }

        const json = (await response.json()) as RecordsetResponse;

        if (!isMounted) {
          return;
        }

        setData(json);

        const releasesQuery = new URLSearchParams({
          page: String(releasesPage),
          limit: String(releasesItemsPerPage),
        }).toString();
        const releasesResponse = await fetch(
          `/papi/v1/distribution/recordsets/${recordsetId}/releases?${releasesQuery}`,
          {
            cache: "no-store",
          },
        );

        if (!releasesResponse.ok) {
          throw new Error(`Could not load releases for recordset ${recordsetId}.`);
        }

        const releasesJson = (await releasesResponse.json()) as unknown;

        if (!isMounted) {
          return;
        }

        setReleasesData(normalizeRecordsetReleasesResponse(releasesJson));

        const draftsQuery = new URLSearchParams({
          page: String(draftsPage),
          limit: String(draftsItemsPerPage),
        }).toString();
        const draftsResponse = await fetch(
          `/papi/v1/distribution/recordsets/${recordsetId}/drafts?${draftsQuery}`,
          {
            cache: "no-store",
          },
        );

        if (!draftsResponse.ok) {
          throw new Error(`Could not load drafts for recordset ${recordsetId}.`);
        }

        const draftsJson = (await draftsResponse.json()) as unknown;

        if (!isMounted) {
          return;
        }

        setDraftsData(normalizeRecordsetDraftsResponse(draftsJson));
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
          caughtError.message.includes("drafts")
        ) {
          setDraftsData(null);
          setDraftsError(caughtError.message);
        } else {
          if (caughtError instanceof Error) {
            setError(caughtError.message);
          } else {
            setError(`Could not load recordset ${recordsetId}.`);
          }

          setData(null);
          setReleasesData(null);
          setDraftsData(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsLoadingReleases(false);
          setIsLoadingDrafts(false);
        }
      }
    }

    void loadRecordset();

    return () => {
      isMounted = false;
    };
  }, [
    recordsetId,
    draftsPage,
    draftsItemsPerPage,
    releasesPage,
    releasesItemsPerPage,
  ]);

  function openAddDestModal() {
    setEditingDestinationId(null);
    setShowDestModal(true);
  }

  function openEditDestModal(dest: RecordsetDestination) {
    setEditingDestinationId(dest.destination_id);
    setShowDestModal(true);
  }

  function closeDestModal() {
    setShowDestModal(false);
  }

  const { data: wpMap, isLoading: isLoadingWpMap } = useWpMap(
    "recordset",
    recordsetId ? Number(recordsetId) : undefined,
  );

  const {
    data: destinations = [],
    isLoading: isLoadingDestinations,
    error: destinationsQueryError,
  } = useRecordsetDestinations(recordsetId);
  const destinationsError = destinationsQueryError
    ? "Could not load destinations."
    : null;
  const { destinations: allDestinations } = useDestinationLookups();
  const configuredDestIds = new Set(destinations.map((d) => d.destination_id));
  const availableDestinations = allDestinations.filter(
    (d) => !configuredDestIds.has(d.destination_id),
  );

  const recordset = data?.recordset ?? data?.data ?? null;

  const openDraft =
    draftsData?.drafts.find(
      (d) => d.draft_status !== "published" && d.draft_status !== "deleted",
    ) ?? null;
  const latestRelease = releasesData?.releases[0] ?? null;

  const metadataStrip = recordset
    ? [
        recordset.recordset_doi,
        recordset.dataset_name,
        recordset.recordset_type_name,
        recordset.license_label,
        `updated ${new Date(recordset.when_updated).toLocaleDateString()}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title={recordset?.recordset_name ?? "Recordset Details"}
        breadcrumb={{ label: "Recordsets", href: "/recordsets" }}
        subtitle={metadataStrip}
        badge={
          recordset
            ? {
                label: recordset.active ? "Active" : "Inactive",
                variant: recordset.active ? "success" : "neutral",
              }
            : undefined
        }
        actions={
          <>
            <FavoriteStar
              disabled={!recordset}
              filled={favoriteKeys.has(`recordset:${recordsetId}`)}
              onClick={() => {
                if (recordsetId && recordset) {
                  void toggleFavorite(
                    "recordset",
                    parseInt(recordsetId, 10),
                    recordset.recordset_name,
                  );
                }
              }}
            />
            <LinkButton
              href={
                recordsetId ? `/recordsets/${recordsetId}/edit` : "/recordsets"
              }
            >
              Edit Recordset
            </LinkButton>
          </>
        }
      />

      {isLoading && (
        <SectionCard className="mt-4">
          <LoadingState />
        </SectionCard>
      )}

      {!isLoading && error && (
        <SectionCard className="mt-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </SectionCard>
      )}

      {!isLoading && recordset && recordsetId && (
        <>
          <CurrentCycleCard
            recordsetId={recordsetId}
            isLoading={isLoadingDrafts || isLoadingReleases}
            openDraft={openDraft}
            latestRelease={latestRelease}
          />

          <CardHeader className="mt-6 mb-0">
            <CardTitle>Releases</CardTitle>
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
                  { key: "recordset_release_id", label: "ID" },
                  { key: "release_number", label: "Version" },
                  { key: "release_date", label: "Date" },
                  { key: "release_notes", label: "Notes" },
                  { key: "file_count", label: "File Count" },
                ]}
                formatters={{
                  release_date: (value) =>
                    new Date(String(value)).toLocaleDateString(),
                }}
                onRowClick={(row) =>
                  navigate(
                    `/recordsets/releases/${row.recordset_release_id}`,
                  )
                }
                getRowKey={(row) => row.recordset_release_id}
              />
            )}
          </SectionCard>

          <CollapsibleSection
            title="Draft History"
            summary={draftsData ? `(${draftsData.total})` : undefined}
            actions={
              !openDraft ? (
                <LinkButton
                  href={`/recordsets/drafts/create?recordset_id=${recordsetId}`}
                  size="sm"
                >
                  New Draft
                </LinkButton>
              ) : undefined
            }
          >
            {isLoadingDrafts && <p className="text-sm">Loading drafts...</p>}
            {!isLoadingDrafts && draftsError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {draftsError}
              </p>
            )}
            {!isLoadingDrafts && !draftsError && draftsData && (
              <DynamicTable
                rows={draftsData.drafts}
                pagination={{
                  defaultItemsPerPage: 4,
                  totalItems: draftsData.total,
                  page: draftsPage,
                  pageSize: draftsItemsPerPage,
                  onPageChange: setDraftsPage,
                  onPageSizeChange: (nextItemsPerPage) => {
                    setDraftsItemsPerPage(nextItemsPerPage);
                    setDraftsPage(1);
                  },
                }}
                columns={[
                  { key: "recordset_draft_id", label: "ID" },
                  { key: "draft_name", label: "Name" },
                  { key: "draft_status", label: "Status" },
                  { key: "draft_notes", label: "Notes" },
                  { key: "file_count", label: "File Count" },
                  { key: "cloned_from_release_id", label: "Cloned Release ID" },
                ]}
                onRowClick={(row) =>
                  navigate(`/recordsets/drafts/${row.recordset_draft_id}`)
                }
                getRowKey={(row) => row.recordset_draft_id}
              />
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Destinations"
            summary={`(${destinations.length})`}
            actions={
              <Button
                size="sm"
                onClick={openAddDestModal}
                disabled={availableDestinations.length === 0}
              >
                New Destination
              </Button>
            }
          >
            {isLoadingDestinations && (
              <p className="text-sm">Loading destinations...</p>
            )}
            {!isLoadingDestinations && destinationsError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {destinationsError}
              </p>
            )}
            {!isLoadingDestinations && !destinationsError && (
              <DynamicTable
                rows={destinations}
                pagination={{
                  defaultItemsPerPage: 4,
                  totalItems: destinations.length,
                  page: destinationsPage,
                  pageSize: destinationsItemsPerPage,
                  onPageChange: setDestinationsPage,
                  onPageSizeChange: (n) => {
                    setDestinationsItemsPerPage(n);
                    setDestinationsPage(1);
                  },
                }}
                columns={[
                  { key: "destination_name", label: "Destination" },
                  { key: "destination_abbr", label: "Abbr" },
                  { key: "default_display", label: "Default Display" },
                ]}
                formatters={{
                  default_display: (value) => (value ? "Yes" : "No"),
                }}
                onRowClick={(row) => openEditDestModal(row)}
                getRowKey={(row) => row.destination_id}
              />
            )}
          </CollapsibleSection>

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
                    {wpMap.wp_object_type}
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
                  Recordset ID:
                </span>{" "}
                {recordset.recordset_id}
              </p>
              <p>
                <span
                  className="font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  Created:
                </span>{" "}
                {new Date(recordset.when_created).toLocaleString()} by{" "}
                {userMap.get(recordset.who_created) ?? "—"}
              </p>
              <p>
                <span
                  className="font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  Updated:
                </span>{" "}
                {new Date(recordset.when_updated).toLocaleString()} by{" "}
                {userMap.get(recordset.who_updated) ?? "—"}
              </p>
            </div>
          </CollapsibleSection>
        </>
      )}

      <RecordsetDestinationModal
        open={showDestModal}
        onClose={closeDestModal}
        recordsetId={recordsetId}
        editingDestinationId={editingDestinationId}
      />

      <WpLinkModal
        open={showWpModal}
        onClose={() => setShowWpModal(false)}
        posdaObjectType="recordset"
        posdaObjectId={recordsetId ? Number(recordsetId) : undefined}
        typeOptions={[
          { value: "download", label: "Download", searchEndpoint: "manager/downloads" },
        ]}
      />
    </PageShell>
  );
}
