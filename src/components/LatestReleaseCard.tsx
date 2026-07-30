import { useQuery } from "@tanstack/react-query";
import { LinkButton } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import TransferChip, {
  type TransferChipTransfer,
} from "@/components/TransferChip";
import { apiFetch } from "@/lib/apiFetch";
import { extractArray } from "@/lib/apiUtils";
import { LoadingState } from "@/components/ui/Spinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { DatasetReleaseStatus } from "@/lib/useCycle";

export type LatestRelease = {
  dataset_release_id: number;
  release_number: number;
  /** Null while draft -- set when release_status transitions to released. */
  release_date: string | null;
  release_status?: DatasetReleaseStatus;
};

type LatestReleaseCardProps = {
  datasetId: string;
  isLoading: boolean;
  release: LatestRelease | null;
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
      return extractArray<TransferChipTransfer>(json, ["data", "transfers"]);
    },
  });

  return (
    <>
      <CardHeader className="mt-6 mb-0">
        <CardTitle>
          {release
            ? `Latest Release: v${release.release_number}${
                release.release_date
                  ? ` (${new Date(release.release_date).toLocaleDateString()})`
                  : ""
              }`
            : "Latest Release"}
        </CardTitle>
        {release?.release_status && (
          <StatusBadge status={release.release_status} />
        )}
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
        {isLoading && <LoadingState />}

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
