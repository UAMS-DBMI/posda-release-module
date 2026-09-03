import { Link } from "react-router-dom";
import DynamicTable from "@/components/DynamicTable";
import { Button, ExternalLinkButton } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WpPostStatusBadge } from "@/components/WpLinkPill";
import {
  DownloadIcon,
  EditIcon,
  ExternalLinkIcon,
  RefreshIcon,
  UploadIcon,
} from "@/components/icons";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess, toastWarning } from "@/components/toastHelpers";
import {
  useAttachRetrieverManifest,
  useGenerateRetrieverManifest,
  usePublishRelease,
} from "@/lib/dissemination";
import { useTransferRecordsets } from "@/lib/transferForm";
import {
  disseminationRecordsets,
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
function publishBlockedReason(cycle: DatasetCycle): string | null {
  const release = cycle.dataset_release;
  if (!release) return "No release to publish.";
  if (release.release_status === "live") return "Already live.";
  if (release.release_status === "retracted") return "This release was retracted.";
  if (release.release_status === "draft") {
    return "Finalize the release in Bundle first.";
  }
  if (release.transfers.length === 0) {
    return "This release has not been sent anywhere yet.";
  }
  const undelivered = release.transfers.filter((t) => t.transfer_status !== "success");
  if (undelivered.length > 0) {
    return `Waiting on ${undelivered.map((t) => t.destination_abbr).join(", ")}.`;
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

/** Manifest state and actions for one recordset.
 *
 *  Its own component so each row's `useTransferRecordsets` is an independent
 *  query — a hook cannot be called inside a `.map()`. Rows sharing a transfer
 *  share one fetch, since the query key is the transfer. Same reason `WpBadge`
 *  is split out for Setup's table. */
function ManifestCell({ recordset }: { recordset: CycleRecordset }) {
  const { cycle } = useCycleContext();
  const { addToast } = useToast();
  const generate = useGenerateRetrieverManifest();
  const attach = useAttachRetrieverManifest();

  const { transfer, destinationAbbr } = publicTransfer(
    recordset,
    cycle.dataset_release?.transfers ?? [],
  );
  const delivered = transfer?.transfer_status === "success";
  const { data: rows, isLoading } = useTransferRecordsets(
    transfer?.dataset_release_transfer_id,
    delivered,
  );

  const muted = { color: "var(--muted)" };

  // Shared by every state so the column keeps one row height: a cell holding
  // icon buttons would otherwise sit taller than one holding a line of text,
  // leaving the table visibly ragged.
  const cell = "flex min-h-8 items-center gap-1";

  const note = (text: string, title?: string) => (
    <div className={`${cell} px-2 text-xs`} style={muted} title={title}>
      {text}
    </div>
  );

  if (!destinationAbbr) return note("—");
  // Not "pending" but "not applicable": a WordPress download links the data
  // file itself, uploaded to the media library by the WordPress transfer, so
  // there is no manifest for a retriever to read. That upload belongs to
  // Transfer, not here.
  if (destinationAbbr === "wp") {
    return note(
      "N/A - Direct download",
      "A WordPress download links the data file itself, uploaded to the media library by the WordPress transfer — there is no manifest.",
    );
  }
  if (!transfer) {
    return (
      <div className={cell}>
        <StatusBadge status="none" label="No transfer" variant="warning" />
      </div>
    );
  }
  if (!delivered) {
    return note(`Waiting (${transfer.transfer_status.replace(/_/g, " ")})`);
  }
  if (isLoading) return note("Loading…");

  const releaseId = recordset.release_in_cycle?.recordset_release_id;
  const row = rows?.find((r) => r.recordset_release_id === releaseId);
  const hasManifest = row?.retriever_manifest_file_id != null;
  const target = {
    transferId: transfer.dataset_release_transfer_id,
    recordsetReleaseId: releaseId ?? 0,
  };

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

  function handleAttach() {
    attach.mutate(target, {
      onSuccess: (r) =>
        toastSuccess(
          addToast,
          // Neither flag set is a success, not a no-op failure: the identical
          // manifest was already uploaded and already linked.
          !r.uploaded && !r.attached
            ? "Already attached — the manifest has not changed."
            : r.uploaded
              ? "Uploaded and attached to the WordPress download page."
              : "Attached the existing upload to the WordPress download page.",
        ),
      onError: (e) =>
        toastError(
          addToast,
          e instanceof Error ? e.message : "Could not attach the manifest.",
        ),
    });
  }

  return (
    <div className={cell}>
      {hasManifest ? (
        <StatusBadge status="success" label="Generated" variant="success" />
      ) : (
        <StatusBadge status="none" label="Not generated" variant="neutral" />
      )}
      <Button
        size="sm"
        variant="ghost"
        className="px-2"
        loading={generate.isPending}
        disabled={!releaseId}
        aria-label={hasManifest ? "Regenerate manifest" : "Generate manifest"}
        title={hasManifest ? "Regenerate manifest" : "Generate manifest"}
        onClick={handleGenerate}
      >
        <RefreshIcon />
      </Button>
      {hasManifest && row?.downloadable_file_id && row?.security_hash && (
        // Plain anchor, not ExternalLinkButton: `download` on a same-origin
        // href is what saves the file rather than navigating to it. Matches
        // the manifest link on transfers/Detail.tsx.
        <a
          className="btn btn-sm btn-ghost px-2"
          href={`/papi/v1/download/file/${row.downloadable_file_id}/${row.security_hash}`}
          download
          aria-label="Download manifest"
          title="Download manifest"
        >
          <DownloadIcon />
        </a>
      )}
      {hasManifest && (
        <Button
          size="sm"
          variant="ghost"
          className="px-2"
          loading={attach.isPending}
          aria-label="Upload to WordPress"
          title="Upload to WordPress"
          onClick={handleAttach}
        >
          <UploadIcon />
        </Button>
      )}
    </div>
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

  if (!release) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        No release yet — start a cycle and bundle one first.
      </p>
    );
  }

  const members = disseminationRecordsets(cycle);
  const blockedReason = publishBlockedReason(cycle);
  const delivered = release.transfers.filter(
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
          {release.transfers.length === 0
            ? "no transfers"
            : `${delivered} of ${release.transfers.length} transfers delivered`}
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
              label: "Manifest",
              render: (_v, row) => <ManifestCell recordset={row.recordset} />,
            },
          ]}
        />
      )}
    </div>
  );
}
