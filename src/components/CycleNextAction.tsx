import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import {
  isCycleInProgress,
  nextAction,
  useStartNextCycle,
  type DatasetCycle,
  type StageKey,
} from "@/lib/useCycle";

type CycleNextActionProps = {
  cycle: DatasetCycle;
  datasetId: string | undefined;
  onGoToStage: (stage: StageKey) => void;
};

/** States what this cycle needs next, in one sentence, with the action that
 *  addresses it. Deliberately not a second status strip — the tabs already
 *  carry per-stage status; this says what to do about it. */
export default function CycleNextAction({
  cycle,
  datasetId,
  onGoToStage,
}: CycleNextActionProps) {
  const action = nextAction(cycle);
  const { addToast } = useToast();
  const startNextCycle = useStartNextCycle(datasetId);

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
        {startButton}
      </div>
    );
  }

  // Reached once a released cycle's transfers are all delivered. Dissemination
  // isn't modelled yet (step 7), so this is as far as the cycle can be tracked
  // -- carry the Start button here too, or a released cycle would have no way
  // forward at all.
  if (!action) {
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
            ? `v${release.release_number} is distributed — nothing outstanding.`
            : "Nothing outstanding."}
        </span>
        {startButton}
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
          {action.blocked ? "Blocked: " : "Next: "}
        </span>
        {action.message}
      </p>

      <Button size="sm" onClick={() => onGoToStage(action.stage)}>
        {action.actionLabel}
      </Button>
    </div>
  );
}
