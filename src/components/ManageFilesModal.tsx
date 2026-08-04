import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DraftAddFiles from "@/components/DraftAddFiles";
import DraftFileList from "@/components/DraftFileList";
import DraftSeriesRemove from "@/components/DraftSeriesRemove";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { extractApiError } from "@/lib/apiUtils";

export type ManageTab = "add" | "remove" | "details";

const TABS: { key: ManageTab; label: string }[] = [
  { key: "add", label: "Add" },
  { key: "remove", label: "Remove" },
  { key: "details", label: "Details" },
];

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

type ManageFilesModalProps = {
  open: boolean;
  onClose: () => void;
  datasetId: string | undefined;
  draftId: number | null;
  recordsetName: string;
  wpLinked: boolean;
  initialTab: ManageTab;
};

/** Edit one recordset draft's files (Add / Remove) and metadata (Details). The
 *  draft summary and lifecycle (Mark Ready / Discard) live on the Assemble row,
 *  so this modal stays focused on one concern per tab. */
export default function ManageFilesModal({
  open,
  onClose,
  datasetId,
  draftId,
  recordsetName,
  wpLinked,
  initialTab,
}: ManageFilesModalProps) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ManageTab>(initialTab);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const draft = useDraft(draftId, open);

  // Open on whichever tab the launcher chose.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

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
        throw new Error(extractApiError(await res.json(), "Could not save the draft."));
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
      toastError(addToast, e instanceof Error ? e.message : "Could not save the draft."),
  });

  const discard = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/drafts/${draftId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error(extractApiError(await res.json(), "Could not discard the draft."));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["dataset-cycle", datasetId ?? ""],
      });
      toastSuccess(addToast, "Draft discarded.");
      setConfirmDiscard(false);
      onClose();
    },
    onError: (e) => {
      setConfirmDiscard(false);
      toastError(addToast, e instanceof Error ? e.message : "Could not discard the draft.");
    },
  });

  const dirty = draft.data
    ? name !== (draft.data.draft_name ?? "") || notes !== (draft.data.draft_notes ?? "")
    : false;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={`Manage Files — ${recordsetName}`}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="mt-3 flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={
              tab === t.key
                ? { color: "var(--accent)", borderBottom: "2px solid var(--accent)" }
                : { color: "var(--muted)" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "add" && draftId != null && draft.data && (
          <DraftAddFiles
            draftId={draftId}
            recordsetId={draft.data.recordset_id}
            datasetId={datasetId}
            wpLinked={wpLinked}
          />
        )}

        {tab === "remove" && draftId != null && (
          <div className="space-y-4">
            <DraftFileList draftId={draftId} datasetId={datasetId} />
            <DraftSeriesRemove draftId={draftId} datasetId={datasetId} />
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
