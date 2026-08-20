import { useState } from "react";
import QcReviewModal from "@/components/QcReviewModal";
import QcReviewManageModal from "@/components/QcReviewManageModal";
import ReviewList from "@/components/qc/ReviewList";
import { Button } from "@/components/ui/Button";
import { CardHeader, CardTitle } from "@/components/ui/Card";

/** A draft's QC reviews with their assignment slices -- the same `ReviewList`
 *  the cycle's Verify stage renders, so the two surfaces stay identical. Manage
 *  opens in place rather than navigating to `/qc/reviews/:id`, which stays as
 *  the deep-link target for the pickup queue and dashboard. */
export default function QcReviewsCard({
  draftId,
  datasetId,
}: {
  draftId: string | undefined;
  datasetId: string | undefined;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [manageReviewId, setManageReviewId] = useState<number | null>(null);

  return (
    <>
      <CardHeader className="mt-6">
        <CardTitle>QC Reviews</CardTitle>
        <Button size="sm" onClick={() => setShowCreate(true)} disabled={!draftId}>
          New Review
        </Button>
      </CardHeader>
      <div>
        {draftId && (
          <ReviewList
            draftId={Number(draftId)}
            datasetId={datasetId}
            onManage={setManageReviewId}
          />
        )}
      </div>

      <QcReviewModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        draftId={draftId}
        defaultType="partial"
      />

      <QcReviewManageModal
        open={manageReviewId !== null}
        onClose={() => setManageReviewId(null)}
        reviewId={manageReviewId}
        datasetId={datasetId}
      />
    </>
  );
}
