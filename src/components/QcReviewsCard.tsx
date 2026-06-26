import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useCreateQcReview,
  useQcReviews,
  type QcReviewType,
} from "@/lib/useQc";
import DynamicTable from "@/components/DynamicTable";
import { Button } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";

export default function QcReviewsCard({
  draftId,
}: {
  draftId: string | undefined;
}) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const reviews = useQcReviews(draftId);
  const create = useCreateQcReview(draftId);

  const [showCreate, setShowCreate] = useState(false);
  const [reviewType, setReviewType] = useState<QcReviewType>("partial");
  const [percentage, setPercentage] = useState("20");
  const [notes, setNotes] = useState("");

  function resetForm() {
    setReviewType("partial");
    setPercentage("20");
    setNotes("");
  }

  function closeCreate() {
    setShowCreate(false);
    resetForm();
  }

  const pctNum = Number(percentage);
  const pctValid =
    reviewType === "full" ||
    (Number.isFinite(pctNum) && pctNum > 0 && pctNum <= 100);

  async function handleSubmit() {
    try {
      await create.mutateAsync({
        review_type: reviewType,
        sample_percentage: reviewType === "partial" ? pctNum : null,
        review_notes: notes.trim() || null,
      });
      toastSuccess(addToast, "QC review created.");
      closeCreate();
    } catch (e) {
      toastError(
        addToast,
        e instanceof Error ? e.message : "Could not create QC review.",
      );
    }
  }

  return (
    <>
      <CardHeader className="mt-6 mb-0">
        <CardTitle>QC Reviews</CardTitle>
        <Button size="sm" onClick={() => setShowCreate(true)} disabled={!draftId}>
          New Review
        </Button>
      </CardHeader>
      <SectionCard className="mt-1">
        {reviews.isLoading && <p className="text-sm">Loading...</p>}

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
      </SectionCard>

      <Modal
        open={showCreate}
        onClose={closeCreate}
        title="New QC Review"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={closeCreate}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={create.isPending || !pctValid}
            >
              {create.isPending ? "Creating..." : "Create Review"}
            </Button>
          </>
        }
      >
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          A partial review samples the chosen percentage of series per modality; a
          full review includes every series.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium">Type</label>
            <select
              value={reviewType}
              onChange={(e) => setReviewType(e.target.value as QcReviewType)}
              className="select mt-1 w-full"
            >
              <option value="partial">Partial (sampled)</option>
              <option value="full">Full (all series)</option>
            </select>
          </div>

          {reviewType === "partial" && (
            <div>
              <label className="block text-sm font-medium">
                Sample percentage (per modality)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                className="input mt-1 w-full"
              />
              {!pctValid && (
                <p className="mt-1 text-xs text-red-600">
                  Enter a percentage between 1 and 100.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium">
              Notes{" "}
              <span className="font-normal text-neutral-500">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="textarea mt-1 w-full"
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
