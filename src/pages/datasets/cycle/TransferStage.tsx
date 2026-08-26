import { useState } from "react";
import ExpandableTable from "@/components/ExpandableTable";
import RecordsetLink from "@/components/RecordsetLink";
import TransferManageModal from "@/components/TransferManageModal";
import QueueTransferModal from "@/components/QueueTransferModal";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import {
  useCreateTransfer,
  useReleaseDestinations,
  useReleaseTransfers,
  useSyncTransferRecordsets,
  useTransferRecordsets,
  type ReleaseDestination,
  type ReleaseTransfer,
  type TransferRecordset,
} from "@/lib/transferForm";
import { useCycleContext } from "./CycleLayout";

/** One destination the release ships to. Rows are destinations rather than
 *  transfers so a configured destination with nothing created yet is still
 *  visible -- the same reason Bundle lists unfrozen recordsets. */
type DestinationRow = ReleaseDestination & {
  transfer: ReleaseTransfer | null;
  /** Still present in the recordsets' destination config. False for a transfer
   *  whose destination has since been unconfigured everywhere -- it has no
   *  destination row of its own, and hiding it would hide a real transfer. */
  configured: boolean;
};

function buildRows(
  destinations: ReleaseDestination[],
  transfers: ReleaseTransfer[],
): DestinationRow[] {
  const transferByDest = new Map(transfers.map((t) => [t.destination_id, t]));
  const rows: DestinationRow[] = destinations.map((d) => ({
    ...d,
    transfer: transferByDest.get(d.destination_id) ?? null,
    configured: true,
  }));

  const seen = new Set(destinations.map((d) => d.destination_id));
  for (const t of transfers) {
    if (seen.has(t.destination_id)) continue;
    rows.push({
      destination_id: t.destination_id,
      destination_name: t.destination_name,
      destination_abbr: t.destination_abbr,
      transfer_mode_id: t.transfer_mode_id,
      transfer_mode_name: t.transfer_mode_name,
      transfer: t,
      configured: false,
    });
  }
  return rows;
}

type ManifestGroup = {
  label: string;
  note?: string;
  rows: TransferRecordset[];
};

/** Which manifest each recordset feeds. IDC's manifests are **dataset-level** --
 *  one imaging manifest per transfer spanning every Radiology Images recordset,
 *  not one per recordset -- so the contents group by manifest rather than
 *  listing a target per row. Other destinations ship their recordsets directly.
 *  Keyed on `destination_abbr`, matching `transfers/Detail.tsx`. */
function manifestGroups(
  rows: TransferRecordset[],
  destinationAbbr: string,
): ManifestGroup[] {
  if (destinationAbbr !== "idc") {
    return rows.length > 0 ? [{ label: "Recordsets", rows }] : [];
  }

  const imaging = rows.filter((r) => r.recordset_type_name === "Radiology Images");
  const clinical = rows.filter((r) => r.recordset_type_name === "Clinical Data");
  const rest = rows.filter(
    (r) =>
      r.recordset_type_name !== "Radiology Images" &&
      r.recordset_type_name !== "Clinical Data",
  );

  const groups: ManifestGroup[] = [];
  if (imaging.length > 0) groups.push({ label: "Imaging manifest", rows: imaging });
  if (clinical.length > 0) {
    groups.push({ label: "Clinical manifest", rows: clinical });
  }
  if (rest.length > 0) {
    groups.push({
      label: "Not manifested for IDC",
      note: "check this recordset's destinations",
      rows: rest,
    });
  }
  return groups;
}

/** What a transfer carries, grouped by the manifest it feeds. Lazily fetched --
 *  only an expanded row asks for it. */
