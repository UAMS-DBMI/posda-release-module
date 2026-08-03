import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DraftAddFiles from "@/components/DraftAddFiles";
import DraftFileList from "@/components/DraftFileList";
import DraftSummary, { useDraftSummary } from "@/components/DraftSummary";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { extractApiError } from "@/lib/apiUtils";

type Tab = "contents" | "details";

type Draft = {
  recordset_draft_id: number;
  recordset_id: number;
  cloned_from_release_id: number | null;
  draft_name: string;
  draft_status: string;
  draft_notes: string | null;
};

function useDraft(draftId: number | null, open: boolean) {
  return useQuery({
    queryKey: ["draft", draftId],
    enabled: open && draftId != null,
    queryFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Could not load draft.");
      const json = (await res.json()) as { data?: Draft; draft?: Draft };
      const draft = json.data ?? json.draft;
      if (!draft) throw new Error("Draft payload missing from response.");
      return draft;
    },
  });
}

type EditDraftModalProps = {
  open: boolean;
  onClose: () => void;
  datasetId: string | undefined;
  draftId: number | null;
  recordsetName: string;
  wpLinked: boolean;
};

/** Manage one recordset draft from inside the cycle -- contents (summary; the
 *  add-files browser lands in 2b-2) and editable name/notes. QC and Publish
 *  deliberately live in the Verify/Bundle stages, not here. */
export default function EditDraftModal({
  open,
  onClose,
  datasetId,
  draftId,
  recordsetName,
  wpLinked,
}: EditDraftModalProps) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("contents");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const draft = useDraft(draftId, open);

  // A primed discard reverts on its own so a stray first click can't linger.
  useEffect(() => {
    if (!confirmDiscard) return;
    const t = setTimeout(() => setConfirmDiscard(false), 4000);
    return () => clearTimeout(t);
  }, [confirmDiscard]);

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (draft.data) {
      setName(draft.data.draft_name ?? "");
      setNotes(draft.data.draft_notes ?? "");
    }
  }, [draft.data]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ draft_name: name, draft_notes: notes }),
        },
      );
      if (!res.ok) {
        throw new Error(
          extractApiError(await res.json(), "Could not save the draft."),
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["draft", draftId] });
      void queryClient.invalidateQueries({
        queryKey: ["dataset-cycle", datasetId ?? ""],
      });
      toastSuccess(addToast, "Draft saved.");
    },
    onError: (e) =>
      toastError(
        addToast,
        e instanceof Error ? e.message : "Could not save the draft.",
      ),
  });

  const discard = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error(
          extractApiError(await res.json(), "Could not discard the draft."),
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["dataset-cycle", datasetId ?? ""],
      });
      toastSuccess(addToast, "Draft discarded.");
      handleClose();
    },
    onError: (e) =>
      toastError(
        addToast,
        e instanceof Error ? e.message : "Could not discard the draft.",
      ),
  });

  const setStatus = useMutation({
    mutationFn: async (status: "ready" | "open") => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ draft_status: status }),
        },
      );
      if (!res.ok) {
        throw new Error(
          extractApiError(await res.json(), "Could not update the draft status."),
        );
      }
    },
    onSuccess: (_data, status) => {
      void queryClient.invalidateQueries({ queryKey: ["draft", draftId] });
      void queryClient.invalidateQueries({
        queryKey: ["dataset-cycle", datasetId ?? ""],
      });
      toastSuccess(
        addToast,
        status === "ready" ? "Draft marked ready." : "Draft reopened.",
      );
    },
    onError: (e) =>
      toastError(
        addToast,
        e instanceof Error ? e.message : "Could not update the draft status.",
      ),
  });

  function handleClose() {
    setTab("contents");
    setConfirmDiscard(false);
    onClose();
  }

  const isReady = draft.data?.draft_status === "ready";
  const summary = useDraftSummary(draftId ?? 0, open && draftId != null);
  const hasFiles = (summary.data?.total_files ?? 0) > 0;

  const dirty = draft.data
    ? name !== (draft.data.draft_name ?? "") ||
      notes !== (draft.data.draft_notes ?? "")
    : false;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="xl"
      title={`Edit Draft — ${recordsetName}`}
      footer={
        <>
          {draft.data &&
            (isReady ? (
              <Button
                variant="ghost"
                onClick={() => setStatus.mutate("open")}
                loading={setStatus.isPending}
              >
                Reopen Draft
              </Button>
            ) : (
              <Button
                onClick={() => setStatus.mutate("ready")}
                loading={setStatus.isPending}
                disabled={!hasFiles}
                title={hasFiles ? undefined : "Add files before marking ready"}
              >
                Mark Ready
              </Button>
            ))}
          <Button variant="ghost" onClick={handleClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="mt-3 flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {(["contents", "details"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={
              tab === t
                ? { color: "var(--accent)", borderBottom: "2px solid var(--accent)" }
                : { color: "var(--muted)" }
            }
          >
            {t === "contents" ? "Contents" : "Details"}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "contents" && draftId != null && (
          <div className="space-y-4">
            <DraftSummary draftId={draftId} />
            <DraftFileList draftId={draftId} />
            {draft.data && (
              <DraftAddFiles
                draftId={draftId}
                recordsetId={draft.data.recordset_id}
                datasetId={datasetId}
                wpLinked={wpLinked}
              />
            )}
          </div>
        )}

        {tab === "details" && (
          <>
            {draft.isLoading && <LoadingState />}
            {draft.isError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Could not load draft.
              </p>
            )}
            {draft.data && (
              <div className="space-y-3">
                <label className="block">
                  <span className="text-sm font-medium">Draft Name</span>
                  <input
                    className="mt-1 input w-full"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Notes</span>
                  <textarea
                    className="mt-1 textarea w-full"
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Status: {draft.data.draft_status}
                  {draft.data.cloned_from_release_id
                    ? ` · baseline: release #${draft.data.cloned_from_release_id}`
                    : ""}
                </p>
                <div className="flex items-center justify-between pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 dark:text-red-400"
                    onClick={() =>
                      confirmDiscard ? discard.mutate() : setConfirmDiscard(true)
                    }
                    loading={discard.isPending}
                  >
                    {confirmDiscard ? "Confirm discard?" : "Discard Draft"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => save.mutate()}
                    disabled={!dirty || !name.trim()}
                    loading={save.isPending}
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
