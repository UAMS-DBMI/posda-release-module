import { Link } from "react-router-dom";
import DynamicTable from "@/components/DynamicTable";
import { LinkButton } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { unbundledRecordsets } from "@/lib/useCycle";
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

export default function BundleStage() {
  const { cycle, datasetId } = useCycleContext();
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
          <span style={{ color: "var(--muted)" }}>No dataset release yet.</span>
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
            render: (v) => (v ? new Date(String(v)).toLocaleDateString() : "—"),
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
