import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DynamicSection, {
  DynamicSectionField,
} from "@/components/DynamicSection";
import ManageFilesModal, { type ManageTab } from "@/components/ManageFilesModal";
import { useDraftSummary } from "@/components/DraftSummary";
import { Button } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { extractApiError } from "@/lib/apiUtils";
import { useUsers } from "@/lib/useUsers";
import { useRecordset } from "@/lib/recordsetForm";
import { useSetDraftStatus } from "@/lib/useCycle";
import { useWpMap } from "@/lib/wpObjectMap";
import { useQcReviews } from "@/lib/useQc";
import QcReviewsCard from "@/components/QcReviewsCard";
import { LoadingState } from "@/components/ui/Spinner";

type Draft = {
  recordset_draft_id: number;
  recordset_id: number;
  cloned_from_release_id: number | null;
  draft_name: string;
  draft_status: string;
  draft_notes: string;
  when_created?: string;
  who_created?: number;
  when_updated?: string;
  who_updated?: number;
};

type DraftResponse = {
  draft?: Draft;
  data?: Draft;
  timestamp: string;
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
  const userMap = useUsers();
  const { addToast } = useToast();
  const { draft_id: draftId } = useParams<{ draft_id: string }>();

  const [data, setData] = useState<DraftResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The draft record is a hand-rolled fetch, so `ManageFilesModal`'s react-query
  // invalidation can't reach it -- bump this to refetch instead. (The file
  // summary below is on the shared `useDraftSummary` query, which the modal
  // does invalidate.)
  const [manageTab, setManageTab] = useState<ManageTab | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

      try {
        const draftRes = await fetch(
          `/papi/v1/distribution/recordsets/drafts/${draftId}`,
          { cache: "no-store" },
        );

        if (!isMounted) return;

        if (!draftRes.ok) {
          const fallbackMessage = `Could not load draft ${draftId}.`;
          const json = (await draftRes.json()) as unknown;
          throw new Error(extractApiError(json, fallbackMessage));
        }

        const json = (await draftRes.json()) as DraftResponse;
        if (isMounted) setData({ ...json, draft: json.draft ?? json.data });
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
  }, [draftId, refreshKey]);

  async function handlePublish() {
    if (!draftId || !releaseNumber.trim() || !releaseDate) return;

    setIsPublishing(true);
    setPublishError(null);

    try {
      const res = await fetch(`/papi/v1/distribution/recordsets/drafts/${draftId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          release_number: releaseNumber.trim(),
          release_date: releaseDate,
          release_notes: releaseNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const json = (await res.json()) as unknown;
        throw new Error(extractApiError(json, "Could not publish draft."));
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

  // QC gate: publishing requires at least one complete review and none open/stale.
  const qcReviews = useQcReviews(draftId);
  const qcBlockingCount = (qcReviews.data ?? []).filter(
    (r) => r.review_status === "open" || r.review_status === "stale",
  ).length;
  const qcCompleteCount = (qcReviews.data ?? []).filter(
    (r) => r.review_status === "complete",
  ).length;
  const canPublish = qcBlockingCount === 0 && qcCompleteCount > 0;
  const publishBlockedReason =
    qcBlockingCount > 0
      ? `QC must be complete before publishing (${qcBlockingCount} review${qcBlockingCount === 1 ? "" : "s"} open or stale)`
      : qcCompleteCount === 0
        ? "Publishing requires a completed QC review"
        : undefined;

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

  const {
    data: summary,
    isLoading: isLoadingSummary,
    isError: isSummaryError,
  } = useDraftSummary(Number(draftId), Boolean(draftId));
  const hasDicom = (summary?.dicom.series_count ?? 0) > 0;

  // `ManageFilesModal` needs the parent recordset's dataset + name, and whether
  // the recordset is WP-linked (gates the modal's WordPress file source).
  const { data: recordset } = useRecordset(
    draft?.recordset_id != null ? String(draft.recordset_id) : undefined,
  );
  const { data: wpMap } = useWpMap("recordset", draft?.recordset_id);
  const datasetId = recordset ? String(recordset.dataset_id) : undefined;

  const setStatus = useSetDraftStatus(datasetId);
  const isReady = draft?.draft_status === "ready";

  function setDraftStatus(status: "ready" | "open") {
    if (draft == null) return;
    setStatus.mutate(
      { draftId: draft.recordset_draft_id, status },
      {
        onSuccess: () => {
          setRefreshKey((k) => k + 1);
          toastSuccess(addToast, status === "ready" ? "Draft marked ready." : "Draft reopened.");
        },
        onError: (e) =>
          toastError(addToast, e instanceof Error ? e.message : "Could not update the draft status."),
      },
    );
  }

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title="Draft Details"
        breadcrumbs={
          draft?.recordset_id
            ? [
                { label: "Recordsets", href: "/recordsets" },
                {
                  label: `Recordset ${draft.recordset_id}`,
                  href: `/recordsets/${draft.recordset_id}`,
                },
              ]
            : [{ label: "Recordsets", href: "/recordsets" }]
        }
        subtitle={draft?.draft_name}
        badge={draft ? {
          label: draft.draft_status === "published" ? "Published" : draft.draft_status === "deleted" ? "Deleted" : "Draft",
          variant: draft.draft_status === "published" ? "success" : draft.draft_status === "deleted" ? "danger" : "neutral",
        } : undefined}
        actions={
          <>
            {!!draft && draft.draft_status !== "published" && draft.draft_status !== "deleted" && (
              <Button
                onClick={() => setShowPublish(true)}
                disabled={!canPublish}
                title={publishBlockedReason}
              >
                Publish Draft
              </Button>
            )}
            {!!draft && draft.draft_status !== "published" && draft.draft_status !== "deleted" && (
              <Button
                variant={isReady ? "ghost" : undefined}
                onClick={() => setDraftStatus(isReady ? "open" : "ready")}
                disabled={!isReady && (summary?.total_files ?? 0) === 0}
                title={
                  isReady || (summary?.total_files ?? 0) > 0
                    ? undefined
                    : "Add files before marking ready"
                }
                loading={setStatus.isPending}
              >
                {isReady ? "Reopen" : "Mark Ready"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setManageTab("add")}>
              Manage
            </Button>
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
                loading={isPublishing}
                disabled={!releaseNumber.trim() || !releaseDate}
              >
                Publish
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
          <div className="metadata-panel">
            <p><strong>Created:</strong>{" "}{draft?.when_created ? new Date(draft.when_created).toLocaleString() : "—"} by {draft?.who_created != null ? (userMap.get(draft.who_created) ?? "—") : "—"}</p>
            <p><strong>Updated:</strong>{" "}{draft?.when_updated ? new Date(draft.when_updated).toLocaleString() : "—"} by {draft?.who_updated != null ? (userMap.get(draft.who_updated) ?? "—") : "—"}</p>
          </div>          
        }
      />

      <CardHeader className="mt-6 mb-0">
        <CardTitle>File Summary</CardTitle>
      </CardHeader>
      <SectionCard className="mt-1">

        {isLoadingSummary && <LoadingState />}

        {!isLoadingSummary && isSummaryError && (
          <p className="text-sm text-red-600 dark:text-red-300">
            Could not load file summary.
          </p>
        )}

        {!isLoadingSummary && !isSummaryError && summary && (
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

      {draft && <QcReviewsCard draftId={draftId} />}

      <ManageFilesModal
        open={manageTab !== null}
        onClose={() => {
          setManageTab(null);
          setRefreshKey((k) => k + 1);
        }}
        datasetId={datasetId}
        draftId={draft?.recordset_draft_id ?? null}
        recordsetName={recordset?.recordset_name ?? ""}
        wpLinked={Boolean(wpMap)}
        initialTab={manageTab ?? "add"}
      />
    </PageShell>
  );
}
