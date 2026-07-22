import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import DynamicTable from "@/components/DynamicTable";
import TransferChip from "@/components/TransferChip";
import { LinkButton } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState } from "@/components/ui/Spinner";
import Tabs, { tabPanelId, tabId, type TabItem } from "@/components/ui/Tabs";
import {
  firstUnfinishedStage,
  isPublishable,
  qcPercent,
  STAGE_ORDER,
  stageSummaries,
  unbundledRecordsets,
  useDatasetCycle,
  type DatasetCycle,
  type StageKey,
} from "@/lib/useCycle";

const STAGE_LABELS: Record<StageKey, string> = {
  draft: "Draft",
  qc: "QC",
  release: "Release",
  distribute: "Distribute",
};

const ID_PREFIX = "cycle";

function RecordsetLink({ id, name }: { id: number; name: string }) {
  return (
    <Link
      to={`/recordsets/${id}`}
      className="hover:text-accent"
      style={{ color: "var(--accent)" }}
    >
      {name}
    </Link>
  );
}

function DraftPanel({ cycle }: { cycle: DatasetCycle }) {
  const rows = cycle.recordsets.map((r) => ({
    recordset_id: r.recordset_id,
    recordset_name: r.recordset_name,
    draft_name: r.open_draft?.draft_name ?? null,
    draft_status: r.open_draft?.draft_status ?? null,
    file_count: r.open_draft?.file_count ?? null,
    draft_id: r.open_draft?.recordset_draft_id ?? null,
    frozen: r.latest_release ? `v${r.latest_release.release_number}` : null,
  }));

  return (
    <DynamicTable
      rows={rows}
      getRowKey={(row) => row.recordset_id}
      emptyMessage="This dataset has no recordsets yet."
      columns={[
        {
          key: "recordset_name",
          label: "Recordset",
          render: (_v, row) => (
            <RecordsetLink id={row.recordset_id} name={row.recordset_name} />
          ),
        },
        {
          key: "draft_name",
          label: "Open Draft",
          render: (v) => (v ? String(v) : "—"),
        },
        {
          key: "draft_status",
          label: "Status",
          render: (v) => (v ? <StatusBadge status={String(v)} /> : "—"),
        },
        {
          key: "file_count",
          label: "Files",
          render: (v) => (v == null ? "—" : Number(v).toLocaleString()),
        },
        {
          key: "frozen",
          label: "Frozen At",
          render: (v) => (v ? String(v) : "—"),
        },
        {
          key: "draft_id",
          label: "",
          sortable: false,
          render: (_v, row) =>
            row.draft_id ? (
              <LinkButton
                size="sm"
                variant="ghost"
                href={`/recordsets/drafts/${row.draft_id}`}
              >
                Open Draft
              </LinkButton>
            ) : null,
        },
      ]}
    />
  );
}

function QcPanel({ cycle }: { cycle: DatasetCycle }) {
  const rows = cycle.recordsets
    .filter((r) => r.open_draft !== null)
    .map((r) => ({
      recordset_id: r.recordset_id,
      recordset_name: r.recordset_name,
      reviews: r.qc.reviews_total,
      progress:
        r.qc.series_total === 0
          ? "—"
          : `${r.qc.series_approved}/${r.qc.series_total} (${qcPercent(r.qc)}%)`,
      status:
        r.qc.stale > 0
          ? "stale"
          : r.qc.open > 0
            ? "open"
            : r.qc.complete > 0
              ? "complete"
              : "pending",
      publishable: isPublishable(r.qc),
      draft_id: r.open_draft?.recordset_draft_id ?? null,
    }));

  return (
    <DynamicTable
      rows={rows}
      getRowKey={(row) => row.recordset_id}
      emptyMessage="No open drafts, so there is nothing to review."
      columns={[
        {
          key: "recordset_name",
          label: "Recordset",
          render: (_v, row) => (
            <RecordsetLink id={row.recordset_id} name={row.recordset_name} />
          ),
        },
        { key: "reviews", label: "Reviews" },
        { key: "progress", label: "Approved" },
        {
          key: "status",
          label: "Status",
          render: (v) => <StatusBadge status={String(v)} />,
        },
        {
          key: "publishable",
          label: "Publish Gate",
          render: (v) =>
            v ? (
              <span className="text-xs text-green-700 dark:text-green-400">
                Ready
              </span>
            ) : (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Blocked
              </span>
            ),
        },
        {
          key: "draft_id",
          label: "",
          sortable: false,
          render: (_v, row) =>
            row.draft_id ? (
              <LinkButton
                size="sm"
                variant="ghost"
                href={`/recordsets/drafts/${row.draft_id}`}
              >
                Reviews
              </LinkButton>
            ) : null,
        },
      ]}
    />
  );
}

