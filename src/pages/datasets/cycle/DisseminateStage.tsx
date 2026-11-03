import { useState } from "react";
import { Link } from "react-router-dom";
import DynamicTable from "@/components/DynamicTable";
import ManifestPreviewModal from "@/components/ManifestPreviewModal";
import { Button, ExternalLinkButton } from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { LoadingState } from "@/components/ui/Spinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WpPostStatusBadge } from "@/components/WpLinkPill";
import {
  EditIcon,
  ExternalLinkIcon,
} from "@/components/icons";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess, toastWarning } from "@/components/toastHelpers";
import {
  useAttachRetrieverManifest,
  useGenerateRetrieverManifest,
  usePublishRelease,
  useUpdateWpPage,
  useWpPageStates,
  type WpPageState,
} from "@/lib/dissemination";
import { useIdcBucketStatus, type IdcBucketStatus } from "@/lib/idcBucket";
import { useTransferRecordsets } from "@/lib/transferForm";
import { namedDownloadUrl } from "@/lib/transferSettings";
import {
  disseminationRecordsets,
  shippingTransfers,
  unlinkedDisseminationRecordsets,
  type CycleRecordset,
  type CycleTransfer,
  type DatasetCycle,
} from "@/lib/useCycle";
import { useCycleContext } from "./CycleLayout";

/** The transfer a recordset's public download points at: the one for its
 *  `default_display` destination. Null when no destination is flagged, or when
 *  no transfer to it exists on this release — both are states to report rather
 *  than paper over, since picking an arbitrary destination would put the wrong
 *  manifest on a public page. */
function publicTransfer(
  recordset: CycleRecordset,
  transfers: CycleTransfer[],
): { transfer: CycleTransfer | null; destinationAbbr: string | null } {
  const dest = recordset.destinations.find((d) => d.default_display);
  if (!dest) return { transfer: null, destinationAbbr: null };
  return {
    transfer: transfers.find((t) => t.destination_id === dest.destination_id) ?? null,
    destinationAbbr: dest.destination_abbr,
  };
}

/** Whether the whole release can go public. Deliberately stricter than what any
 *  individual row needs: a manifest can be generated as soon as *its* transfer
 *  lands, but publishing takes every page live at once, so it waits for all of
 *  them. Mirrors the server's gate, which refuses regardless. */
function publishBlockedReason(
  cycle: DatasetCycle,
  wpPages: WpPageState[],
  idc: IdcBucketStatus | undefined,
): string | null {
  const release = cycle.dataset_release;
  if (!release) return "No release to publish.";
  if (release.release_status === "live") return "Already live.";
  if (release.release_status === "retracted") return "This release was retracted.";
  if (release.release_status === "draft") {
    return "Finalize the release in Bundle first.";
  }
  const transfers = shippingTransfers(release);
  if (transfers.length === 0) {
    return "This release has not been sent anywhere yet.";
  }
  const undelivered = transfers.filter((t) => t.transfer_status !== "success");
  if (undelivered.length > 0) {
    return `Waiting on ${undelivered.map((t) => t.destination_abbr).join(", ")}.`;
  }
  // IDC's Processed is its published, and the release goes live with IDC.
  if (
    transfers.some((t) => t.destination_abbr === "idc") &&
    idc?.status !== "Processed"
  ) {
    return idc?.status === "" || idc?.status === "Draft"
      ? "Set the IDC transfer to Ready in Transfer first."
      : idc?.status === null
        ? "Couldn't read the IDC status."
        : "Waiting on IDC to publish.";
  }
  // Transfers only stage files, and manifests are attached here; the pages
  // still point at the previous files until they're updated below.
  const stale = wpPages.filter((p) => !p.page_current);
  if (stale.length > 0) {
    return `Update the download for ${stale.map((p) => p.recordset_name).join(", ")}.`;
  }
  const unlinked = unlinkedDisseminationRecordsets(cycle);
  if (unlinked.length > 0) {
    return `${unlinked.map((r) => r.recordset_name).join(", ")} not linked to WordPress.`;
  }
  if (!cycle.dataset_wp_linked) return "The dataset has no WordPress page linked.";
  return null;
}

/** The one destination that matters on this stage: the `default_display` one,
 *  which is where the public download points and therefore whose format the
 *  manifest must be in. The others a recordset may be configured for are
 *  Setup's concern, not this stage's — showing them all here would imply a
 *  choice that isn't being made.
 *
 *  Green matches SetupStage's destination pills, where it already means
 *  `default_display` rather than "succeeded". */
