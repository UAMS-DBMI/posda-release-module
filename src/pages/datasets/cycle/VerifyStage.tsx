import { useState } from "react";
import ExpandableTable from "@/components/ExpandableTable";
import RecordsetLink from "@/components/RecordsetLink";
import { useQueryClient } from "@tanstack/react-query";
import QcReviewModal from "@/components/QcReviewModal";
import QcReviewManageModal from "@/components/QcReviewManageModal";
import ReviewList from "@/components/qc/ReviewList";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { isCycleActive, isPublishable, qcPercent, type CycleQc } from "@/lib/useCycle";
import { useCycleContext } from "./CycleLayout";


/** The recordset's QC state as a single badge status. */
function qcStatus(qc: CycleQc): string {
  if (qc.stale > 0) return "stale";
  if (qc.open > 0) return "open";
  if (qc.complete > 0) return "complete";
  return "pending";
}


// A non-DICOM-only draft samples nothing (no series), so its "Add Review" opens
// the modal in non-DICOM mode. Mixed / DICOM drafts get the full/partial form.
type CreateTarget = { draftId: number; assignToCaller: boolean; nonDicom: boolean };

export default function VerifyStage() {
  const { cycle, datasetId } = useCycleContext();
  const queryClient = useQueryClient();

  const [createFor, setCreateFor] = useState<CreateTarget | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [manageReviewId, setManageReviewId] = useState<number | null>(null);

  const cycleActive = isCycleActive(cycle);
  const withDraft = cycle.recordsets.filter((r) => r.open_draft !== null);

  if (withDraft.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        No open drafts, so there is nothing to review.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ExpandableTable
        headers={["Recordset", "Reviews", "Approved", "Status", "Publish Gate", ""]}
        rows={withDraft}
        getRowKey={(r) => r.recordset_id}
        canExpand={(r) =>
          r.open_draft?.recordset_draft_id != null && r.qc.reviews_total > 0
        }
        expandLabel="reviews"
        expandedKey={expandedId}
        onExpandedKeyChange={(k) => setExpandedId(k as number | null)}
        renderExpanded={(r) =>
          r.open_draft ? (
            <ReviewList
              draftId={r.open_draft.recordset_draft_id}
              datasetId={datasetId}
              onManage={setManageReviewId}
            />
          ) : null
        }
        renderCells={(r) => {
              const draft = r.open_draft;
              const draftId = draft?.recordset_draft_id ?? null;
              const qc = r.qc;
              const hasReviews = qc.reviews_total > 0;
              // No DICOM series to sample -> "Add Review" creates a non_dicom review.
              const nonDicomOnly =
                !!draft?.has_non_dicom && !draft?.has_dicom;
              const progress =
                qc.series_total === 0
                  ? "—"
                  : `${qc.series_approved.toLocaleString()}/${qc.series_total.toLocaleString()} (${qcPercent(qc)}%)`;

              return (
                <>
                  <td className="px-2 py-1">
                      <RecordsetLink id={r.recordset_id} name={r.recordset_name} />
                    </td>
                    <td className="px-2 py-1">
                      {qc.reviews_total.toLocaleString()}
                    </td>
                    <td className="px-2 py-1">{progress}</td>
                    <td className="px-2 py-1">
                      <StatusBadge status={qcStatus(qc)} />
                    </td>
                    <td className="px-2 py-1">
                      {isPublishable(r) ? (
                        <span className="text-xs text-green-700 dark:text-green-400">
                          Ready
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          Blocked
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {draftId != null && cycleActive ? (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {hasReviews ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setCreateFor({
                                  draftId,
                                  assignToCaller: false,
                                  nonDicom: nonDicomOnly,
                                })
                              }
                            >
                              Add Review
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() =>
                                setCreateFor({
                                  draftId,
                                  assignToCaller: true,
                                  nonDicom: nonDicomOnly,
                                })
                              }
                            >
                              Start QC
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </td>
                </>
              );
            }}
      />

      {!cycleActive && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No cycle is in progress — start one from the banner above to create
          reviews.
        </p>
      )}

      <QcReviewModal
        open={createFor !== null}
        onClose={() => setCreateFor(null)}
        draftId={createFor ? String(createFor.draftId) : undefined}
        defaultType="full"
        nonDicom={createFor?.nonDicom ?? false}
        assignToCaller={createFor?.assignToCaller ?? false}
        onCreated={() =>
          void queryClient.invalidateQueries({
            queryKey: ["dataset-cycle", datasetId ?? ""],
          })
        }
      />

      <QcReviewManageModal
        open={manageReviewId !== null}
        onClose={() => setManageReviewId(null)}
        reviewId={manageReviewId}
        datasetId={datasetId}
      />
    </div>
  );
}
