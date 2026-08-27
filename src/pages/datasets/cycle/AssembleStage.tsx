import { useState } from "react";
import RecordsetLink from "@/components/RecordsetLink";
import CreateDraftModal from "@/components/CreateDraftModal";
import CreateRecordsetModal from "@/components/CreateRecordsetModal";
import DraftSummary from "@/components/DraftSummary";
import ExpandableTable from "@/components/ExpandableTable";
import ManageFilesModal, { type ManageTab } from "@/components/ManageFilesModal";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import {
  isCycleActive,
  isCycleInProgress,
  useSetDraftStatus,
} from "@/lib/useCycle";
import {
  useExcludeRecordsetRelease,
  useIncludeRecordsetRelease,
} from "@/lib/datasetReleaseForm";
import { useCycleContext } from "./CycleLayout";


type ManageTarget = { id: number; name: string; wpLinked: boolean; tab: ManageTab };

export default function AssembleStage() {
  const { cycle, datasetId } = useCycleContext();
  const { addToast } = useToast();

  const [showCreateRecordset, setShowCreateRecordset] = useState(false);
  const [createFor, setCreateFor] = useState<{
    id: number;
    name: string;
    wpLinked: boolean;
  } | null>(null);
  const [manage, setManage] = useState<ManageTarget | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const setStatus = useSetDraftStatus(datasetId);

  // Membership is written here, at Assemble, rather than at Bundle -- so this
  // is where a recordset is taken out of the release or put back. Carrying
  // forward is the default and needs no action; removing is the exception.
  const cycleReleaseId = cycle.dataset_release?.dataset_release_id;
  const exclude = useExcludeRecordsetRelease(cycleReleaseId, datasetId);
  const include = useIncludeRecordsetRelease(cycleReleaseId, datasetId);

  function excludeFromRelease(releaseId: number, name: string) {
    exclude.mutate(releaseId, {
      onSuccess: () => toastSuccess(addToast, `${name} removed from this release.`),
      onError: (e) =>
        toastError(addToast, e instanceof Error ? e.message : "Could not remove it."),
    });
  }

  function includeInRelease(releaseId: number, name: string) {
    include.mutate(releaseId, {
      onSuccess: () => toastSuccess(addToast, `${name} added back to this release.`),
      onError: (e) =>
        toastError(addToast, e instanceof Error ? e.message : "Could not add it."),
    });
  }

  function setDraftStatus(draftId: number, status: "ready" | "open") {
    setStatus.mutate(
      { draftId, status },
      {
        onSuccess: () =>
          toastSuccess(addToast, status === "ready" ? "Draft marked ready." : "Draft reopened."),
        onError: (e) =>
          toastError(addToast, e instanceof Error ? e.message : "Could not update the draft status."),
      },
    );
  }

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
  // "Active" means the release is still a draft, i.e. composition is open.
  // A released cycle is still in progress -- it just cannot take new drafts.
  const cycleInProgress = isCycleInProgress(cycle);
  // The release this page is pinned to -- what "last bundled" is compared
  // against, so the line describes this release rather than the dataset's
  // history in general.
  const viewedRelease = cycle.dataset_release?.release_number ?? null;

  return (
    <div className="space-y-3">
      {!cycleActive && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {cycleInProgress && cycle.dataset_release
            ? `v${cycle.dataset_release.release_number} is ${cycle.dataset_release.release_status} — its contents are fixed. Start the next cycle to assemble new drafts.`
            : `No cycle is currently in progress${
                cycle.dataset_release
                  ? ` — last release was v${cycle.dataset_release.release_number} (${cycle.dataset_release.release_status})`
                  : ""
              }. Start one from the banner above before assembling drafts.`}
        </p>
      )}

      <ExpandableTable
        headers={["Recordset", "Draft", "Status", "Files", "Version", ""]}
        rows={cycle.recordsets}
        getRowKey={(r) => r.recordset_id}
        canExpand={(r) => r.open_draft?.recordset_draft_id != null}
        expandLabel="contents"
        expandedKey={expandedId}
        onExpandedKeyChange={(k) => setExpandedId(k as number | null)}
        renderExpanded={(r) =>
          r.open_draft ? (
            <DraftSummary draftId={r.open_draft.recordset_draft_id} />
          ) : null
        }
        renderCells={(r) => {
              const draft = r.open_draft;
              const draftId = draft?.recordset_draft_id ?? null;
              // Status and files describe the work, which outlives the open
              // draft: once published, open_draft is null but the draft row --
              // and its file list -- are still there. Actions stay keyed on
              // draftId, so a published draft displays without becoming
              // actionable.
              const shown = draft ?? r.published_draft;
              const status = shown?.draft_status ?? null;
              const fileCount = shown?.file_count ?? null;
              const frozen = r.latest_release ? `v${r.latest_release.release_number}` : null;
              const neverReleased = r.latest_release === null;
              const isReady = status === "ready";
              const hasFiles = (fileCount ?? 0) > 0;
              const member = r.release_in_cycle;
              const latestReleaseId = r.latest_release?.recordset_release_id ?? null;
              // A draft member has no release_number yet -- it is claimed at
              // publish, so an abandoned draft leaves no gap in the numbering.
              const memberIsDraft = member?.release_status === "draft";

              function openManage(tab: ManageTab) {
                if (draftId == null) return;
                setManage({ id: draftId, name: r.recordset_name, wpLinked: r.wp_linked, tab });
              }

              return (
                <>
                  <td className="px-2 py-1">
                      <RecordsetLink id={r.recordset_id} name={r.recordset_name} />
                    </td>
                    <td className="px-2 py-1">
                      {draft?.draft_name ? (
                        draft.draft_name
                      ) : r.published_draft ? (
                        <div>
                          <div>{r.published_draft.draft_name}</div>
                          <div className="text-xs" style={{ color: "var(--muted)" }}>
                            published this cycle
                          </div>
                        </div>
                      ) : r.worked_this_cycle ? (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          published this cycle
                        </span>
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
                    {/* The recordset's latest published version, plus a note
                        only when the release disagrees with it. What the
                        release carries is otherwise derivable -- a draft means
                        the next version, no draft means carrying this one
                        forward -- so stating it every row was restatement. The
                        two cases that are not derivable get a line. */}
                    <td className="px-2 py-1">
                      <div>{frozen ?? "—"}</div>
                      {/* Read against the release being viewed. The raw value
                          is the highest dataset release holding any published
                          version of this recordset, so on a pinned older
                          release it can name a *newer* one -- which reads as
                          history unless it says otherwise. */}
                      {r.last_bundled_dataset_release_number != null && (
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          {viewedRelease != null &&
                          r.last_bundled_dataset_release_number === viewedRelease
                            ? "in this release"
                            : viewedRelease != null &&
                                r.last_bundled_dataset_release_number > viewedRelease
                              ? `also in dataset v${r.last_bundled_dataset_release_number}`
                              : `last bundled: dataset v${r.last_bundled_dataset_release_number}`}
                        </div>
                      )}
                      {!member && (
                        <div className="text-xs text-amber-600 dark:text-amber-400">
                          not in this release
                        </div>
                      )}
                      {/* A draft member is the expected case -- it becomes the
                          next version. Only a *published* version that is not
                          the latest is worth calling out. */}
                      {member &&
                        !memberIsDraft &&
                        latestReleaseId !== null &&
                        member.recordset_release_id !== latestReleaseId && (
                          <div className="text-xs text-amber-600 dark:text-amber-400">
                            release carries v{member.release_number}
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
                              onClick={() => setDraftStatus(draftId, "open")}
                              loading={setStatus.isPending && setStatus.variables?.draftId === draftId}
                            >
                              Reopen
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => setDraftStatus(draftId, "ready")}
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
                        <div className="flex items-center justify-end gap-2">
                          {member ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Ship this release without this recordset"
                              onClick={() =>
                                excludeFromRelease(
                                  member.recordset_release_id,
                                  r.recordset_name,
                                )
                              }
                              loading={
                                exclude.isPending &&
                                exclude.variables === member.recordset_release_id
                              }
                            >
                              Remove
                            </Button>
                          ) : r.latest_release ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              title={`Carry v${r.latest_release.release_number} forward into this release`}
                              onClick={() =>
                                includeInRelease(
                                  r.latest_release!.recordset_release_id,
                                  r.recordset_name,
                                )
                              }
                              loading={
                                include.isPending &&
                                include.variables === r.latest_release.recordset_release_id
                              }
                            >
                              Add Back
                            </Button>
                          ) : null}
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
                </>
              );
            }}
      />

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
