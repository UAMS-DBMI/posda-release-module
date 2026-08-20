import { useMemo, useState } from "react";
import { useSplitReview, type QcAssignment, type QcReviewType } from "@/lib/useQc";
import { useUsers } from "@/lib/useUsers";
import DynamicTable from "@/components/DynamicTable";
import QcSliceActions from "@/components/qc/QcSliceActions";
import { Button } from "@/components/ui/Button";
import { CardHeader, CardTitle } from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";

/** Assignment slices for a QC review: table + Split, with per-slice actions
 *  (Claim / Release / Reassign / Open) delegated to the shared `QcSliceActions`.
 *  Self-contained on `reviewId`; shared by the review-detail page and the cycle's
 *  Verify Manage modal. `onChanged` fires after any successful mutation so a host
 *  can refresh its own rollup. */
export default function QcAssignments({
  reviewId,
  assignments,
  reviewType,
  reviewStatus,
  canManage = true,
  onChanged,
}: {
  reviewId: string;
  assignments: QcAssignment[];
  /** Parent review's type, forwarded to each slice's Review action. */
  reviewType?: QcReviewType;
  /** Parent review's status, forwarded so terminal reviews hide claim/assign. */
  reviewStatus?: string;
  /** False for a terminal review (e.g. cancelled): the table is read-only —
   *  no per-slice actions and no Split. */
  canManage?: boolean;
  onChanged?: () => void;
}) {
  const { addToast } = useToast();
  const userMap = useUsers();

  const split = useSplitReview(reviewId);

  // Every unit belongs to exactly one slice, so the slices sum to the review's
  // total. A slice with no units can never be worked or completed, so N is
  // capped at the unit count -- but N = 1 is always allowed, since that is the
  // documented *merge* (and the only way to repair an over-split review).
  const unitTotal = assignments.reduce((sum, a) => sum + a.series_total, 0);
  const canSplit = unitTotal >= 1;

  const [showSplit, setShowSplit] = useState(false);
  const [splitMode, setSplitMode] = useState<"count" | "users">("count");
  const [splitCount, setSplitCount] = useState("2");
  const [splitUsers, setSplitUsers] = useState<Set<number>>(new Set());

  // A rebalance only moves units, but it destroys the slice boundaries -- and
  // with them the assignee of finished work. Completed slices are therefore
  // off-limits; merely claimed ones can still be rebalanced (force is sent for
  // those, which is what the API's guard asks for).
  const hasCompletedWork = assignments.some(
    (a) => a.assignment_status === "complete",
  );
  const hasActiveWork = assignments.some(
    (a) => a.assignment_status === "in_progress",
  );
  const users = useMemo(
    () =>
      Array.from(userMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [userMap],
  );

  async function handleSplit() {
    const body =
      splitMode === "count"
        ? { count: Number(splitCount) }
        : { user_ids: [...splitUsers] };
    try {
      await split.mutateAsync(hasActiveWork ? { ...body, force: true } : body);
      toastSuccess(addToast, "Review split.");
      setShowSplit(false);
      setSplitUsers(new Set());
      onChanged?.();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not split review.");
    }
  }

  return (
    <>
      <CardHeader className="mt-6">
        <CardTitle>Assignments</CardTitle>
        {canManage && (
          <Button
            size="sm"
            onClick={() => {
              // Open on a value the cap allows, so a 1-unit review lands on the
              // merge rather than a disabled Split button.
              setSplitCount(String(Math.min(2, unitTotal)));
              setShowSplit(true);
            }}
            disabled={!canSplit || hasCompletedWork}
            title={
              hasCompletedWork
                ? "This review has completed slices; re-splitting would discard who did the work."
                : canSplit
                  ? unitTotal === 1
                    ? "Only a merge to 1 slice is possible: this review has 1 unit."
                    : undefined
                  : "This review has no units to split."
            }
          >
            Split
          </Button>
        )}
      </CardHeader>
      <div>
        {assignments.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No assignments.
          </p>
        ) : (
          <DynamicTable
            rows={assignments}
            getRowKey={(row) => row.assignment_id}
            columns={[
              {
                key: "assignment_id",
                label: "Slice",
                render: (v) => `#${v}`,
              },
              {
                key: "assigned_to",
                label: "Assignee",
                render: (v) =>
                  v != null
                    ? (userMap.get(v as number) ?? `User ${v}`)
                    : "Unclaimed",
              },
              {
                key: "assignment_status",
                label: "Status",
                render: (v) => <StatusBadge status={String(v)} />,
              },
              {
                key: "share_percentage",
                label: "Share",
                render: (v) => (v != null ? `${v}%` : "—"),
              },
              {
                key: "series_approved",
                label: "Progress",
                sortable: false,
                render: (_v, row) =>
                  `${row.series_approved}/${row.series_total} approved`,
              },
              {
                key: "who_updated",
                label: "Actions",
                sortable: false,
                render: (_v, a) =>
                  !canManage ? (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  ) : (
                    <QcSliceActions
                      reviewId={reviewId}
                      assignment={a}
                      reviewType={reviewType}
                      reviewStatus={reviewStatus}
                      onChanged={onChanged}
                    />
                  ),
              },
            ]}
          />
        )}
      </div>

      {/* Split */}
      <Modal
        open={showSplit}
        onClose={() => setShowSplit(false)}
        title="Split Review"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowSplit(false)}
              disabled={split.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleSplit()}
              loading={split.isPending}
              disabled={
                (splitMode === "users" &&
                  (splitUsers.size < 1 || splitUsers.size > unitTotal)) ||
                (splitMode === "count" &&
                  (!Number.isFinite(Number(splitCount)) ||
                    Number(splitCount) < 1 ||
                    Number(splitCount) > unitTotal))
              }
            >
              Split
            </Button>
          </>
        }
      >
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Splitting rebalances the whole review across new slices, evenly per
          modality. This replaces the current slices.{" "}
          {`At most ${unitTotal} slice${unitTotal === 1 ? "" : "s"}`} — one per
          unit — since an empty slice can never be completed. Splitting into 1
          slice merges the review back together.
        </p>
        {hasActiveWork && (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
            Some slices are already in progress — splitting will reassign that
            work.
          </p>
        )}
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="split-mode"
              checked={splitMode === "count"}
              onChange={() => setSplitMode("count")}
            />
            <span>Into</span>
            <input
              type="number"
              min={1}
              max={unitTotal}
              value={splitCount}
              onChange={(e) => setSplitCount(e.target.value)}
              className="input w-20"
              disabled={splitMode !== "count"}
            />
            <span>unclaimed slices</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="split-mode"
              checked={splitMode === "users"}
              onChange={() => setSplitMode("users")}
            />
            <span>Assign to reviewers</span>
          </label>
          {splitMode === "users" && (
            <div
              className="max-h-48 overflow-y-auto rounded border p-2"
              style={{ borderColor: "var(--border-strong)" }}
            >
              {users.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>No reviewers available.</p>
              ) : (
                users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      checked={splitUsers.has(u.id)}
                      onChange={() =>
                        setSplitUsers((prev) => {
                          const next = new Set(prev);
                          if (next.has(u.id)) next.delete(u.id);
                          else next.add(u.id);
                          return next;
                        })
                      }
                    />
                    <span>{u.name}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
