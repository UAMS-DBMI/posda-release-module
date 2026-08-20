import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CreateDraftModal from "@/components/CreateDraftModal";
import DraftSummary from "@/components/DraftSummary";
import ExpandableTable from "@/components/ExpandableTable";
import ManageFilesModal from "@/components/ManageFilesModal";
import RecordsetLink from "@/components/RecordsetLink";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import DynamicTable from "@/components/DynamicTable";
import RecordsetDestinationModal from "@/components/RecordsetDestinationModal";
import RecordsetEditModal from "@/components/RecordsetEditModal";
import WpLinkPill from "@/components/WpLinkPill";
import { Button } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { useFavorites } from "@/lib/useFavorites";
import { useSetDraftStatus } from "@/lib/useCycle";
import { useWpMap } from "@/lib/wpObjectMap";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useDestinationLookups, useRecordset } from "@/lib/recordsetForm";
import {
  useRecordsetDestinations,
  type RecordsetDestination,
} from "@/lib/recordsetDestinations";
import FavoriteStar from "@/components/FavoriteStar";
import { LoadingState } from "@/components/ui/Spinner";

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
  const { favoriteKeys, toggle: toggleFavorite } = useFavorites();
  const { recordset_id: recordsetId } = useParams<{ recordset_id: string }>();
  const { addToast } = useToast();
  const {
    data: recordset,
    isLoading,
    isError,
    error: recordsetError,
  } = useRecordset(recordsetId);
  // Gates `CreateDraftModal`'s WordPress source tab. `WpLinkPill` fetches the
  // same map internally; react-query shares the one request.
  const { data: wpMap } = useWpMap(
    "recordset",
    recordsetId ? Number(recordsetId) : undefined,
  );
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

  const [showEditModal, setShowEditModal] = useState(false);

  // The drafts list below is a hand-rolled fetch, so `CreateDraftModal`'s
  // react-query invalidation can't reach it -- bump this to refetch instead.
  const [showCreateDraftModal, setShowCreateDraftModal] = useState(false);
  const [draftsRefreshKey, setDraftsRefreshKey] = useState(0);
  const [expandedDraftId, setExpandedDraftId] = useState<number | null>(null);
  const [manageDraftId, setManageDraftId] = useState<number | null>(null);

  const datasetId = recordset ? String(recordset.dataset_id) : undefined;
  const setStatus = useSetDraftStatus(datasetId);

  function setDraftStatus(draftId: number, status: "ready" | "open") {
    setStatus.mutate(
      { draftId, status },
      {
        onSuccess: () => {
          setDraftsRefreshKey((k) => k + 1);
          toastSuccess(
            addToast,
            status === "ready" ? "Draft marked ready." : "Draft reopened.",
          );
        },
        onError: (e) =>
          toastError(
            addToast,
            e instanceof Error ? e.message : "Could not update the draft status.",
          ),
      },
    );
  }

  // Releases and drafts only need the id -- independent of the recordset
  // record itself, which comes from the shared `useRecordset` query (kept in
  // sync with `RecordsetEditModal`'s save via its cache invalidation).
  useEffect(() => {
    if (!recordsetId) {
      setReleasesData(null);
      setDraftsData(null);
      setIsLoadingReleases(false);
      setIsLoadingDrafts(false);
      return;
    }

    let isMounted = true;

    async function loadReleasesAndDrafts() {
      setIsLoadingReleases(true);
      setReleasesError(null);
      setIsLoadingDrafts(true);
      setDraftsError(null);

      try {
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
        } else {
          setDraftsData(null);
          setDraftsError(
            caughtError instanceof Error
              ? caughtError.message
              : `Could not load drafts for recordset ${recordsetId}.`,
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingReleases(false);
          setIsLoadingDrafts(false);
        }
      }
    }

    void loadReleasesAndDrafts();

    return () => {
      isMounted = false;
    };
  }, [
    recordsetId,
    draftsPage,
    draftsItemsPerPage,
    releasesPage,
    releasesItemsPerPage,
    draftsRefreshKey,
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

  const openDraft =
    draftsData?.drafts.find(
      (d) => d.draft_status !== "published" && d.draft_status !== "deleted",
    ) ?? null;

  const metadataStrip = recordset
    ? [
        `#${recordset.recordset_id}`,
        recordset.recordset_doi,
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
        breadcrumbs={[
          { label: "Datasets", href: "/datasets" },
          ...(recordset?.dataset_id != null
            ? [
                {
                  label: recordset.dataset_name ?? `Dataset ${recordset.dataset_id}`,
                  href: `/datasets/${recordset.dataset_id}`,
                },
              ]
            : []),
        ]}
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
            <Button
              variant="ghost"
              onClick={() => setShowEditModal(true)}
              disabled={!recordsetId}
            >
              Edit Recordset
            </Button>
          </>
        }
        subActions={
          <WpLinkPill
            posdaObjectType="recordset"
            posdaObjectId={recordsetId ? Number(recordsetId) : undefined}
            typeOptions={[
              {
                value: "download",
                label: "Download",
                searchEndpoint: "manager/downloads",
              },
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
            {recordsetError instanceof Error
              ? recordsetError.message
              : `Could not load recordset ${recordsetId}.`}
          </p>
        </SectionCard>
      )}

      {!isLoading && recordset && recordsetId && (
        <SectionCard className="mt-4">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Destinations</CardTitle>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                ({destinations.length})
              </span>
            </div>
            <Button
              size="sm"
              onClick={openAddDestModal}
              disabled={availableDestinations.length === 0}
            >
              New Destination
            </Button>
          </CardHeader>
          <div>
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
          </div>

          <CardHeader className="mt-6">
            <div className="flex items-center gap-2">
              <CardTitle>Drafts</CardTitle>
              {draftsData && (
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  ({draftsData.total})
                </span>
              )}
            </div>
            {!openDraft && (
              <Button size="sm" onClick={() => setShowCreateDraftModal(true)}>
                New Draft
              </Button>
            )}
          </CardHeader>
          <div>
            {isLoadingDrafts && <p className="text-sm">Loading drafts...</p>}
            {!isLoadingDrafts && draftsError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {draftsError}
              </p>
            )}
            {!isLoadingDrafts && !draftsError && draftsData && (
              <ExpandableTable
                headers={["Name", "Status", "Files", "Cloned From", ""]}
                rows={draftsData.drafts}
                getRowKey={(d) => d.recordset_draft_id}
                expandLabel="contents"
                expandedKey={expandedDraftId}
                onExpandedKeyChange={(k) => setExpandedDraftId(k as number | null)}
                renderExpanded={(d) => (
                  <DraftSummary draftId={d.recordset_draft_id} />
                )}
                pagination={{
                  page: draftsPage,
                  pageSize: draftsItemsPerPage,
                  totalItems: draftsData.total,
                  onPageChange: setDraftsPage,
                  onPageSizeChange: (nextItemsPerPage) => {
                    setDraftsItemsPerPage(nextItemsPerPage);
                    setDraftsPage(1);
                  },
                }}
                emptyMessage="No drafts yet."
                renderCells={(d) => {
                  // Published / discarded drafts are history -- only an open one
                  // can be edited or moved through the ready lifecycle.
                  const editable =
                    d.draft_status !== "published" && d.draft_status !== "deleted";
                  const isReady = d.draft_status === "ready";

                  return (
                    <>
                      <td className="px-2 py-1">
                        <RecordsetLink
                          to={`/recordsets/drafts/${d.recordset_draft_id}`}
                          name={d.draft_name}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <StatusBadge status={d.draft_status} />
                      </td>
                      <td className="px-2 py-1">
                        {d.file_count.toLocaleString()}
                      </td>
                      <td className="px-2 py-1">
                        {d.cloned_from_release_id != null
                          ? `release ${d.cloned_from_release_id}`
                          : "—"}
                      </td>
                      <td className="px-2 py-1">
                        {editable && (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant={isReady ? "ghost" : undefined}
                              onClick={() =>
                                setDraftStatus(
                                  d.recordset_draft_id,
                                  isReady ? "open" : "ready",
                                )
                              }
                              disabled={!isReady && d.file_count === 0}
                              title={
                                isReady || d.file_count > 0
                                  ? undefined
                                  : "Add files before marking ready"
                              }
                              loading={
                                setStatus.isPending &&
                                setStatus.variables?.draftId ===
                                  d.recordset_draft_id
                              }
                            >
                              {isReady ? "Reopen" : "Mark Ready"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setManageDraftId(d.recordset_draft_id)
                              }
                            >
                              Manage
                            </Button>
                          </div>
                        )}
                      </td>
                    </>
                  );
                }}
              />
            )}
          </div>

          <CardHeader className="mt-6">
            <CardTitle>Releases</CardTitle>
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
          </div>
        </SectionCard>
      )}

      <RecordsetDestinationModal
        open={showDestModal}
        onClose={closeDestModal}
        recordsetId={recordsetId}
        editingDestinationId={editingDestinationId}
      />

      <RecordsetEditModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        recordsetId={recordsetId}
      />

      <CreateDraftModal
        open={showCreateDraftModal}
        onClose={() => setShowCreateDraftModal(false)}
        datasetId={datasetId}
        recordsetId={Number(recordsetId)}
        recordsetName={recordset?.recordset_name ?? ""}
        wpLinked={Boolean(wpMap)}
        onCreated={() => setDraftsRefreshKey((k) => k + 1)}
      />

      <ManageFilesModal
        open={manageDraftId !== null}
        onClose={() => {
          setManageDraftId(null);
          setDraftsRefreshKey((k) => k + 1);
        }}
        datasetId={datasetId}
        draftId={manageDraftId}
        recordsetName={recordset?.recordset_name ?? ""}
        wpLinked={Boolean(wpMap)}
        initialTab="add"
      />
    </PageShell>
  );
}
