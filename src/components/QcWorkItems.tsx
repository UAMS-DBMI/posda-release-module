import { Link } from "react-router-dom";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useUsers } from "@/lib/useUsers";
import { useAssignmentQueue, useMyFlags, useResolveFlag } from "@/lib/useQc";
import { Button, LinkButton } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";

const CAP = 8;

/** Dashboard QC work-intake: action items (flags) + the current user's queue. */
export default function QcWorkItems() {
  const { addToast } = useToast();
  const currentUser = useCurrentUser();
  const userMap = useUsers();

  const myQueue = useAssignmentQueue({
    assignedTo: currentUser?.user_id,
    enabled: currentUser != null,
  });
  const flags = useMyFlags(CAP);
  const resolve = useResolveFlag();

  const myActive = (myQueue.data?.data ?? [])
    .filter((a) => a.assignment_status !== "complete")
    .slice(0, CAP);

  const myFlags = flags.data?.data ?? [];
  const flagTotal = flags.data?.meta.total ?? myFlags.length;

  async function handleResolve(id: number) {
    try {
      await resolve.mutateAsync(id);
      toastSuccess(addToast, "Flag resolved.");
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not resolve flag.");
    }
  }

  return (
    <>
      {/* My Action Items (flags) — hidden for now, not in use yet.
      <CardHeader className="mt-6 mb-0">
        <CardTitle>My Action Items</CardTitle>
      </CardHeader>
      <SectionCard className="mt-1">
        {flags.isLoading && <p className="text-sm">Loading...</p>}
        {!flags.isLoading && myFlags.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No open action items.
          </p>
        )}
        {myFlags.length > 0 && (
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {myFlags.map((f) => (
              <li
                key={f.user_flag_id}
                className="flex items-start justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p>{f.note || "(no note)"}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    flagged by{" "}
                    {f.flagged_by != null
                      ? (userMap.get(f.flagged_by) ?? `User ${f.flagged_by}`)
                      : "—"}
                    {f.object_type === "qc_review" && (
                      <>
                        {" · "}
                        <Link
                          to={`/qc/reviews/${f.object_id}`}
                          className="hover:text-accent"
                          style={{ color: "var(--accent)" }}
                        >
                          Review #{f.object_id}
                        </Link>
                      </>
                    )}
                    {f.series_instance_uid && <> · series {f.series_instance_uid}</>}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleResolve(f.user_flag_id)}
                  disabled={resolve.isPending}
                >
                  Resolve
                </Button>
              </li>
            ))}
            {flagTotal > myFlags.length && (
              <li className="py-2 text-xs" style={{ color: "var(--muted)" }}>
                +{flagTotal - myFlags.length} more
              </li>
            )}
          </ul>
        )}
      </SectionCard>
      */}

      <CardHeader className="mt-6 mb-0">
        <CardTitle>My QC Queue</CardTitle>
        <LinkButton href="/qc/queue" size="sm">
          Pickup Queue
        </LinkButton>
      </CardHeader>
      <SectionCard className="mt-1">
        {myQueue.isLoading && <p className="text-sm">Loading...</p>}
        {!myQueue.isLoading && myActive.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Nothing assigned to you. Pick up work from the queue.
          </p>
        )}
        {myActive.length > 0 && (
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {myActive.map((a) => (
              <li
                key={a.assignment_id}
                className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Link
                    to={`/qc/reviews/${a.qc_review_id}`}
                    className="font-medium hover:text-accent"
                    style={{ color: "var(--accent)" }}
                  >
                    {a.recordset_name} — {a.review_type} #{a.qc_review_id}
                  </Link>
                  <StatusBadge status={a.assignment_status} />
                </div>
                <span className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                  {a.series_approved}/{a.series_total} approved
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
