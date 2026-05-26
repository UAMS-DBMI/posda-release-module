import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DynamicTable from "@/components/DynamicTable";
import { Button, LinkButton } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { papiUrl } from "@/lib/papi";

type Transfer = {
  dataset_release_transfer_id: number;
  destination_id: number;
  destination_name: string;
  destination_abbr: string;
  transfer_name: string;
  transfer_mode_name: string;
  transfer_status: string;
  transfer_notes: string | null;
};

type Destination = {
  destination_id: number;
  destination_name: string;
  destination_abbr: string;
  transfer_mode_id: number;
  transfer_mode_name: string;
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

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  queued: "Queued",
  submitted: "Submitted",
  failed: "Failed",
};

function extractArray<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== "object") return [];
  const source = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

export default function DatasetReleaseTransfersList() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { release_id: releaseId } = useParams<{ release_id: string }>();

  const [release, setRelease] = useState<DatasetRelease | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null);

  async function loadTransfers(id: string) {
    const res = await fetch(papiUrl(`distribution/datasets/releases/${id}/transfers`), { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load transfers.");
    const json = (await res.json()) as unknown;
    return extractArray<Transfer>(json, ["data", "transfers"]);
  }

  useEffect(() => {
    if (!releaseId) return;
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const [releaseRes, transfersRes] = await Promise.all([
          fetch(papiUrl(`distribution/datasets/releases/${releaseId}`), { cache: "no-store" }),
          fetch(papiUrl(`distribution/datasets/releases/${releaseId}/transfers`), { cache: "no-store" }),
        ]);

        if (!isMounted) return;

        let loadedRelease: DatasetRelease | null = null;
        if (releaseRes.ok) {
          const json = (await releaseRes.json()) as { data?: DatasetRelease };
          loadedRelease = json.data ?? null;
          setRelease(loadedRelease);
        }

        if (loadedRelease?.dataset_id) {
          const datasetRes = await fetch(papiUrl(`distribution/datasets/${loadedRelease.dataset_id}`), { cache: "no-store" });
          if (datasetRes.ok && isMounted) {
            const json = (await datasetRes.json()) as { data?: Dataset };
            setDataset(json.data ?? null);
          }
        }

        if (!transfersRes.ok) throw new Error("Could not load transfers.");
        const json = (await transfersRes.json()) as unknown;
        if (isMounted) setTransfers(extractArray<Transfer>(json, ["data", "transfers"]));
      } catch (e) {
        if (isMounted) setError(e instanceof Error ? e.message : "Could not load transfers.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void load();
    return () => { isMounted = false; };
  }, [releaseId]);

  async function syncTransfers() {
    if (!releaseId || !release) return;
    setIsGenerating(true);

    try {
      const destRes = await fetch(papiUrl(`distribution/datasets/releases/${releaseId}/destinations`), { cache: "no-store" });
      if (!destRes.ok) throw new Error("Could not load destinations.");
      const destinations = extractArray<Destination>(
        (await destRes.json()) as unknown,
        ["data", "destinations"],
      );

      const transferByDest = new Map(transfers.map((t) => [t.destination_id, t]));
      let created = 0;
      let synced = 0;

      const results = await Promise.allSettled(
        destinations.map(async (dest) => {
          const rsRes = await fetch(
            `${papiUrl(`distribution/datasets/releases/${releaseId}/recordsets`)}?destination_id=${dest.destination_id}`,
            { cache: "no-store" },
          );
          const expectedRecordsets = extractArray<{ recordset_release_id: number }>(
            (await rsRes.json()) as unknown,
            ["data", "recordsets"],
          );
          const expectedIds = new Set(expectedRecordsets.map((r) => r.recordset_release_id));

          const existing = transferByDest.get(dest.destination_id);

          if (!existing) {
            const res = await fetch(papiUrl(`distribution/datasets/releases/${releaseId}/transfers`), {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                destination_id: dest.destination_id,
                transfer_name: `${dataset?.dataset_name ?? `Dataset ${release.dataset_id}`} v${release.release_number} — ${dest.destination_abbr}`,
                transfer_mode_id: dest.transfer_mode_id,
                transfer_status: "draft",
                recordset_release_ids: expectedRecordsets.length > 0 ? [...expectedIds] : null,
              }),
            });
            if (!res.ok) {
              const json = (await res.json()) as { error?: { message?: string } | string };
              const msg =
                typeof json.error === "string"
                  ? json.error
                  : (json.error?.message ?? `Failed to create transfer for ${dest.destination_name}.`);
              throw new Error(msg);
            }
            created++;
          } else {
            const currentRes = await fetch(
              papiUrl(`distribution/transfers/${existing.dataset_release_transfer_id}/recordsets`),
              { cache: "no-store" },
            );
            const currentRecordsets = extractArray<{ recordset_release_id: number }>(
              (await currentRes.json()) as unknown,
              ["data"],
            );
            const currentIds = new Set(currentRecordsets.map((r) => r.recordset_release_id));

            const toAdd = [...expectedIds].filter((id) => !currentIds.has(id));
            const toRemove = [...currentIds].filter((id) => !expectedIds.has(id));

            await Promise.all([
              toAdd.length > 0
                ? fetch(papiUrl(`distribution/transfers/${existing.dataset_release_transfer_id}/recordsets/add`), {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ recordset_release_ids: toAdd }),
                  })
                : Promise.resolve(),
              toRemove.length > 0
                ? fetch(papiUrl(`distribution/transfers/${existing.dataset_release_transfer_id}/recordsets/remove`), {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ recordset_release_ids: toRemove }),
                  })
                : Promise.resolve(),
            ]);

            if (toAdd.length > 0 || toRemove.length > 0) synced++;
          }
        }),
      );

      const failures = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      const parts: string[] = [];
      if (created > 0) parts.push(`${created} created`);
      if (synced > 0) parts.push(`${synced} synced`);

      if (failures.length > 0) {
        const reason = failures[0].reason instanceof Error ? failures[0].reason.message : "unknown error";
        toastError(addToast, `${failures.length} destination(s) failed: ${reason}`);
      } else if (parts.length > 0) {
        toastSuccess(addToast, parts.join(", ") + ".");
      } else {
        toastSuccess(addToast, "All transfers are up to date.");
      }

      setTransfers(await loadTransfers(releaseId));
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not sync transfers.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function deleteTransfer(id: number) {
    setIsDeletingId(id);
    try {
      const res = await fetch(papiUrl(`distribution/transfers/${id}`), { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } | string };
        const msg =
          typeof json.error === "string"
            ? json.error
            : (json.error?.message ?? "Could not delete transfer.");
        throw new Error(msg);
      }
      setTransfers((prev) => prev.filter((t) => t.dataset_release_transfer_id !== id));
      setDeleteConfirmId(null);
      toastSuccess(addToast, "Transfer deleted.");
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not delete transfer.");
    } finally {
      setIsDeletingId(null);
    }
  }

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title="Transfers"
        breadcrumb={{
          label: "Dataset Release",
          href: releaseId ? `/datasets/releases/${releaseId}` : "/datasets",
        }}
        subtitle={release ? `${dataset?.dataset_name ?? `Dataset ${release.dataset_id}`} — v${release.release_number}` : undefined}
      />

      <CardHeader className="mt-6 mb-0">
        <CardTitle>Transfers</CardTitle>
        <div className="flex items-center gap-2">
          {!isLoading && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void syncTransfers()}
              disabled={isGenerating}
            >
              {isGenerating ? "Syncing..." : "Sync with Default Config"}
            </Button>
          )}
          {releaseId && (
            <LinkButton
              href={`/datasets/releases/${releaseId}/transfers/create`}
              size="sm"
            >
              New Destination Transfer
            </LinkButton>
          )}
        </div>
      </CardHeader>
      <SectionCard className="mt-1">
        {isLoading && <p className="text-sm">Loading...</p>}
        {!isLoading && error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {!isLoading && !error && (
          <DynamicTable
            rows={transfers}
            emptyMessage="No transfers yet for this release."
            columns={[
              { key: "transfer_name", label: "Name" },
              { key: "destination_name", label: "Destination" },
              { key: "transfer_mode_name", label: "Mode" },
              {
                key: "transfer_status",
                label: "Status",
                render: (v) => STATUS_LABELS[String(v)] ?? String(v),
              },
              {
                key: "dataset_release_transfer_id",
                label: "",
                render: (_v, row) => {
                  const id = row.dataset_release_transfer_id;
                  const isConfirming = deleteConfirmId === id;
                  const isThisDeleting = isDeletingId === id;
                  return (
                    <div
                      className="flex justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isConfirming ? (
                        <>
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ color: "var(--foreground)" }}
                            onClick={() => setDeleteConfirmId(null)}
                            disabled={isThisDeleting}
                          >
                            Cancel
                          </button>
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ color: "#dc2626" }}
                            onClick={() => void deleteTransfer(id)}
                            disabled={isThisDeleting}
                          >
                            {isThisDeleting ? "Deleting…" : "Confirm"}
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn btn-sm btn-ghost"
                          style={{ color: "#dc2626" }}
                          onClick={() => setDeleteConfirmId(id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  );
                },
              },
            ]}
            onRowClick={(row) =>
              navigate(`/transfers/${row.dataset_release_transfer_id}`)
            }
            getRowKey={(row) => row.dataset_release_transfer_id}
          />
        )}
      </SectionCard>
    </PageShell>
  );
}
