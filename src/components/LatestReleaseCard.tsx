import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { LinkButton } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { apiFetch } from "@/lib/apiFetch";
import { extractArray } from "@/lib/apiUtils";

export type LatestRelease = {
  dataset_release_id: number;
  release_number: number;
  release_date: string;
};

type ReleaseTransfer = {
  dataset_release_transfer_id: number;
  destination_abbr: string;
  destination_name: string;
  transfer_status: string;
};

type LatestReleaseCardProps = {
  datasetId: string;
  isLoading: boolean;
  release: LatestRelease | null;
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

export default function LatestReleaseCard({
  datasetId,
  isLoading,
  release,
}: LatestReleaseCardProps) {
  const releaseId = release?.dataset_release_id;

  const transfers = useQuery({
    queryKey: ["release-transfers", releaseId ?? ""],
    enabled: releaseId != null,
    queryFn: async () => {
      const json = await apiFetch<unknown>(
        `/papi/v1/distribution/datasets/releases/${releaseId}/transfers`,
      );
      return extractArray<ReleaseTransfer>(json, ["data", "transfers"]);
    },
  });

  return (
    <>
      <CardHeader className="mt-6 mb-0">
        <CardTitle>
          {release
            ? `Latest Release: v${release.release_number} (${new Date(release.release_date).toLocaleDateString()})`
            : "Latest Release"}
        </CardTitle>
        {release ? (
          <LinkButton
            size="sm"
            href={`/datasets/releases/${release.dataset_release_id}/transfers`}
          >
            View Transfers
          </LinkButton>
        ) : (
          <LinkButton
            size="sm"
            href={`/datasets/releases/create?dataset_id=${datasetId}`}
          >
            New Release
          </LinkButton>
        )}
      </CardHeader>
      <SectionCard className="mt-1">
        {isLoading && <p className="text-sm">Loading...</p>}

        {!isLoading && !release && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No releases yet. Create a release to start distributing this
            dataset.
          </p>
        )}

        {!isLoading && release && (
          <div className="space-y-2">
            {transfers.isLoading && <p className="text-sm">Loading transfers...</p>}
            {transfers.isError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Could not load transfers.
              </p>
            )}
            {transfers.data && transfers.data.length === 0 && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No transfers configured for this release yet.
              </p>
            )}
            {transfers.data && transfers.data.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm" style={{ color: "var(--muted)" }}>
                  Transfers:
                </span>
                {transfers.data.map((t) => (
                  <TransferChip key={t.dataset_release_transfer_id} transfer={t} />
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </>
  );
}

function TransferChip({ transfer }: { transfer: ReleaseTransfer }) {
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