function DestinationCell({ recordset }: { recordset: CycleRecordset }) {
  const dest = recordset.destinations.find((d) => d.default_display);
  if (!dest) {
    return <StatusBadge status="none" label="None set" variant="warning" />;
  }
  return (
    <span
      className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400"
      title="The destination this recordset's public download points at"
    >
      {dest.destination_abbr}
    </span>
  );
}

/** The Disseminate column: is this recordset's download page current, and a way
 *  in to what goes on it. The same for manifest and data-file rows; the
 *  differences live in the modal. Its own component so each row can hold its
 *  modal state -- a hook cannot be called inside a `.map()`. */
function DownloadPageCell({ recordset }: { recordset: CycleRecordset }) {
  const { cycle } = useCycleContext();
  const pages = useWpPageStates(cycle.dataset_release?.dataset_release_id);
  const [managing, setManaging] = useState(false);

  const { transfer, destinationAbbr } = publicTransfer(
    recordset,
    cycle.dataset_release?.transfers ?? [],
  );
  const cell = "flex min-h-8 items-center gap-2";
  const note = (text: string) => (
    <div className={`${cell} px-2 text-xs`} style={{ color: "var(--muted)" }}>
      {text}
    </div>
  );

  if (!destinationAbbr) return note("—");
  if (!transfer) {
    return (
      <div className={cell}>
        <StatusBadge status="none" label="No transfer" variant="warning" />
      </div>
    );
  }
  if (transfer.transfer_status !== "success") {
    return note(`Waiting (${transfer.transfer_status.replace(/_/g, " ")})`);
  }
  if (pages.isLoading) return note("Loading…");

  const releaseId = recordset.release_in_cycle?.recordset_release_id;
  const state = pages.data?.find((p) => p.recordset_release_id === releaseId);
  if (!state) return note("—");

  return (
    <div className={cell}>
      {state.page_current ? (
        <StatusBadge status="success" label="Page updated" variant="success" />
      ) : (
        <StatusBadge status="none" label="Page not updated" variant="warning" />
      )}
      <Button size="sm" variant="ghost" onClick={() => setManaging(true)}>
        Manage
      </Button>
      {managing && (
        <DownloadPageModal
          recordset={recordset}
          transfer={transfer}
          state={state}
          onClose={() => setManaging(false)}
        />
      )}
    </div>
  );
}

/** What goes on one recordset's download page, and Update Page to put it there
 *  -- the public change. A retriever manifest is generated here first; a
 *  WordPress data file was already uploaded by its transfer. */
