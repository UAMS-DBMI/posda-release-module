import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type ItemEnvelope } from "@/lib/apiFetch";
import { extractArray } from "@/lib/apiUtils";

/**
 * Hooks for a recordset's configured destinations (`recordset_destination`) —
 * the read + upsert used by `recordsets/Detail.tsx` and
 * `RecordsetDestinationModal`, so both stay backed by the same cache entry.
 */

export type RecordsetDestination = {
  destination_id: number;
  destination_name: string;
  destination_abbr: string;
  default_display: boolean;
};

export function useRecordsetDestinations(recordsetId: string | number | undefined) {
  return useQuery({
    queryKey: ["recordset-destinations", recordsetId ?? ""],
    enabled: Boolean(recordsetId),
    queryFn: async () =>
      extractArray<RecordsetDestination>(
        await apiFetch(
          `/papi/v1/distribution/recordsets/${recordsetId}/destinations`,
        ),
        ["destinations", "data", "items", "results"],
      ),
  });
}

export type SaveRecordsetDestinationInput = {
  destination_id: number;
  default_display: boolean;
};

/** Upserts one destination via the existing `PUT .../destinations/{id}`. */
export function useSaveRecordsetDestination(recordsetId: string | number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveRecordsetDestinationInput) => {
      const json = await apiFetch<ItemEnvelope<RecordsetDestination>>(
        `/papi/v1/distribution/recordsets/${recordsetId}/destinations/${input.destination_id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            default_display: input.default_display,
          }),
        },
      );
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["recordset-destinations", recordsetId ?? ""],
      });
      // The cycle rollup (SetupStage's destination pills) embeds a snapshot of
      // each recordset's destinations, so it goes stale too. Invalidate every
      // dataset-cycle query rather than threading datasetId through here.
      void queryClient.invalidateQueries({ queryKey: ["dataset-cycle"] });
      // A release's destinations are aggregated from its recordsets' config,
      // and transfer drift detection joins recordset_destination to work out
      // what a transfer *should* carry -- so both go stale the moment this
      // changes. Without these, the Transfer stage keeps showing pre-edit
      // destinations and drift warnings until the page is reloaded.
      void queryClient.invalidateQueries({ queryKey: ["release-destinations"] });
      void queryClient.invalidateQueries({ queryKey: ["release-transfers"] });
    },
  });
}

/** Removes one destination via `DELETE .../destinations/{id}`. Takes
 *  `recordsetId` per call (not per hook) so one instance can serve a table of
 *  many recordsets, e.g. SetupStage's destination pills. */
export function useDeleteRecordsetDestination() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      recordsetId,
      destinationId,
    }: {
      recordsetId: string | number;
      destinationId: number;
    }) => {
      await apiFetch(
        `/papi/v1/distribution/recordsets/${recordsetId}/destinations/${destinationId}`,
        { method: "DELETE" },
      );
      return { recordsetId };
    },
    onSuccess: ({ recordsetId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["recordset-destinations", recordsetId],
      });
      void queryClient.invalidateQueries({ queryKey: ["dataset-cycle"] });
      // A release's destinations are aggregated from its recordsets' config,
      // and transfer drift detection joins recordset_destination to work out
      // what a transfer *should* carry -- so both go stale the moment this
      // changes. Without these, the Transfer stage keeps showing pre-edit
      // destinations and drift warnings until the page is reloaded.
      void queryClient.invalidateQueries({ queryKey: ["release-destinations"] });
      void queryClient.invalidateQueries({ queryKey: ["release-transfers"] });
    },
  });
}
