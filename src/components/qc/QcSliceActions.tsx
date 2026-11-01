import { useMemo, useState } from "react";
import {
  isRetiredReview,
  useApproveAssignmentUnits,
  useClaimAssignment,
  useCompleteAssignmentForTesting,
  useRejectAssignmentUnits,
  useReleaseAssignment,
  useUpdateAssignment,
  type QcAssignment,
  type QcReviewType,
} from "@/lib/useQc";
import { useUsers } from "@/lib/useUsers";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Button, ExternalLinkButton } from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import QcFileList from "@/components/qc/QcFileList";
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
  reviewStatus,
  onChanged,
  reviewOnly = false,
}: {
  /** Only the Review action -- the Verify expand, where everything else lives
   *  in the Manage modal. */
  reviewOnly?: boolean;
  reviewId: string;
  assignment: QcAssignment;
  /** Parent review's type; drives the Review action (non_dicom -> approve modal
   *  instead of Mirabelle). Undefined is treated as a DICOM review. */
  reviewType?: QcReviewType;
  /** Parent review's status. The API refuses claim/release/reassign on a
   *  terminal review, so those actions aren't offered for one. */
  reviewStatus?: string;
  onChanged?: () => void;
}) {
  const { addToast } = useToast();
  const userMap = useUsers();
  // The test-only Complete shortcut is for the system / admin accounts only.
  const currentUser = useCurrentUser();
  const canTestComplete =
    currentUser?.username === "system" || currentUser?.username === "admin";
  const claim = useClaimAssignment(reviewId);
  const release = useReleaseAssignment(reviewId);
  const reassign = useUpdateAssignment(reviewId);
  const completeForTesting = useCompleteAssignmentForTesting(reviewId);
  const approveUnits = useApproveAssignmentUnits(reviewId);
  const rejectUnits = useRejectAssignmentUnits(reviewId);

  const isNonDicom = reviewType === "non_dicom";
  const terminal = reviewStatus === "complete" || isRetiredReview(reviewStatus);
  // A finished slice is locked: the API refuses to release or reassign it, since
  // either would reopen work that is done.
  const sliceDone = assignment.assignment_status === "complete";
  const allApproved =
    assignment.series_total > 0 && assignment.series_approved === assignment.series_total;
  const allRejected =
    assignment.series_total > 0 && assignment.series_rejected === assignment.series_total;

  const [showReassign, setShowReassign] = useState(false);
  const [reassignUser, setReassignUser] = useState("");
  const [showNonDicom, setShowNonDicom] = useState(false);
  // Reject asks for a reason first; this holds it while the field is open.
  const [rejectNotes, setRejectNotes] = useState<string | null>(null);

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
      closeNonDicom();
      onChanged?.();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not approve files.");
    }
  }

  async function handleReject() {
    const notes = rejectNotes?.trim();
    if (!notes) return;
    try {
      await rejectUnits.mutateAsync({ assignmentId: assignment.assignment_id, notes });
      toastSuccess(addToast, "Files marked rejected.");
      closeNonDicom();
      onChanged?.();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not reject files.");
    }
  }

  function closeNonDicom() {
    setShowNonDicom(false);
    setRejectNotes(null);
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
        {!reviewOnly && !terminal && !sliceDone &&
          (assignment.assigned_to == null ? (
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
          ))}
        {!reviewOnly && !sliceDone && (
          <Button size="xs" variant="ghost" onClick={openReassign}>
            Assign
          </Button>
        )}
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
        {canTestComplete && !reviewOnly && !isNonDicom && assignment.assignment_status !== "complete" && (
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

      {/* Non-DICOM review: download each file, then decide the slice as a
          whole. A decided slice can still be flipped the other way. */}
      <Modal
        open={showNonDicom}
        onClose={closeNonDicom}
        title="Review Non-DICOM Files"
        size="xl"
        footer={
          rejectNotes === null ? (
            <>
              <Button variant="ghost" onClick={closeNonDicom} disabled={approveUnits.isPending}>
                Close
              </Button>
              <Button
                variant="ghost"
                onClick={() => setRejectNotes("")}
                disabled={terminal || allRejected || approveUnits.isPending}
              >
                Reject All
              </Button>
              <Button
                onClick={() => void handleApprove()}
                loading={approveUnits.isPending}
                disabled={terminal || allApproved}
              >
                Approve All
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => setRejectNotes(null)}
                disabled={rejectUnits.isPending}
              >
                Back
              </Button>
              <Button
                onClick={() => void handleReject()}
                loading={rejectUnits.isPending}
                disabled={!rejectNotes.trim()}
              >
                Reject All
              </Button>
            </>
          )
        }
      >
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          Download and check each file, then approve or reject them together.
        </p>
        <div className="mt-4">
          <QcFileList reviewId={reviewId} assignmentId={assignment.assignment_id} />
        </div>
        {rejectNotes !== null && (
          <label className="mt-4 block text-sm">
            <span className="font-medium">Reason for rejecting</span>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={3}
              className="textarea mt-1 w-full"
              autoFocus
            />
          </label>
        )}
      </Modal>
    </>
  );
}
