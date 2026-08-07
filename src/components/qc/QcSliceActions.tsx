import { useMemo, useState } from "react";
import {
  useApproveAssignmentUnits,
  useClaimAssignment,
  useCompleteAssignmentForTesting,
  useReleaseAssignment,
  useUpdateAssignment,
  type QcAssignment,
  type QcReviewType,
} from "@/lib/useQc";
import { useUsers } from "@/lib/useUsers";
import { Button, ExternalLinkButton } from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";

/** Per-slice actions for one QC assignment: Claim / Release / Assign (with its
 *  user-picker modal) and the Review link. For a DICOM review, Review opens the
 *  slice in Mirabelle; for a non-DICOM review it opens an approve modal (Mirabelle
 *  is DICOM-only). Shared by the assignments table and the Verify expand's inline
 *  slice lines. `onChanged` lets a host refresh its own rollup after a mutation. */
export default function QcSliceActions({
  reviewId,
  assignment,
  reviewType,
  onChanged,
}: {
  reviewId: string;
  assignment: QcAssignment;
  /** Parent review's type; drives the Review action (non_dicom -> approve modal
   *  instead of Mirabelle). Undefined is treated as a DICOM review. */
  reviewType?: QcReviewType;
  onChanged?: () => void;
}) {
  const { addToast } = useToast();
  const userMap = useUsers();
  const claim = useClaimAssignment(reviewId);
  const release = useReleaseAssignment(reviewId);
  const reassign = useUpdateAssignment(reviewId);
  const completeForTesting = useCompleteAssignmentForTesting(reviewId);
  const approveUnits = useApproveAssignmentUnits(reviewId);

  const isNonDicom = reviewType === "non_dicom";

  const [showReassign, setShowReassign] = useState(false);
  const [reassignUser, setReassignUser] = useState("");
  const [showNonDicom, setShowNonDicom] = useState(false);

  const users = useMemo(
    () =>
      Array.from(userMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [userMap],
  );

  async function handleClaim() {
    try {
      await claim.mutateAsync(assignment.assignment_id);
      toastSuccess(addToast, "Slice claimed.");
      onChanged?.();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not claim slice.");
    }
  }

  async function handleRelease() {
    try {
      await release.mutateAsync(assignment.assignment_id);
      toastSuccess(addToast, "Slice released.");
      onChanged?.();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not release slice.");
    }
  }

  async function handleCompleteForTesting() {
    try {
      await completeForTesting.mutateAsync(assignment.assignment_id);
      toastSuccess(addToast, "Slice approved + completed (test).");
      onChanged?.();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not complete slice.");
    }
  }

  async function handleApprove() {
    try {
      await approveUnits.mutateAsync(assignment.assignment_id);
      toastSuccess(addToast, "Files marked approved.");
      setShowNonDicom(false);
      onChanged?.();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not approve files.");
    }
  }

  function openReassign() {
    setReassignUser(assignment.assigned_to != null ? String(assignment.assigned_to) : "");
    setShowReassign(true);
  }

  async function handleReassign() {
    if (!reassignUser) return;
    try {
      await reassign.mutateAsync({
        assignmentId: assignment.assignment_id,
        assigned_to: Number(reassignUser),
      });
      toastSuccess(addToast, "Slice assigned.");
      setShowReassign(false);
      onChanged?.();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not reassign slice.");
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {assignment.assigned_to == null ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void handleClaim()}
            disabled={claim.isPending}
          >
            Claim
          </Button>
        ) : (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void handleRelease()}
            disabled={release.isPending}
          >
            Release
          </Button>
        )}
        <Button size="xs" variant="ghost" onClick={openReassign}>
          Assign
        </Button>
        {assignment.assigned_to != null &&
          (isNonDicom ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setShowNonDicom(true)}
              title="Review this slice's non-DICOM files"
            >
              Review
            </Button>
          ) : (
            <ExternalLinkButton
              size="xs"
              variant="ghost"
              href={`/mira/qc/assignments/${assignment.assignment_id}`}
              title="Review this slice's series in Mirabelle"
            >
              Review
            </ExternalLinkButton>
          ))}
        {!isNonDicom && assignment.assignment_status !== "complete" && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void handleCompleteForTesting()}
            disabled={completeForTesting.isPending}
            title="complete for testing"
            style={{
              background: "#eab308",
              borderColor: "#eab308",
              color: "#000",
            }}
          >
            Complete
          </Button>
        )}
      </div>

      <Modal
        open={showReassign}
        onClose={() => setShowReassign(false)}
        title="Assign Slice"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowReassign(false)}
              disabled={reassign.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleReassign()}
              loading={reassign.isPending}
              disabled={!reassignUser}
            >
              Assign
            </Button>
          </>
        }
      >
        <label className="mt-4 block text-sm">
          <span className="font-medium">Assign to</span>
          <select
            value={reassignUser}
            onChange={(e) => setReassignUser(e.target.value)}
            className="select mt-1 w-full"
          >
            <option value="">— select reviewer —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          To unassign, use Release instead.
        </p>
      </Modal>

      {/* Non-DICOM review: download (deferred) + mark the slice's files approved. */}
      <Modal
        open={showNonDicom}
        onClose={() => setShowNonDicom(false)}
        title="Review Non-DICOM Files"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowNonDicom(false)}
              disabled={approveUnits.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleApprove()}
              loading={approveUnits.isPending}
              disabled={assignment.assignment_status === "complete"}
            >
              Mark Approved
            </Button>
          </>
        }
      >
        <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
          {assignment.assignment_status === "complete"
            ? "This slice's files are already approved."
            : "Confirm this slice's non-DICOM files pass review. Marking approved completes the slice. (File download will be added here later.)"}
        </p>
      </Modal>
    </>
  );
}
