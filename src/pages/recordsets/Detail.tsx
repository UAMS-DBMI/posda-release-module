import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DynamicSection, {
  DynamicSectionField,
} from "@/components/DynamicSection";
import DynamicTable from "@/components/DynamicTable";
import { Button, LinkButton } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { papiUrl } from "@/lib/papi";

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
  who_created: string;
  when_updated: string;
  who_updated: string;
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

type RecordsetDestination = {
  destination_id: number;
  destination_name: string;
  destination_abbr: string;
  default_display: boolean;
  transfer_mode_id: number;
  transfer_mode_name: string;
};

type DestinationLookup = {
  destination_id: number;
  destination_name: string;
  destination_abbr: string;
};

type TransferModeLookup = {
  transfer_mode_id: number;
  transfer_mode_name: string;
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

  const drafts = Array.isArray(source?.drafts)
    ? source.drafts
    : Array.isArray(source?.data)
      ? source.data
      : [];

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
  const { addToast } = useToast();
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

  const [destinations, setDestinations] = useState<RecordsetDestination[]>([]);
  const [isLoadingDestinations, setIsLoadingDestinations] = useState(false);
  const [destinationsError, setDestinationsError] = useState<string | null>(
    null,
  );
  const [allDestinations, setAllDestinations] = useState<DestinationLookup[]>(
    [],
  );
  const [transferModes, setTransferModes] = useState<TransferModeLookup[]>([]);

  const [showDestModal, setShowDestModal] = useState(false);
  const [destModalIsAdding, setDestModalIsAdding] = useState(true);
  const [destModalDestId, setDestModalDestId] = useState<number | null>(null);
  const [destModalDefaultDisplay, setDestModalDefaultDisplay] = useState(false);
  const [destModalTransferModeId, setDestModalTransferModeId] = useState<
    number | null
  >(null);
  const [isSavingDest, setIsSavingDest] = useState(false);
  const [destModalError, setDestModalError] = useState<string | null>(null);

  const [wpMap, setWpMap] = useState<WpMap | null | undefined>(undefined);
  const [isLoadingWpMap, setIsLoadingWpMap] = useState(false);
  const [showWpModal, setShowWpModal] = useState(false);
  const [wpSearchQuery, setWpSearchQuery] = useState("");
  const [wpResults, setWpResults] = useState<WpSearchResult[]>([]);
  const [isSearchingWp, setIsSearchingWp] = useState(false);
  const [isSavingWpMap, setIsSavingWpMap] = useState(false);
  const [wpModalError, setWpModalError] = useState<string | null>(null);

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
        const response = await fetch(papiUrl(`recordsets/${recordsetId}`), {
          cache: "no-store",
        });

        if (!response.ok) {
          const fallbackMessage = `Could not load recordset ${recordsetId}.`;

          try {
            const json = (await response.json()) as { error?: string };
            throw new Error(json.error ?? fallbackMessage);
          } catch {
            throw new Error(fallbackMessage);
          }
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
          `${papiUrl(`recordsets/${recordsetId}/releases`)}?${releasesQuery}`,
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
          `${papiUrl(`recordsets/${recordsetId}/drafts`)}?${draftsQuery}`,
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

  useEffect(() => {
    if (!recordsetId) return;
    let isMounted = true;

    setIsLoadingDestinations(true);
    setDestinationsError(null);

    async function loadDestinationsAndLookups() {
      try {
        const [destRes, allDestRes, modesRes] = await Promise.all([
          fetch(papiUrl(`recordsets/${recordsetId}/destinations`), {
            cache: "no-store",
          }),
          fetch(papiUrl("lookups/destinations"), { cache: "no-store" }),
          fetch(papiUrl("lookups/transfer-modes"), { cache: "no-store" }),
        ]);

        if (!isMounted) return;

        if (destRes.ok) {
          const json = (await destRes.json()) as
            | { data?: RecordsetDestination[] }
            | RecordsetDestination[];
          setDestinations(Array.isArray(json) ? json : (json.data ?? []));
        } else {
          setDestinationsError("Could not load destinations.");
        }

        if (allDestRes.ok) {
          const json = (await allDestRes.json()) as
            | { data?: DestinationLookup[] }
            | DestinationLookup[];
          setAllDestinations(Array.isArray(json) ? json : (json.data ?? []));
        }

        if (modesRes.ok) {
          const json = (await modesRes.json()) as
            | { data?: TransferModeLookup[] }
            | TransferModeLookup[];
          setTransferModes(Array.isArray(json) ? json : (json.data ?? []));
        }
      } catch {
        if (isMounted) setDestinationsError("Could not load destinations.");
      } finally {
        if (isMounted) setIsLoadingDestinations(false);
      }
    }

    void loadDestinationsAndLookups();
    return () => {
      isMounted = false;
    };
  }, [recordsetId]);

  function openAddDestModal() {
    setDestModalIsAdding(true);
    setDestModalDestId(null);
    setDestModalDefaultDisplay(false);
    setDestModalTransferModeId(transferModes[0]?.transfer_mode_id ?? null);
    setDestModalError(null);
    setShowDestModal(true);
  }

  function openEditDestModal(dest: RecordsetDestination) {
    setDestModalIsAdding(false);
    setDestModalDestId(dest.destination_id);
    setDestModalDefaultDisplay(dest.default_display);
    setDestModalTransferModeId(dest.transfer_mode_id);
    setDestModalError(null);
    setShowDestModal(true);
  }

  function closeDestModal() {
    setShowDestModal(false);
    setDestModalError(null);
  }

  async function handleSaveDestination() {
    if (!recordsetId || !destModalDestId || !destModalTransferModeId) return;

    setIsSavingDest(true);
    setDestModalError(null);

    try {
      const res = await fetch(
        papiUrl(`recordsets/${recordsetId}/destinations/${destModalDestId}`),
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            default_display: destModalDefaultDisplay,
            default_transfer_mode_id: destModalTransferModeId,
          }),
        },
      );

      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? "Could not save destination.");
      }

      toastSuccess(
        addToast,
        destModalIsAdding ? "Destination added." : "Destination updated.",
      );
      closeDestModal();

      const destRes = await fetch(
        papiUrl(`recordsets/${recordsetId}/destinations`),
        { cache: "no-store" },
      );
      if (destRes.ok) {
        const json = (await destRes.json()) as
          | { data?: RecordsetDestination[] }
          | RecordsetDestination[];
        setDestinations(Array.isArray(json) ? json : (json.data ?? []));
      }
    } catch (e) {
      setDestModalError(
        e instanceof Error ? e.message : "Could not save destination.",
      );
      toastError(
        addToast,
        e instanceof Error ? e.message : "Could not save destination.",
      );
    } finally {
      setIsSavingDest(false);
    }
  }

  useEffect(() => {
    if (!recordsetId) return;
    let isMounted = true;
    setIsLoadingWpMap(true);
    fetch(papiUrl(`posda/recordset/${recordsetId}/wp-map`), { cache: "no-store" })
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
  }, [recordsetId]);

  async function searchWp() {
    if (!wpSearchQuery.trim()) return;
    setIsSearchingWp(true);
    setWpResults([]);
    try {
      const res = await fetch(
        `${papiUrl("downloads")}?search=${encodeURIComponent(wpSearchQuery.trim())}`,
      );
      if (res.ok) setWpResults((await res.json()) as WpSearchResult[]);
    } finally {
      setIsSearchingWp(false);
    }
  }

  async function saveWpLink(result: WpSearchResult) {
    if (!recordsetId) return;
    setIsSavingWpMap(true);
    setWpModalError(null);
    try {
      const body = {
        wp_object_type: "download",
        wp_object_id: result.id,
        wp_edit_url: result.edit_url,
        wp_view_url: result.view_url,
      };
      const res = wpMap
        ? await fetch(papiUrl(`wp-object-map/${wpMap.map_id}`), {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(papiUrl("wp-object-map"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              posda_object_type: "recordset",
              posda_object_id: parseInt(recordsetId, 10),
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

  const configuredDestIds = new Set(destinations.map((d) => d.destination_id));
  const availableDestinations = allDestinations.filter(
    (d) => !configuredDestIds.has(d.destination_id),
  );

  const recordset = data?.recordset ?? data?.data ?? null;
  const recordsetFields: DynamicSectionField[] = recordset
    ? [
        { label: "Recordset ID", value: recordset.recordset_id },
        { label: "DOI", value: recordset.recordset_doi },
        { label: "Dataset", value: recordset.dataset_name },
        { label: "License", value: recordset.license_label },
        { label: "Type", value: recordset.recordset_type_name },
        { label: "Active", value: recordset.active ? "Yes" : "No" },
        { label: "Name", value: recordset.recordset_name, fullWidth: true },
      ]
    : [];

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title="Recordset Details"
        breadcrumb={{ label: "Recordsets", href: "/recordsets" }}
        subtitle={recordset?.recordset_name}
        badge={
          recordset
            ? {
                label: recordset.active ? "Active" : "Inactive",
                variant: recordset.active ? "success" : "neutral",
              }
            : undefined
        }
        actions={
          <LinkButton
            href={
              recordsetId ? `/recordsets/${recordsetId}/edit` : "/recordsets"
            }
          >
            Edit Recordset
          </LinkButton>
        }
      />

      <DynamicSection
        isLoading={isLoading}
        error={error}
        fields={recordsetFields}
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
              {recordset
                ? new Date(recordset.when_created).toLocaleString()
                : "—"}{" "}
              by {recordset?.who_created}
            </p>
            <p>
              <span
                className="font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                Updated:
              </span>{" "}
              {recordset
                ? new Date(recordset.when_updated).toLocaleString()
                : "—"}{" "}
              by {recordset?.who_updated}
            </p>
          </div>
        }
      />

      {!isLoading && recordset && (
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
          </SectionCard>

          <CardHeader className="mt-6 mb-0">
            <CardTitle>Destinations</CardTitle>
            <Button
              size="sm"
              onClick={openAddDestModal}
              disabled={availableDestinations.length === 0}
            >
              New Destination
            </Button>
          </CardHeader>
          <SectionCard className="mt-1">
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
                  { key: "transfer_mode_name", label: "Transfer Mode" },
                ]}
                formatters={{
                  default_display: (value) => (value ? "Yes" : "No"),
                }}
                onRowClick={(row) => openEditDestModal(row)}
                getRowKey={(row) => row.destination_id}
              />
            )}
          </SectionCard>

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

          <CardHeader className="mt-6 mb-0">
            <CardTitle>Drafts</CardTitle>
            <LinkButton
              href={
                recordsetId
                  ? `/recordsets/drafts/create?recordset_id=${recordsetId}`
                  : "/recordsets/drafts/create"
              }
              size="sm"
            >
              New Draft
            </LinkButton>
          </CardHeader>
          <SectionCard className="mt-1">
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
          </SectionCard>
        </>
      )}

      {showDestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900">
            <h2 className="text-lg font-semibold">
              {destModalIsAdding ? "New Destination" : "Edit Destination"}
            </h2>

            {destModalError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                {destModalError}
              </p>
            )}

            <div className="mt-4 space-y-4">
              {destModalIsAdding ? (
                <div>
                  <label className="block text-sm font-medium">
                    Destination
                  </label>
                  <select
                    value={destModalDestId ?? ""}
                    onChange={(e) => setDestModalDestId(Number(e.target.value))}
                    className="select mt-1 w-full"
                  >
                    <option value="">Select a destination...</option>
                    {availableDestinations.map((d) => (
                      <option key={d.destination_id} value={d.destination_id}>
                        {d.destination_name} ({d.destination_abbr})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <span className="block text-sm font-medium">Destination</span>
                  <span className="text-sm">
                    {
                      destinations.find(
                        (d) => d.destination_id === destModalDestId,
                      )?.destination_name
                    }
                  </span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium">
                  Transfer Mode
                </label>
                <select
                  value={destModalTransferModeId ?? ""}
                  onChange={(e) =>
                    setDestModalTransferModeId(Number(e.target.value))
                  }
                  className="select mt-1 w-full"
                >
                  <option value="">Select a transfer mode...</option>
                  {transferModes.map((tm) => (
                    <option
                      key={tm.transfer_mode_id}
                      value={tm.transfer_mode_id}
                    >
                      {tm.transfer_mode_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="dest_default_display"
                  checked={destModalDefaultDisplay}
                  onChange={(e) => setDestModalDefaultDisplay(e.target.checked)}
                  className="h-4 w-4"
                />
                <label
                  htmlFor="dest_default_display"
                  className="text-sm font-medium"
                >
                  Default Display
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={closeDestModal}
                disabled={isSavingDest}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleSaveDestination()}
                disabled={
                  isSavingDest || !destModalDestId || !destModalTransferModeId
                }
              >
                {isSavingDest ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
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
            <h2 className="text-lg font-semibold">
              Link to WordPress Download
            </h2>
            {wpModalError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                {wpModalError}
              </p>
            )}
            <div className="mt-4 space-y-3">
              <div className="space-y-2">
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
                <Button
                  onClick={() => void searchWp()}
                  disabled={isSearchingWp || !wpSearchQuery.trim()}
                >
                  {isSearchingWp ? "…" : "Search"}
                </Button>
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
