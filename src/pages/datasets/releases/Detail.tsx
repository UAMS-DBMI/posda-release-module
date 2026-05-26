import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DynamicSection, {
  DynamicSectionField,
} from "@/components/DynamicSection";
import { Button, LinkButton } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { papiUrl } from "@/lib/papi";

type DatasetRelease = {
  dataset_release_id: number;
  dataset_id: number;
  release_number: number;
  release_date: string;
  release_notes: string;
  when_created?: string;
  who_created?: string;
  when_updated?: string;
  who_updated?: string;
};

type DatasetReleaseResponse = {
  dataset_release?: DatasetRelease;
  data?: DatasetRelease;
  release?: DatasetRelease;
  timestamp: string;
};

type RecordsetRelease = {
  recordset_release_id: number;
  recordset_id: number;
  release_number: number;
  release_date: string;
  release_notes: string;
  recordset_name?: string;
};

type DatasetRecordset = {
  recordset_id: number;
  recordset_name?: string;
};

type RecordsetReleasesResponse = {
  recordsets?: RecordsetRelease[];
  releases?: RecordsetRelease[];
  data?: RecordsetRelease[];
  total?: number;
  meta?: { count?: number };
  timestamp?: string;
};

function normalizeRecordsetReleasesResponse(payload: unknown): {
  releases: RecordsetRelease[];
  total: number;
} {
  const source = payload as RecordsetReleasesResponse | undefined;
  const releases = Array.isArray(source?.releases)
    ? source.releases
    : Array.isArray(source?.recordsets)
      ? source.recordsets
      : Array.isArray(source?.data)
        ? source.data
        : [];

  const total =
    typeof source?.total === "number"
      ? source.total
      : typeof source?.meta?.count === "number"
        ? source.meta.count
        : releases.length;

  return { releases, total };
}

function extractArray<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const source = payload as Record<string, unknown>;

  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value as T[];
    }
  }

  return [];
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "-";
  }

  return new Date(parsed).toLocaleDateString();
}

