import { useState, type ReactNode } from "react";
import {
  isRetiredReview,
  useCancelQcReview,
  useQcSyncPreview,
  useSyncQcReview,
  type QcReviewRow,
  type QcStaleBreakdown,
} from "@/lib/useQc";
import { useUsers } from "@/lib/useUsers";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";

/** Review-level lifecycle for a QC review: the stale "sync" banner plus Sync /
 *  Cancel, owning the Sync and Cancel modals. Completion is automatic -- the
 *  backend completes a review once every unit is approved. Shared by the
 *  review-detail page and the cycle's Verify Manage modal. `onChanged` lets a
 *  host refresh its own rollup after a mutation.
 *
 *  Sync updates a stale review in place (notes/LUSCIDA.md §4): added units and
 *  changed ones go to a target slice, removed units and emptied slices are
 *  deleted, finished slices are otherwise untouched.
 *
 *  Returns its pieces separately rather than one fragment, because the hosts
 *  place them differently: the actions belong in a page header while the banner
 *  stays in the body. The modals share state with the actions, so they cannot
 *  simply be split into two components. */
export function useQcReviewLifecycle({
  reviewId,
  review,
  stale,
  onChanged,
}: {
  reviewId: string;
  /** Undefined while the host is still loading; everything returns null then. */
  review: QcReviewRow | undefined;
  stale: QcStaleBreakdown | null;
  onChanged?: () => void;
}): { actions: ReactNode; banner: ReactNode; modals: ReactNode } {
  const { addToast } = useToast();
  const userMap = useUsers();
  const cancel = useCancelQcReview(reviewId);
  const sync = useSyncQcReview(reviewId);

  const [showSync, setShowSync] = useState(false);
  // undefined = not chosen yet: the default applies (see `target` below).
  const [targetChoice, setTargetChoice] = useState<number | null | undefined>(
    undefined,
  );
  const [showCancel, setShowCancel] = useState(false);
  const preview = useQcSyncPreview(reviewId, showSync);

  const active = !!review && !isRetiredReview(review.review_status);
  // Sync only means something once the draft has moved under the review.
  const canSync = active && review?.review_status === "stale";
  const unitNoun = review?.review_type === "non_dicom" ? "files" : "series";

  const plan = preview.data;
  const targets = plan?.targets ?? [];
  const moving = plan ? plan.would_add + plan.changed : 0;
  // New slice by default; the only unfinished slice when there is just one.
  const target =
    targetChoice !== undefined
      ? targetChoice
      : targets.length === 1
        ? targets[0].assignment_id
        : null;
  // A slice picked as the target receives the moving units, so it stays.
  const deletedSlices = (plan?.emptied_assignment_ids ?? []).filter(
    (id) => !(moving > 0 && id === target),
  );

  function openSync() {
    setTargetChoice(undefined);
    setShowSync(true);
  }

  async function handleSync() {
    try {
      await sync.mutateAsync({ target_assignment_id: moving > 0 ? target : null });
      toastSuccess(addToast, "Review synced.");
      setShowSync(false);
      onChanged?.();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not sync review.");
    }
  }

  async function handleCancel() {
    try {
      await cancel.mutateAsync();
      toastSuccess(addToast, "Review cancelled.");
      setShowCancel(false);
      onChanged?.();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not cancel review.");
    }
  }

  const banner =
    canSync && stale ? (
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
            {stale.changed} changed · {stale.would_add} added ·{" "}
            {stale.would_drop} removed. Sync to bring the review up to date;
            decisions on unchanged {unitNoun} are kept.
          </p>
          <Button size="sm" className="mt-3" onClick={openSync}>
            Sync
          </Button>
        </div>
      </SectionCard>
    ) : null;

  const actions = active ? (
    <>
      {canSync && (
        <Button variant="ghost" onClick={openSync}>
          Sync
        </Button>
      )}
      {/* A completed review is locked; it leaves 'complete' only by going stale. */}
      {review?.review_status !== "complete" && (
        <Button variant="ghost" onClick={() => setShowCancel(true)}>
          Cancel Review
        </Button>
      )}
    </>
  ) : null;

  const modals = active ? (
    <>
      {/* Sync */}
      <Modal
        open={showSync}
        onClose={() => setShowSync(false)}
        title="Sync QC Review"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowSync(false)}
              disabled={sync.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleSync()}
              loading={sync.isPending}
              disabled={!plan}
            >
              Sync
            </Button>
          </>
        }
      >
        {preview.isLoading && <LoadingState className="mt-4" />}
        {preview.isError && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            Could not work out what the sync would do.
          </p>
        )}
        {plan && (
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <p className="font-medium">
                {plan.would_add} added · {plan.changed} changed · {plan.would_drop}{" "}
                removed
              </p>
              <ul
                className="mt-1 list-disc space-y-0.5 pl-5"
                style={{ color: "var(--muted)" }}
              >
                <li>Added {unitNoun} start pending in the target slice.</li>
                <li>Changed {unitNoun} go back to pending and move there.</li>
                <li>Removed {unitNoun} are deleted with their decisions.</li>
                <li>Everything else keeps its slice and decision.</li>
              </ul>
            </div>

            {moving > 0 && (
              <fieldset className="space-y-2">
                <legend className="mb-1 font-medium">Send the new work to</legend>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="sync-target"
                    checked={target === null}
                    onChange={() => setTargetChoice(null)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">A new slice</span> — unclaimed,
                    with its own review link.
                  </span>
                </label>
                {targets.map((t) => (
                  <label key={t.assignment_id} className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="sync-target"
                      checked={target === t.assignment_id}
                      onChange={() => setTargetChoice(t.assignment_id)}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">Slice #{t.assignment_id}</span> ·{" "}
                      {t.assigned_to != null
                        ? (userMap.get(t.assigned_to) ?? `user ${t.assigned_to}`)
                        : "Unclaimed"}{" "}
                      · {t.unit_count} {unitNoun}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            {deletedSlices.length > 0 && (
              <div
                className="rounded-md px-3 py-2"
                style={{
                  background: "var(--surface-alt)",
                  borderLeft: "4px solid var(--accent)",
                }}
              >
                {deletedSlices.map((id) => (
                  <p key={id}>
                    Slice #{id} will be deleted: none of its {unitNoun} remain in
                    it.
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
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
    </>
  ) : null;

  return { actions, banner, modals };
}
