import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type ItemEnvelope } from "@/lib/apiFetch";

/**
 * Per-destination transfer settings (`transfer_idc` / `_gc` / `_aspera` /
 * `_nbia` / `_wp`) and IDC manifest generation. Shared by the cycle's Transfer
 * stage Manage modal and `transfers/Detail.tsx`, so the two can't drift.
 */

const BASE = "/papi/v1/distribution";

/** `destination_abbr` → its settings subresource. Note `asp` → `aspera`; the
 *  abbreviation and the route segment differ for that one. */
export const SETTINGS_ENDPOINT: Record<string, string> = {
  idc: "idc",
  gc: "gc",
  wp: "wp",
  asp: "aspera",
  nbia: "nbia",
};

export const IDC_MANIFEST_TYPES = ["dataset", "imaging", "clinical"] as const;
export type IdcManifestType = (typeof IDC_MANIFEST_TYPES)[number];

/** The union of every destination's settings row. Only the fields belonging to
 *  the transfer's own destination are ever populated. */
export type TransferSettings = {
  dataset_release_transfer_id: number;
  published: boolean | null;
  public: boolean | null;
  base_gcs_url?: string | null;
  dataset_manifest_file_id?: number | null;
  dataset_manifest_downloadable_file_id?: number | null;
  dataset_manifest_security_hash?: string | null;
  imaging_manifest_file_id?: number | null;
  imaging_manifest_downloadable_file_id?: number | null;
  imaging_manifest_security_hash?: string | null;
  clinical_manifest_file_id?: number | null;
  clinical_manifest_downloadable_file_id?: number | null;
  clinical_manifest_security_hash?: string | null;
  faspex_url?: string | null;
  collection?: string | null;
  site?: string | null;
  wp_media_file_id?: number | null;
  /** IDC only. Which manifests this transfer needs, derived from what it
   *  actually carries (dataset always; imaging when it has Radiology Images
   *  DICOM; clinical when it has non-DICOM files), and which are still
   *  ungenerated. The API refuses to queue while any are missing. */
  required_manifests?: IdcManifestType[];
  missing_manifests?: IdcManifestType[];
};

/** Form state. Kept as strings so the inputs stay controlled; converted on save. */
export type TransferSettingsValues = {
  published: boolean;
  public: boolean;
  base_gcs_url: string;
  faspex_url: string;
  collection: string;
  site: string;
  wp_media_file_id: string;
};

export const emptyTransferSettings: TransferSettingsValues = {
  published: false,
  public: false,
  base_gcs_url: "",
  faspex_url: "",
  collection: "",
  site: "",
  wp_media_file_id: "",
};

export function settingsToValues(
  s: TransferSettings | null | undefined,
): TransferSettingsValues {
  if (!s) return emptyTransferSettings;
  return {
    published: s.published ?? false,
    public: s.public ?? false,
    base_gcs_url: s.base_gcs_url ?? "",
    faspex_url: s.faspex_url ?? "",
    collection: s.collection ?? "",
    site: s.site ?? "",
    wp_media_file_id:
      s.wp_media_file_id != null ? String(s.wp_media_file_id) : "",
  };
}

/** Only the destination's own fields are sent — each settings table has its own
 *  Pydantic model, so posting a foreign field would 422. */
export function settingsPayload(
  destinationAbbr: string,
  v: TransferSettingsValues,
): Record<string, unknown> {
  const shared = { published: v.published, public: v.public };
  switch (destinationAbbr) {
    case "idc":
      return { ...shared, base_gcs_url: v.base_gcs_url.trim() || null };
    case "asp":
      return { ...shared, faspex_url: v.faspex_url.trim() || null };
    case "nbia":
      return {
        ...shared,
        collection: v.collection.trim() || null,
        site: v.site.trim() || null,
      };
    case "wp":
      return {
        ...shared,
        wp_media_file_id: v.wp_media_file_id.trim()
          ? Number.parseInt(v.wp_media_file_id, 10)
          : null,
      };
    default:
      return shared;
  }
}

export function transferSettingsKey(transferId: number | undefined) {
  return ["transfer-settings", transferId ?? 0] as const;
}

/** The transfer's destination settings. Resolves to `null` (not an error) when
 *  no settings row exists yet — the endpoint returns `{data: null}` with a 200. */
export function useTransferSettings(
  transferId: number | undefined,
  destinationAbbr: string | undefined,
  enabled = true,
) {
  const path = destinationAbbr ? SETTINGS_ENDPOINT[destinationAbbr] : undefined;
  return useQuery({
    queryKey: transferSettingsKey(transferId),
    enabled: enabled && transferId != null && path != null,
    queryFn: async () => {
      const json = await apiFetch<ItemEnvelope<TransferSettings | null>>(
        `${BASE}/transfers/${transferId}/${path}`,
      );
      return json.data;
    },
  });
}

export function useSaveTransferSettings(
  transferId: number | undefined,
  destinationAbbr: string | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: TransferSettingsValues) => {
      const path = destinationAbbr ? SETTINGS_ENDPOINT[destinationAbbr] : undefined;
      if (transferId == null || !path) throw new Error("Unknown destination.");
      const json = await apiFetch<ItemEnvelope<TransferSettings>>(
        `${BASE}/transfers/${transferId}/${path}`,
        {
          method: "PUT",
          body: JSON.stringify(settingsPayload(destinationAbbr!, values)),
        },
      );
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: transferSettingsKey(transferId),
      });
    },
  });
}

export type ManifestResult = {
  file_id: number;
  downloadable_file_id: number;
  security_hash: string;
};

/** Generate (or replace) one of IDC's three dataset-level manifests.
 *  ⚠ The imaging generator refuses with 422 `MANIFEST_INCOMPLETE` when any DICOM
 *  file is missing index data — the message carries the counts, so surface it
 *  rather than replacing it with a generic failure string. */
export function useGenerateIdcManifest(transferId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (type: IdcManifestType) => {
      const json = await apiFetch<ItemEnvelope<ManifestResult>>(
        `${BASE}/transfers/${transferId}/idc/${type}-manifest/generate`,
        { method: "POST" },
      );
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: transferSettingsKey(transferId),
      });
    },
  });
}

/** The download URL for a generated manifest, or null when it hasn't been
 *  generated yet. */
export function manifestDownloadUrl(
  settings: TransferSettings | null | undefined,
  type: IdcManifestType,
): string | null {
  if (!settings) return null;
  const dfId = settings[`${type}_manifest_downloadable_file_id`];
  const hash = settings[`${type}_manifest_security_hash`];
  if (dfId == null || hash == null) return null;
  return `/papi/v1/download/file/${String(dfId)}/${String(hash)}`;
}

export function hasManifest(
  settings: TransferSettings | null | undefined,
  type: IdcManifestType,
): boolean {
  return settings?.[`${type}_manifest_file_id`] != null;
}
