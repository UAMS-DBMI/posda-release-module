import { useState } from "react";
import { Button } from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import type { IdcBucketStatus } from "@/lib/idcBucket";
import {
  isCycleInProgress,
  nextAction,
  useStartNextCycle,
  type DatasetCycle,
  type StageKey,
} from "@/lib/useCycle";

type CycleNextActionProps = {
  cycle: DatasetCycle;
  idc: IdcBucketStatus | undefined;
  datasetId: string | undefined;
  onGoToStage: (stage: StageKey) => void;
  /** What's being corrected on the live release, or null. */
  correction: string | null;
  onCorrectionChange: (note: string | null) => void;
};

/** States what this cycle needs next, in one sentence, with the action that
 *  addresses it. Deliberately not a second status strip — the tabs already
 *  carry per-stage status; this says what to do about it. */
export default function CycleNextAction({
  cycle,
  idc,
  datasetId,
  onGoToStage,
  correction,
  onCorrectionChange,
}: CycleNextActionProps) {
  const action = nextAction(cycle, idc);
  const { addToast } = useToast();
  const startNextCycle = useStartNextCycle(datasetId);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  const release = cycle.dataset_release;

  async function handleStartNextCycle() {
    try {
      await startNextCycle.mutateAsync();
      toastSuccess(addToast, "Started the next release cycle.");
    } catch (e) {
      toastError(
        addToast,
        e instanceof Error ? e.message : "Could not start the next cycle.",
      );
    }
  }

  const startButton = (
    <Button
      size="sm"
      loading={startNextCycle.isPending}
      onClick={() => void handleStartNextCycle()}
    >
      Start Next Cycle
    </Button>
  );

  // Whether work remains is orthogonal to Setup/other per-stage readiness -- a
  // dataset can be mid-Setup (e.g. WP not linked yet, so nextAction() reports
  // that) with no dataset_release at all. Check the release directly rather
  // than inferring it from nextAction() being null.
  //
  // Note this is isCycleInProgress, NOT isCycleActive: a released-but-not-live
  // release is past composition but still mid-cycle, and saying "no cycle in
  // progress" there hid unsent transfers behind a Start Next Cycle button.
  if (!isCycleInProgress(cycle)) {
    const live = release?.release_status === "live";

    // A small fix to the live release; a bigger change is a new cycle.
    if (live && correction !== null) {
      return (
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-amber-50 px-4 py-3 text-sm dark:bg-amber-900/15"
          style={{ border: "1px solid var(--border-strong)" }}
        >
          <span>
            <span className="font-semibold text-amber-700 dark:text-amber-400">
              Correcting v{release.release_number}:{" "}
            </span>
            {correction}
            <span className="block text-xs" style={{ color: "var(--muted)" }}>
              Transfer and Disseminate actions are open. Each one is added to its
              transfer&apos;s notes.
            </span>
          </span>
          <Button size="sm" variant="ghost" onClick={() => onCorrectionChange(null)}>
            Done
          </Button>
        </div>
      );
    }

    return (
      <div
        className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3 text-sm"
        style={{
          background: "var(--surface-alt)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <span style={{ color: "var(--muted)" }}>
          {release
            ? `Last release: v${release.release_number} (${release.release_status}). No cycle is currently in progress.`
            : "No cycle is currently in progress."}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {live && (
            <Button size="sm" variant="ghost" onClick={() => setNoteOpen(true)}>
              Make a Correction
            </Button>
          )}
          {startButton}
        </span>
        {live && (
          <Modal
            open={noteOpen}
            onClose={() => setNoteOpen(false)}
            title={`Correct v${release.release_number}?`}
            footer={
              <>
                <Button variant="ghost" onClick={() => setNoteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={note.trim() === ""}
                  onClick={() => {
                    onCorrectionChange(note.trim());
                    setNote("");
                    setNoteOpen(false);
                  }}
                >
                  Start Correction
                </Button>
              </>
            }
          >
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              v{release.release_number} is live. A correction opens its Transfer
              and Disseminate actions, for small fixes like re-pushing a file or
              updating a download page. A change to what the release contains
              needs a new cycle.
            </p>
            <label className="mt-4 block">
              <span className="block text-sm font-medium">What are you correcting?</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="textarea mt-1 w-full"
              />
            </label>
          </Modal>
        )}
      </div>
    );
  }

  // Reached once a released cycle's transfers are all delivered. Dissemination
  // isn't modelled yet (step 7), so this is as far as the cycle can be tracked
  // -- carry the Start button here too, or a released cycle would have no way
  // forward at all.
  //
  // A *draft* release can also land here with nothing flagged, and it is not
  // distributed by any reading: it has not even been finalized. Saying so would
  // be wrong, and offering Start Next Cycle worse -- the API refuses a second
  // draft release while one exists, so the button could only ever fail.
  if (!action) {
    const stillComposing = release?.release_status === "draft";
    return (
      <div
        className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3 text-sm"
        style={{
          background: "var(--surface-alt)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <span style={{ color: "var(--muted)" }}>
          {!release
            ? "Nothing outstanding."
            : stillComposing
              ? `v${release.release_number} is still being composed — nothing flagged right now.`
              : `v${release.release_number} is distributed — nothing outstanding.`}
        </span>
        {stillComposing ? null : startButton}
      </div>
    );
  }

  return (
    <div
      className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3 ${
        action.blocked ? "bg-amber-50 dark:bg-amber-900/15" : ""
      }`}
      style={
        action.blocked
          ? { border: "1px solid var(--border-strong)" }
          : {
              background: "var(--surface-alt)",
              border: "1px solid var(--border-strong)",
            }
      }
    >
      <p className="text-sm">
        <span
          className={`font-semibold ${
            action.blocked ? "text-amber-700 dark:text-amber-400" : ""
          }`}
        >
          {action.blocked ? "Blocked: " : action.actionLabel ? "Next: " : ""}
        </span>
        {action.message}
      </p>

      {action.actionLabel && (
        <Button size="sm" onClick={() => onGoToStage(action.stage)}>
          {action.actionLabel}
        </Button>
      )}
    </div>
  );
}
