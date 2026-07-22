import { Link, useParams } from "react-router-dom";
import CycleStrip, { type CycleStage } from "@/components/CycleStrip";
import TransferChip from "@/components/TransferChip";
import { LinkButton } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState } from "@/components/ui/Spinner";
import {
  isPublishable,
  unbundledRecordsets,
  useDatasetCycle,
  type CycleRecordset,
} from "@/lib/useCycle";

/** Draft -> QC -> Freeze, for one recordset. Mirrors the gate used on draft
 *  detail: publishing needs >=1 complete review and none open or stale. */
function recordsetStages(recordset: CycleRecordset): CycleStage[] {
  const { open_draft: draft, qc, latest_release: release } = recordset;
  const draftUrl = draft
    ? `/recordsets/drafts/${draft.recordset_draft_id}`
    : undefined;

  if (!draft) {
    return [
      {
        key: "draft",
        label: "Draft",
        state: "pending",
        detail: "No open draft",
        href: `/recordsets/${recordset.recordset_id}`,
      },
      { key: "qc", label: "QC", state: "pending", detail: "—" },
      {
        key: "freeze",
        label: "Frozen",
        state: release ? "done" : "pending",
        detail: release ? `v${release.release_number}` : "Never released",
        href: release
          ? `/recordsets/releases/${release.recordset_release_id}`
          : undefined,
      },
    ];
  }

  const reviewed = qc.series_total - qc.series_pending;
  const percent =
    qc.series_total > 0 ? Math.round((reviewed / qc.series_total) * 100) : 0;

  const qcStage: CycleStage = (() => {
    if (qc.reviews_total === 0) {
      return { key: "qc", label: "QC", state: "pending", detail: "No QC yet", href: draftUrl };
    }
    if (qc.stale > 0) {
      return {
        key: "qc",
        label: "QC",
        state: "blocked",
        detail: `${percent}% · ${qc.stale} stale`,
        href: draftUrl,
      };
    }
    if (qc.open > 0) {
      return { key: "qc", label: "QC", state: "active", detail: `${percent}% reviewed`, href: draftUrl };
    }
    return { key: "qc", label: "QC", state: "done", detail: "Complete", href: draftUrl };
  })();

  const publishable = isPublishable(qc);

  return [
    {
      key: "draft",
      label: "Draft",
      state: qc.reviews_total > 0 ? "done" : "active",
      detail: `${draft.file_count} files`,
      href: draftUrl,
    },
    qcStage,
    {
      key: "freeze",
      label: "Freeze",
      state: publishable ? "active" : "pending",
      detail: publishable
        ? "Ready to publish"
        : qc.reviews_total === 0
          ? "Requires QC"
          : "Awaiting QC",
      href: draftUrl,
    },
  ];
}

function RecordsetRow({ recordset }: { recordset: CycleRecordset }) {
  const frozenNotBundled =
    recordset.latest_release !== null && !recordset.in_latest_dataset_release;

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Link
          to={`/recordsets/${recordset.recordset_id}`}
          className="text-sm font-medium hover:text-accent"
          style={{ color: "var(--accent)" }}
        >
          {recordset.recordset_name}
        </Link>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {recordset.recordset_type_name}
        </span>
        {frozenNotBundled && (
          <StatusBadge
            status="not_bundled"
            variant="warning"
            label={`v${recordset.latest_release?.release_number} not in a dataset release`}
          />
        )}
      </div>
      <CycleStrip stages={recordsetStages(recordset)} />
    </div>
  );
}