function DownloadPageModal({
  recordset,
  transfer,
  state,
  onClose,
}: {
  recordset: CycleRecordset;
  transfer: CycleTransfer;
  state: WpPageState;
  onClose: () => void;
}) {
  const { addToast } = useToast();
  const generate = useGenerateRetrieverManifest();
  const attach = useAttachRetrieverManifest();
  const update = useUpdateWpPage();
  const [previewing, setPreviewing] = useState(false);

  const isDirect = state.destination_abbr === "wp";
  const { data: rows, isLoading } = useTransferRecordsets(
    transfer.dataset_release_transfer_id,
    !isDirect,
  );
  const row = rows?.find((r) => r.recordset_release_id === state.recordset_release_id);
  const hasManifest = row?.download_file_id != null;
  const target = {
    transferId: transfer.dataset_release_transfer_id,
    recordsetReleaseId: state.recordset_release_id,
  };
  const manifestUrl =
    hasManifest && row?.downloadable_file_id && row?.security_hash
      ? namedDownloadUrl(
          row.downloadable_file_id,
          row.security_hash,
          row.manifest_file_name,
        )
      : null;

  function handleGenerate() {
    generate.mutate(target, {
      onSuccess: (r) =>
        toastSuccess(
          addToast,
          r.series_count === 0
            ? `Generated an empty ${r.manifest_format} manifest — this recordset has no DICOM series.`
            : `Generated a ${r.manifest_format} manifest with ${r.series_count} series.`,
        ),
      onError: (e) =>
        toastError(
          addToast,
          e instanceof Error ? e.message : "Could not generate the manifest.",
        ),
    });
  }

  function handleUpdatePage() {
    const onError = (e: Error) =>
      toastError(addToast, e.message || "Could not update the download.");
    const onDone = (attached: boolean) => {
      toastSuccess(
        addToast,
        attached
          ? `Updated ${recordset.recordset_name}'s download.`
          : `${recordset.recordset_name}'s download already has this file.`,
      );
      onClose();
    };
    if (isDirect) {
      update.mutate(target, { onSuccess: (r) => onDone(r.attached), onError });
    } else {
      attach.mutate(target, { onSuccess: (r) => onDone(r.attached), onError });
    }
  }

  const updating = update.isPending || attach.isPending;
  const canUpdate = !state.page_current && (isDirect || hasManifest);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${recordset.recordset_name} — download`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={updating}>
            Close
          </Button>
          <Button
            onClick={handleUpdatePage}
            loading={updating}
            disabled={!canUpdate}
            title={
              state.page_current
                ? "The page already has this file."
                : canUpdate
                  ? undefined
                  : "Generate the manifest first."
            }
          >
            Update Page
          </Button>
        </>
      }
    >
      <div className="mt-2 space-y-4 text-sm">
        <div className="flex items-center gap-2">
          {state.page_current ? (
            <StatusBadge status="success" label="Page updated" variant="success" />
          ) : (
            <StatusBadge status="none" label="Page not updated" variant="warning" />
          )}
          <span style={{ color: "var(--muted)" }}>
            {state.page_current
              ? "The public page has this file."
              : "Update Page changes the public page right away."}
          </span>
        </div>

        {isDirect ? (
          <div>
            <p className="font-medium">Data file</p>
            <p className="mt-1 break-all">{state.file_name ?? "—"}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              Uploaded to the media library by the WordPress transfer.
            </p>
          </div>
        ) : isLoading ? (
          <LoadingState />
        ) : (
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">Retriever manifest</p>
              {hasManifest ? (
                <StatusBadge status="success" label="Generated" variant="success" />
              ) : (
                <StatusBadge status="none" label="Not generated" variant="neutral" />
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                loading={generate.isPending}
                onClick={handleGenerate}
              >
                {hasManifest ? "Regenerate" : "Generate"}
              </Button>
              {manifestUrl && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setPreviewing(true)}>
                    Preview
                  </Button>
                  {/* Plain anchor: `download` on a same-origin href is what saves
                      the file rather than navigating to it. */}
                  <a className="btn btn-sm btn-ghost" href={manifestUrl} download>
                    Download
                  </a>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <ManifestPreviewModal
        url={previewing ? manifestUrl : null}
        title={`${recordset.recordset_name} manifest`}
        format={state.destination_abbr === "nbia" ? "text" : "csv"}
        onClose={() => setPreviewing(false)}
      />
    </Modal>
  );
}

/** Stage 5 — publish the release's WordPress pages and mark it live.
 *
 *  Rows stay usable while the release is still shipping: a manifest only needs
 *  its own destination's transfer to have landed. Only the go-live button waits
 *  for the whole release. */
export default function DisseminateStage() {
  const { cycle, datasetId } = useCycleContext();
  const { addToast } = useToast();
  const release = cycle.dataset_release;
  const publish = usePublishRelease(datasetId, release?.dataset_release_id);
  const wpPages = useWpPageStates(release?.dataset_release_id);
  const idcTransfer = release
    ? shippingTransfers(release).find((t) => t.destination_abbr === "idc")
    : undefined;
  const idc = useIdcBucketStatus(idcTransfer?.dataset_release_transfer_id);

  if (!release) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        No release yet — start a cycle and bundle one first.
      </p>
    );
  }

  const members = disseminationRecordsets(cycle);
  const blockedReason = publishBlockedReason(cycle, wpPages.data ?? [], idc.data);
  const transfers = shippingTransfers(release);
  const delivered = transfers.filter(
    (t) => t.transfer_status === "success",
  ).length;

  function handlePublish() {
    publish.mutate(undefined, {
      onSuccess: (r) => {
        if (r.failed.length > 0) {
          toastWarning(
            addToast,
            `Published ${r.published.length}, but ${r.failed.length} failed: ${r.failed
              .map((f) => `${f.label} (${f.error})`)
              .join("; ")}`,
          );
        } else {
          toastSuccess(
            addToast,
            `v${r.release_number} is live — ${r.published.length} pages published.`,
          );
        }
      },
      onError: (e) =>
        toastError(
          addToast,
          e instanceof Error ? e.message : "Could not publish the release.",
        ),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          v{release.release_number} · {release.release_status} ·{" "}
          {transfers.length === 0
            ? "no transfers"
            : `${delivered} of ${transfers.length} transfers delivered`}
        </span>
        <Button
          size="sm"
          loading={publish.isPending}
          disabled={blockedReason !== null}
          title={blockedReason ?? "Publish every page and mark the release live"}
          onClick={handlePublish}
        >
          Publish All &amp; Go Live
        </Button>
      </div>

      {blockedReason && release.release_status !== "live" && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Not ready to go live: {blockedReason} Manifests below can still be
          generated as soon as their own destination has delivered.
        </p>
      )}

      <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
        Dataset
      </span>

      <DynamicTable
        rows={[
          {
            dataset_id: cycle.dataset_id,
            dataset_name: cycle.dataset_name,
            dataset_type_name: cycle.dataset_type_name,
            version: `v${release.release_number}`,
            wp_linked: cycle.dataset_wp_linked,
            wp_status: cycle.dataset_wp_linked,
          },
        ]}
        getRowKey={(row) => row.dataset_id}
        hideSummary
        columns={[
          {
            key: "dataset_name",
            label: "Dataset",
            render: (_v, row) => (
              <Link
                to={`/datasets/${row.dataset_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)" }}
                className="hover:text-accent"
              >
                {row.dataset_name}
              </Link>
            ),
          },
          { key: "dataset_type_name", label: "Type" },
          { key: "version", label: "Version" },
          {
            key: "wp_linked",
            label: "WordPress",
            render: () => (
              <div className="flex items-center gap-1">
                {!cycle.dataset_wp_linked && (
                  <StatusBadge status="not_linked" label="Not Linked" variant="warning" />
                )}
                {cycle.dataset_wp_view_url && (
                  <ExternalLinkButton
                    size="sm"
                    variant="ghost"
                    className="px-2"
                    aria-label="View on WordPress"
                    title="View on WordPress"
                    href={cycle.dataset_wp_view_url}
                  >
                    <ExternalLinkIcon />
                  </ExternalLinkButton>
                )}
                {cycle.dataset_wp_edit_url && (
                  <ExternalLinkButton
                    size="sm"
                    variant="ghost"
                    className="px-2"
                    aria-label="Edit on WordPress"
                    title="Edit on WordPress"
                    href={cycle.dataset_wp_edit_url}
                  >
                    <EditIcon />
                  </ExternalLinkButton>
                )}
              </div>
            ),
          },
          {
            key: "wp_status",
            label: "Publication",
            render: () => (
              <WpPostStatusBadge
                posdaObjectType="dataset"
                posdaObjectId={cycle.dataset_id}
                linked={cycle.dataset_wp_linked}
              />
            ),
          },
        ]}
      />

      <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
        Recordsets
      </span>

      {members.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          This release carries no recordsets.
        </p>
      ) : (
        <DynamicTable
          rows={members.map((r) => ({
            recordset_id: r.recordset_id,
            recordset_name: r.recordset_name,
            recordset_type_name: r.recordset_type_name,
            version: r.release_in_cycle
              ? `v${r.release_in_cycle.release_number ?? "draft"}`
              : "—",
            wp_linked: r.wp_linked,
            wp_edit_url: r.wp_edit_url,
            wp_status: r.wp_linked,
            destination: r.recordset_id,
            manifest: r.recordset_id,
            recordset: r,
          }))}
          getRowKey={(row) => row.recordset_id}
          hideSummary
          columns={[
            {
              key: "recordset_name",
              label: "Recordset",
              render: (_v, row) => (
                <Link
                  to={`/recordsets/${row.recordset_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent)" }}
                  className="hover:text-accent"
                >
                  {row.recordset_name}
                </Link>
              ),
            },
            { key: "recordset_type_name", label: "Type" },
            { key: "version", label: "Version" },
            {
              key: "wp_linked",
              label: "WordPress",
              render: (_v, row) => (
                <div className="flex items-center gap-1">
                  {!row.wp_linked && (
                    <StatusBadge status="not_linked" label="Not Linked" variant="warning" />
                  )}
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
            {
              key: "wp_status",
              label: "Publication",
              render: (_v, row) => (
                <WpPostStatusBadge
                  posdaObjectType="recordset"
                  posdaObjectId={row.recordset_id}
                  linked={row.wp_linked}
                />
              ),
            },
            {
              key: "destination",
              label: "Default",
              render: (_v, row) => <DestinationCell recordset={row.recordset} />,
            },
            {
              key: "manifest",
              label: "Download",
              render: (_v, row) => <DownloadPageCell recordset={row.recordset} />,
            },
          ]}
        />
      )}
    </div>
  );
}
