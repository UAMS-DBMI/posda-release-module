import { useQuery } from "@tanstack/react-query";
import { extractArray } from "@/lib/apiUtils";

export type RecordsetRelease = {
  recordset_release_id: number;
  release_number: number | string;
  release_date: string | null;
  file_count: number;
  /** Also returned by the endpoint; used by Bundle's version picker to tell
   *  otherwise-similar versions apart. */
  release_notes: string | null;
  release_doi: string | null;
  when_created: string | null;
  who_created: number | null;
};

/** A recordset's releases, **oldest-first** (the endpoint orders by
 *  `release_number` ascending). Callers that want newest-first sort locally.
 *  Shared by the draft create/edit flows that clone or add from a previous
 *  release, and by Bundle's version picker. */
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
