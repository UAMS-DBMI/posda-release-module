import { Fragment, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import CreateDraftModal from "@/components/CreateDraftModal";
import CreateRecordsetModal from "@/components/CreateRecordsetModal";
import DraftSummary from "@/components/DraftSummary";
import ManageFilesModal, { type ManageTab } from "@/components/ManageFilesModal";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { extractApiError } from "@/lib/apiUtils";
import { isCycleActive } from "@/lib/useCycle";
import { useCycleContext } from "./CycleLayout";

/** Recordset links leave the cycle, so they open in a new tab -- the only
 *  navigation allowed off a cycle page. */
function RecordsetLink({ id, name }: { id: number; name: string }) {
  return (
    <Link
      to={`/recordsets/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-accent"
      style={{ color: "var(--accent)" }}
    >
      {name}
    </Link>
  );
}

const TH = "px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-white";

type ManageTarget = { id: number; name: string; wpLinked: boolean; tab: ManageTab };

export default function AssembleStage() {
  const { cycle, datasetId } = useCycleContext();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const [showCreateRecordset, setShowCreateRecordset] = useState(false);
  const [createFor, setCreateFor] = useState<{
    id: number;
    name: string;
    wpLinked: boolean;
  } | null>(null);
  const [manage, setManage] = useState<ManageTarget | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  function invalidateCycle() {
    void queryClient.invalidateQueries({
      queryKey: ["dataset-cycle", datasetId ?? ""],
    });
  }

  const setStatus = useMutation({
    mutationFn: async (v: { draftId: number; status: "ready" | "open" }) => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${v.draftId}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ draft_status: v.status }),
        },
      );
      if (!res.ok) {
        throw new Error(extractApiError(await res.json(), "Could not update the draft status."));
      }
    },
    onSuccess: (_d, v) => {
      invalidateCycle();
      toastSuccess(addToast, v.status === "ready" ? "Draft marked ready." : "Draft reopened.");
    },
    onError: (e) =>
      toastError(addToast, e instanceof Error ? e.message : "Could not update the draft status."),
  });

  if (cycle.recordsets.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          This dataset has no recordsets yet. Add one to start a release cycle.
        </p>
        <Button size="sm" onClick={() => setShowCreateRecordset(true)}>
          Create a Recordset
        </Button>
        <CreateRecordsetModal
          open={showCreateRecordset}
          onClose={() => setShowCreateRecordset(false)}
          datasetId={datasetId}
        />
      </div>
    );
  }

  const cycleActive = isCycleActive(cycle);

  return (
    <div className="space-y-3">
      {!cycleActive && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No cycle is currently in progress
          {cycle.latest_dataset_release
            ? ` — last release was v${cycle.latest_dataset_release.release_number} (${cycle.latest_dataset_release.release_status})`
            : ""}
          . Start one from the banner above before assembling drafts.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="data-table min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-accent">
              <th className="w-10 px-2 py-1" />
              <th className={TH}>Recordset</th>
              <th className={TH}>Draft</th>
              <th className={TH}>Status</th>
              <th className={TH}>Files</th>
              <th className={TH}>Frozen At</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {cycle.recordsets.map((r) => {
              const draft = r.open_draft;
              const draftId = draft?.recordset_draft_id ?? null;
              const status = draft?.draft_status ?? null;
              const fileCount = draft?.file_count ?? null;
              const frozen = r.latest_release ? `v${r.latest_release.release_number}` : null;
              const neverReleased = r.latest_release === null;
              const isReady = status === "ready";
              const hasFiles = (fileCount ?? 0) > 0;
              const expanded = draftId != null && expandedId === draftId;

              function openManage(tab: ManageTab) {
                if (draftId == null) return;
                setManage({ id: draftId, name: r.recordset_name, wpLinked: r.wp_linked, tab });
              }

              return (
                <Fragment key={r.recordset_id}>
                  <tr className="table-row">
                    <td className="px-1 py-1">
                      {draftId != null && (
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : draftId)}
                          className="flex h-7 w-7 items-center justify-center rounded hover:bg-(--surface-alt)"
                          style={{ color: "var(--muted)" }}
                          title={expanded ? "Hide contents" : "Show contents"}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width={18}
                            height={18}
                            fill="currentColor"
                            aria-hidden
                            style={{
                              transform: expanded ? "rotate(90deg)" : "none",
                              transition: "transform 100ms",
                            }}
                          >
                            <path d="M5 3l14 9-14 9z" />
                          </svg>
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <RecordsetLink id={r.recordset_id} name={r.recordset_name} />
                    </td>
                    <td className="px-2 py-1">
                      {draft?.draft_name ? (
                        draft.draft_name
                      ) : neverReleased ? (
                        <div>
                          <StatusBadge status="never-released" label="Never released" variant="warning" />
                          <div className="text-xs" style={{ color: "var(--muted)" }}>
                            won't be in this release without a draft
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          carrying forward
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {status ? <StatusBadge status={status} /> : "—"}
                    </td>
                    <td className="px-2 py-1">
                      {fileCount == null ? "—" : fileCount.toLocaleString()}
                    </td>
                    <td className="px-2 py-1">
                      <div>{frozen ?? "—"}</div>
                      {r.last_bundled_dataset_release_number != null && (
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          last bundled: dataset v{r.last_bundled_dataset_release_number}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {draftId != null ? (
                        <div className="flex items-center justify-end gap-2">
                          {isReady ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setStatus.mutate({ draftId, status: "open" })}
                              loading={setStatus.isPending && setStatus.variables?.draftId === draftId}
                            >
                              Reopen
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => setStatus.mutate({ draftId, status: "ready" })}
                              disabled={!hasFiles}
                              title={hasFiles ? undefined : "Add files before marking ready"}
                              loading={setStatus.isPending && setStatus.variables?.draftId === draftId}
                            >
                              Mark Ready
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => openManage("add")}>
                            Manage
                          </Button>
                        </div>
                      ) : cycleActive ? (
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            onClick={() =>
                              setCreateFor({
                                id: r.recordset_id,
                                name: r.recordset_name,
                                wpLinked: r.wp_linked,
                              })
                            }
                          >
                            Create Draft
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                  {expanded && draftId != null && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-3"
                        style={{
                          background: "var(--surface)",
                          borderTop: "1px solid var(--border-strong)",
                        }}
                      >
                        <DraftSummary draftId={draftId} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <CreateDraftModal
        open={createFor !== null}
        onClose={() => setCreateFor(null)}
        datasetId={datasetId}
        recordsetId={createFor?.id ?? 0}
        recordsetName={createFor?.name ?? ""}
        wpLinked={createFor?.wpLinked ?? false}
      />

      <ManageFilesModal
        open={manage !== null}
        onClose={() => setManage(null)}
        datasetId={datasetId}
        draftId={manage?.id ?? null}
        recordsetName={manage?.name ?? ""}
        wpLinked={manage?.wpLinked ?? false}
        initialTab={manage?.tab ?? "add"}
      />
    </div>
  );
}
