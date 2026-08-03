import { useState } from "react";
import { Link } from "react-router-dom";
import CreateDraftModal from "@/components/CreateDraftModal";
import CreateRecordsetModal from "@/components/CreateRecordsetModal";
import DynamicTable from "@/components/DynamicTable";
import EditDraftModal from "@/components/EditDraftModal";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { isCycleActive } from "@/lib/useCycle";
import { useCycleContext } from "./CycleLayout";

/** Recordset links leave the cycle, so they open in a new tab -- the only
 *  navigation allowed off a cycle page. */
function RecordsetLink({ id, name }: { id: number; name: string }) {
  return (
    <Link
      to={`/recordsets/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-accent"
      style={{ color: "var(--accent)" }}
    >
      {name}
    </Link>
  );
}

export default function AssembleStage() {
  const { cycle, datasetId } = useCycleContext();
  const [showCreateRecordset, setShowCreateRecordset] = useState(false);
  const [createFor, setCreateFor] = useState<{
    id: number;
    name: string;
    wpLinked: boolean;
  } | null>(null);
  const [editDraft, setEditDraft] = useState<{
    id: number;
    name: string;
    wpLinked: boolean;
  } | null>(null);

  if (cycle.recordsets.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          This dataset has no recordsets yet. Add one to start a release cycle.
        </p>
        <Button size="sm" onClick={() => setShowCreateRecordset(true)}>
          Create a Recordset
        </Button>
        <CreateRecordsetModal
          open={showCreateRecordset}
          onClose={() => setShowCreateRecordset(false)}
          datasetId={datasetId}
        />
      </div>
    );
  }

  const cycleActive = isCycleActive(cycle);

  const rows = cycle.recordsets.map((r) => ({
    recordset_id: r.recordset_id,
    recordset_name: r.recordset_name,
    draft_name: r.open_draft?.draft_name ?? null,
    draft_status: r.open_draft?.draft_status ?? null,
    file_count: r.open_draft?.file_count ?? null,
    draft_id: r.open_draft?.recordset_draft_id ?? null,
    frozen: r.latest_release ? `v${r.latest_release.release_number}` : null,
    last_bundled: r.last_bundled_dataset_release_number,
    never_released: r.latest_release === null,
    wp_linked: r.wp_linked,
  }));

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
            label: "Draft",
            render: (v, row) => {
              if (v) return String(v);
              if (row.never_released) {
                return (
                  <div>
                    <StatusBadge
                      status="never-released"
                      label="Never released"
                      variant="warning"
                    />
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      won't be in this release without a draft
                    </div>
                  </div>
                );
              }
              return (
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  carrying forward
                </span>
              );
            },
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
            render: (_v, row) => {
              if (row.draft_id) {
                return (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setEditDraft({
                        id: row.draft_id as number,
                        name: row.recordset_name,
                        wpLinked: row.wp_linked,
                      })
                    }
                  >
                    Edit Draft
                  </Button>
                );
              }
              if (!cycleActive) return null;
              return (
                <Button
                  size="sm"
                  onClick={() =>
                    setCreateFor({
                      id: row.recordset_id,
                      name: row.recordset_name,
                      wpLinked: row.wp_linked,
                    })
                  }
                >
                  Create Draft
                </Button>
              );
            },
          },
        ]}
      />

      <CreateDraftModal
        open={createFor !== null}
        onClose={() => setCreateFor(null)}
        datasetId={datasetId}
        recordsetId={createFor?.id ?? 0}
        recordsetName={createFor?.name ?? ""}
        wpLinked={createFor?.wpLinked ?? false}
      />

      <EditDraftModal
        open={editDraft !== null}
        onClose={() => setEditDraft(null)}
        datasetId={datasetId}
        draftId={editDraft?.id ?? null}
        recordsetName={editDraft?.name ?? ""}
        wpLinked={editDraft?.wpLinked ?? false}
      />
    </div>
  );
}
