import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type ItemEnvelope, type ListEnvelope } from "@/lib/apiFetch";
import { transferRecordsetsKey } from "@/lib/transferForm";
import { wpObjectQueryKey } from "@/lib/wpObjectMap";

/**
 * Mutations for the Disseminate stage: publishing a release's WordPress pages,
 * and putting each recordset's retriever manifest on its download page.
 *
 * Reads come from hooks that already exist — the cycle payload carries the
 * pages and their `wp_map_id`, `useWpObject` carries live post status, and
 * `useTransferRecordsets` carries `download_file_id`. Only the writes
 * are new. Toasts stay at the call site, as with the other hooks here.
 */

const BASE = "/papi/v1/distribution";

export type PublishedPage = {
  map_id: number;
  wp_object_type: string;
  wp_object_id: number;
  /** Dataset or recordset name — what the page is *for*, not its WP title. */
  label: string;
};

export type PublishFailure = PublishedPage & { error: string };

export type PublishReleaseResult = {
  dataset_release_id: number;
  release_number: number;
  /** `live` only when every page published; otherwise unchanged at `released`. */
  release_status: string;
  published: PublishedPage[];
  failed: PublishFailure[];
};

/**
 * Go live: publishes the dataset's collection page and every member recordset's
 * download page, then marks the release `live`.
 *
 * The server refuses unless the release is `released` with all transfers
 * delivered and every member linked — so a rejection here is a 409/422 with a
 * specific reason, not a generic failure. The button is gated on the same
 * conditions, so those are a backstop rather than the normal path.
 *
 * Resolves even when some pages failed: `failed` being non-empty is a partial
 * result the caller must report, not an exception. Only a clean sweep sets
 * `live`, so a partial run leaves the stage showing work still to do.
 */
export function usePublishRelease(
  datasetId: string | undefined,
  releaseId: number | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const json = await apiFetch<ItemEnvelope<PublishReleaseResult>>(
        `${BASE}/datasets/releases/${releaseId}/publish`,
        { method: "POST" },
      );
      return json.data;
    },
    onSuccess: () => {
      // release_status changed, so the whole rollup is stale.
      void queryClient.invalidateQueries({
        queryKey: ["dataset-cycle", datasetId ?? ""],
      });
      // Every badge on the stage reads live WP status through its own
      // `["wp-object", type, id]` query, and a publish moves all of them at
      // once — so drop the lot by prefix rather than naming each page.
      void queryClient.invalidateQueries({ queryKey: ["wp-object"] });
    },
  });
}

export type ManifestTarget = {
  transferId: number;
  recordsetReleaseId: number;
};

export type GenerateManifestResult = {
  file_id: number;
  downloadable_file_id: number;
  security_hash: string;
  series_count: number;
  destination_abbr: string;
  /** `tcia` for NBIA, `csv` for the general format. */
  manifest_format: string;
};

/**
 * Builds (or rebuilds) one recordset release's manifest, in whatever format the
 * transfer's destination expects.
 *
 * Takes its target per call rather than per hook so one instance can serve a
 * table of many recordsets — the same reason `useDeleteRecordsetDestination`
 * does. 422s for a WordPress transfer, which has no manifest.
 */
export function useGenerateRetrieverManifest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ transferId, recordsetReleaseId }: ManifestTarget) => {
      const json = await apiFetch<ItemEnvelope<GenerateManifestResult>>(
        `${BASE}/transfers/${transferId}/recordsets/${recordsetReleaseId}/manifest/generate`,
        { method: "POST" },
      );
      return json.data;
    },
    onSuccess: (_result, { transferId }) => {
      // download_file_id lives on the transfer's recordset list,
      // which is what the stage reads to decide Generate vs Attach.
      void queryClient.invalidateQueries({
        queryKey: transferRecordsetsKey(transferId),
      });
      // A regenerated manifest isn't on the page yet.
      void queryClient.invalidateQueries({ queryKey: ["wp-pages"] });
    },
  });
}

export type AttachManifestResult = {
  recordset_id: number;
  recordset_name: string;
  file_id: number;
  wp_media_id: number;
  download_post_id: number;
  /** False when those exact bytes were already in the media library. */
  uploaded: boolean;
  /** False when the page already pointed at that attachment. */
  attached: boolean;
};

/**
 * Puts a generated manifest on the recordset's WordPress download page,
 * uploading it to the media library first if it isn't there already.
 *
 * `uploaded: false, attached: false` is a **success** — the identical manifest
 * was already up and already linked, which is the normal outcome for a release
 * whose series list didn't change. Callers should say so rather than reporting
 * nothing happened.
 */
export function useAttachRetrieverManifest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ transferId, recordsetReleaseId }: ManifestTarget) => {
      const json = await apiFetch<ItemEnvelope<AttachManifestResult>>(
        `${BASE}/transfers/${transferId}/recordsets/${recordsetReleaseId}/manifest/attach`,
        { method: "POST" },
      );
      return json.data;
    },
    onSuccess: (result) => {
      // The download page's `download_file` changed, so anything showing that
      // post's live state is stale.
      void queryClient.invalidateQueries({
        queryKey: wpObjectQueryKey("recordset", result.recordset_id),
      });
      void queryClient.invalidateQueries({ queryKey: ["wp-pages"] });
    },
  });
}

/** Whether a recordset's WordPress download page points at the file its
 *  default destination puts there: a data file the WordPress transfer staged,
 *  or a retriever manifest. Transfers only upload; pointing the page is
 *  Disseminate's job, so the public site changes there. */
export type WpPageState = {
  transfer_id: number;
  recordset_release_id: number;
  recordset_id: number;
  recordset_name: string;
  destination_abbr: string;
  /** The data file's name on a WordPress row; null for a manifest. */
  file_name: string | null;
  /** Null until the file is uploaded -- so also for a regenerated manifest. */
  staged_media_id: number | null;
  current_media_id: number | null;
  page_current: boolean;
};

export function wpPagesKey(releaseId: number | undefined) {
  return ["wp-pages", releaseId ?? null] as const;
}

/** Read live from WordPress, one read per page. */
export function useWpPageStates(releaseId: number | undefined) {
  return useQuery({
    queryKey: wpPagesKey(releaseId),
    enabled: releaseId != null,
    queryFn: () =>
      apiFetch<ListEnvelope<WpPageState>>(
        `${BASE}/datasets/releases/${releaseId}/wp/pages`,
      ),
    select: (env) => env.data,
  });
}

export type UpdateWpPageResult = {
  recordset_id: number;
  recordset_name: string;
  wp_media_id: number;
  download_post_id: number;
  /** False when the page already pointed at that file. */
  attached: boolean;
};

/** Point one recordset's WordPress download page at its staged file -- the
 *  public change. Target per call, like the manifest hooks. */
export function useUpdateWpPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ transferId, recordsetReleaseId }: ManifestTarget) => {
      const json = await apiFetch<ItemEnvelope<UpdateWpPageResult>>(
        `${BASE}/transfers/${transferId}/recordsets/${recordsetReleaseId}/wp/update-page`,
        { method: "POST" },
      );
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["wp-pages"] });
      void queryClient.invalidateQueries({ queryKey: ["wp-object"] });
    },
  });
}
