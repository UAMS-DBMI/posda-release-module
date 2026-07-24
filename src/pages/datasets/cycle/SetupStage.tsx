import { useState } from "react";
import { Link } from "react-router-dom";
import CreateRecordsetModal from "@/components/CreateRecordsetModal";
import DatasetEditModal from "@/components/DatasetEditModal";
import RecordsetDestinationModal from "@/components/RecordsetDestinationModal";
import RecordsetEditModal from "@/components/RecordsetEditModal";
import WpLinkModal from "@/components/WpLinkModal";
import DynamicTable from "@/components/DynamicTable";
import { Button, ExternalLinkButton } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  useWpMap,
  useWpObject,
  wpTypeOptionForDataset,
  type WpObjectLive,
} from "@/lib/wpObjectMap";
import { useDeleteRecordsetDestination } from "@/lib/recordsetDestinations";
import { EditIcon, ExternalLinkIcon, LinkIcon } from "@/components/icons";
import classNames from "@/lib/classNames";
import { useToast } from "@/components/Toast";
import { toastError } from "@/components/toastHelpers";
import { useCycleContext } from "./CycleLayout";
import type { CycleRecordsetDestination } from "@/lib/useCycle";

/** Label/variant for a WordPress link pill. Checks `status === "trash"`
 *  rather than the slug -- WP appends "__trashed" to the slug on trash, so
 *  matching that string is brittle compared to reading the real status. */
function wpBadgeState(
  linked: boolean,
  isError: boolean,
  data: WpObjectLive | undefined,
): { label: string; variant: "success" | "danger" | "warning" | "neutral" } {
  if (!linked) return { label: "Not Linked", variant: "warning" };
  if (isError) return { label: "Broken Link", variant: "danger" };
  if (data?.status === "trash") return { label: "Trashed", variant: "warning" };
  return { label: data?.slug ?? "Linked", variant: "success" };
}

/** Placeholder for the brief window between "linked" and the live slug
 *  arriving -- avoids showing "Linked" and then visibly swapping to the
 *  slug a moment later. */
function WpBadgeSkeleton() {
  return (
    <span
      className="inline-block h-5 w-20 animate-pulse rounded-full"
      style={{ background: "var(--border-strong)" }}
    />
  );
}

/** Stage 0 — ready the dataset for cycles. Step 2 adds relations; for now it
 *  lists recordsets, lets you create one, and manage each one's destinations
 *  and WordPress download link, plus the dataset's collection page. */
