import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { extractApiError } from "@/lib/apiUtils";

/**
 * Hooks for linking a Posda object (dataset/recordset) to a WordPress object
 * (`wp_object_map`) — shared by `recordsets/Detail.tsx`, `datasets/Detail.tsx`,
 * and the cycle Setup stage via `WpLinkModal`.
 */

export type WpMap = {
  map_id: number;
  posda_object_type: string;
  posda_object_id: number;
  wp_object_type: string;
  wp_object_id: number;
  wp_edit_url: string | null;
  wp_view_url: string | null;
  parent_wp_object_id: number | null;
  when_synced: string | null;
};

export type WpSearchResult = {
  id: number;
  title: string;
  type: string;
  status: string;
  view_url: string;
  edit_url: string;
};

export function wpMapQueryKey(posdaObjectType: string, posdaObjectId: number | undefined) {
  return ["wp-map", posdaObjectType, posdaObjectId ?? ""];
}

/** Keyed by the Posda object, not the WP object -- a relink changes which WP
 *  post this points at without changing the key, so callers that mutate the
 *  mapping must invalidate this alongside wpMapQueryKey. */
export function wpObjectQueryKey(posdaObjectType: string, posdaObjectId: number | undefined) {
  return ["wp-object", posdaObjectType, posdaObjectId ?? ""];
}

export type WpObjectTypeOption = {
  value: string;
  label: string;
  searchEndpoint: string;
};

/** A dataset's `dataset_type` (Collection | Analysis Result) is exactly its
 *  WordPress object type -- derive it instead of leaving the choice to a
 *  dropdown that can default to the wrong one. */
export function wpTypeOptionForDataset(datasetTypeName: string): WpObjectTypeOption {
  return datasetTypeName === "Analysis Result"
    ? { value: "analysis_result", label: "Analysis Result", searchEndpoint: "manager/analysis-results" }
    : { value: "collection", label: "Collection", searchEndpoint: "manager/collections" };
}

/** No mapping yet is a normal state (404), not an error. */
export function useWpMap(
  posdaObjectType: string,
  posdaObjectId: number | undefined,
) {
  return useQuery({
    queryKey: wpMapQueryKey(posdaObjectType, posdaObjectId),
    enabled: Boolean(posdaObjectId),
    queryFn: async () => {
      const res = await fetch(
        `/papi/v1/manager/posda/${posdaObjectType}/${posdaObjectId}/wp-map`,
        { cache: "no-store" },
      );
      if (res.status === 404) return null;
      const json = (await res.json()) as unknown;
      if (!res.ok) {
        throw new Error(extractApiError(json, "Could not load WordPress link."));
      }
      return (json as { data: WpMap }).data;
    },
  });
}

/** Bare-array manager.py list routes, e.g. `manager/downloads?search=...`. */
export async function searchWpObjects(searchEndpoint: string, query: string) {
  return apiFetch<WpSearchResult[]>(
    `/papi/v1/${searchEndpoint}?search=${encodeURIComponent(query)}`,
  );
}

/** Bare-object manager.py by-id routes, e.g. `manager/downloads/{id}` --
 *  fetches by the raw WP post ID directly, with no Posda-side mapping
 *  required (unlike useWpObject). Includes trashed posts, same as a direct
 *  by-id GET always does regardless of status. */
export async function fetchWpObjectByEndpoint(searchEndpoint: string, id: number) {
  return apiFetch<WpSearchResult>(`/papi/v1/${searchEndpoint}/${id}`);
}

export type SaveWpLinkInput = {
  existingMapId?: number;
  wp_object_type: string;
  wp_object_id: number;
  wp_edit_url: string;
  wp_view_url: string;
};

