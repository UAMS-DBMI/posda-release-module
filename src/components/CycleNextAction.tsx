import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import {
  isCycleActive,
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

  // Whether a cycle is in progress is orthogonal to Setup/other per-stage
  // readiness -- a dataset can be mid-Setup (e.g. WP not linked yet, so
  // nextAction() reports that) with no draft dataset_release at all. Check
  // isCycleActive directly rather than inferring it from nextAction() being
  // null, which it usually isn't even with no active cycle.
  if (!isCycleActive(cycle)) {
    const release = cycle.latest_dataset_release;

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
        <Button
          size="sm"
          loading={startNextCycle.isPending}
          onClick={() => void handleStartNextCycle()}
        >
          Start Next Cycle
        </Button>
      </div>
    );
  }

  // Reachable only as a defensive fallback -- an active draft dataset_release
  // always keeps Bundle "active" until released, so nextAction() should never
  // actually be null once isCycleActive is true.
  if (!action) {
    return (
      <div
        className="mt-4 flex flex-wrap items-center gap-3 rounded-md px-4 py-3 text-sm"
        style={{
          background: "var(--surface-alt)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <span style={{ color: "var(--muted)" }}>
          Nothing outstanding — this cycle is fully distributed.
        </span>
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