function ReleasePanel({
  cycle,
  datasetId,
}: {
  cycle: DatasetCycle;
  datasetId: string | undefined;
}) {
  const release = cycle.latest_dataset_release;
  const unbundled = unbundledRecordsets(cycle);

  const rows = cycle.recordsets
    .filter((r) => r.latest_release !== null)
    .map((r) => ({
      recordset_id: r.recordset_id,
      recordset_name: r.recordset_name,
      release: `v${r.latest_release?.release_number}`,
      release_date: r.latest_release?.release_date ?? "",
      bundled: r.in_latest_dataset_release,
      release_id: r.latest_release?.recordset_release_id ?? null,
    }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {release ? (
          <>
            <span className="font-medium">
              v{release.release_number} ·{" "}
              {new Date(release.release_date).toLocaleDateString()}
            </span>
            <StatusBadge status={release.release_status} />
            {release.release_doi && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {release.release_doi}
              </span>
            )}
          </>
        ) : (
          <span style={{ color: "var(--muted)" }}>
            No dataset release yet.
          </span>
        )}
        <LinkButton
          size="sm"
          href={`/datasets/releases/create?dataset_id=${datasetId}`}
        >
          New Release
        </LinkButton>
      </div>

      {unbundled.length > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          ⚠ {unbundled.length} recordset{unbundled.length === 1 ? " is" : "s are"}{" "}
          frozen but not bundled
          {release ? ` into v${release.release_number}` : ""} — cut a release to
          distribute {unbundled.length === 1 ? "it" : "them"}.
        </p>
      )}

      <DynamicTable
        rows={rows}
        getRowKey={(row) => row.recordset_id}
        emptyMessage="No recordset has been frozen yet."
        columns={[
          {
            key: "recordset_name",
            label: "Recordset",
            render: (_v, row) => (
              <RecordsetLink id={row.recordset_id} name={row.recordset_name} />
            ),
          },
          { key: "release", label: "Frozen At" },
          {
            key: "release_date",
            label: "Date",
            render: (v) =>
              v ? new Date(String(v)).toLocaleDateString() : "—",
          },
          {
            key: "bundled",
            label: "In Dataset Release",
            render: (v) =>
              v ? (
                <StatusBadge status="bundled" variant="success" label="Yes" />
              ) : (
                <StatusBadge status="unbundled" variant="warning" label="No" />
              ),
          },
        ]}
      />
    </div>
  );
}

function DistributePanel({ cycle }: { cycle: DatasetCycle }) {
  const navigate = useNavigate();
  const release = cycle.latest_dataset_release;

  if (!release) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Nothing to distribute until a dataset release exists.
      </p>
    );
  }

  // UI-only gate: the API still accepts transfers on a draft release
  // (see TECH_DEBT #5).
  if (release.release_status === "draft") {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        v{release.release_number} is still a draft. Mark it released to start
        distributing it.
      </p>
    );
  }

  const rows = release.transfers.map((t) => ({
    dataset_release_transfer_id: t.dataset_release_transfer_id,
    destination_name: t.destination_name,
    destination_abbr: t.destination_abbr,
    transfer_name: t.transfer_name,
    transfer_status: t.transfer_status,
  }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {release.transfers.map((t) => (
          <TransferChip key={t.dataset_release_transfer_id} transfer={t} />
        ))}
        <LinkButton
          size="sm"
          variant="ghost"
          href={`/datasets/releases/${release.dataset_release_id}/transfers`}
        >
          Manage Transfers
        </LinkButton>
      </div>

      <DynamicTable
        rows={rows}
        getRowKey={(row) => row.dataset_release_transfer_id}
        emptyMessage={`No transfers configured for v${release.release_number} yet.`}
        onRowClick={(row) =>
          navigate(`/transfers/${row.dataset_release_transfer_id}`)
        }
        columns={[
          { key: "destination_name", label: "Destination" },
          { key: "transfer_name", label: "Transfer" },
          {
            key: "transfer_status",
            label: "Status",
            render: (v) => <StatusBadge status={String(v)} />,
          },
        ]}
      />
    </div>
  );
}

export default function DatasetCycle() {
  const { dataset_id: datasetId } = useParams<{ dataset_id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const cycle = useDatasetCycle(datasetId);

  const data = cycle.data;
  const summaries = data ? stageSummaries(data) : null;

  const requested = searchParams.get("stage") as StageKey | null;
  const activeStage: StageKey =
    requested && STAGE_ORDER.includes(requested)
      ? requested
      : summaries
        ? firstUnfinishedStage(summaries)
        : "draft";

  function selectStage(key: string) {
    const next = new URLSearchParams(searchParams);
    next.set("stage", key);
    setSearchParams(next);
  }

  const tabs: TabItem[] = summaries
    ? STAGE_ORDER.map((key) => ({
        key,
        label: STAGE_LABELS[key],
        detail: summaries[key].detail,
        state: summaries[key].state,
      }))
    : [];

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

      {data && summaries && (
        <SectionCard className="mt-4">
          <Tabs
            tabs={tabs}
            active={activeStage}
            onChange={selectStage}
            idPrefix={ID_PREFIX}
            className="mb-4"
          />

          <div
            role="tabpanel"
            id={tabPanelId(ID_PREFIX, activeStage)}
            aria-labelledby={tabId(ID_PREFIX, activeStage)}
          >
            {activeStage === "draft" && <DraftPanel cycle={data} />}
            {activeStage === "qc" && <QcPanel cycle={data} />}
            {activeStage === "release" && (
              <ReleasePanel cycle={data} datasetId={datasetId} />
            )}
            {activeStage === "distribute" && <DistributePanel cycle={data} />}
          </div>
        </SectionCard>
      )}
    </PageShell>
  );
}
