import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, LinkButton } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { extractApiError, extractArray } from "@/lib/apiUtils";
import { LoadingState } from "@/components/ui/Spinner";

type Destination = {
  destination_id: number;
  destination_name: string;
  destination_abbr: string;
};

type RecordsetRelease = {
  recordset_id: number;
  recordset_release_id: number;
  recordset_name: string;
  release_number: number;
};

type DatasetRelease = {
  dataset_release_id: number;
  dataset_id: number;
  release_number: number;
};

type Dataset = {
  dataset_id: number;
  dataset_name: string;
};

type CreateTransferResponse = {
  data?: { dataset_release_transfer_id: number };
  dataset_release_transfer_id?: number;
};

export default function DatasetReleaseTransferCreate() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { release_id: releaseId } = useParams<{ release_id: string }>();

  const [release, setRelease] = useState<DatasetRelease | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [isLoadingInit, setIsLoadingInit] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const [selectedDestinationId, setSelectedDestinationId] = useState("");
  const [transferName, setTransferName] = useState("");
  const [transferNotes, setTransferNotes] = useState("");

  const [recordsetReleases, setRecordsetReleases] = useState<RecordsetRelease[]>([]);
  const [selectedRecordsetIds, setSelectedRecordsetIds] = useState<Set<number>>(new Set());
  const [isLoadingRecordsets, setIsLoadingRecordsets] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedDestination =
    destinations.find((d) => String(d.destination_id) === selectedDestinationId) ?? null;

  useEffect(() => {
    if (!releaseId) return;
    let isMounted = true;

    async function loadInit() {
      setIsLoadingInit(true);
      setInitError(null);

      try {
        const [releaseRes, destinationsRes] = await Promise.all([
          fetch(`/papi/v1/distribution/datasets/releases/${releaseId}`, { cache: "no-store" }),
          fetch(`/papi/v1/distribution/datasets/releases/${releaseId}/destinations`, { cache: "no-store" }),
        ]);

        if (!isMounted) return;

        let loadedRelease: DatasetRelease | null = null;
        if (releaseRes.ok) {
          const json = (await releaseRes.json()) as { data?: DatasetRelease };
          loadedRelease = json.data ?? null;
          setRelease(loadedRelease);
        }

        if (loadedRelease?.dataset_id) {
          const datasetRes = await fetch(`/papi/v1/distribution/datasets/${loadedRelease.dataset_id}`, { cache: "no-store" });
          if (datasetRes.ok && isMounted) {
            const json = (await datasetRes.json()) as { data?: Dataset };
            setDataset(json.data ?? null);
          }
        }

        if (!destinationsRes.ok) throw new Error("Could not load destinations.");

        const json = (await destinationsRes.json()) as unknown;
        const items = extractArray<Destination>(json, ["data", "destinations"]);
        if (isMounted) {
          setDestinations(items);
          if (items.length > 0) setSelectedDestinationId(String(items[0].destination_id));
        }
      } catch (e) {
        if (isMounted) setInitError(e instanceof Error ? e.message : "Could not load page data.");
      } finally {
        if (isMounted) setIsLoadingInit(false);
      }
    }

    void loadInit();
    return () => { isMounted = false; };
  }, [releaseId]);

  useEffect(() => {
    if (!releaseId || !selectedDestinationId) {
      setRecordsetReleases([]);
      setSelectedRecordsetIds(new Set());
      return;
    }

    let isMounted = true;

    async function loadRecordsets() {
      setIsLoadingRecordsets(true);
      try {
        const res = await fetch(
          `/papi/v1/distribution/datasets/releases/${releaseId}/recordsets?destination_id=${selectedDestinationId}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error();
        const json = (await res.json()) as unknown;
        const items = extractArray<RecordsetRelease>(json, ["data", "recordsets"]);
        if (isMounted) {
          setRecordsetReleases(items);
          setSelectedRecordsetIds(new Set(items.map((r) => r.recordset_release_id)));
        }
      } catch {
        if (isMounted) {
          setRecordsetReleases([]);
          setSelectedRecordsetIds(new Set());
        }
      } finally {
        if (isMounted) setIsLoadingRecordsets(false);
      }
    }

    void loadRecordsets();
    return () => { isMounted = false; };
  }, [releaseId, selectedDestinationId]);

  function toggleRecordset(id: number) {
    setSelectedRecordsetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!releaseId || !selectedDestination || !transferName.trim()) return;

    setSaveError(null);
    setIsSaving(true);

    try {
      const res = await fetch(`/papi/v1/distribution/datasets/releases/${releaseId}/transfers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          destination_id: selectedDestination.destination_id,
          transfer_name: transferName.trim(),
          transfer_notes: transferNotes.trim() || null,
          transfer_status: "draft",
          recordset_release_ids:
            selectedRecordsetIds.size > 0 ? [...selectedRecordsetIds] : null,
        }),
      });

      if (!res.ok) {
        const json = (await res.json()) as unknown;
        throw new Error(extractApiError(json, "Could not create transfer."));
      }

      const json = (await res.json()) as CreateTransferResponse;
      const newId =
        json.data?.dataset_release_transfer_id ?? json.dataset_release_transfer_id;
      if (!newId) throw new Error("No transfer ID returned.");

      toastSuccess(addToast, "Transfer created.");
      navigate(`/transfers/${newId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create transfer.";
      setSaveError(msg);
      toastError(addToast, msg);
    } finally {
      setIsSaving(false);
    }
  }

  const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide";

  const breadcrumbTrail = release
    ? [
        { label: "Datasets", href: "/datasets" },
        {
          label: dataset?.dataset_name ?? `Dataset ${release.dataset_id}`,
          href: `/datasets/${release.dataset_id}`,
        },
        {
          label: `Release v${release.release_number}`,
          href: `/datasets/releases/${releaseId}`,
        },
        {
          label: "Transfers",
          href: `/datasets/releases/${releaseId}/transfers`,
        },
      ]
    : [
        {
          label: "Transfers",
          href: releaseId ? `/datasets/releases/${releaseId}/transfers` : "/transfers",
        },
      ];

  if (isLoadingInit) {
    return (
      <PageShell size="3xl">
        <PageDetailHeader title="New Transfer" breadcrumbs={breadcrumbTrail} />
        <SectionCard><LoadingState /></SectionCard>
      </PageShell>
    );
  }

  if (initError) {
    return (
      <PageShell size="3xl">
        <PageDetailHeader title="New Transfer" breadcrumbs={breadcrumbTrail} />
        <SectionCard>
          <p className="text-sm text-red-600 dark:text-red-400">{initError}</p>
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell size="3xl">
      <PageDetailHeader title="New Transfer" breadcrumbs={breadcrumbTrail} />

      <form onSubmit={(e) => void handleSubmit(e)}>
        <SectionCard>
          <div className="space-y-4">
            <label className="block">
              <span className={labelClass} style={{ color: "var(--muted)" }}>
                Destination <span className="text-red-500">*</span>
              </span>
              {destinations.length === 0 ? (
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                  No destinations configured for this release.
                </p>
              ) : (
                <select
                  value={selectedDestinationId}
                  onChange={(e) => setSelectedDestinationId(e.target.value)}
                  className="mt-1 select w-full"
                  required
                >
                  <option value="">--- Select a destination ---</option>
                  {destinations.map((d) => (
                    <option key={d.destination_id} value={String(d.destination_id)}>
                      {d.destination_name} ({d.destination_abbr})
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="block">
              <span className={labelClass} style={{ color: "var(--muted)" }}>
                Transfer Name <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                value={transferName}
                onChange={(e) => setTransferName(e.target.value)}
                required
                className="mt-1 input w-full"
                placeholder="e.g. IDC 2025-Q1 Export"
              />
            </label>

            <label className="block">
              <span className={labelClass} style={{ color: "var(--muted)" }}>
                Notes
              </span>
              <textarea
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                rows={3}
                className="mt-1 textarea w-full"
              />
            </label>
          </div>
        </SectionCard>

        <CardHeader className="mt-6 mb-0">
          <CardTitle>Recordset Releases</CardTitle>
        </CardHeader>
        <SectionCard className="mt-1">
          {isLoadingRecordsets && <LoadingState />}
          {!isLoadingRecordsets && !selectedDestinationId && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Select a destination to see its recordset releases.
            </p>
          )}
          {!isLoadingRecordsets && selectedDestinationId && recordsetReleases.length === 0 && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No recordset releases configured for this destination.
            </p>
          )}
          {!isLoadingRecordsets && recordsetReleases.length > 0 && (
            <div className="space-y-2">
              {recordsetReleases.map((r) => (
                <label
                  key={r.recordset_release_id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedRecordsetIds.has(r.recordset_release_id)}
                    onChange={() => toggleRecordset(r.recordset_release_id)}
                    className="checkbox"
                  />
                  <span>
                    {r.recordset_name} — v{r.release_number}
                  </span>
                </label>
              ))}
            </div>
          )}
        </SectionCard>

        {saveError && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{saveError}</p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            type="submit"
            disabled={
              !selectedDestinationId ||
              !transferName.trim() ||
              selectedRecordsetIds.size === 0
            }
            loading={isSaving}
          >
            Create Transfer
          </Button>
          <LinkButton
            href={releaseId ? `/datasets/releases/${releaseId}/transfers` : "/transfers"}
            variant="ghost"
          >
            Cancel
          </LinkButton>
        </div>
      </form>
    </PageShell>
  );
}
