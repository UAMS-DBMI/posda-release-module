import { Link } from "react-router-dom";

export type TransferChipTransfer = {
  dataset_release_transfer_id: number;
  destination_abbr: string;
  destination_name: string;
  transfer_status: string;
};

const statusChipClasses: Record<string, string> = {
  success:
    "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400",
  in_progress:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
  queued: "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  draft: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

const statusIcons: Record<string, string> = {
  success: "✓",
  failed: "✗",
  in_progress: "⟳",
  queued: "…",
  draft: "○",
};

/** Per-destination transfer status pill. Destinations run in parallel, so
 *  transfers render as chips rather than as a linear cycle strip. */
export default function TransferChip({
  transfer,
}: {
  transfer: TransferChipTransfer;
}) {
  const chipClass =
    statusChipClasses[transfer.transfer_status] ?? statusChipClasses.draft;
  const icon = statusIcons[transfer.transfer_status] ?? "○";
  return (
    <Link
      to={`/transfers/${transfer.dataset_release_transfer_id}`}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-75 ${chipClass}`}
      title={`${transfer.destination_name}: ${transfer.transfer_status.replace("_", " ")}`}
    >
      {transfer.destination_abbr}
      <span aria-hidden>{icon}</span>
    </Link>
  );
}