async function getApiErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  try {
    const json = (await response.json()) as {
      error?: string | { message?: string };
      message?: string;
    };
    if (typeof json?.error === "string") {
      return json.error;
    }
    if (json?.error && typeof json.error.message === "string") {
      return json.error.message;
    }
    if (typeof json?.message === "string") {
      return json.message;
    }
  } catch {
    // ignore
  }

  try {
    const text = await response.text();
    return text || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export default function DatasetReleaseDetail() {
  const { release_id: releaseId } = useParams<{ release_id: string }>();
  const [data, setData] = useState<DatasetReleaseResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkedRecordsetReleases, setLinkedRecordsetReleases] = useState<
    RecordsetRelease[]
  >([]);
  const [availableRecordsetReleases, setAvailableRecordsetReleases] = useState<
    RecordsetRelease[]
  >([]);
  const [selectedAvailableIds, setSelectedAvailableIds] = useState<Set<number>>(
    new Set(),
  );
  const [selectedLinkedIds, setSelectedLinkedIds] = useState<Set<number>>(
    new Set(),
  );
  const [isLoadingRecordsets, setIsLoadingRecordsets] = useState(false);
  const [recordsetsError, setRecordsetsError] = useState<string | null>(null);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [availableError, setAvailableError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isUpdatingLinks, setIsUpdatingLinks] = useState(false);

  async function loadAvailableReleases(
    datasetId: number,
    linkedIds: Set<number>,
  ) {
    setIsLoadingAvailable(true);
    setAvailableError(null);

    try {
      const recordsetsResponse = await fetch(
        `${papiUrl("distribution/recordsets")}?dataset_id=${datasetId}&limit=1000`,
        { cache: "no-store" },
      );

      if (!recordsetsResponse.ok) {
        throw new Error("Could not load recordsets for this dataset.");
      }

      const recordsetsJson = (await recordsetsResponse.json()) as unknown;
      const recordsets = extractArray<DatasetRecordset>(recordsetsJson, [
        "recordsets",
        "data",
        "items",
        "results",
      ]);

      const releasesByRecordset = await Promise.all(
        recordsets.map(async (recordset) => {
          try {
            const releasesResponse = await fetch(
              `${papiUrl(`distribution/recordsets/${recordset.recordset_id}/releases`)}?limit=1000`,
              { cache: "no-store" },
            );

            if (!releasesResponse.ok) {
              return [] as RecordsetRelease[];
            }

            const releasesJson = (await releasesResponse.json()) as unknown;
            const { releases } =
              normalizeRecordsetReleasesResponse(releasesJson);
            return releases.map((release) => ({
              ...release,
              recordset_name:
                release.recordset_name ?? recordset.recordset_name,
            }));
          } catch {
            return [] as RecordsetRelease[];
          }
        }),
      );

      const flattened = releasesByRecordset.flat();
      const filtered = flattened.filter(
        (release) => !linkedIds.has(release.recordset_release_id),
      );

      setAvailableRecordsetReleases(filtered);
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setAvailableError(caughtError.message);
      } else {
        setAvailableError("Could not load available recordset releases.");
      }
      setAvailableRecordsetReleases([]);
    } finally {
      setIsLoadingAvailable(false);
    }
  }

  useEffect(() => {
    if (!releaseId) return;
    let isMounted = true;

    async function loadRelease() {
      setIsLoading(true);
      setError(null);
      setIsLoadingRecordsets(true);
      setRecordsetsError(null);
      setIsLoadingAvailable(true);
      setAvailableError(null);

      try {
        const response = await fetch(papiUrl(`distribution/datasets/releases/${releaseId}`), {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Could not load dataset release ${releaseId}.`);
        }

        const json = (await response.json()) as DatasetReleaseResponse;
        const releasePayload =
          json.dataset_release ?? json.data ?? json.release ?? null;

        if (!releasePayload) {
          throw new Error("Release payload missing from response.");
        }

        if (!isMounted) {
          return;
        }

        setData({ ...json, dataset_release: releasePayload });

        try {
          const recordsetsResponse = await fetch(
            papiUrl(`distribution/datasets/releases/${releaseId}/recordsets`),
            { cache: "no-store" },
          );

          if (!recordsetsResponse.ok) {
            throw new Error(
              `Could not load recordset releases for dataset release ${releaseId}.`,
            );
          }

          const recordsetsJson = (await recordsetsResponse.json()) as unknown;
          const normalized = normalizeRecordsetReleasesResponse(recordsetsJson);
          const linked = normalized.releases;

          if (!isMounted) {
            return;
          }

          setLinkedRecordsetReleases(linked);
          setSelectedLinkedIds(new Set());
          const linkedIds = new Set(
            linked.map((release) => release.recordset_release_id),
          );
          await loadAvailableReleases(releasePayload.dataset_id, linkedIds);
        } catch (caughtError) {
          if (!isMounted) {
            return;
          }

          setLinkedRecordsetReleases([]);
          if (caughtError instanceof Error) {
            setRecordsetsError(caughtError.message);
          } else {
            setRecordsetsError(
              `Could not load recordset releases for dataset release ${releaseId}.`,
            );
          }
        } finally {
          if (isMounted) {
            setIsLoadingRecordsets(false);
          }
        }
      } catch (caughtError) {
        if (!isMounted) {
          return;
        }

        if (caughtError instanceof Error) {
          setError(caughtError.message);
        } else {
          setError(`Could not load dataset release ${releaseId}.`);
        }

        setData(null);
        setLinkedRecordsetReleases([]);
        setAvailableRecordsetReleases([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsLoadingRecordsets(false);
          setIsLoadingAvailable(false);
        }
      }
    }

    void loadRelease();

    return () => {
      isMounted = false;
    };
  }, [releaseId]);

  const release = data?.dataset_release ?? data?.data ?? data?.release ?? null;
  const releaseFields: DynamicSectionField[] = release
    ? [
        { label: "Release ID", value: release.dataset_release_id },
        { label: "Dataset ID", value: release.dataset_id },
        { label: "Release Number", value: release.release_number },
        { label: "Release Date", value: formatDate(release.release_date) },
        {
          label: "Release Notes",
          value: release.release_notes,
          fullWidth: true,
          valueClassName: "mt-1 whitespace-pre-wrap text-xs",
        },
      ]
    : [];

  function groupByRecordset(items: RecordsetRelease[]) {
    const map = new Map<number, { recordset_id: number; recordset_name: string; releases: RecordsetRelease[] }>();
    for (const item of items) {
      const existing = map.get(item.recordset_id);
      if (existing) {
        existing.releases.push(item);
      } else {
        map.set(item.recordset_id, {
          recordset_id: item.recordset_id,
          recordset_name: item.recordset_name ?? `Recordset ${item.recordset_id}`,
          releases: [item],
        });
      }
    }
    return [...map.values()].map((group) => ({
      ...group,
      releases: [...group.releases].sort((a, b) => b.release_number - a.release_number),
    }));
  }

  function toggleSelection(
    setState: React.Dispatch<React.SetStateAction<Set<number>>>,
    id: number,
  ) {
    setState((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function refreshLists() {
    if (!releaseId || !release) {
      return;
    }

    setIsLoadingRecordsets(true);
    setRecordsetsError(null);
    setIsLoadingAvailable(true);
    setAvailableError(null);

    try {
      const recordsetsResponse = await fetch(
        papiUrl(`distribution/datasets/releases/${releaseId}/recordsets`),
        { cache: "no-store" },
      );

      if (!recordsetsResponse.ok) {
        throw new Error(
          `Could not load recordset releases for dataset release ${releaseId}.`,
        );
      }

      const recordsetsJson = (await recordsetsResponse.json()) as unknown;
      const normalized = normalizeRecordsetReleasesResponse(recordsetsJson);
      const linked = normalized.releases;
      setLinkedRecordsetReleases(linked);
      setSelectedLinkedIds(new Set());
      const linkedIds = new Set(
        linked.map((releaseItem) => releaseItem.recordset_release_id),
      );

      await loadAvailableReleases(release.dataset_id, linkedIds);
      setSelectedAvailableIds(new Set());
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setRecordsetsError(caughtError.message);
      } else {
        setRecordsetsError(
          `Could not load recordset releases for dataset release ${releaseId}.`,
        );
      }
    } finally {
      setIsLoadingRecordsets(false);
      setIsLoadingAvailable(false);
    }
  }

  async function handleAddSelected() {
    if (!releaseId || selectedAvailableIds.size === 0) {
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setIsUpdatingLinks(true);

    try {
      const response = await fetch(
        papiUrl(`distribution/datasets/releases/${releaseId}/recordsets/add`),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            recordset_release_ids: Array.from(selectedAvailableIds),
          }),
        },
      );

      if (!response.ok) {
        const fallbackMessage =
          "Could not link one or more recordset releases.";
        const message = await getApiErrorMessage(response, fallbackMessage);
        throw new Error(message);
      }

      setActionSuccess("Recordset releases linked successfully.");
      await refreshLists();
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setActionError(caughtError.message);
      } else {
        setActionError("Could not link recordset releases.");
      }
    } finally {
      setIsUpdatingLinks(false);
    }
  }

  async function handleRemoveSelected() {
    if (!releaseId || selectedLinkedIds.size === 0) {
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setIsUpdatingLinks(true);

    try {
      const response = await fetch(
        papiUrl(`distribution/datasets/releases/${releaseId}/recordsets/remove`),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            recordset_release_ids: Array.from(selectedLinkedIds),
          }),
        },
      );

      if (!response.ok) {
        const fallbackMessage =
          "Could not unlink one or more recordset releases.";
        const message = await getApiErrorMessage(response, fallbackMessage);
        throw new Error(message);
      }

      setActionSuccess("Recordset releases removed successfully.");
      await refreshLists();
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setActionError(caughtError.message);
      } else {
        setActionError("Could not remove recordset releases.");
      }
    } finally {
      setIsUpdatingLinks(false);
    }
  }

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title="Dataset Release Details"
        breadcrumb={{ label: "Dataset", href: release?.dataset_id ? `/datasets/${release.dataset_id}` : "/datasets" }}
        subtitle={release ? `Release ${release.release_number}` : undefined}
        actions={
          <>
            <LinkButton href={releaseId ? `/datasets/releases/${releaseId}/transfers` : "/transfers"} variant="ghost">
              Transfers
            </LinkButton>
            <LinkButton href={releaseId ? `/datasets/releases/${releaseId}/edit` : "/datasets"}>
              Edit Release
            </LinkButton>
          </>
        }
      />

      <DynamicSection
        isLoading={isLoading}
        error={error}
        fields={releaseFields}
        actions={
          <div className="space-y-1 rounded-md px-3 py-2 text-xs" style={{ background: "var(--surface-alt)", border: "1px solid var(--border-strong)", color: "var(--muted)" }}>
            <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Created:</span>{" "}{release?.when_created ? new Date(release.when_created).toLocaleString() : "—"} by {release?.who_created ?? "—"}</p>
            <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Updated:</span>{" "}{release ? (release.when_updated ? new Date(release.when_updated).toLocaleString() : "—") : "—"} by {release?.who_updated ?? "—"}</p>
          </div>
        }
      />

      {!isLoading && release && (
        <>
          <CardHeader className="mt-6 mb-0">
            <CardTitle>Recordset Releases</CardTitle>
          </CardHeader>
          <SectionCard className="mt-1">

          {actionError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {actionError}
            </p>
          )}

          {actionSuccess && !actionError && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              {actionSuccess}
            </p>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div className="space-y-2">
              <div className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Available Recordset Releases
              </div>
              {isLoadingAvailable && (
                <p className="text-sm">Loading available releases...</p>
              )}
              {!isLoadingAvailable && availableError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {availableError}
                </p>
              )}
              {!isLoadingAvailable && !availableError && (
                <div className="rounded-md p-2" style={{ border: "1px solid var(--border-strong)" }}>
                  {availableRecordsetReleases.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--muted)" }}>No available recordset releases.</p>
                  ) : (
                    <div className="space-y-3">
                      {groupByRecordset(availableRecordsetReleases).map((group) => (
                        <div key={group.recordset_id}>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                            {group.recordset_name}
                          </p>
                          <div className="space-y-1">
                            {group.releases.map((r) => (
                              <label key={r.recordset_release_id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm transition-colors bg-background hover:bg-surface-alt">
                                <input
                                  type="checkbox"
                                  checked={selectedAvailableIds.has(r.recordset_release_id)}
                                  onChange={() => toggleSelection(setSelectedAvailableIds, r.recordset_release_id)}
                                  className="checkbox"
                                />
                                <span className="font-medium">v{r.release_number}</span>
                                <span style={{ color: "var(--muted)" }}>{formatDate(r.release_date)}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col items-center justify-center gap-3">
              <Button
                type="button"
                onClick={handleAddSelected}
                disabled={isUpdatingLinks || selectedAvailableIds.size === 0}
                wide
              >
                Add →
              </Button>
              <Button
                type="button"
                onClick={handleRemoveSelected}
                disabled={isUpdatingLinks || selectedLinkedIds.size === 0}
                variant="ghost"
                wide
              >
                ← Remove
              </Button>
            </div>

            <div className="space-y-2">
              <div className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Added to Dataset Release
              </div>
              {isLoadingRecordsets && (
                <p className="text-sm">Loading linked releases...</p>
              )}
              {!isLoadingRecordsets && recordsetsError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {recordsetsError}
                </p>
              )}
              {!isLoadingRecordsets && !recordsetsError && (
                <div className="rounded-md p-2" style={{ border: "1px solid var(--border-strong)" }}>
                  {linkedRecordsetReleases.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--muted)" }}>No recordset releases linked.</p>
                  ) : (
                    <div className="space-y-3">
                      {groupByRecordset(linkedRecordsetReleases).map((group) => (
                        <div key={group.recordset_id}>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                            {group.recordset_name}
                          </p>
                          <div className="space-y-1">
                            {group.releases.map((r) => (
                              <label key={r.recordset_release_id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm transition-colors bg-background hover:bg-surface-alt">
                                <input
                                  type="checkbox"
                                  checked={selectedLinkedIds.has(r.recordset_release_id)}
                                  onChange={() => toggleSelection(setSelectedLinkedIds, r.recordset_release_id)}
                                  className="checkbox"
                                />
                                <span className="font-medium">v{r.release_number}</span>
                                <span style={{ color: "var(--muted)" }}>{formatDate(r.release_date)}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </SectionCard>
        </>
      )}
    </PageShell>
  );
}
