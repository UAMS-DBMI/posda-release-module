import { useState } from "react";
import { Link } from "react-router-dom";
import { useAssignmentQueue, useClaimAssignment } from "@/lib/useQc";
import DynamicTable from "@/components/DynamicTable";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";

export default function QcQueue() {
  const { addToast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const queue = useAssignmentQueue({
    unassigned: true,
    status: "needs_qc",
    page,
    limit: pageSize,
  });
  const claim = useClaimAssignment(undefined);

  async function handleClaim(assignmentId: number) {
    try {
      await claim.mutateAsync(assignmentId);
      toastSuccess(addToast, "Slice claimed.");
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not claim slice.");
    }
  }

  const rows = queue.data?.data ?? [];
  const total = queue.data?.meta.total ?? rows.length;

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title="QC Pickup Queue"
        breadcrumb={{ label: "Dashboard", href: "/" }}
        subtitle="Unclaimed review slices available to pick up"
      />

      <SectionCard>
        {queue.isLoading && <p className="text-sm">Loading...</p>}

        {queue.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Could not load the queue.
          </p>
        )}

        {queue.data && (
          <DynamicTable
            rows={rows}
            emptyMessage="No slices available to claim."
            getRowKey={(row) => row.assignment_id}
            pagination={{
              defaultItemsPerPage: 25,
              totalItems: total,
              page,
              pageSize,
              onPageChange: setPage,
              onPageSizeChange: (next) => {
                setPageSize(next);
                setPage(1);
              },
            }}
            columns={[
              { key: "recordset_name", label: "Recordset" },
              {
                key: "review_type",
                label: "Review",
                render: (_v, row) => (
                  <Link
                    to={`/qc/reviews/${row.qc_review_id}`}
                    className="transition-colors hover:text-accent"
                    style={{ color: "var(--accent)" }}
                  >
                    {row.review_type} #{row.qc_review_id}
                  </Link>
                ),
              },
              {
                key: "assignment_id",
                label: "Slice",
                render: (v) => `#${v}`,
              },
              {
                key: "series_pending",
                label: "Pending",
                sortable: false,
                render: (_v, row) => `${row.series_pending}/${row.series_total}`,
              },
              {
                key: "when_created",
                label: "Created",
              },
              {
                key: "who_updated",
                label: "",
                sortable: false,
                render: (_v, row) => (
                  <Button
                    size="sm"
                    onClick={() => void handleClaim(row.assignment_id)}
                    disabled={claim.isPending}
                  >
                    Claim
                  </Button>
                ),
              },
            ]}
            formatters={{
              when_created: (v) => new Date(String(v)).toLocaleDateString(),
            }}
          />
        )}
      </SectionCard>
    </PageShell>
  );
}