export default function SetupStage() {
  const { cycle, datasetId } = useCycleContext();
  const { addToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [destRecordsetId, setDestRecordsetId] = useState<number | null>(null);
  const [editingDestinationId, setEditingDestinationId] = useState<number | null>(
    null,
  );
  const [wpRecordsetId, setWpRecordsetId] = useState<number | null>(null);
  const [showCollectionWp, setShowCollectionWp] = useState(false);
  const [showDatasetEdit, setShowDatasetEdit] = useState(false);
  const [editRecordsetId, setEditRecordsetId] = useState<number | null>(null);
  const deleteDestination = useDeleteRecordsetDestination();

  function handleRemoveDestination(recordsetId: number, destinationId: number) {
    deleteDestination.mutate(
      { recordsetId, destinationId },
      {
        onError: (e) => {
          toastError(
            addToast,
            e instanceof Error ? e.message : "Could not remove destination.",
          );
        },
      },
    );
  }

  const { data: collectionMap, isLoading: isLoadingCollectionMap } = useWpMap(
    "dataset",
    datasetId ? Number(datasetId) : undefined,
  );
  const {
    data: collectionObject,
    isLoading: isLoadingCollectionObject,
    isError: collectionWpBroken,
  } = useWpObject(
    "dataset",
    datasetId ? Number(datasetId) : undefined,
    Boolean(collectionMap),
  );

  const datasetRows = [
    {
      dataset_id: cycle.dataset_id,
      dataset_name: cycle.dataset_name,
      dataset_type_name: cycle.dataset_type_name,
      latest: cycle.latest_dataset_release
        ? `v${cycle.latest_dataset_release.release_number}`
        : "never released",
      wp_linked: Boolean(collectionMap),
    },
  ];

  const rows = cycle.recordsets.map((r) => ({
    recordset_id: r.recordset_id,
    recordset_name: r.recordset_name,
    recordset_type_name: r.recordset_type_name,
    latest: r.latest_release
      ? `v${r.latest_release.release_number}`
      : "never released",
    last_bundled: r.last_bundled_dataset_release_number,
    destinations: r.destinations,
    wp_linked: r.wp_linked,
    wp_edit_url: r.wp_edit_url,
  }));

  // Downloads listed on the dataset's WP page that aren't the current
  // download for any recordset here -- left behind by unlinking/relinking a
  // recordset's download, or added directly in WordPress. Computed
  // server-side now (GET .../cycle) so it can also gate Setup completion;
  // detection only, no auto-remediation.
  const orphanedDownloadCount = cycle.orphaned_download_count;

  return (
    <div className="space-y-3">
      <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
        Dataset
      </span>

      <DynamicTable
        rows={datasetRows}
        getRowKey={(row) => row.dataset_id}
        hideSummary
        columns={[
          {
            key: "dataset_name",
            label: "Dataset",
            render: (_v, row) => (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="px-2"
                  aria-label="Edit Dataset"
                  title="Edit Dataset"
                  onClick={() => setShowDatasetEdit(true)}
                >
                  <EditIcon />
                </Button>
                <Link
                  to={`/datasets/${row.dataset_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-accent"
                  style={{ color: "var(--accent)" }}
                >
                  {row.dataset_name}
                </Link>
              </div>
            ),
          },
          { key: "dataset_type_name", label: "Type" },
          { key: "latest", label: "Latest Release" },
          {
            key: "wp_linked",
            label: "WordPress",
            render: () => {
              const badge = wpBadgeState(Boolean(collectionMap), collectionWpBroken, collectionObject);
              return (
              <div className="flex flex-wrap items-center gap-2">
                {isLoadingCollectionMap ? (
                  <StatusBadge status="loading" label="Loading…" variant="neutral" />
                ) : collectionMap && isLoadingCollectionObject ? (
                  <WpBadgeSkeleton />
                ) : (
                  <StatusBadge
                    status={collectionMap ? "linked" : "not_linked"}
                    label={badge.label}
                    variant={badge.variant}
                  />
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="px-2"
                  aria-label="Link WordPress Object"
                  title="Link WordPress Object"
                  onClick={() => setShowCollectionWp(true)}
                >
                  <LinkIcon />
                </Button>
                {collectionMap?.wp_view_url && (
                  <ExternalLinkButton
                    size="sm"
                    variant="ghost"
                    className="px-2"
                    aria-label="View on WordPress"
                    title="View on WordPress"
                    href={collectionMap.wp_view_url}
                  >
                    <ExternalLinkIcon />
                  </ExternalLinkButton>
                )}
                {collectionMap?.wp_edit_url && (
                  <ExternalLinkButton
                    size="sm"
                    variant="ghost"
                    className="px-2"
                    aria-label="Edit on WordPress"
                    title="Edit on WordPress"
                    href={collectionMap.wp_edit_url}
                  >
                    <EditIcon />
                  </ExternalLinkButton>
                )}
              </div>
              );
            },
          },
        ]}
      />

      {orphanedDownloadCount > 0 && (
        <div
          className="rounded-md px-3 py-2 text-sm bg-amber-50 dark:bg-amber-900/15"
          style={{ border: "1px solid var(--border-strong)" }}
        >
          <span className="font-semibold text-amber-700 dark:text-amber-400">Note: </span>
          <span className="text-amber-700 dark:text-amber-400">
            {orphanedDownloadCount} download{orphanedDownloadCount === 1 ? "" : "s"} listed on
            the dataset's WordPress page {orphanedDownloadCount === 1 ? "isn't" : "aren't"} linked
            to any of these recordsets.
          </span>
        </div>
      )}

      <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
        Recordsets
      </span>

      {cycle.recordsets.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No recordsets yet — add one to begin.
        </p>
      ) : (
        <DynamicTable
          rows={rows}
          getRowKey={(row) => row.recordset_id}
          emptyMessage="No recordsets yet."
          hideSummary
          columns={[
            {
              key: "recordset_name",
              label: "Recordset",
              render: (_v, row) => (
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="px-2"
                    aria-label="Edit Recordset"
                    title="Edit Recordset"
                    onClick={() => setEditRecordsetId(row.recordset_id)}
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
            {
              key: "latest",
              label: "Latest Release",
              render: (v, row) => (
                <div>
                  <div>{String(v)}</div>
                  {row.last_bundled != null && (
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      last bundled: dataset v{row.last_bundled}
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: "destinations",
              label: "Destinations",
              render: (_v, row) => (
                <div className="flex flex-wrap items-center gap-1">
                  {row.destinations.length === 0 ? (
                    <StatusBadge status="none" label="None" variant="warning" />
                  ) : (
                    row.destinations.map((d: CycleRecordsetDestination) => (
                      <span
                        key={d.destination_id}
                        className={classNames(
                          "inline-flex items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-xs font-medium",
                          d.default_display
                            ? "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                        )}
                      >
                        <button
                          type="button"
                          aria-label={`Edit ${d.destination_abbr}`}
                          title={`Edit ${d.destination_abbr}`}
                          onClick={() => {
                            setDestRecordsetId(row.recordset_id);
                            setEditingDestinationId(d.destination_id);
                          }}
                          className="rounded-full hover:underline"
                        >
                          {d.destination_abbr}
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${d.destination_abbr}`}
                          title={`Remove ${d.destination_abbr}`}
                          disabled={deleteDestination.isPending}
                          onClick={() =>
                            handleRemoveDestination(row.recordset_id, d.destination_id)
                          }
                          className="rounded-full px-1 leading-none hover:bg-black/10 disabled:opacity-50 dark:hover:bg-white/10"
                        >
                          −
                        </button>
                      </span>
                    ))
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="px-2"
                    aria-label="Add destination"
                    title="Add destination"
                    onClick={() => {
                      setDestRecordsetId(row.recordset_id);
                      setEditingDestinationId(null);
                    }}
                  >
                    +
                  </Button>
                </div>
              ),
            },
            {
              key: "wp_linked",
              label: "WordPress",
              render: (_v, row) => (
                <div className="flex items-center gap-2">
                  <RecordsetWpBadge recordsetId={row.recordset_id} wpLinked={row.wp_linked} />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="px-2"
                    disabled={!collectionMap}
                    aria-label="Link WordPress Object"
                    title={
                      collectionMap
                        ? "Link WordPress Object"
                        : "Link the dataset to a WordPress page first"
                    }
                    onClick={() => setWpRecordsetId(row.recordset_id)}
                  >
                    <LinkIcon />
                  </Button>
                  {row.wp_edit_url && (
                    <ExternalLinkButton
                      size="sm"
                      variant="ghost"
                      className="px-2"
                      aria-label="Edit on WordPress"
                      title="Edit on WordPress"
                      href={row.wp_edit_url}
                    >
                      <EditIcon />
                    </ExternalLinkButton>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}

      <Button size="sm" onClick={() => setShowCreate(true)}>
        Create a Recordset
      </Button>

      <CreateRecordsetModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        datasetId={datasetId}
      />

      <RecordsetDestinationModal
        open={destRecordsetId !== null}
        onClose={() => {
          setDestRecordsetId(null);
          setEditingDestinationId(null);
        }}
        recordsetId={destRecordsetId ?? undefined}
        editingDestinationId={editingDestinationId}
      />

      <DatasetEditModal
        open={showDatasetEdit}
        onClose={() => setShowDatasetEdit(false)}
        datasetId={datasetId}
      />

      <RecordsetEditModal
        open={editRecordsetId !== null}
        onClose={() => setEditRecordsetId(null)}
        recordsetId={editRecordsetId ?? undefined}
      />

      <WpLinkModal
        open={wpRecordsetId !== null}
        onClose={() => setWpRecordsetId(null)}
        posdaObjectType="recordset"
        posdaObjectId={wpRecordsetId ?? undefined}
        typeOptions={[
          { value: "download", label: "Download", searchEndpoint: "manager/downloads" },
        ]}
      />

      <WpLinkModal
        open={showCollectionWp}
        onClose={() => setShowCollectionWp(false)}
        posdaObjectType="dataset"
        posdaObjectId={datasetId ? Number(datasetId) : undefined}
        typeOptions={[wpTypeOptionForDataset(cycle.dataset_type_name)]}
      />
    </div>
  );
}

/** One row's WordPress pill -- its own component so each row's live slug
 *  lookup (by the immutable wp_object_id, never cached in wp_object_map)
 *  is an independent query, not a hook called from inside a `.map()`. */
function RecordsetWpBadge({
  recordsetId,
  wpLinked,
}: {
  recordsetId: number;
  wpLinked: boolean;
}) {
  const { data, isLoading, isError } = useWpObject("recordset", recordsetId, wpLinked);
  if (wpLinked && isLoading) return <WpBadgeSkeleton />;
  const badge = wpBadgeState(wpLinked, isError, data);
  return (
    <StatusBadge
      status={wpLinked ? "linked" : "not_linked"}
      label={badge.label}
      variant={badge.variant}
    />
  );
}