/** Links (or re-links) a Posda object to an existing WP post. */
export function useSaveWpLink(
  posdaObjectType: string,
  posdaObjectId: number | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveWpLinkInput) => {
      const body = {
        wp_object_type: input.wp_object_type,
        wp_object_id: input.wp_object_id,
        wp_edit_url: input.wp_edit_url,
        wp_view_url: input.wp_view_url,
      };
      const json = input.existingMapId
        ? await apiFetch<{ data: WpMap; warning?: string }>(
            `/papi/v1/manager/wp-object-map/${input.existingMapId}`,
            { method: "PUT", body: JSON.stringify(body) },
          )
        : await apiFetch<{ data: WpMap; warning?: string }>("/papi/v1/manager/wp-object-map", {
            method: "POST",
            body: JSON.stringify({
              posda_object_type: posdaObjectType,
              posda_object_id: posdaObjectId,
              ...body,
            }),
          });
      return { map: json.data, warning: json.warning };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: wpMapQueryKey(posdaObjectType, posdaObjectId),
      });
      void queryClient.invalidateQueries({
        queryKey: wpObjectQueryKey(posdaObjectType, posdaObjectId),
      });
      // The cycle rollup (SetupStage's WordPress status) embeds a snapshot per
      // recordset, so it goes stale too. See recordsetDestinations.ts for the
      // same reasoning.
      void queryClient.invalidateQueries({ queryKey: ["dataset-cycle"] });
    },
  });
}

/** Removes the mapping between a Posda object and its WP post -- the WP
 *  post itself is left alone, only the link is dropped. */
export function useDeleteWpLink(
  posdaObjectType: string,
  posdaObjectId: number | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mapId: number) => {
      await apiFetch(`/papi/v1/manager/wp-object-map/${mapId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: wpMapQueryKey(posdaObjectType, posdaObjectId),
      });
      void queryClient.invalidateQueries({
        queryKey: wpObjectQueryKey(posdaObjectType, posdaObjectId),
      });
      void queryClient.invalidateQueries({ queryKey: ["dataset-cycle"] });
    },
  });
}

export type WpObjectLive = {
  id: number;
  slug: string;
  title: string;
  status: string;
  view_url: string;
  edit_url: string;
  /** Present on Collections -- Download post IDs listed on the page. */
  collection_downloads?: number[] | null;
  /** Present on Analysis Results -- Download post IDs listed on the page. */
  result_downloads?: number[] | null;
};

/** Live lookup by the immutable wp_object_id -- always current (e.g. the
 *  slug), unlike anything we'd cache in wp_object_map. Only meaningful once
 *  a mapping exists, so callers gate `enabled` on that. */
export function useWpObject(
  posdaObjectType: string,
  posdaObjectId: number | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: wpObjectQueryKey(posdaObjectType, posdaObjectId),
    enabled: Boolean(posdaObjectId) && enabled,
    queryFn: async () => {
      const json = await apiFetch<{ data: WpObjectLive }>(
        `/papi/v1/manager/posda/${posdaObjectType}/${posdaObjectId}/wp-object`,
      );
      return json.data;
    },
  });
}

export type CreateWpObjectInput = {
  wp_object_type: string;
  title: string;
  slug?: string;
};

/** Creates a new WP post as a draft and links it in one step. */
export function useCreateWpObject(
  posdaObjectType: string,
  posdaObjectId: number | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateWpObjectInput) => {
      const json = await apiFetch<{
        data: { map: WpMap; object: WpSearchResult };
        warning?: string;
      }>("/papi/v1/manager/wp-objects", {
        method: "POST",
        body: JSON.stringify({
          posda_object_type: posdaObjectType,
          posda_object_id: posdaObjectId,
          wp_object_type: input.wp_object_type,
          title: input.title,
          slug: input.slug,
        }),
      });
      return { map: json.data.map, warning: json.warning };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: wpMapQueryKey(posdaObjectType, posdaObjectId),
      });
      void queryClient.invalidateQueries({
        queryKey: wpObjectQueryKey(posdaObjectType, posdaObjectId),
      });
      void queryClient.invalidateQueries({ queryKey: ["dataset-cycle"] });
    },
  });
}