export default function DatasetCycle() {
  const { dataset_id: datasetId } = useParams<{ dataset_id: string }>();
  const cycle = useDatasetCycle(datasetId);

  const data = cycle.data;
  const release = data?.latest_dataset_release ?? null;
  const unbundled = data ? unbundledRecordsets(data) : [];
  const isDraftRelease = release?.release_status === "draft";

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title={data ? `${data.dataset_name} — Release Cycle` : "Release Cycle"}
        breadcrumbs={[
          { label: "Datasets", href: "/datasets" },
          ...(datasetId
            ? [
                {
                  label: data?.dataset_name ?? `Dataset ${datasetId}`,
                  href: `/datasets/${datasetId}`,
                },
              ]
            : []),
        ]}
        subtitle={
          data
            ? `${data.dataset_type_name} · ${data.recordsets.length} recordset${data.recordsets.length === 1 ? "" : "s"}`
            : undefined
        }
        actions={
          datasetId ? (
            <LinkButton size="sm" variant="ghost" href={`/datasets/${datasetId}`}>
              Dataset Details
            </LinkButton>
          ) : undefined
        }
      />

      {cycle.isLoading && (
        <SectionCard>
          <LoadingState />
        </SectionCard>
      )}

      {cycle.isError && (
        <SectionCard>
          <p className="text-sm text-red-600 dark:text-red-400">
            Could not load the release cycle for this dataset.
          </p>
        </SectionCard>
      )}

      {data && (
        <>
          <CardHeader className="mt-6 mb-0">
            <CardTitle>Recordsets</CardTitle>
          </CardHeader>
          <SectionCard className="mt-1">
            {data.recordsets.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                This dataset has no recordsets yet. Add one to start a cycle.
              </p>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {data.recordsets.map((r) => (
                  <RecordsetRow key={r.recordset_id} recordset={r} />
                ))}
              </div>
            )}
          </SectionCard>

          <CardHeader className="mt-6 mb-0">
            <CardTitle>
              {release
                ? `Dataset Release v${release.release_number} (${new Date(release.release_date).toLocaleDateString()})`
                : "Dataset Release"}
            </CardTitle>
            {release && <StatusBadge status={release.release_status} />}
            <LinkButton
              size="sm"
              href={`/datasets/releases/create?dataset_id=${datasetId}`}
            >
              New Release
            </LinkButton>
          </CardHeader>
          <SectionCard className="mt-1">
            {!release && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No dataset release yet.{" "}
                {unbundled.length > 0
                  ? `${unbundled.length} recordset${unbundled.length === 1 ? " is" : "s are"} frozen and ready to bundle.`
                  : "Freeze a recordset first."}
              </p>
            )}

            {release && unbundled.length === 0 && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Every frozen recordset is bundled into v{release.release_number}.
              </p>
            )}

            {release && unbundled.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  ⚠ {unbundled.length} recordset
                  {unbundled.length === 1 ? " is" : "s are"} frozen but not in v
                  {release.release_number} — cut a new release to distribute
                  {unbundled.length === 1 ? " it" : " them"}.
                </p>
                <ul className="text-sm" style={{ color: "var(--muted)" }}>
                  {unbundled.map((r) => (
                    <li key={r.recordset_id}>
                      {r.recordset_name} · v{r.latest_release?.release_number}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SectionCard>

          <CardHeader className="mt-6 mb-0">
            <CardTitle>Distribution</CardTitle>
            {release && !isDraftRelease && (
              <LinkButton
                size="sm"
                variant="ghost"
                href={`/datasets/releases/${release.dataset_release_id}/transfers`}
              >
                View Transfers
              </LinkButton>
            )}
          </CardHeader>
          <SectionCard className="mt-1">
            {!release && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Nothing to distribute until a dataset release exists.
              </p>
            )}

            {/* UI-only gate: the API still accepts transfers on a draft
                release (see TECH_DEBT). */}
            {isDraftRelease && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                v{release?.release_number} is still a draft. Mark it released to
                start distributing it.
              </p>
            )}

            {release && !isDraftRelease && release.transfers.length === 0 && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No transfers configured for v{release.release_number} yet.
              </p>
            )}

            {release && !isDraftRelease && release.transfers.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {release.transfers.map((t) => (
                  <TransferChip
                    key={t.dataset_release_transfer_id}
                    transfer={t}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}
    </PageShell>
  );
}
