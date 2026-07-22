import { Link } from "react-router-dom";
import DynamicTable from "@/components/DynamicTable";
import { LinkButton } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { isPublishable, qcPercent } from "@/lib/useCycle";
import { useCycleContext } from "./CycleLayout";

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

export default function VerifyStage() {
  const { cycle } = useCycleContext();

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
