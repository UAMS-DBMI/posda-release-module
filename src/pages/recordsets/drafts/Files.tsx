import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { papiUrl } from "@/lib/papi";

type Draft = {
  recordset_draft_id: number;
  draft_name: string;
  draft_status: string;
  recordset_id: number;
};

type Activity = {
  activity_id: number;
  brief_description: string;
  who_created: string;
  when_created: string;
};

type Timepoint = {
  activity_timepoint_id: number;
  when_created: string;
  comment: string | null;
  creating_user: string | null;
  file_count: number;
};

type Release = {
  recordset_release_id: number;
  release_number: string;
  release_date: string;
  release_notes: string | null;
  file_count: number;
};

type DiffResult = {
  draft_id: number;
  compare_type: string;
  compare_id: number;
  compare_timepoint_id: number | null;
  added_file_ids: number[];
  removed_file_ids: number[];
  added_count: number;
  removed_count: number;
  unchanged_count: number;
};

type FileTypeSummary = {
  file_type: string;
  file_count: number;
  total_size_bytes: number;
};

type ModalitySummary = {
  modality: string;
  series_count: number;
  file_count: number;
};

type DraftSummary = {
  draft_id: number;
  total_files: number;
  total_size_bytes: number;
  by_file_type: FileTypeSummary[];
  dicom: {
    patient_count: number;
    study_count: number;
    series_count: number;
    by_modality: ModalitySummary[];
  };
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function RecordsetDraftFiles() {
  const { addToast } = useToast();
  const { draft_id: draftId } = useParams<{ draft_id: string }>();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [browserTab, setBrowserTab] = useState<"activity" | "release" | "files">("activity");

  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityIdSearch, setActivityIdSearch] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [timepoints, setTimepoints] = useState<Timepoint[]>([]);
  const [selectedTimepointId, setSelectedTimepointId] = useState<number | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffRefreshKey, setDiffRefreshKey] = useState(0);

  const [releases, setReleases] = useState<Release[]>([]);
  const [releaseSearch, setReleaseSearch] = useState("");
  const [releaseIdSearch, setReleaseIdSearch] = useState("");
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [releaseDiff, setReleaseDiff] = useState<DiffResult | null>(null);
  const [releaseDiffRefreshKey, setReleaseDiffRefreshKey] = useState(0);

  const [draftSummary, setDraftSummary] = useState<DraftSummary | null>(null);
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);

  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [isLoadingTimepoints, setIsLoadingTimepoints] = useState(false);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [isLoadingReleases, setIsLoadingReleases] = useState(false);
  const [isLoadingReleaseDiff, setIsLoadingReleaseDiff] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingFromRelease, setIsAddingFromRelease] = useState(false);

  const [draftError, setDraftError] = useState<string | null>(null);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);
  const [timepointsError, setTimepointsError] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [releasesError, setReleasesError] = useState<string | null>(null);
  const [releaseDiffError, setReleaseDiffError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    if (!draftId) return;
    let isMounted = true;

    async function load() {
      setIsLoadingDiff(true);
      setIsLoadingActivities(true);

      try {
        const [draftRes, activitiesRes] = await Promise.all([
          fetch(papiUrl(`distribution/recordsets/drafts/${draftId}`), { cache: "no-store" }),
          fetch(papiUrl("activities"), { cache: "no-store" }),
        ]);

        if (!isMounted) return;

        if (draftRes.ok) {
          const json = (await draftRes.json()) as { data?: Draft; draft?: Draft };
          setDraft(json.data ?? json.draft ?? null);
        } else {
          setDraftError(`Could not load draft ${draftId}.`);
        }

        if (activitiesRes.ok) {
          const json = (await activitiesRes.json()) as Activity[] | { data?: Activity[] };
          setActivities(Array.isArray(json) ? json : (json.data ?? []));
        } else {
          setActivitiesError("Could not load activities.");
        }
      } catch {
        if (!isMounted) return;
        setDraftError("Could not load page data.");
      } finally {
        if (isMounted) {
          setIsLoadingDiff(false);
          setIsLoadingActivities(false);
        }
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [draftId]);

  useEffect(() => {
    if (!draftId) return;
    let isMounted = true;

    setIsLoadingSummary(true);
    setSummaryError(null);

    async function loadSummary() {
      try {
        const res = await fetch(papiUrl(`distribution/recordsets/drafts/${draftId}/summary`), {
          cache: "no-store",
        });
        if (!isMounted) return;
        if (res.ok) {
          const json = (await res.json()) as { data: DraftSummary };
          setDraftSummary(json.data);
        } else {
          setSummaryError("Could not load draft summary.");
        }
      } catch {
        if (!isMounted) return;
        setSummaryError("Could not load draft summary.");
      } finally {
        if (isMounted) setIsLoadingSummary(false);
      }
    }

    void loadSummary();
    return () => {
      isMounted = false;
    };
  }, [draftId, summaryRefreshKey]);

  useEffect(() => {
    if (!selectedActivityId) {
      setTimepoints([]);
      setSelectedTimepointId(null);
      setDiff(null);
      return;
    }

    let isMounted = true;
    setIsLoadingTimepoints(true);
    setTimepointsError(null);
    setTimepoints([]);
    setSelectedTimepointId(null);
    setDiff(null);

    async function loadTimepoints() {
      try {
        const res = await fetch(
          papiUrl(`activities/${selectedActivityId}/timepoints`),
          { cache: "no-store" },
        );
        if (!isMounted) return;
        if (res.ok) {
          const json = (await res.json()) as Timepoint[] | { data?: Timepoint[] };
          const list = Array.isArray(json) ? json : (json.data ?? []);
          setTimepoints(list);
          if (list.length > 0) {
            setSelectedTimepointId(list[0].activity_timepoint_id);
          }
        } else {
          setTimepointsError("Could not load timepoints.");
        }
      } catch {
        if (!isMounted) return;
        setTimepointsError("Could not load timepoints.");
      } finally {
        if (isMounted) setIsLoadingTimepoints(false);
      }
    }

    void loadTimepoints();
    return () => {
      isMounted = false;
    };
  }, [selectedActivityId]);

  useEffect(() => {
    if (!draftId || !selectedActivityId || !selectedTimepointId) {
      setDiff(null);
      return;
    }

    let isMounted = true;
    setIsLoadingDiff(true);
    setDiffError(null);
    setDiff(null);

    const activityId = selectedActivityId;
    const timepointId = selectedTimepointId;

    async function loadDiff() {
      const query = new URLSearchParams({
        compare_activity_id: String(activityId),
        compare_timepoint_id: String(timepointId),
      });
      try {
        const res = await fetch(
          `${papiUrl(`distribution/recordsets/drafts/${draftId}/diff`)}?${query.toString()}`,
          { cache: "no-store" },
        );
        if (!isMounted) return;
        if (res.ok) {
          const json = (await res.json()) as { data: DiffResult } | DiffResult;
          setDiff("data" in json ? (json as { data: DiffResult }).data : (json as DiffResult));
        } else {
          setDiffError("Could not load diff.");
        }
      } catch {
        if (!isMounted) return;
        setDiffError("Could not load diff.");
      } finally {
        if (isMounted) setIsLoadingDiff(false);
      }
    }

    void loadDiff();
    return () => {
      isMounted = false;
    };
  }, [draftId, selectedActivityId, selectedTimepointId, diffRefreshKey]);

  useEffect(() => {
    if (!draft?.recordset_id) return;
    let isMounted = true;

    setIsLoadingReleases(true);
    setReleasesError(null);

    async function loadReleases() {
      try {
        const res = await fetch(
          papiUrl(`distribution/recordsets/${draft!.recordset_id}/releases`),
          { cache: "no-store" },
        );
        if (!isMounted) return;
        if (res.ok) {
          const json = (await res.json()) as Release[] | { data?: Release[] };
          setReleases(Array.isArray(json) ? json : (json.data ?? []));
        } else {
          setReleasesError("Could not load releases.");
        }
      } catch {
        if (!isMounted) return;
        setReleasesError("Could not load releases.");
      } finally {
        if (isMounted) setIsLoadingReleases(false);
      }
    }

    void loadReleases();
    return () => { isMounted = false; };
  }, [draft]);

  useEffect(() => {
    if (!draftId || !selectedRelease) {
      setReleaseDiff(null);
      return;
    }

    let isMounted = true;
    setIsLoadingReleaseDiff(true);
    setReleaseDiffError(null);
    setReleaseDiff(null);

    const releaseId = selectedRelease.recordset_release_id;

    async function loadReleaseDiff() {
      const query = new URLSearchParams({ compare_release_id: String(releaseId) });
      try {
        const res = await fetch(
          `${papiUrl(`distribution/recordsets/drafts/${draftId}/diff`)}?${query.toString()}`,
          { cache: "no-store" },
        );
        if (!isMounted) return;
        if (res.ok) {
          const json = (await res.json()) as { data: DiffResult } | DiffResult;
          setReleaseDiff("data" in json ? (json as { data: DiffResult }).data : (json as DiffResult));
        } else {
          setReleaseDiffError("Could not load diff.");
        }
      } catch {
        if (!isMounted) return;
        setReleaseDiffError("Could not load diff.");
      } finally {
        if (isMounted) setIsLoadingReleaseDiff(false);
      }
    }

    void loadReleaseDiff();
    return () => { isMounted = false; };
  }, [draftId, selectedRelease, releaseDiffRefreshKey]);

  async function handleAddFromActivity() {
    if (!draftId || !diff || diff.removed_file_ids.length === 0) return;

    setIsAdding(true);
    try {
      const res = await fetch(papiUrl(`distribution/recordsets/drafts/${draftId}/files/add`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_ids: diff.removed_file_ids }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? "Could not add files.");
      }

      toastSuccess(
        addToast,
        `Added ${diff.removed_file_ids.length.toLocaleString()} files to draft.`,
      );
      setDiffRefreshKey((k) => k + 1);
      setSummaryRefreshKey((k) => k + 1);
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not add files.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleAddFromRelease() {
    if (!draftId || !releaseDiff || releaseDiff.removed_file_ids.length === 0) return;

    setIsAddingFromRelease(true);
    try {
      const res = await fetch(papiUrl(`distribution/recordsets/drafts/${draftId}/files/add`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_ids: releaseDiff.removed_file_ids }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? "Could not add files.");
      }

      toastSuccess(
        addToast,
        `Added ${releaseDiff.removed_file_ids.length.toLocaleString()} files to draft.`,
      );
      setReleaseDiffRefreshKey((k) => k + 1);
      setSummaryRefreshKey((k) => k + 1);
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not add files.");
    } finally {
      setIsAddingFromRelease(false);
    }
  }

  const DISPLAY_CAP = 25;
  const trimmedSearch = activitySearch.trim();
  const trimmedIdSearch = activityIdSearch.trim();
  const textSearchActive = trimmedSearch.length >= 2;
  const idSearchActive = /^\d+$/.test(trimmedIdSearch);
  const searchActive = textSearchActive || idSearchActive;
  const searchedId = idSearchActive ? Number(trimmedIdSearch) : null;

  const matchedActivities = searchActive
    ? activities.filter(
        (a) =>
          (idSearchActive && a.activity_id === searchedId) ||
          (textSearchActive &&
            ((a.brief_description ?? "").toLowerCase().includes(trimmedSearch.toLowerCase()) ||
              (a.who_created ?? "").toLowerCase().includes(trimmedSearch.toLowerCase()))),
      )
    : [];

  const hasMoreResults = matchedActivities.length > DISPLAY_CAP;
  const displayedActivities = hasMoreResults
    ? matchedActivities.slice(0, DISPLAY_CAP)
    : matchedActivities;

  const trimmedReleaseSearch = releaseSearch.trim();
  const trimmedReleaseIdSearch = releaseIdSearch.trim();
  const releaseTextSearchActive = trimmedReleaseSearch.length >= 2;
  const releaseIdSearchActive = /^\d+$/.test(trimmedReleaseIdSearch);
  const releaseSearchActive = releaseTextSearchActive || releaseIdSearchActive;
  const searchedReleaseId = releaseIdSearchActive ? Number(trimmedReleaseIdSearch) : null;

  const matchedReleases = releaseSearchActive
    ? releases.filter(
        (r) =>
          (releaseIdSearchActive && r.recordset_release_id === searchedReleaseId) ||
          (releaseTextSearchActive &&
            (r.release_number ?? "").toLowerCase().includes(trimmedReleaseSearch.toLowerCase())),
      )
    : [];

  const releaseHasMoreResults = matchedReleases.length > DISPLAY_CAP;
  const displayedReleases = releaseHasMoreResults
    ? matchedReleases.slice(0, DISPLAY_CAP)
    : matchedReleases;

  const hasDicom = (draftSummary?.dicom.series_count ?? 0) > 0;

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title="Edit Draft Files"
        breadcrumb={{ label: "Draft", href: draftId ? `/recordsets/drafts/${draftId}` : "/recordsets" }}
        subtitle={draft?.draft_name}
      />

      {draftError && (
        <p className="text-sm text-red-600 dark:text-red-400">{draftError}</p>
      )}

      <div className="grid grid-cols-[2fr_3fr] items-start gap-6">
        <SectionCard>
          <CardHeader>
            <CardTitle>Draft Contents</CardTitle>
          </CardHeader>

          {isLoadingSummary && <p className="mt-3 text-sm">Loading...</p>}

          {!isLoadingSummary && summaryError && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">
              {summaryError}
            </p>
          )}

          {!isLoadingSummary && !summaryError && draftSummary && (
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <div className="flex-1 rounded-md px-4 py-3" style={{ background: "var(--surface-alt)", borderLeft: "4px solid var(--accent)" }}>
                  <p className="text-2xl font-bold">{draftSummary.total_files.toLocaleString()}</p>
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>Total Files</p>
                </div>
                <div className="flex-1 rounded-md px-4 py-3" style={{ background: "var(--surface-alt)", borderLeft: "4px solid var(--accent)" }}>
                  <p className="text-2xl font-bold">{formatBytes(draftSummary.total_size_bytes)}</p>
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>Total Size</p>
                </div>
              </div>

              {draftSummary.by_file_type.length > 0 && (
                <div className="rounded-md" style={{ background: "var(--surface-alt)", border: "1px solid var(--border-strong)" }}>
                  <div className="px-3 py-2" style={{ borderLeft: "4px solid var(--accent)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>File Types</p>
                  </div>
                  <div className="px-3 pb-3 pt-2">
                    <table className="w-full table-fixed">
                      <colgroup>
                        <col className="w-1/2" />
                        <col className="w-1/4" />
                        <col className="w-1/4" />
                      </colgroup>
                      <thead>
                        <tr className="text-left text-xs font-semibold" style={{ color: "var(--muted)", background: "var(--border-strong)" }}>
                          <th className="py-1.5">Type</th>
                          <th className="py-1.5">Files</th>
                          <th className="py-1.5">Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {draftSummary.by_file_type.map((ft) => (
                          <tr key={ft.file_type} className="border-t" style={{ borderColor: "var(--border-strong)" }}>
                            <td className="py-1.5">{ft.file_type}</td>
                            <td className="py-1.5">{ft.file_count.toLocaleString()}</td>
                            <td className="py-1.5">{formatBytes(ft.total_size_bytes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {hasDicom && (
                <div className="rounded-md" style={{ background: "var(--surface-alt)", border: "1px solid var(--border-strong)" }}>
                  <div className="px-3 py-2" style={{ borderLeft: "4px solid var(--accent)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>DICOM</p>
                  </div>
                  <div className="px-3 pb-3 pt-2">
                    <table className="w-full table-fixed">
                      <colgroup>
                        <col className="w-1/2" />
                        <col className="w-1/4" />
                        <col className="w-1/4" />
                      </colgroup>
                      <thead>
                        <tr className="text-left text-xs font-semibold" style={{ color: "var(--muted)", background: "var(--border-strong)" }}>
                          <th className="py-1.5">Patients</th>
                          <th className="py-1.5">Studies</th>
                          <th className="py-1.5">Series</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t" style={{ borderColor: "var(--border-strong)" }}>
                          <td className="py-1.5">{draftSummary.dicom.patient_count.toLocaleString()}</td>
                          <td className="py-1.5">{draftSummary.dicom.study_count.toLocaleString()}</td>
                          <td className="py-1.5">{draftSummary.dicom.series_count.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>

                    {draftSummary.dicom.by_modality.length > 0 && (
                      <div className="mt-3 border-t" style={{ borderColor: "var(--border-strong)" }}>
                        <table className="w-full table-fixed">
                          <colgroup>
                            <col className="w-1/2" />
                            <col className="w-1/4" />
                            <col className="w-1/4" />
                          </colgroup>
                          <thead>
                            <tr className="text-left text-xs font-semibold" style={{ color: "var(--muted)", background: "var(--border-strong)" }}>
                              <th className="py-1.5">Modality</th>
                              <th className="py-1.5">Series</th>
                              <th className="py-1.5">Files</th>
                            </tr>
                          </thead>
                          <tbody>
                            {draftSummary.dicom.by_modality.map((m) => (
                              <tr key={m.modality} className="border-t" style={{ borderColor: "var(--border-strong)" }}>
                                <td className="py-1.5">{m.modality}</td>
                                <td className="py-1.5">{m.series_count.toLocaleString()}</td>
                                <td className="py-1.5">{m.file_count.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        <div className="space-y-3">
          <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-700">
            {(["activity", "release", "files"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setBrowserTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  browserTab === tab
                    ? "border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                    : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                }`}
              >
                {tab === "activity"
                  ? "Activity Browser"
                  : tab === "release"
                  ? "Release Browser"
                  : "File Browser"}
              </button>
            ))}
          </div>

          {browserTab === "activity" && (
            <div className="space-y-3">
              <SectionCard>
                <CardHeader>
                  <CardTitle>Activities</CardTitle>
                </CardHeader>

                <div className="mt-3 flex gap-2">
                  <input
                    type="number"
                    placeholder="ID"
                    value={activityIdSearch}
                    onChange={(e) => setActivityIdSearch(e.target.value)}
                    className="input w-24"
                  />
                  <input
                    type="text"
                    placeholder="Search by description or creator..."
                    value={activitySearch}
                    onChange={(e) => setActivitySearch(e.target.value)}
                    className="input flex-1"
                  />
                </div>

                {isLoadingActivities && (
                  <p className="mt-3 text-sm">Loading activities...</p>
                )}

                {!isLoadingActivities && activitiesError && (
                  <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                    {activitiesError}
                  </p>
                )}

                {!isLoadingActivities && !activitiesError && (
                  <div className="mt-3 rounded-md border border-neutral-200 dark:border-neutral-700">
                    {!searchActive ? (
                      <p className="p-3 text-sm text-neutral-500">
                        Enter an activity ID or type 2+ characters to search.
                      </p>
                    ) : displayedActivities.length === 0 ? (
                      <p className="p-3 text-sm text-neutral-500">No activities found.</p>
                    ) : (
                      <>
                        <ul className="max-h-72 divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-800">
                          {displayedActivities.map((a) => (
                            <li key={a.activity_id}>
                              <button
                                className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                                  selectedActivityId === a.activity_id
                                    ? "bg-blue-50 dark:bg-blue-950/30"
                                    : ""
                                }`}
                                onClick={() => {
                                  setSelectedActivityId(a.activity_id);
                                  setSelectedActivity(a);
                                }}
                              >
                                <span className="font-medium">{a.brief_description}</span>
                                <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
                                  #{a.activity_id} &middot; {a.who_created} &middot;{" "}
                                  {new Date(a.when_created).toLocaleDateString()}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {hasMoreResults && (
                          <p className="border-t border-neutral-200 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                            Showing {DISPLAY_CAP} of {matchedActivities.length} — refine your search to narrow results.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </SectionCard>

              {selectedActivity && (
                <SectionCard>
                  <CardHeader>
                    <CardTitle>{selectedActivity.brief_description}</CardTitle>
                  </CardHeader>

                  <div className="mt-3">
                    {isLoadingTimepoints && (
                      <p className="text-sm">Loading timepoints...</p>
                    )}
                    {!isLoadingTimepoints && timepointsError && (
                      <p className="text-sm text-red-600 dark:text-red-400">{timepointsError}</p>
                    )}
                    {!isLoadingTimepoints && !timepointsError && timepoints.length === 0 && (
                      <p className="text-sm text-neutral-500">
                        No timepoints found for this activity.
                      </p>
                    )}
                    {!isLoadingTimepoints && !timepointsError && timepoints.length > 0 && (
                      <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          Timepoint
                        </label>
                        <select
                          value={selectedTimepointId ?? ""}
                          onChange={(e) => setSelectedTimepointId(Number(e.target.value))}
                          className="select"
                        >
                          {timepoints.map((tp, idx) => (
                            <option key={tp.activity_timepoint_id} value={tp.activity_timepoint_id}>
                              {new Date(tp.when_created).toLocaleString()}
                              {idx === 0 ? " (latest)" : ""}
                              {tp.comment ? ` — ${tp.comment}` : ""}
                              {` · ${tp.file_count.toLocaleString()} files`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {isLoadingDiff && <p className="mt-4 text-sm">Loading diff...</p>}

                  {!isLoadingDiff && diffError && (
                    <p className="mt-4 text-sm text-red-600 dark:text-red-400">{diffError}</p>
                  )}

                  {!isLoadingDiff && !diffError && diff && (
                    <div className="mt-4 space-y-4">
                      <div className="grid grid-cols-3 gap-3 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-700">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                            {diff.removed_count.toLocaleString()}
                          </p>
                          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                            From activity, not in draft
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-neutral-700 dark:text-neutral-300">
                            {diff.unchanged_count.toLocaleString()}
                          </p>
                          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                            Already in draft
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                            {diff.added_count.toLocaleString()}
                          </p>
                          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                            In draft, not from this activity
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <Button
                          onClick={() => void handleAddFromActivity()}
                          disabled={isAdding || diff.removed_count === 0}
                          size="sm"
                        >
                          {isAdding
                            ? "Adding..."
                            : `Add ${diff.removed_count.toLocaleString()} Files to Draft`}
                        </Button>
                      </div>
                    </div>
                  )}
                </SectionCard>
              )}
            </div>
          )}

          {browserTab === "release" && (
            <div className="space-y-3">
              <SectionCard>
                <CardHeader>
                  <CardTitle>Releases</CardTitle>
                </CardHeader>

                <div className="mt-3 flex gap-2">
                  <input
                    type="number"
                    placeholder="ID"
                    value={releaseIdSearch}
                    onChange={(e) => setReleaseIdSearch(e.target.value)}
                    className="input w-24"
                  />
                  <input
                    type="text"
                    placeholder="Search by version number..."
                    value={releaseSearch}
                    onChange={(e) => setReleaseSearch(e.target.value)}
                    className="input flex-1"
                  />
                </div>

                {isLoadingReleases && (
                  <p className="mt-3 text-sm">Loading releases...</p>
                )}

                {!isLoadingReleases && releasesError && (
                  <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                    {releasesError}
                  </p>
                )}

                {!isLoadingReleases && !releasesError && (
                  <div className="mt-3 rounded-md border border-neutral-200 dark:border-neutral-700">
                    {!releaseSearchActive ? (
                      <p className="p-3 text-sm text-neutral-500">
                        Enter a release ID or type 2+ characters to search.
                      </p>
                    ) : displayedReleases.length === 0 ? (
                      <p className="p-3 text-sm text-neutral-500">No releases found.</p>
                    ) : (
                      <>
                        <ul className="max-h-72 divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-800">
                          {displayedReleases.map((r) => (
                            <li key={r.recordset_release_id}>
                              <button
                                className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                                  selectedRelease?.recordset_release_id === r.recordset_release_id
                                    ? "bg-blue-50 dark:bg-blue-950/30"
                                    : ""
                                }`}
                                onClick={() => setSelectedRelease(r)}
                              >
                                <span className="font-medium">{r.release_number}</span>
                                <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
                                  #{r.recordset_release_id} &middot;{" "}
                                  {new Date(r.release_date).toLocaleDateString()} &middot;{" "}
                                  {r.file_count.toLocaleString()} files
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {releaseHasMoreResults && (
                          <p className="border-t border-neutral-200 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                            Showing {DISPLAY_CAP} of {matchedReleases.length} — refine your search to narrow results.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </SectionCard>

              {selectedRelease && (
                <SectionCard>
                  <CardHeader>
                    <CardTitle>{selectedRelease.release_number}</CardTitle>
                  </CardHeader>

                  {isLoadingReleaseDiff && <p className="mt-3 text-sm">Loading diff...</p>}

                  {!isLoadingReleaseDiff && releaseDiffError && (
                    <p className="mt-3 text-sm text-red-600 dark:text-red-400">{releaseDiffError}</p>
                  )}

                  {!isLoadingReleaseDiff && !releaseDiffError && releaseDiff && (
                    <div className="mt-4 space-y-4">
                      <div className="grid grid-cols-3 gap-3 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-700">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                            {releaseDiff.removed_count.toLocaleString()}
                          </p>
                          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                            From release, not in draft
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-neutral-700 dark:text-neutral-300">
                            {releaseDiff.unchanged_count.toLocaleString()}
                          </p>
                          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                            Already in draft
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                            {releaseDiff.added_count.toLocaleString()}
                          </p>
                          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                            In draft, not from this release
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <Button
                          onClick={() => void handleAddFromRelease()}
                          disabled={isAddingFromRelease || releaseDiff.removed_count === 0}
                          size="sm"
                        >
                          {isAddingFromRelease
                            ? "Adding..."
                            : `Add ${releaseDiff.removed_count.toLocaleString()} Files to Draft`}
                        </Button>
                      </div>
                    </div>
                  )}
                </SectionCard>
              )}
            </div>
          )}

          {browserTab === "files" && (
            <SectionCard>
              <CardHeader>
                <CardTitle>File Browser</CardTitle>
              </CardHeader>
              <p className="mt-3 text-sm text-neutral-500">Coming soon.</p>
            </SectionCard>
          )}
        </div>
      </div>
    </PageShell>
  );
}