function TransferContents({
  transferId,
  destinationAbbr,
}: {
  transferId: number;
  destinationAbbr: string;
}) {
  const recordsets = useTransferRecordsets(transferId);

  if (recordsets.isLoading) return <LoadingState />;
  if (recordsets.isError) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        Could not load what this transfer carries.
      </p>
    );
  }

  const rows = recordsets.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        This transfer carries no recordsets.
      </p>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {manifestGroups(rows, destinationAbbr).map((group) => (
        <div key={group.label}>
          <p
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--muted)" }}
          >
            {group.label} · {group.rows.length} recordset
            {group.rows.length === 1 ? "" : "s"}
          </p>
          {group.note && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              ⚠ {group.note}
            </p>
          )}
          <ul
            className="mt-1 divide-y overflow-hidden rounded-md"
            style={{
              borderColor: "var(--border)",
              border: "1px solid var(--border-strong)",
            }}
          >
            {group.rows.map((r) => (
              <li
                key={r.recordset_release_id}
                className="flex items-baseline justify-between gap-3 px-3 py-1.5"
              >
                <RecordsetLink id={r.recordset_id} name={r.recordset_name} />
                <span className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                  v{r.release_number} · {r.recordset_type_name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function TransferStage() {
  const { cycle, datasetId } = useCycleContext();
  const { addToast } = useToast();
  const release = cycle.dataset_release;
  const releaseId = release?.dataset_release_id;

  const destinations = useReleaseDestinations(releaseId);
  const transfers = useReleaseTransfers(releaseId);
  const create = useCreateTransfer(releaseId, datasetId);
  const sync = useSyncTransferRecordsets(releaseId, datasetId);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [manageRow, setManageRow] = useState<DestinationRow | null>(null);
  const [queueRow, setQueueRow] = useState<DestinationRow | null>(null);

  if (!release) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Nothing to transfer until a dataset release exists.
      </p>
    );
  }

  // UI-only gate today; the API is being tightened to match (TECH_DEBT #5).
  if (release.release_status === "draft") {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        v{release.release_number} is still a draft. Finalize it in Bundle to
        start transferring it.
      </p>
    );
  }

  // Captured so the row callbacks below don't depend on narrowing `release`
  // through a closure, which TS won't carry into a function declaration.
  const releaseNumber = release.release_number;

  const rows = buildRows(destinations.data ?? [], transfers.data ?? []);
  const drifted = rows.filter((r) => r.transfer?.membership_drifted).length;
  // Bundled into this release but routed nowhere -- these files ship to no
  // destination at all, and nothing else on the page would say so.
  const stranded = cycle.recordsets.filter(
    (r) => r.in_dataset_release && r.destinations.length === 0,
  );

  function createFor(row: DestinationRow) {
    create.mutate(
      {
        destination: row,
        datasetName: cycle.dataset_name,
        releaseNumber,
      },
      {
        onSuccess: () => toastSuccess(addToast, `Transfer created for ${row.destination_name}.`),
        onError: (e) =>
          toastError(
            addToast,
            e instanceof Error ? e.message : "Could not create the transfer.",
          ),
      },
    );
  }

  function syncFor(row: DestinationRow) {
    if (!row.transfer) return;
    sync.mutate(
      {
        transferId: row.transfer.dataset_release_transfer_id,
        destinationId: row.destination_id,
      },
      {
        onSuccess: ({ added, removed }) => {
          const parts: string[] = [];
          if (added > 0) parts.push(`${added} added`);
          if (removed > 0) parts.push(`${removed} removed`);
          toastSuccess(
            addToast,
            parts.length > 0 ? parts.join(", ") + "." : "Already up to date.",
          );
        },
        onError: (e) =>
          toastError(
            addToast,
            e instanceof Error ? e.message : "Could not sync the transfer.",
          ),
      },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">
          v{release.release_number}
          {release.release_date &&
            ` · ${new Date(release.release_date).toLocaleDateString()}`}
        </span>
        <StatusBadge status={release.release_status} />
      </div>

      {stranded.length > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          ⚠ {stranded.length} recordset{stranded.length === 1 ? "" : "s"} in this
          release {stranded.length === 1 ? "has" : "have"} no destination
          configured — {stranded.map((r) => r.recordset_name).join(", ")} will not
          ship anywhere. Set destinations in Setup.
        </p>
      )}

      {drifted > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          ⚠ {drifted} transfer{drifted === 1 ? "" : "s"} no longer match
          {drifted === 1 ? "es" : ""} what this release bundles — sync{" "}
          {drifted === 1 ? "it" : "them"} below before queueing.
        </p>
      )}

      {(destinations.isError || transfers.isError) && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Could not load this release&apos;s transfers.
        </p>
      )}

      <ExpandableTable
        headers={["Destination", "Transfer", "Recordsets", "Status", ""]}
        rows={rows}
        getRowKey={(r) => r.destination_id}
        expandLabel="contents"
        expandedKey={expandedId}
        onExpandedKeyChange={(k) => setExpandedId(k as number | null)}
        canExpand={(r) => r.transfer !== null}
        emptyMessage="No recordset in this release has a destination configured yet."
        renderExpanded={(r) =>
          r.transfer ? (
            <TransferContents
              transferId={r.transfer.dataset_release_transfer_id}
              destinationAbbr={r.destination_abbr}
            />
          ) : null
        }
        renderCells={(r) => {
          const t = r.transfer;
          const busy =
            (create.isPending &&
              create.variables?.destination.destination_id === r.destination_id) ||
            (sync.isPending &&
              sync.variables?.destinationId === r.destination_id);

          return (
            <>
              <td className="px-2 py-1">
                <div>{r.destination_name}</div>
                {!r.configured && (
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    no longer configured
                  </div>
                )}
              </td>
              <td className="px-2 py-1">
                {t ? (
                  <RecordsetLink
                    to={`/transfers/${t.dataset_release_transfer_id}`}
                    name={t.transfer_name}
                  />
                ) : (
                  "—"
                )}
              </td>
              <td className="px-2 py-1">
                {t ? (
                  <span className="flex items-center gap-2">
                    {t.recordset_count}
                    {t.membership_drifted && (
                      <span
                        className="text-xs text-amber-600 dark:text-amber-400"
                        title={`This release now bundles ${t.expected_recordset_count} recordset(s) for this destination`}
                      >
                        out of sync
                      </span>
                    )}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-2 py-1">
                {t ? <StatusBadge status={t.transfer_status} /> : "—"}
              </td>
              <td className="px-2 py-1">
                <div className="flex items-center justify-end gap-2">
                  {!t && r.configured && (
                    <Button size="sm" disabled={busy} onClick={() => createFor(r)}>
                      Create
                    </Button>
                  )}
                  {t?.membership_drifted && (
                    <Button size="sm" disabled={busy} onClick={() => syncFor(r)}>
                      Sync
                    </Button>
                  )}
                  {t && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setManageRow(r)}
                    >
                      Manage
                    </Button>
                  )}
                  {t?.transfer_status === "draft" && (
                    <Button size="sm" onClick={() => setQueueRow(r)}>
                      Queue
                    </Button>
                  )}
                </div>
              </td>
            </>
          );
        }}
      />

      <TransferManageModal
        open={manageRow !== null}
        onClose={() => setManageRow(null)}
        transferId={manageRow?.transfer?.dataset_release_transfer_id}
        transferName={manageRow?.transfer?.transfer_name}
        destinationAbbr={manageRow?.destination_abbr}
        destinationName={manageRow?.destination_name}
      />

      <QueueTransferModal
        open={queueRow !== null}
        onClose={() => setQueueRow(null)}
        transfer={queueRow?.transfer ?? null}
        releaseId={releaseId}
        datasetId={datasetId}
      />
    </div>
  );
}
