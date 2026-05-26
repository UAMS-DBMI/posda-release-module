import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DynamicSection, {
  DynamicSectionField,
} from "@/components/DynamicSection";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";

type RecordsetRelease = {
  recordset_release_id: number;
  recordset_id: number;
  release_number: number;
  release_date: string;
  release_notes: string;
  when_created: string;
  who_created: string;
  when_updated?: string;
  who_updated?: string;
};

type ReleaseResponse = {
  releaseType?: "dataset" | "recordset";
  release?: RecordsetRelease;
  data?: RecordsetRelease;
  timestamp: string;
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

type ReleaseSummary = {
  release_id: number;
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

export default function RecordsetReleaseDetail() {
  const { release_id: releaseId } = useParams<{ release_id: string }>();
  const [data, setData] = useState<ReleaseResponse | null>(null);
  const [summary, setSummary] = useState<ReleaseSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    if (!releaseId) return;
    let isMounted = true;

    async function loadRelease() {
      setIsLoading(true);
      setError(null);

      try {
        const [response, summaryRes] = await Promise.all([
          fetch(`/papi/v1/distribution/recordsets/releases/${releaseId}`, { cache: "no-store" }),
          fetch(`/papi/v1/distribution/recordsets/releases/${releaseId}/summary`, { cache: "no-store" }),
        ]);

        if (!response.ok) {
          const fallbackMessage = `Could not load release ${releaseId}.`;
          const message = await getApiErrorMessage(response, fallbackMessage);
          throw new Error(message);
        }

        const json = (await response.json()) as ReleaseResponse;

        if (!isMounted) {
          return;
        }

        setData({ ...json, release: json.release ?? json.data });

        if (summaryRes.ok) {
          const summaryJson = (await summaryRes.json()) as { data: ReleaseSummary };
          if (isMounted) setSummary(summaryJson.data);
        } else {
          if (isMounted) setSummaryError("Could not load file summary.");
        }
      } catch (caughtError) {
        if (!isMounted) {
          return;
        }

        if (caughtError instanceof Error) {
          setError(caughtError.message);
        } else {
          setError(`Could not load release ${releaseId}.`);
        }

        setData(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadRelease();

    return () => {
      isMounted = false;
    };
  }, [releaseId]);

  const release = data?.release ?? data?.data ?? null;
  const releaseFields: DynamicSectionField[] = release
    ? [
        { label: "Release ID", value: release.recordset_release_id },
        { label: "Recordset ID", value: release.recordset_id },
        { label: "Release Number", value: release.release_number },
        {
          label: "Release Date",
          value: new Date(release.release_date).toLocaleDateString(),
        },
        {
          label: "Release Notes",
          value: release.release_notes,
          fullWidth: true,
          valueClassName: "mt-1 whitespace-pre-wrap text-xs",
        },
      ]
    : [];

  const recordsetId = release?.recordset_id;

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title="Release Details"
        breadcrumb={{ label: "Recordset", href: recordsetId ? `/recordsets/${recordsetId}` : "/recordsets" }}
        subtitle={release ? `Release ${release.release_number}` : undefined}
      />

      <DynamicSection
        isLoading={isLoading}
        error={error}
        fields={releaseFields}
        actions={
          <div className="space-y-1 rounded-md px-3 py-2 text-xs" style={{ background: "var(--surface-alt)", border: "1px solid var(--border-strong)", color: "var(--muted)" }}>
            <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Created:</span>{" "}{release?.when_created ? new Date(release.when_created).toLocaleString() : "—"} by {release?.who_created ?? "—"}</p>
            <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Updated:</span>{" "}{release?.when_updated ? new Date(release.when_updated).toLocaleString() : "—"} by {release?.who_updated ?? "—"}</p>
          </div>
        }
      />

      <CardHeader className="mt-6 mb-0">
        <CardTitle>File Summary</CardTitle>
      </CardHeader>
      <SectionCard className="mt-1">

        {isLoading && <p className="text-sm">Loading...</p>}

        {!isLoading && summaryError && (
          <p className="text-sm text-red-600 dark:text-red-300">{summaryError}</p>
        )}

        {!isLoading && !summaryError && summary && (() => {
          const hasDicom = summary.dicom.series_count > 0;
          return (
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <div className="flex-1 rounded-md px-4 py-3" style={{ background: "var(--surface-alt)", borderLeft: "4px solid var(--accent)" }}>
                  <p className="text-2xl font-bold">{summary.total_files.toLocaleString()}</p>
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>Total Files</p>
                </div>
                <div className="flex-1 rounded-md px-4 py-3" style={{ background: "var(--surface-alt)", borderLeft: "4px solid var(--accent)" }}>
                  <p className="text-2xl font-bold">{formatBytes(summary.total_size_bytes)}</p>
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>Total Size</p>
                </div>
              </div>

              {summary.by_file_type.length > 0 && (
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
                        {summary.by_file_type.map((ft) => (
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
                          <td className="py-1.5">{summary.dicom.patient_count.toLocaleString()}</td>
                          <td className="py-1.5">{summary.dicom.study_count.toLocaleString()}</td>
                          <td className="py-1.5">{summary.dicom.series_count.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>

                    {summary.dicom.by_modality.length > 0 && (
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
                            {summary.dicom.by_modality.map((m) => (
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
          );
        })()}
      </SectionCard>
    </PageShell>
  );
}
