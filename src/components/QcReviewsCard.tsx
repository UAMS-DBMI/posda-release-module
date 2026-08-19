import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQcReviews } from "@/lib/useQc";
import DynamicTable from "@/components/DynamicTable";
import QcReviewModal from "@/components/QcReviewModal";
import { Button } from "@/components/ui/Button";
import { CardHeader, CardTitle } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState } from "@/components/ui/Spinner";

export default function QcReviewsCard({
  draftId,
}: {
  draftId: string | undefined;
}) {
  const navigate = useNavigate();
  const reviews = useQcReviews(draftId);

  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <CardHeader className="mt-6">
        <CardTitle>QC Reviews</CardTitle>
        <Button size="sm" onClick={() => setShowCreate(true)} disabled={!draftId}>
          New Review
        </Button>
      </CardHeader>
      <div>
        {reviews.isLoading && <LoadingState />}

        {reviews.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Could not load QC reviews.
          </p>
        )}

        {reviews.data && (
          <DynamicTable
            rows={reviews.data}
            emptyMessage="No QC reviews yet."
            getRowKey={(row) => row.qc_review_id}
            onRowClick={(row) => navigate(`/qc/reviews/${row.qc_review_id}`)}
            columns={[
              { key: "qc_review_id", label: "ID" },
              {
                key: "review_status",
                label: "Status",
                render: (v) => <StatusBadge status={String(v)} />,
              },
              {
                key: "review_type",
                label: "Type",
                render: (_v, row) =>
                  row.review_type === "partial"
                    ? `partial · ${row.sample_percentage}%`
                    : "full",
              },
              {
                key: "series_total",
                label: "Series",
                render: (v) => Number(v).toLocaleString(),
              },
              { key: "series_approved", label: "Approved" },
              { key: "series_pending", label: "Pending" },
              { key: "when_created", label: "Created" },
            ]}
            formatters={{
              when_created: (v) => new Date(String(v)).toLocaleDateString(),
            }}
          />
        )}
      </div>

      <QcReviewModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        draftId={draftId}
        defaultType="partial"
      />
    </>
  );
}
