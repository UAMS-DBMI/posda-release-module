import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DynamicSection, {
  DynamicSectionField,
} from "@/components/DynamicSection";
import { Button, LinkButton } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { useToast } from "@/components/Toast";
import { toastSuccess } from "@/components/toastHelpers";
import { papiUrl } from "@/lib/papi";

type Draft = {
  recordset_draft_id: number;
  recordset_id: number;
  cloned_from_release_id: number | null;
  draft_name: string;
  draft_status: string;
  draft_notes: string;
  when_created?: string;
  who_created?: string;
  when_updated?: string;
  who_updated?: string;
};

type DraftResponse = {
  draft?: Draft;
  data?: Draft;
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

export default function RecordsetDraftDetail() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { draft_id: draftId } = useParams<{ draft_id: string }>();

  const [data, setData] = useState<DraftResponse | null>(null);
  const [summary, setSummary] = useState<DraftSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [showPublish, setShowPublish] = useState(false);
  const [releaseNumber, setReleaseNumber] = useState("");
  const [releaseDate, setReleaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [releaseNotes, setReleaseNotes] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    if (!draftId) return;
    let isMounted = true;

    async function loadDraft() {
      setIsLoading(true);
      setError(null);
      setSummaryError(null);

      try {
        const [draftRes, summaryRes] = await Promise.all([
          fetch(papiUrl(`recordsets/drafts/${draftId}`), { cache: "no-store" }),
          fetch(papiUrl(`recordsets/drafts/${draftId}/summary`), { cache: "no-store" }),
        ]);

        if (!isMounted) return;

        if (!draftRes.ok) {
          const fallbackMessage = `Could not load draft ${draftId}.`;
          try {
            const json = (await draftRes.json()) as { error?: string };
            throw new Error(json.error ?? fallbackMessage);
          } catch {
            throw new Error(fallbackMessage);
          }
        }

        const json = (await draftRes.json()) as DraftResponse;
        if (isMounted) setData({ ...json, draft: json.draft ?? json.data });

        if (summaryRes.ok) {
          const summaryJson = (await summaryRes.json()) as { data: DraftSummary };
          if (isMounted) setSummary(summaryJson.data);
        } else {
          if (isMounted) setSummaryError("Could not load file summary.");
        }
      } catch (caughtError) {
        if (!isMounted) return;
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : `Could not load draft ${draftId}.`,
        );
        setData(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadDraft();
    return () => {
      isMounted = false;
    };
  }, [draftId]);

  async function handlePublish() {
    if (!draftId || !releaseNumber.trim() || !releaseDate) return;

    setIsPublishing(true);
    setPublishError(null);

    try {
      const res = await fetch(papiUrl(`recordsets/drafts/${draftId}/publish`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          release_number: releaseNumber.trim(),
          release_date: releaseDate,
          release_notes: releaseNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? "Could not publish draft.");
      }

      toastSuccess(addToast, `Draft published as release ${releaseNumber.trim()}.`);
      navigate(draft?.recordset_id ? `/recordsets/${draft.recordset_id}` : "/recordsets");
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Could not publish draft.");
    } finally {
      setIsPublishing(false);
    }
  }

  const draft = data?.draft ?? data?.data ?? null;

  const draftFields: DynamicSectionField[] = draft
    ? [
        { label: "Draft ID", value: draft.recordset_draft_id },
        { label: "Recordset ID", value: draft.recordset_id },
        { label: "Draft Name", value: draft.draft_name },
        { label: "Draft Status", value: draft.draft_status },
        {
          label: "Cloned From Release ID",
          value: draft.cloned_from_release_id ?? "N/A",
        },
        ...(draft.draft_notes
          ? [
              {
                label: "Notes",
                value: draft.draft_notes,
                fullWidth: true,
                valueClassName: "mt-1 whitespace-pre-wrap text-xs",
              },
            ]
          : []),
      ]
    : [];

  const hasDicom = (summary?.dicom.series_count ?? 0) > 0;

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title="Draft Details"
        breadcrumb={{ label: "Recordset", href: draft?.recordset_id ? `/recordsets/${draft.recordset_id}` : "/recordsets" }}
        subtitle={draft?.draft_name}
        badge={draft ? {
          label: draft.draft_status === "published" ? "Published" : draft.draft_status === "deleted" ? "Deleted" : "Draft",
          variant: draft.draft_status === "published" ? "success" : draft.draft_status === "deleted" ? "danger" : "neutral",
        } : undefined}
        actions={
          <>
            {!!draft && draft.draft_status !== "published" && draft.draft_status !== "deleted" && (
              <Button onClick={() => setShowPublish(true)}>Publish Draft</Button>
            )}
            <LinkButton href={draftId ? `/recordsets/drafts/${draftId}/edit` : "/recordsets"}>
              Edit Draft
            </LinkButton>
          </>
        }
      />

      {showPublish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg p-6 shadow-xl" style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}>
            <h2 className="text-lg font-semibold">Publish Draft</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              This will create an immutable release from the current draft files.
            </p>

            {publishError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{publishError}</p>
            )}

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium">Release Number</label>
                <input
                  type="text"
                  value={releaseNumber}
                  onChange={(e) => setReleaseNumber(e.target.value)}
                  placeholder="e.g. 1.0.0"
                  className="input mt-1 w-full"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Release Date</label>
                <input
                  type="date"
                  value={releaseDate}
                  onChange={(e) => setReleaseDate(e.target.value)}
                  className="input mt-1 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">
                  Release Notes{" "}
                  <span className="font-normal text-neutral-500">(optional)</span>
                </label>
                <textarea
                  value={releaseNotes}
                  onChange={(e) => setReleaseNotes(e.target.value)}
                  rows={3}
                  className="input mt-1 w-full"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => { setShowPublish(false); setPublishError(null); }}
                disabled={isPublishing}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handlePublish()}
                disabled={isPublishing || !releaseNumber.trim() || !releaseDate}
              >
                {isPublishing ? "Publishing..." : "Publish"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <DynamicSection
        isLoading={isLoading}
        error={error}
        fields={draftFields}
        actions={
          <div className="space-y-1 rounded-md px-3 py-2 text-xs" style={{ background: "var(--surface-alt)", border: "1px solid var(--border-strong)", color: "var(--muted)" }}>
            <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Created:</span>{" "}{draft?.when_created ? new Date(draft.when_created).toLocaleString() : "—"} by {draft?.who_created ?? "—"}</p>
            <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Updated:</span>{" "}{draft?.when_updated ? new Date(draft.when_updated).toLocaleString() : "—"} by {draft?.who_updated ?? "—"}</p>
          </div>
        }
      />

      <CardHeader className="mt-6 mb-0">
        <CardTitle>File Summary</CardTitle>
        <LinkButton
          href={draftId ? `/recordsets/drafts/${draftId}/files` : "#"}
          size="sm"
        >
          Edit Files
        </LinkButton>
      </CardHeader>
      <SectionCard className="mt-1">

        {isLoading && <p className="text-sm">Loading...</p>}

        {!isLoading && summaryError && (
          <p className="text-sm text-red-600 dark:text-red-300">{summaryError}</p>
        )}

        {!isLoading && !summaryError && summary && (
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
        )}
      </SectionCard>
    </PageShell>
  );
}
