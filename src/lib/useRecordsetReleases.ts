import { useQuery } from "@tanstack/react-query";
import { extractArray } from "@/lib/apiUtils";

export type RecordsetRelease = {
  recordset_release_id: number;
  release_number: number | string;
  release_date: string | null;
  file_count: number;
};

/** A recordset's releases, newest-first from the API. Shared by the draft
 *  create/edit flows that clone or add from a previous release. */
export function useRecordsetReleases(recordsetId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["recordset-releases", recordsetId],
    enabled,
    queryFn: async () => {
      const res = await fetch(
        `/papi/v1/distribution/recordsets/${recordsetId}/releases`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Could not load releases.");
      return extractArray<RecordsetRelease>(await res.json(), ["data"]);
    },
  });
}
