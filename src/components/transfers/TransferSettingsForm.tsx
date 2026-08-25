import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import {
  IDC_MANIFEST_TYPES,
  SETTINGS_ENDPOINT,
  emptyTransferSettings,
  hasManifest,
  manifestDownloadUrl,
  settingsToValues,
  useGenerateIdcManifest,
  useSaveTransferSettings,
  useTransferSettings,
  type IdcManifestType,
  type TransferSettingsValues,
} from "@/lib/transferSettings";

const LABEL = "mb-1 block text-xs font-semibold uppercase tracking-wide";

/** Destination settings for one transfer, plus IDC's dataset-level manifests.
 *  Self-contained on `transferId` — shared by the cycle's Manage modal and
 *  `transfers/Detail.tsx` so the two surfaces can't drift. */
export default function TransferSettingsForm({
  transferId,
  destinationAbbr,
  destinationName,
}: {
  transferId: number;
  destinationAbbr: string;
  destinationName: string;
}) {
  const { addToast } = useToast();
  const settings = useTransferSettings(transferId, destinationAbbr);
  const save = useSaveTransferSettings(transferId, destinationAbbr);
  const generate = useGenerateIdcManifest(transferId);

  const [values, setValues] = useState<TransferSettingsValues>(emptyTransferSettings);

  // Seed the form once the row arrives (and after a save replaces it).
  useEffect(() => {
    if (settings.data !== undefined) setValues(settingsToValues(settings.data));
  }, [settings.data]);

  if (!SETTINGS_ENDPOINT[destinationAbbr]) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {destinationName} has no destination-specific settings.
      </p>
    );
  }

  if (settings.isLoading) return <LoadingState />;
  if (settings.isError) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        Could not load {destinationName} settings.
      </p>
    );
  }

  function set<K extends keyof TransferSettingsValues>(
    key: K,
    value: TransferSettingsValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSave(e: { preventDefault: () => void }) {
    e.preventDefault();
    save.mutate(values, {
      onSuccess: () => toastSuccess(addToast, "Settings saved."),
      onError: (err) =>
        toastError(
          addToast,
          err instanceof Error ? err.message : "Could not save settings.",
        ),
    });
  }

  function runGenerate(type: IdcManifestType) {
    generate.mutate(type, {
      onSuccess: () => toastSuccess(addToast, `${type} manifest generated.`),
      // The imaging generator's 422 carries how many files are unindexed --
      // pass it through rather than flattening it to "could not generate".
      onError: (err) =>
        toastError(
          addToast,
          err instanceof Error ? err.message : "Could not generate manifest.",
        ),
    });
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {destinationAbbr === "idc" && (
        <label className="block">
          <span className={LABEL} style={{ color: "var(--muted)" }}>
            GCS URL
          </span>
          <input
            type="text"
            value={values.base_gcs_url}
            onChange={(e) => set("base_gcs_url", e.target.value)}
            className="input mt-1 w-full"
            placeholder="gs://bucket/path"
          />
        </label>
      )}

      {destinationAbbr === "asp" && (
        <label className="block">
          <span className={LABEL} style={{ color: "var(--muted)" }}>
            Faspex URL
          </span>
          <input
            type="text"
            value={values.faspex_url}
            onChange={(e) => set("faspex_url", e.target.value)}
            className="input mt-1 w-full"
            placeholder="https://faspex.example.com/..."
          />
        </label>
      )}

      {destinationAbbr === "nbia" && (
        <>
          <label className="block">
            <span className={LABEL} style={{ color: "var(--muted)" }}>
              Collection
            </span>
            <input
              type="text"
              value={values.collection}
              onChange={(e) => set("collection", e.target.value)}
              className="input mt-1 w-full"
            />
          </label>
          <label className="block">
            <span className={LABEL} style={{ color: "var(--muted)" }}>
              Site
            </span>
            <input
              type="text"
              value={values.site}
              onChange={(e) => set("site", e.target.value)}
              className="input mt-1 w-full"
            />
          </label>
        </>
      )}

      {destinationAbbr === "wp" && (
        <label className="block">
          <span className={LABEL} style={{ color: "var(--muted)" }}>
            Media File ID
          </span>
          <input
            type="number"
            value={values.wp_media_file_id}
            onChange={(e) => set("wp_media_file_id", e.target.value)}
            className="input mt-1 w-full"
          />
        </label>
      )}

      {destinationAbbr === "idc" && (
        <div>
          <span className={LABEL} style={{ color: "var(--muted)" }}>
            IDC Manifests
          </span>
          <p className="mb-1 text-xs" style={{ color: "var(--muted)" }}>
            One set per transfer, covering the whole submission — not per
            recordset.
          </p>
          <ul
            className="divide-y text-sm"
            style={{ borderColor: "var(--border-strong)" }}
          >
            {IDC_MANIFEST_TYPES.map((type) => {
              const url = manifestDownloadUrl(settings.data, type);
              const generated = hasManifest(settings.data, type);
              const busy = generate.isPending && generate.variables === type;
              return (
                <li
                  key={type}
                  className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
                >
                  <span className="capitalize">{type}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={busy}
                      onClick={() => runGenerate(type)}
                    >
                      {generated ? "Replace" : "Generate"}
                    </Button>
                    {url && (
                      <a className="btn btn-sm btn-ghost" href={url} download>
                        Download
                      </a>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.published}
          onChange={(e) => set("published", e.target.checked)}
          className="checkbox"
        />
        <span>Published</span>
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.public}
          onChange={(e) => set("public", e.target.checked)}
          className="checkbox"
        />
        <span>Public</span>
      </label>

      <div>
        <Button type="submit" loading={save.isPending}>
          Save Settings
        </Button>
      </div>
    </form>
  );
}
