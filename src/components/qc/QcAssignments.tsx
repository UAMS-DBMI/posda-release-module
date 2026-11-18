import { useMemo, useState } from "react";
import {
  useCombineQcAssignment,
  useSplitQcAssignment,
  type QcAssignment,
  type QcReviewType,
} from "@/lib/useQc";
import { useUsers } from "@/lib/useUsers";
import DynamicTable from "@/components/DynamicTable";
import QcSliceActions from "@/components/qc/QcSliceActions";
import { Button } from "@/components/ui/Button";
import { CardHeader, CardTitle } from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";

/** Assignment slices for a QC review, with per-slice actions: Claim / Release /
 *  Assign / Review (the shared `QcSliceActions`) plus Split and Combine. Split and
 *  Combine work on one unfinished slice at a time and leave finished slices and
 *  decided series where they are. Self-contained on `reviewId`; shared by the
 *  review-detail page and the cycle's Verify Manage modal. `onChanged` fires after
 *  any successful mutation so a host can refresh its own rollup. */
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
   *  no per-slice actions. */
  canManage?: boolean;
  onChanged?: () => void;
}) {
  const { addToast } = useToast();
  const userMap = useUsers();
  const split = useSplitQcAssignment(reviewId);
  const combine = useCombineQcAssignment(reviewId);

  const users = useMemo(
    () =>
      Array.from(userMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [userMap],
  );
  const unfinished = assignments.filter((a) => a.assignment_status !== "complete");

  // Split: the slice being split, the total slice count after it (original
  // included), and a reviewer per new slice ("" = unclaimed).
  const [splitSlice, setSplitSlice] = useState<QcAssignment | null>(null);
  const [splitCount, setSplitCount] = useState(2);
  const [splitAssignees, setSplitAssignees] = useState<string[]>([""]);

  // Combine: the source slice, the chosen target, and whether decided series go too.
  const [combineSlice, setCombineSlice] = useState<QcAssignment | null>(null);
  const [combineTarget, setCombineTarget] = useState<number | null>(null);
  const [includeDecided, setIncludeDecided] = useState(false);

  function userName(id: number | null): string {
    return id != null ? (userMap.get(id) ?? `User ${id}`) : "Unclaimed";
  }

  function openSplit(a: QcAssignment) {
    setSplitSlice(a);
    changeSplitCount(2);
  }

  function changeSplitCount(n: number) {
    setSplitCount(n);
    setSplitAssignees((prev) => Array.from({ length: n - 1 }, (_, i) => prev[i] ?? ""));
  }

  function openCombine(a: QcAssignment) {
    const targets = unfinished.filter((t) => t.assignment_id !== a.assignment_id);
    setCombineSlice(a);
    setCombineTarget(targets.length === 1 ? targets[0].assignment_id : null);
    setIncludeDecided(false);
  }

  async function handleSplit() {
    if (!splitSlice) return;
    try {
      await split.mutateAsync({
        assignmentId: splitSlice.assignment_id,
        count: splitCount,
        assignees: splitAssignees.map((u) => (u ? Number(u) : null)),
      });
      toastSuccess(addToast, `Slice #${splitSlice.assignment_id} split.`);
      setSplitSlice(null);
      onChanged?.();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not split slice.");
    }
  }

  async function handleCombine() {
    if (!combineSlice || combineTarget == null) return;
    try {
      await combine.mutateAsync({
        assignmentId: combineSlice.assignment_id,
        target_assignment_id: combineTarget,
        include_decided: includeDecided,
      });
      toastSuccess(
        addToast,
        `Slice #${combineSlice.assignment_id} combined into #${combineTarget}.`,
      );
      setCombineSlice(null);
      onChanged?.();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not combine slices.");
    }
  }

  const splitDecided = splitSlice ? splitSlice.series_total - splitSlice.series_pending : 0;
  const combineDecided = combineSlice
    ? combineSlice.series_total - combineSlice.series_pending
    : 0;
  const combineTargets = combineSlice
    ? unfinished.filter((t) => t.assignment_id !== combineSlice.assignment_id)
    : [];
  const combineDeletesSource = combineDecided === 0 || includeDecided;

  return (
    <>
      <CardHeader className="mt-6">
        <CardTitle>Assignments</CardTitle>
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
            hideSummary
            columns={[
              {
                key: "assignment_id",
                label: "Slice",
                render: (v) => `#${v}`,
              },
              {
                key: "assigned_to",
                label: "Assignee",
                render: (v) => userName(v as number | null),
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
                    <div className="flex flex-wrap gap-2">
                      <QcSliceActions
                        reviewId={reviewId}
                        assignment={a}
                        reviewType={reviewType}
                        reviewStatus={reviewStatus}
                        onChanged={onChanged}
                      />
                      {a.assignment_status !== "complete" && (
                        <>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => openSplit(a)}
                            disabled={a.series_pending < 2}
                            title={
                              a.series_pending < 2
                                ? "A slice needs at least 2 pending series to split."
                                : "Share this slice's pending series with new slices"
                            }
                          >
                            Split
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => openCombine(a)}
                            disabled={unfinished.length < 2}
                            title={
                              unfinished.length < 2
                                ? "There's no other unfinished slice to combine into."
                                : "Move this slice's series into another unfinished slice"
                            }
                          >
                            Combine
                          </Button>
                        </>
                      )}
                    </div>
                  ),
              },
            ]}
          />
        )}
      </div>

      {/* Split one slice */}
      <Modal
        open={splitSlice != null}
        onClose={() => setSplitSlice(null)}
        title={splitSlice ? `Split Slice #${splitSlice.assignment_id}` : "Split Slice"}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setSplitSlice(null)}
              disabled={split.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSplit()} loading={split.isPending}>
              Split
            </Button>
          </>
        }
      >
        {splitSlice && (
          <>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm" style={{ color: "var(--muted)" }}>
              <li>
                Slice #{splitSlice.assignment_id} keeps
                {splitSlice.assigned_to != null &&
                  ` its reviewer (${userName(splitSlice.assigned_to)}),`}{" "}
                its link
                {splitDecided > 0 && `, its ${splitDecided} decided series`} and an even
                share of its {splitSlice.series_pending} pending series.
              </li>
              <li>The new slices take the rest, evenly per modality.</li>
              <li>Other slices aren't touched.</li>
            </ul>
            {splitSlice.assigned_to != null && (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                {userName(splitSlice.assigned_to)} may need to reload Mirabelle: a
                decision on a series that has moved won't save.
              </p>
            )}
            <label className="mt-4 flex items-center gap-2 text-sm">
              <span className="font-medium">Split into</span>
              <select
                value={splitCount}
                onChange={(e) => changeSplitCount(Number(e.target.value))}
                className="select w-20"
              >
                {Array.from({ length: splitSlice.series_pending - 1 }, (_, i) => i + 2).map(
                  (n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ),
                )}
              </select>
              <span>slices, including this one</span>
            </label>
            <div className="mt-3 space-y-2 text-sm">
              {splitAssignees.map((u, i) => (
                <label key={i} className="flex items-center gap-2">
                  <span className="w-24">New slice {i + 1}</span>
                  <select
                    value={u}
                    onChange={(e) =>
                      setSplitAssignees((prev) =>
                        prev.map((v, j) => (j === i ? e.target.value : v)),
                      )
                    }
                    className="select flex-1"
                  >
                    <option value="">Unclaimed</option>
                    {users.map((usr) => (
                      <option key={usr.id} value={usr.id}>
                        {usr.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </>
        )}
      </Modal>

      {/* Combine one slice into another */}
      <Modal
        open={combineSlice != null}
        onClose={() => setCombineSlice(null)}
        title={
          combineSlice ? `Combine Slice #${combineSlice.assignment_id}` : "Combine Slice"
        }
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setCombineSlice(null)}
              disabled={combine.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCombine()}
              loading={combine.isPending}
              disabled={combineTarget == null}
            >
              Combine
            </Button>
          </>
        }
      >
        {combineSlice && (
          <>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              Its {combineSlice.series_pending} pending series move to the slice you
              pick.
              {combineDecided > 0 &&
                ` Its ${combineDecided} decided series stay with it unless you bring them too.`}
            </p>
            <fieldset className="mt-4 space-y-2 text-sm">
              <legend className="mb-1 font-medium">Combine into</legend>
              {combineTargets.map((t) => (
                <label key={t.assignment_id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="combine-target"
                    checked={combineTarget === t.assignment_id}
                    onChange={() => setCombineTarget(t.assignment_id)}
                  />
                  <span>
                    Slice #{t.assignment_id} · {userName(t.assigned_to)} · {t.series_total}{" "}
                    series
                  </span>
                </label>
              ))}
            </fieldset>
            {combineDecided > 0 && (
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeDecided}
                  onChange={(e) => setIncludeDecided(e.target.checked)}
                />
                <span>Bring decided series too</span>
              </label>
            )}
            {combineDeletesSource ? (
              <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                Slice #{combineSlice.assignment_id} will be deleted: none of its series
                remain in it.
              </p>
            ) : (
              <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
                Slice #{combineSlice.assignment_id} keeps its decided series and its
                reviewer, and is then complete.
              </p>
            )}
            {combineSlice.assigned_to != null && (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                {userName(combineSlice.assigned_to)} may need to reload Mirabelle: a
                decision on a series that has moved won't save.
              </p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
