import { useState } from "react";
import { Link } from "react-router-dom";
import CreateRecordsetModal from "@/components/CreateRecordsetModal";
import DynamicTable from "@/components/DynamicTable";
import { Button } from "@/components/ui/Button";
import { useCycleContext } from "./CycleLayout";

/** Stage 0 — ready the dataset for cycles. Step 2 adds destinations, the WP
 *  collection page, and relations; for now it lists recordsets and lets you
 *  create one. */
export default function SetupStage() {
  const { cycle, datasetId } = useCycleContext();
  const [showCreate, setShowCreate] = useState(false);

  const rows = cycle.recordsets.map((r) => ({
    recordset_id: r.recordset_id,
    recordset_name: r.recordset_name,
    recordset_type_name: r.recordset_type_name,
    latest: r.latest_release
      ? `v${r.latest_release.release_number}`
      : "never released",
  }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Recordsets in this dataset. Destinations, WordPress pages, and
          relations arrive here in a later step.
        </p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          Create a Recordset
        </Button>
      </div>

      {cycle.recordsets.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No recordsets yet — add one to begin.
        </p>
      ) : (
        <DynamicTable
          rows={rows}
          getRowKey={(row) => row.recordset_id}
          emptyMessage="No recordsets yet."
          columns={[
            {
              key: "recordset_name",
              label: "Recordset",
              render: (_v, row) => (
                <Link
                  to={`/recordsets/${row.recordset_id}`}
                  className="hover:text-accent"
                  style={{ color: "var(--accent)" }}
                >
                  {row.recordset_name}
                </Link>
              ),
            },
            { key: "recordset_type_name", label: "Type" },
            { key: "latest", label: "Latest Release" },
          ]}
        />
      )}

      <CreateRecordsetModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        datasetId={datasetId}
      />
    </div>
  );
}
