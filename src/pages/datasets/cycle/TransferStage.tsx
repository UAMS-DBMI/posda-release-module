import { useNavigate } from "react-router-dom";
import DynamicTable from "@/components/DynamicTable";
import TransferChip from "@/components/TransferChip";
import { LinkButton } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useCycleContext } from "./CycleLayout";

export default function TransferStage() {
  const navigate = useNavigate();
  const { cycle } = useCycleContext();
  const release = cycle.latest_dataset_release;

  if (!release) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Nothing to transfer until a dataset release exists.
      </p>
    );
  }

  // UI-only gate: the API still accepts transfers on a draft release
  // (see TECH_DEBT #5).
  if (release.release_status === "draft") {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        v{release.release_number} is still a draft. Mark it released to start
        transferring it.
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
