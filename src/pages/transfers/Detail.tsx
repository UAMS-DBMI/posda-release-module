import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DynamicSection, { DynamicSectionField } from "@/components/DynamicSection";
import { Button } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { extractApiError } from "@/lib/apiUtils";
import TransferSettingsForm from "@/components/transfers/TransferSettingsForm";
import { LoadingState } from "@/components/ui/Spinner";

type Transfer = {
  dataset_release_transfer_id: number;
  dataset_release_id: number;
  destination_id: number;
  destination_name: string;
  destination_abbr: string;
  transfer_name: string;
  transfer_mode_id: number;
  transfer_mode_name: string;
  transfer_status: string;
  transfer_notes: string | null;
  when_created: string;
  when_updated: string;
};

type RecordsetRelease = {
  recordset_release_id: number;
  recordset_id: number;
  recordset_name: string;
  recordset_type_name: string;
  release_number: number;
  retriever_manifest_file_id: number | null;
  downloadable_file_id: number | null;
  security_hash: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  queued: "Queued",
  submitted: "Submitted",
  failed: "Failed",
};

const STATUS_BADGE: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  draft: "neutral",
  queued: "warning",
  submitted: "success",
  failed: "danger",
};

export default function TransferDetail() {
  const { addToast } = useToast();
  const { transfer_id: transferId } = useParams<{ transfer_id: string }>();

  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [recordsets, setRecordsets] = useState<RecordsetRelease[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isQueuing, setIsQueuing] = useState(false);
  const [generatingManifestId, setGeneratingManifestId] = useState<number | null>(null);

  useEffect(() => {
    if (!transferId) return;
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const [transferRes, recordsetsRes] = await Promise.all([
          fetch(`/papi/v1/distribution/transfers/${transferId}`, { cache: "no-store" }),
          fetch(`/papi/v1/distribution/transfers/${transferId}/recordsets`, { cache: "no-store" }),
        ]);

        if (!isMounted) return;

        if (!transferRes.ok) {
          const json = (await transferRes.json()) as unknown;
          throw new Error(extractApiError(json, `Could not load transfer ${transferId}.`));
        }

        const transferJson = (await transferRes.json()) as { data: Transfer };
        const loadedTransfer = transferJson.data;
        if (isMounted) setTransfer(loadedTransfer);

        if (recordsetsRes.ok) {
          const rsJson = (await recordsetsRes.json()) as { data: RecordsetRelease[] };
          if (isMounted) setRecordsets(rsJson.data ?? []);
        }

      } catch (e) {
        if (!isMounted) return;
        setError(e instanceof Error ? e.message : `Could not load transfer ${transferId}.`);
        setTransfer(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [transferId]);

  async function generateManifest(r: RecordsetRelease) {
    if (!transferId) return;
    setGeneratingManifestId(r.recordset_release_id);
    try {
      const res = await fetch(
        `/papi/v1/distribution/transfers/${transferId}/recordsets/${r.recordset_release_id}/manifest/generate`,
        { method: "POST" },
      );
      if (!res.ok) {
        const json = (await res.json()) as unknown;
        throw new Error(extractApiError(json, "Could not generate manifest."));
      }
      const json = (await res.json()) as {
        data: { downloadable_file_id: number; security_hash: string; file_id: number; series_count: number };
      };
      setRecordsets((prev) =>
        prev.map((rs) =>
          rs.recordset_release_id === r.recordset_release_id
            ? {
                ...rs,
                retriever_manifest_file_id: json.data.file_id,
                downloadable_file_id: json.data.downloadable_file_id,
                security_hash: json.data.security_hash,
              }
            : rs,
        ),
      );
      toastSuccess(addToast, `Manifest generated (${json.data.series_count} series).`);
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not generate manifest.");
    } finally {
      setGeneratingManifestId(null);
    }
  }

  async function queueTransfer() {
    if (!transferId) return;
    setIsQueuing(true);
    try {
      const res = await fetch(`/papi/v1/distribution/transfers/${transferId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transfer_status: "queued" }),
      });
      if (!res.ok) {
        const json = (await res.json()) as unknown;
        throw new Error(extractApiError(json, "Could not queue transfer."));
      }
      const json = (await res.json()) as { data: Transfer };
      setTransfer(json.data);
      toastSuccess(addToast, "Transfer queued.");
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not queue transfer.");
    } finally {
      setIsQueuing(false);
    }
  }

  const transferFields: DynamicSectionField[] = transfer
    ? [
        { label: "Transfer ID", value: transfer.dataset_release_transfer_id },
        { label: "Dataset Release ID", value: transfer.dataset_release_id },
        { label: "Destination", value: transfer.destination_name },
        { label: "Status", value: STATUS_LABELS[transfer.transfer_status] ?? transfer.transfer_status },
        ...(transfer.transfer_notes
          ? [
              {
                label: "Notes",
                value: transfer.transfer_notes,
                fullWidth: true,
                valueClassName: "whitespace-pre-wrap text-xs",
              },
            ]
          : []),
      ]
    : [];


  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title="Transfer Details"
        breadcrumbs={
          transfer?.dataset_release_id
            ? [
                {
                  label: "Dataset Release",
                  href: `/datasets/releases/${transfer.dataset_release_id}`,
                },
                {
                  label: "Transfers",
                  href: `/datasets/releases/${transfer.dataset_release_id}/transfers`,
                },
              ]
            : [{ label: "Transfers", href: "/transfers" }]
        }
        subtitle={transfer?.transfer_name}
        badge={
          transfer
            ? {
                label: STATUS_LABELS[transfer.transfer_status] ?? transfer.transfer_status,
                variant: STATUS_BADGE[transfer.transfer_status] ?? "neutral",
              }
            : undefined
        }
        actions={
          transfer?.transfer_status === "draft" ? (
            <Button onClick={() => void queueTransfer()} disabled={isQueuing}>
              {isQueuing ? "Queuing..." : "Queue Transfer"}
            </Button>
          ) : undefined
        }
      />

      <DynamicSection
        isLoading={isLoading}
        error={error}
        fields={transferFields}
        actions={
          <div className="metadata-panel">
            <p><strong>Created:</strong>{" "}{transfer ? new Date(transfer.when_created).toLocaleString() : "—"}</p>
            <p><strong>Updated:</strong>{" "}{transfer ? new Date(transfer.when_updated).toLocaleString() : "—"}</p>
          </div>
        }
      />

      <CardHeader className="mt-6 mb-0">
        <CardTitle>Recordset Releases</CardTitle>
      </CardHeader>
      <SectionCard className="mt-1">
        {isLoading && <LoadingState />}
        {!isLoading && recordsets.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No recordset releases linked to this transfer.
          </p>
        )}
        {!isLoading && recordsets.length > 0 && (
          <ul className="divide-y text-sm" style={{ borderColor: "var(--border-strong)" }}>
            {recordsets.map((r) => {
              const hasManifest = r.retriever_manifest_file_id !== null;
              const isGenerating = generatingManifestId === r.recordset_release_id;
              const isRadiology = r.recordset_type_name === "Radiology Images";
              return (
                <li key={r.recordset_release_id} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{r.recordset_name}</span>
                    <span style={{ color: "var(--muted)" }}>v{r.release_number}</span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>{r.recordset_type_name}</span>
                  </span>
                  {isRadiology && (
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs" style={{ color: "var(--muted)" }}>Retriever Manifest</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void generateManifest(r)}
                        loading={isGenerating}
                      >
                        {hasManifest ? "Replace" : "Generate"}
                      </Button>
                      {hasManifest && r.downloadable_file_id && r.security_hash && (
                        <a
                          className="btn btn-sm btn-ghost"
                          href={`/papi/v1/download/file/${r.downloadable_file_id}/${r.security_hash}`}
                          download
                        >
                          Download
                        </a>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {transfer && (
        <>
          <CardHeader className="mt-6 mb-0">
            <CardTitle>{transfer.destination_name} Settings</CardTitle>
          </CardHeader>
          <SectionCard className="mt-1">
            <TransferSettingsForm
              transferId={transfer.dataset_release_transfer_id}
              destinationAbbr={transfer.destination_abbr}
              destinationName={transfer.destination_name}
            />
          </SectionCard>
        </>
      )}
    </PageShell>
  );
}
