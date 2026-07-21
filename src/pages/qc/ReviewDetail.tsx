import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useCancelQcReview,
  useClaimAssignment,
  useCloneQcReview,
  useQcReview,
  useReleaseAssignment,
  useSplitReview,
  useUpdateAssignment,
  useUpdateQcReview,
} from "@/lib/useQc";
import { useUsers } from "@/lib/useUsers";
import DynamicSection, {
  type DynamicSectionField,
} from "@/components/DynamicSection";
import DynamicTable from "@/components/DynamicTable";
import { Button } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import Modal from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";

type ModalityProgress = {
  modality: string;
  pending: number;
  approved: number;
  rejected: number;
  flagged: number;
  total: number;
};

function fmt(value?: string | null) {
  if (!value) return "—";
  const t = Date.parse(value);
  return Number.isNaN(t) ? "—" : new Date(t).toLocaleString();
}

export default function QcReviewDetail() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const userMap = useUsers();
  const { review_id: reviewId } = useParams<{ review_id: string }>();

  const detail = useQcReview(reviewId);
  const update = useUpdateQcReview(reviewId);
  const cancel = useCancelQcReview(reviewId);
  const clone = useCloneQcReview(reviewId);
  const split = useSplitReview(reviewId);
  const claim = useClaimAssignment(reviewId);
  const release = useReleaseAssignment(reviewId);
  const reassign = useUpdateAssignment(reviewId);

  const [showNotes, setShowNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [showClone, setShowClone] = useState(false);
  const [cloneMode, setCloneMode] = useState<"carry_forward" | "resample">(
    "carry_forward",
  );
  const [showCancel, setShowCancel] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [splitMode, setSplitMode] = useState<"count" | "users">("count");
  const [splitCount, setSplitCount] = useState("2");
  const [splitUsers, setSplitUsers] = useState<Set<number>>(new Set());
  const [showReassign, setShowReassign] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<number | null>(null);
  const [reassignUser, setReassignUser] = useState("");

  const review = detail.data?.review;
  const assignments = detail.data?.assignments ?? [];
  const byStatus = detail.data?.series_by_status ?? [];
  const byModality = detail.data?.series_by_modality ?? [];
  const stale = detail.data?.stale_breakdown;
  const seriesTotal = byStatus.reduce((sum, s) => sum + s.count, 0);
  const approvedCount =
    byStatus.find((s) => s.qc_status === "approved")?.count ?? 0;
  const allApproved = seriesTotal > 0 && approvedCount === seriesTotal;
  const hasActiveWork = assignments.some(
    (a) =>
      a.assignment_status === "in_progress" ||
      a.assignment_status === "complete",
  );
  const users = useMemo(
    () =>
      Array.from(userMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [userMap],
  );

  const modalityProgress = useMemo<ModalityProgress[]>(() => {
    const map = new Map<string, ModalityProgress>();
    for (const r of byModality) {
      const row =
        map.get(r.modality) ??
        {
          modality: r.modality,
          pending: 0,
          approved: 0,
          rejected: 0,
          flagged: 0,
          total: 0,
        };
      if (r.qc_status === "pending") row.pending += r.count;
      else if (r.qc_status === "approved") row.approved += r.count;
      else if (r.qc_status === "rejected") row.rejected += r.count;
      else if (r.qc_status === "flagged") row.flagged += r.count;
      row.total += r.count;
      map.set(r.modality, row);
    }
    return Array.from(map.values());
  }, [byModality]);

  const fields: DynamicSectionField[] = review
    ? [
        { label: "Type", value: review.review_type },
        {
          label: "Sample %",
          value:
            review.review_type === "partial"
              ? `${review.sample_percentage}%`
              : "—",
        },
        { label: "Series", value: seriesTotal.toLocaleString() },
        {
          label: "Cloned From",
          value: review.cloned_from_review_id
            ? `#${review.cloned_from_review_id}`
            : "—",
        },
        {
          label: "Notes",
          value: review.review_notes || "—",
          fullWidth: true,
          valueClassName: "whitespace-pre-wrap",
        },
      ]
    : [];

  async function saveNotes() {
    try {
      await update.mutateAsync({ review_notes: notesDraft.trim() || null });
      toastSuccess(addToast, "Notes updated.");
      setShowNotes(false);
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not save notes.");
    }
  }

  async function handleClone() {
    try {
      const res = await clone.mutateAsync({ mode: cloneMode });
      toastSuccess(addToast, "Review cloned.");
      setShowClone(false);
      navigate(`/qc/reviews/${res.data.review.qc_review_id}`);
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not clone review.");
    }
  }

  async function handleCancel() {
    try {
      await cancel.mutateAsync();
      toastSuccess(addToast, "Review cancelled.");
      setShowCancel(false);
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not cancel review.");
    }
  }

  async function handleMarkComplete() {
    try {
      await update.mutateAsync({ review_status: "complete" });
      toastSuccess(addToast, "Review marked complete.");
    } catch (e) {
      toastError(
        addToast,
        e instanceof Error ? e.message : "Could not complete review.",
      );
    }
  }

  async function handleClaim(assignmentId: number) {
    try {
      await claim.mutateAsync(assignmentId);
      toastSuccess(addToast, "Slice claimed.");
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not claim slice.");
    }
  }

  async function handleRelease(assignmentId: number) {
    try {
      await release.mutateAsync(assignmentId);
      toastSuccess(addToast, "Slice released.");
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not release slice.");
    }
  }

  function openReassign(assignmentId: number, current: number | null) {
    setReassignTarget(assignmentId);
    setReassignUser(current != null ? String(current) : "");
    setShowReassign(true);
  }

  async function handleReassign() {
    if (reassignTarget == null || !reassignUser) return;
    try {
      await reassign.mutateAsync({
        assignmentId: reassignTarget,
        assigned_to: Number(reassignUser),
      });
      toastSuccess(addToast, "Slice reassigned.");
      setShowReassign(false);
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not reassign slice.");
    }
  }

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
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not split review.");
    }
  }

  const active = review && review.review_status !== "cancelled";

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title="QC Review"
        breadcrumbs={
          review
            ? [
                { label: "Recordsets", href: "/recordsets" },
                {
                  label: `Draft ${review.recordset_draft_id}`,
                  href: `/recordsets/drafts/${review.recordset_draft_id}`,
                },
              ]
            : [{ label: "Recordsets", href: "/recordsets" }]
        }
        subtitle={reviewId ? `Review #${reviewId}` : undefined}
        badge={
          review
            ? {
                label: review.review_status,
                variant:
                  review.review_status === "complete"
                    ? "success"
                    : review.review_status === "stale"
                      ? "warning"
                      : review.review_status === "cancelled"
                        ? "neutral"
                        : "success",
              }
            : undefined
        }
        actions={
          active ? (
            <>
              {review.review_status !== "complete" && (
                <Button
                  onClick={() => void handleMarkComplete()}
                  disabled={!allApproved || update.isPending}
                  title={
                    allApproved
                      ? undefined
                      : "All series must be approved before completing"
                  }
                >
                  Mark Complete
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  setNotesDraft(review.review_notes ?? "");
                  setShowNotes(true);
                }}
              >
                Edit Notes
              </Button>
              <Button variant="ghost" onClick={() => setShowClone(true)}>
                Clone
              </Button>
              <Button variant="ghost" onClick={() => setShowCancel(true)}>
                Cancel Review
              </Button>
            </>
          ) : undefined
        }
      />

      {review && review.review_status === "stale" && stale && (
        <SectionCard className="mt-1">
          <div
            className="rounded-md px-4 py-3 text-sm"
            style={{
              background: "var(--surface-alt)",
              borderLeft: "4px solid var(--accent)",
            }}
          >
            <p className="font-medium">
              The draft changed since this review was sampled.
            </p>
            <p className="mt-1" style={{ color: "var(--muted)" }}>
              {stale.changed} changed · {stale.would_add} to add ·{" "}
              {stale.would_drop} to drop. Clone (carry-forward) to refresh while
              preserving decisions.
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => {
                setCloneMode("carry_forward");
                setShowClone(true);
              }}
            >
              Clone to refresh
            </Button>
          </div>
        </SectionCard>
      )}

      <DynamicSection
        isLoading={detail.isLoading}
        error={detail.isError ? "Could not load this QC review." : null}
        fields={fields}
        actions={
          review ? (
            <div className="metadata-panel">
              <p>
                <strong>Created:</strong> {fmt(review.when_created)} by{" "}
                {review.who_created != null
                  ? (userMap.get(review.who_created) ?? "—")
                  : "—"}
              </p>
              <p>
                <strong>Updated:</strong> {fmt(review.when_updated)} by{" "}
                {review.who_updated != null
                  ? (userMap.get(review.who_updated) ?? "—")
                  : "—"}
              </p>
            </div>
          ) : undefined
        }
      />

      {review && (
        <>
          <CardHeader className="mt-6 mb-0">
            <CardTitle>Series Status</CardTitle>
          </CardHeader>
          <SectionCard className="mt-1">
            {seriesTotal === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No series.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  {byStatus.map((s) => (
                    <span
                      key={s.qc_status}
                      className="inline-flex items-center gap-2 text-sm"
                    >
                      <StatusBadge status={s.qc_status} />
                      <span className="font-medium">
                        {s.count.toLocaleString()}
                      </span>
                    </span>
                  ))}
                </div>

                {modalityProgress.length > 0 && (
                  <DynamicTable
                    rows={modalityProgress}
                    getRowKey={(row) => row.modality}
                    columns={[
                      { key: "modality", label: "Modality" },
                      { key: "pending", label: "Pending" },
                      { key: "approved", label: "Approved" },
                      { key: "rejected", label: "Rejected" },
                      { key: "flagged", label: "Flagged" },
                      { key: "total", label: "Total" },
                    ]}
                  />
                )}
              </div>
            )}
          </SectionCard>

          <CardHeader className="mt-6 mb-0">
            <CardTitle>Assignments</CardTitle>
            <Button size="sm" onClick={() => setShowSplit(true)}>
              Split
            </Button>
          </CardHeader>
          <SectionCard className="mt-1">
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
                    render: (_v, a) => (
                      <div className="flex flex-wrap gap-2">
                        {a.assigned_to == null ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleClaim(a.assignment_id)}
                            disabled={claim.isPending}
                          >
                            Claim
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleRelease(a.assignment_id)}
                            disabled={release.isPending}
                          >
                            Release
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            openReassign(a.assignment_id, a.assigned_to)
                          }
                        >
                          Reassign
                        </Button>
                        {a.assigned_to != null && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled
                            title="Mirabelle link coming soon"
                          >
                            Open in Mirabelle
                          </Button>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </SectionCard>
        </>
      )}

      {/* Edit notes */}
      <Modal
        open={showNotes}
        onClose={() => setShowNotes(false)}
        title="Edit Notes"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowNotes(false)}
              disabled={update.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveNotes()} loading={update.isPending}>
              Save
            </Button>
          </>
        }
      >
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          rows={4}
          className="textarea mt-4 w-full"
          autoFocus
        />
      </Modal>

      {/* Clone */}
      <Modal
        open={showClone}
        onClose={() => setShowClone(false)}
        title="Clone QC Review"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowClone(false)}
              disabled={clone.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleClone()} loading={clone.isPending}>
              Clone
            </Button>
          </>
        }
      >
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="clone-mode"
              checked={cloneMode === "carry_forward"}
              onChange={() => setCloneMode("carry_forward")}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Carry forward</span> — re-sample the
              current draft with the same seed and keep prior decisions (changed
              series reset to pending).
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="clone-mode"
              checked={cloneMode === "resample"}
              onChange={() => setCloneMode("resample")}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Resample</span> — a fresh draw with a
              new seed; no decisions carried.
            </span>
          </label>
        </div>
      </Modal>

      {/* Cancel confirm */}
      <Modal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        title="Cancel this QC review?"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowCancel(false)}
              disabled={cancel.isPending}
            >
              Keep
            </Button>
            <Button onClick={() => void handleCancel()} loading={cancel.isPending}>
              Cancel Review
            </Button>
          </>
        }
      >
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          The review and its series are kept for audit, but it's marked cancelled.
        </p>
      </Modal>

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
                (splitMode === "users" && splitUsers.size < 1) ||
                (splitMode === "count" &&
                  (!Number.isFinite(Number(splitCount)) ||
                    Number(splitCount) < 1))
              }
            >
              Split
            </Button>
          </>
        }
      >
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Splitting rebalances the whole review across new slices, evenly per
          modality. This replaces the current slices.
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

      {/* Reassign */}
      <Modal
        open={showReassign}
        onClose={() => setShowReassign(false)}
        title="Reassign Slice"
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
              Reassign
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
    </PageShell>
  );
}
