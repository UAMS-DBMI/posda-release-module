import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type ItemEnvelope } from "@/lib/apiFetch";

const BASE = "/papi/v1/distribution";

/** Publishing freezes a draft into an immutable recordset release. The version
 *  number and date are assigned by the server (next unused number for the
 *  recordset, now()), so the curator only supplies notes. */
export type PublishFormValues = {
  release_notes: string;
};

export const emptyPublishForm: PublishFormValues = { release_notes: "" };

export type PublishPayload = {
  release_notes?: string;
};

export function publishPayload(values: PublishFormValues): PublishPayload {
  const notes = values.release_notes.trim();
  return notes ? { release_notes: notes } : {};
}

export type PublishedRelease = {
  recordset_release_id: number;
  recordset_id: number;
};

/** Freeze a draft into a release. Deliberately does **not** navigate: the draft
 *  detail page goes to the new release's recordset, while the Bundle stage
 *  stays put -- so the destination is the caller's decision. */
export function usePublishDraft(
  draftId: number | undefined,
  datasetId?: string | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: PublishFormValues) => {
      const json = await apiFetch<ItemEnvelope<PublishedRelease>>(
        `${BASE}/recordsets/drafts/${draftId}/publish`,
        { method: "POST", body: JSON.stringify(publishPayload(values)) },
      );
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["draft", draftId] });
      void queryClient.invalidateQueries({ queryKey: ["draft-summary", draftId] });
      void queryClient.invalidateQueries({ queryKey: ["qc-reviews"] });
      void queryClient.invalidateQueries({
        queryKey: ["dataset-cycle", datasetId ?? ""],
      });
      // Publishing now finalizes a release the dataset release already carries,
      // flipping it from draft to released. That endpoint is filtered to
      // released members, so its result changes here even though membership
      // does not -- and the finalize modal reads it. Prefix-invalidated: the
      // release can be carried by more than one dataset release.
      void queryClient.invalidateQueries({
        queryKey: ["dataset-release-recordsets"],
      });
    },
  });
}
