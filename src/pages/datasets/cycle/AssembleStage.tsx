import { useState } from "react";
import { Link } from "react-router-dom";
import CreateRecordsetModal from "@/components/CreateRecordsetModal";
import DynamicTable from "@/components/DynamicTable";
import { Button, LinkButton } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { isCycleActive } from "@/lib/useCycle";
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

export default function AssembleStage() {
  const { cycle, datasetId } = useCycleContext();
  const [showCreate, setShowCreate] = useState(false);

  const startable = cycle.recordsets.filter((r) => r.open_draft === null).length;

  const rows = cycle.recordsets.map((r) => ({
    recordset_id: r.recordset_id,
    recordset_name: r.recordset_name,
    draft_name: r.open_draft?.draft_name ?? null,
    draft_status: r.open_draft?.draft_status ?? null,
    file_count: r.open_draft?.file_count ?? null,
    draft_id: r.open_draft?.recordset_draft_id ?? null,
    frozen: r.latest_release ? `v${r.latest_release.release_number}` : null,
    last_bundled: r.last_bundled_dataset_release_number,
  }));

  if (cycle.recordsets.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          This dataset has no recordsets yet. Add one to start a release cycle.
        </p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          Create a Recordset
        </Button>
        <CreateRecordsetModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          datasetId={datasetId}
        />
      </div>
    );
  }

  const cycleActive = isCycleActive(cycle);

  return (
    <div className="space-y-3">
      {!cycleActive && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No cycle is currently in progress
          {cycle.latest_dataset_release
            ? ` — last release was v${cycle.latest_dataset_release.release_number} (${cycle.latest_dataset_release.release_status})`
            : ""}
          . Start one from the banner above before assembling drafts.
        </p>
      )}

      {cycleActive && startable > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {startable} recordset{startable === 1 ? " has" : "s have"} no open
            draft.
          </p>
          <LinkButton size="sm" href={`/datasets/${datasetId}/cycle/start`}>
            Start a Cycle
          </LinkButton>
        </div>
      )}

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
            render: (v, row) => (
              <div>
                <div>{v ? String(v) : "—"}</div>
                {row.last_bundled != null && (
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    last bundled: dataset v{row.last_bundled}
                  </div>
                )}
              </div>
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
                  Open Draft
                </LinkButton>
              ) : null,
          },
        ]}
      />
    </div>
  );
}
