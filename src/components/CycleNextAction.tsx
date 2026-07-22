import { Button } from "@/components/ui/Button";
import { nextAction, type DatasetCycle, type StageKey } from "@/lib/useCycle";

type CycleNextActionProps = {
  cycle: DatasetCycle;
  onGoToStage: (stage: StageKey) => void;
};

/** States what this cycle needs next, in one sentence, with the action that
 *  addresses it. Deliberately not a second status strip — the tabs already
 *  carry per-stage status; this says what to do about it. */
export default function CycleNextAction({
  cycle,
  onGoToStage,
}: CycleNextActionProps) {
  const action = nextAction(cycle);

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
