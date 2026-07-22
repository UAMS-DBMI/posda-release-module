import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoadingState } from "@/components/ui/Spinner";
import { extractArray } from "@/lib/apiUtils";

export type Activity = {
  activity_id: number;
  brief_description: string;
  who_created: string;
  when_created: string;
};

export type Timepoint = {
  activity_timepoint_id: number;
  when_created: string;
  comment: string | null;
  creating_user: string | null;
  file_count: number;
};

/** What the caller cares about: which timepoint's files to use. Carries the
 *  activity name and file count so a confirm screen needs no second fetch. */
export type ActivitySource = {
  activityId: number;
  timepointId: number;
  activityName: string;
  fileCount: number;
};

const DISPLAY_CAP = 25;

// The activities endpoint returns every activity; filtering is client-side.
// Shared query key so several pickers on one page hit the network once.
// TECH_DEBT: server-side search is the real fix at scale.
export function useActivities() {
  return useQuery({
    queryKey: ["activities"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch("/papi/v1/activities/", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load activities.");
      return extractArray<Activity>(await res.json(), ["data"]);
    },
  });
}

function useTimepoints(activityId: number | null) {
  return useQuery({
    queryKey: ["activity-timepoints", activityId ?? 0],
    enabled: activityId != null,
    queryFn: async () => {
      const res = await fetch(`/papi/v1/activities/${activityId}/timepoints`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Could not load timepoints.");
      return extractArray<Timepoint>(await res.json(), ["data"]);
    },
  });
}

type ActivitySourcePickerProps = {
  value: ActivitySource | null;
  onChange: (next: ActivitySource | null) => void;
  /** Caps the activity result list height; wizard rows want it short. */
  maxListRows?: number;
};

/** Pick an activity, then one of its timepoints. Used both by the draft Files
 *  page and by the Start Cycle wizard, which needs one per recordset. */
export default function ActivitySourcePicker({
  value,
  onChange,
  maxListRows = 8,
}: ActivitySourcePickerProps) {
  const [idSearch, setIdSearch] = useState("");
  const [textSearch, setTextSearch] = useState("");
  const [activityId, setActivityId] = useState<number | null>(
    value?.activityId ?? null,
  );

  const activities = useActivities();
  const timepoints = useTimepoints(activityId);

  const trimmedText = textSearch.trim();
  const trimmedId = idSearch.trim();
  const textActive = trimmedText.length >= 2;
  const idActive = /^\d+$/.test(trimmedId);
  const searchActive = textActive || idActive;
  const searchedId = idActive ? Number(trimmedId) : null;

  const matched = searchActive
    ? (activities.data ?? []).filter(
        (a) =>
          (idActive && a.activity_id === searchedId) ||
          (textActive &&
            ((a.brief_description ?? "").toLowerCase().includes(trimmedText.toLowerCase()) ||
              (a.who_created ?? "").toLowerCase().includes(trimmedText.toLowerCase()))),
      )
    : [];
  const hasMore = matched.length > DISPLAY_CAP;
  const displayed = hasMore ? matched.slice(0, DISPLAY_CAP) : matched;

  const selectedActivity =
    (activities.data ?? []).find((a) => a.activity_id === activityId) ?? null;

  // Timepoints come back newest-first, so default to the latest.
  useEffect(() => {
    if (activityId == null) return;
    const list = timepoints.data;
    if (!list || list.length === 0) return;
    if (value?.activityId === activityId) return;
    onChange({
      activityId,
      timepointId: list[0].activity_timepoint_id,
      activityName:
        (activities.data ?? []).find((a) => a.activity_id === activityId)
          ?.brief_description ?? `Activity ${activityId}`,
      fileCount: list[0].file_count,
    });
    // onChange/value are caller-owned; re-running on them would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, timepoints.data]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="ID"
          value={idSearch}
          onChange={(e) => setIdSearch(e.target.value)}
          className="input w-24"
        />
        <input
          type="text"
          placeholder="Search by description or creator..."
          value={textSearch}
          onChange={(e) => setTextSearch(e.target.value)}
          className="input flex-1"
        />
      </div>

      {activities.isLoading && <LoadingState label="Loading activities..." />}

      {activities.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Could not load activities.
        </p>
      )}

      {!activities.isLoading && !activities.isError && (
        <div
          className="rounded-md"
          style={{ border: "1px solid var(--border-strong)" }}
        >
          {!searchActive ? (
            <p className="p-3 text-sm" style={{ color: "var(--muted)" }}>
              Enter an activity ID or type 2+ characters to search.
            </p>
          ) : displayed.length === 0 ? (
            <p className="p-3 text-sm" style={{ color: "var(--muted)" }}>
              No activities found.
            </p>
          ) : (
            <>
              <ul
                className="divide-y overflow-y-auto"
                style={{
                  borderColor: "var(--border)",
                  maxHeight: `${maxListRows * 2.75}rem`,
                }}
              >
                {displayed.map((a) => (
                  <li key={a.activity_id}>
                    <button
                      type="button"
                      onClick={() => setActivityId(a.activity_id)}
                      className="w-full px-3 py-2 text-left text-sm transition-colors"
                      style={
                        activityId === a.activity_id
                          ? { background: "var(--surface-alt)" }
                          : undefined
                      }
                    >
                      <span className="font-medium">{a.brief_description}</span>
                      <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                        #{a.activity_id} &middot; {a.who_created} &middot;{" "}
                        {new Date(a.when_created).toLocaleDateString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {hasMore && (
                <p
                  className="border-t px-3 py-2 text-xs"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                >
                  Showing {DISPLAY_CAP} of {matched.length} — refine your search
                  to narrow results.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {selectedActivity && (
        <div>
          {timepoints.isLoading && <LoadingState label="Loading timepoints..." />}
          {timepoints.isError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Could not load timepoints.
            </p>
          )}
          {timepoints.data && timepoints.data.length === 0 && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No timepoints found for this activity.
            </p>
          )}
          {timepoints.data && timepoints.data.length > 0 && (
            <label className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Timepoint</span>
              <select
                value={value?.timepointId ?? ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  const tp = timepoints.data?.find(
                    (t) => t.activity_timepoint_id === id,
                  );
                  onChange({
                    activityId: selectedActivity.activity_id,
                    timepointId: id,
                    activityName: selectedActivity.brief_description,
                    fileCount: tp?.file_count ?? 0,
                  });
                }}
                className="select"
              >
                {timepoints.data.map((tp, idx) => (
                  <option key={tp.activity_timepoint_id} value={tp.activity_timepoint_id}>
                    {new Date(tp.when_created).toLocaleString()}
                    {idx === 0 ? " (latest)" : ""}
                    {tp.comment ? ` — ${tp.comment}` : ""}
                    {` · ${tp.file_count.toLocaleString()} files`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
