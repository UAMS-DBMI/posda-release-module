import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DynamicSection, { DynamicSectionField } from "@/components/DynamicSection";
import { Button } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { papiDownloadUrl, papiUrl } from "@/lib/papi";

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

type DestSettings = {
  dataset_release_transfer_id: number;
  published: boolean | null;
  public: boolean | null;
  gcs_url?: string | null;
  dataset_manifest_file_id?: number | null;
  dataset_manifest_downloadable_file_id?: number | null;
  dataset_manifest_security_hash?: string | null;
  recordset_manifest_file_id?: number | null;
  recordset_manifest_downloadable_file_id?: number | null;
  recordset_manifest_security_hash?: string | null;
  clinical_manifest_file_id?: number | null;
  clinical_manifest_downloadable_file_id?: number | null;
  clinical_manifest_security_hash?: string | null;
  faspex_url?: string | null;
  collection?: string | null;
  site?: string | null;
  wp_media_file_id?: number | null;
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

const SETTINGS_ENDPOINT: Record<string, string> = {
  idc: "idc",
  gc: "gc",
  wp: "wp",
  asp: "aspera",
  nbia: "nbia",
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

  const [destSettings, setDestSettings] = useState<DestSettings | null | undefined>(undefined);
  const [settingsPublished, setSettingsPublished] = useState(false);
  const [settingsPublic, setSettingsPublic] = useState(false);
  const [settingsGcsUrl, setSettingsGcsUrl] = useState("");
  const [settingsFaspexUrl, setSettingsFaspexUrl] = useState("");
  const [settingsCollection, setSettingsCollection] = useState("");
  const [settingsSite, setSettingsSite] = useState("");
  const [settingsWpMediaFileId, setSettingsWpMediaFileId] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);
  const [generatingIdcManifest, setGeneratingIdcManifest] = useState<"dataset" | "recordset" | "clinical" | null>(null);

  function populateSettingsFields(data: DestSettings) {
    setSettingsPublished(data.published ?? false);
    setSettingsPublic(data.public ?? false);
    setSettingsGcsUrl(data.gcs_url ?? "");
    setSettingsFaspexUrl(data.faspex_url ?? "");
    setSettingsCollection(data.collection ?? "");
    setSettingsSite(data.site ?? "");
    setSettingsWpMediaFileId(data.wp_media_file_id != null ? String(data.wp_media_file_id) : "");
  }

  useEffect(() => {
    if (!transferId) return;
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const [transferRes, recordsetsRes] = await Promise.all([
          fetch(papiUrl(`transfers/${transferId}`), { cache: "no-store" }),
          fetch(papiUrl(`transfers/${transferId}/recordsets`), { cache: "no-store" }),
        ]);

        if (!isMounted) return;

        if (!transferRes.ok) {
          const json = (await transferRes.json()) as { error?: { message?: string } | string };
          const msg =
            typeof json.error === "string"
              ? json.error
              : (json.error?.message ?? `Could not load transfer ${transferId}.`);
          throw new Error(msg);
        }

        const transferJson = (await transferRes.json()) as { data: Transfer };
        const loadedTransfer = transferJson.data;
        if (isMounted) setTransfer(loadedTransfer);

        if (recordsetsRes.ok) {
          const rsJson = (await recordsetsRes.json()) as { data: RecordsetRelease[] };
          if (isMounted) setRecordsets(rsJson.data ?? []);
        }

        const settingsPath = SETTINGS_ENDPOINT[loadedTransfer.destination_abbr];
        if (settingsPath) {
          const settingsRes = await fetch(papiUrl(`transfers/${transferId}/${settingsPath}`), { cache: "no-store" });
          if (!isMounted) return;
          if (settingsRes.ok) {
            const settingsJson = (await settingsRes.json()) as { data: DestSettings | null };
            if (isMounted) {
              setDestSettings(settingsJson.data);
              if (settingsJson.data) populateSettingsFields(settingsJson.data);
            }
          } else {
            if (isMounted) setDestSettings(null);
          }
        } else {
          if (isMounted) setDestSettings(null);
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
        papiUrl(`transfers/${transferId}/recordsets/${r.recordset_release_id}/manifest/generate`),
        { method: "POST" },
      );
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } | string };
        const msg =
          typeof json.error === "string"
            ? json.error
            : (json.error?.message ?? "Could not generate manifest.");
        throw new Error(msg);
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
      const res = await fetch(papiUrl(`transfers/${transferId}`), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transfer_status: "queued" }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } | string };
        const msg =
          typeof json.error === "string"
            ? json.error
            : (json.error?.message ?? "Could not queue transfer.");
        throw new Error(msg);
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

  async function generateIdcManifest(type: "dataset" | "recordset" | "clinical") {
    if (!transferId) return;
    setGeneratingIdcManifest(type);
    try {
      const res = await fetch(papiUrl(`transfers/${transferId}/idc/${type}-manifest/generate`), { method: "POST" });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } | string };
        const msg = typeof json.error === "string" ? json.error : (json.error?.message ?? "Could not generate manifest.");
        throw new Error(msg);
      }
      const json = (await res.json()) as {
        data: { file_id: number; downloadable_file_id: number; security_hash: string };
      };
      setDestSettings((prev) =>
        prev
          ? {
              ...prev,
              [`${type}_manifest_file_id`]:               json.data.file_id,
              [`${type}_manifest_downloadable_file_id`]:  json.data.downloadable_file_id,
              [`${type}_manifest_security_hash`]:         json.data.security_hash,
            }
          : prev
      );
      toastSuccess(addToast, `${type.charAt(0).toUpperCase() + type.slice(1)} manifest generated.`);
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not generate manifest.");
    } finally {
      setGeneratingIdcManifest(null);
    }
  }

  async function saveSettings(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!transferId || !transfer) return;

    const settingsPath = SETTINGS_ENDPOINT[transfer.destination_abbr];
    if (!settingsPath) return;

    setIsSavingSettings(true);
    setSettingsSaveError(null);

    let payload: Record<string, unknown>;
    const abbr = transfer.destination_abbr;

    if (abbr === "idc") {
      payload = {
        gcs_url: settingsGcsUrl.trim() || null,
        published: settingsPublished,
        public: settingsPublic,
      };
    } else if (abbr === "asp") {
      payload = {
        faspex_url: settingsFaspexUrl.trim() || null,
        published: settingsPublished,
        public: settingsPublic,
      };
    } else if (abbr === "nbia") {
      payload = {
        collection: settingsCollection.trim() || null,
        site: settingsSite.trim() || null,
        published: settingsPublished,
        public: settingsPublic,
      };
    } else if (abbr === "wp") {
      payload = {
        wp_media_file_id: settingsWpMediaFileId.trim() ? parseInt(settingsWpMediaFileId, 10) : null,
        published: settingsPublished,
        public: settingsPublic,
      };
    } else {
      payload = { published: settingsPublished, public: settingsPublic };
    }

    try {
      const res = await fetch(papiUrl(`transfers/${transferId}/${settingsPath}`), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } | string };
        const msg =
          typeof json.error === "string"
            ? json.error
            : (json.error?.message ?? "Could not save settings.");
        throw new Error(msg);
      }
      const json = (await res.json()) as { data: DestSettings };
      setDestSettings(json.data);
      toastSuccess(addToast, "Settings saved.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save settings.";
      setSettingsSaveError(msg);
      toastError(addToast, msg);
    } finally {
      setIsSavingSettings(false);
    }
  }

  const transferFields: DynamicSectionField[] = transfer
    ? [
        { label: "Transfer ID", value: transfer.dataset_release_transfer_id },
        { label: "Dataset Release ID", value: transfer.dataset_release_id },
        { label: "Destination", value: transfer.destination_name },
        { label: "Transfer Mode", value: transfer.transfer_mode_name },
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

  const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide";
  const abbr = transfer?.destination_abbr;

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title="Transfer Details"
        breadcrumb={{
          label: "Transfers",
          href: transfer?.dataset_release_id
            ? `/datasets/releases/${transfer.dataset_release_id}/transfers`
            : "/transfers",
        }}
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
          <div className="space-y-1 rounded-md px-3 py-2 text-xs" style={{ background: "var(--surface-alt)", border: "1px solid var(--border-strong)", color: "var(--muted)" }}>
            <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Created:</span>{" "}{transfer ? new Date(transfer.when_created).toLocaleString() : "—"}</p>
            <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Updated:</span>{" "}{transfer ? new Date(transfer.when_updated).toLocaleString() : "—"}</p>
          </div>
        }
      />

      <CardHeader className="mt-6 mb-0">
        <CardTitle>Recordset Releases</CardTitle>
      </CardHeader>
      <SectionCard className="mt-1">
        {isLoading && <p className="text-sm">Loading...</p>}
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
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => void generateManifest(r)}
                        disabled={isGenerating}
                      >
                        {isGenerating ? "Generating…" : hasManifest ? "Replace" : "Generate"}
                      </button>
                      {hasManifest && r.downloadable_file_id && r.security_hash && (
                        <a
                          className="btn btn-sm btn-ghost"
                          href={papiDownloadUrl(`file/${r.downloadable_file_id}/${r.security_hash}`)}
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

      {destSettings !== undefined && transfer && abbr && SETTINGS_ENDPOINT[abbr] && (
        <>
          <CardHeader className="mt-6 mb-0">
            <CardTitle>{transfer.destination_name} Settings</CardTitle>
          </CardHeader>
          <SectionCard className="mt-1">
            <form onSubmit={(e) => void saveSettings(e)}>
              <div className="space-y-4">

                {abbr === "idc" && (
                  <>
                    <label className="block">
                      <span className={labelClass} style={{ color: "var(--muted)" }}>GCS URL</span>
                      <input
                        type="text"
                        value={settingsGcsUrl}
                        onChange={(e) => setSettingsGcsUrl(e.target.value)}
                        className="mt-1 input w-full"
                        placeholder="gs://bucket/path"
                      />
                    </label>

                    <div>
                      <span className={labelClass} style={{ color: "var(--muted)" }}>IDC Manifests</span>
                      <ul className="mt-1 divide-y text-sm" style={{ borderColor: "var(--border-strong)" }}>
                        {(["dataset", "recordset", "clinical"] as const).map((type) => {
                          const fileIdKey  = `${type}_manifest_file_id`                as keyof DestSettings;
                          const dfIdKey    = `${type}_manifest_downloadable_file_id`   as keyof DestSettings;
                          const hashKey    = `${type}_manifest_security_hash`          as keyof DestSettings;
                          const hasFile    = destSettings?.[fileIdKey] != null;
                          const dfId       = destSettings?.[dfIdKey];
                          const hash       = destSettings?.[hashKey];
                          const isGenerating = generatingIdcManifest === type;
                          return (
                            <li key={type} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                              <span className="capitalize">{type}</span>
                              <span className="flex shrink-0 items-center gap-2">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost"
                                  onClick={() => void generateIdcManifest(type)}
                                  disabled={isGenerating}
                                >
                                  {isGenerating ? "Generating…" : hasFile ? "Replace" : "Generate"}
                                </button>
                                {hasFile && dfId && hash && (
                                  <a
                                    className="btn btn-sm btn-ghost"
                                    href={papiDownloadUrl(`file/${String(dfId)}/${String(hash)}`)}
                                    download
                                  >
                                    Download
                                  </a>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </>
                )}

                {abbr === "asp" && (
                  <label className="block">
                    <span className={labelClass} style={{ color: "var(--muted)" }}>Faspex URL</span>
                    <input
                      type="text"
                      value={settingsFaspexUrl}
                      onChange={(e) => setSettingsFaspexUrl(e.target.value)}
                      className="mt-1 input w-full"
                      placeholder="https://faspex.example.com/..."
                    />
                  </label>
                )}

                {abbr === "nbia" && (
                  <>
                    <label className="block">
                      <span className={labelClass} style={{ color: "var(--muted)" }}>Collection</span>
                      <input
                        type="text"
                        value={settingsCollection}
                        onChange={(e) => setSettingsCollection(e.target.value)}
                        className="mt-1 input w-full"
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass} style={{ color: "var(--muted)" }}>Site</span>
                      <input
                        type="text"
                        value={settingsSite}
                        onChange={(e) => setSettingsSite(e.target.value)}
                        className="mt-1 input w-full"
                      />
                    </label>
                  </>
                )}

                {abbr === "wp" && (
                  <label className="block">
                    <span className={labelClass} style={{ color: "var(--muted)" }}>Media File ID</span>
                    <input
                      type="number"
                      value={settingsWpMediaFileId}
                      onChange={(e) => setSettingsWpMediaFileId(e.target.value)}
                      className="mt-1 input w-full"
                    />
                  </label>
                )}

                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settingsPublished}
                    onChange={(e) => setSettingsPublished(e.target.checked)}
                    className="checkbox"
                  />
                  <span>Published</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settingsPublic}
                    onChange={(e) => setSettingsPublic(e.target.checked)}
                    className="checkbox"
                  />
                  <span>Public</span>
                </label>

                {settingsSaveError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{settingsSaveError}</p>
                )}

                <div>
                  <Button type="submit" disabled={isSavingSettings}>
                    {isSavingSettings ? "Saving..." : "Save Settings"}
                  </Button>
                </div>
              </div>
            </form>
          </SectionCard>
        </>
      )}
    </PageShell>
  );
}
