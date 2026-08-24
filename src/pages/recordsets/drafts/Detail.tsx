import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ManageFilesModal, { type ManageTab } from "@/components/ManageFilesModal";
import PublishDraftModal from "@/components/PublishDraftModal";
import DraftSummary, { useDraftSummary } from "@/components/DraftSummary";
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

  const metadataStrip = draft
    ? [
        `#${draft.recordset_draft_id}`,
        draft.cloned_from_release_id != null
          ? `cloned from release ${draft.cloned_from_release_id}`
          : null,
        draft.when_updated
          ? `updated ${new Date(draft.when_updated).toLocaleDateString()}`
          : null,
        draft.who_updated != null ? `by ${userMap.get(draft.who_updated) ?? "—"}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  // Only for Mark Ready's "has files" gate -- `DraftSummary` below renders from
  // this same cached query, so this costs no extra request.
  const { data: summary } = useDraftSummary(Number(draftId), Boolean(draftId));

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
        title={draft?.draft_name ?? "Draft Details"}
        breadcrumbs={
          draft?.recordset_id
            ? [
                { label: "Datasets", href: "/datasets" },
                ...(recordset?.dataset_id != null
                  ? [
                      {
                        label:
                          recordset.dataset_name ?? `Dataset ${recordset.dataset_id}`,
                        href: `/datasets/${recordset.dataset_id}`,
                      },
                    ]
                  : []),
                {
                  label:
                    recordset?.recordset_name ?? `Recordset ${draft.recordset_id}`,
                  href: `/recordsets/${draft.recordset_id}`,
                },
              ]
            : [{ label: "Datasets", href: "/datasets" }]
        }
        subtitle={metadataStrip}
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

      {isLoading && <LoadingState />}

      {!isLoading && error && (
        <SectionCard className="mt-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </SectionCard>
      )}

      {!isLoading && !error && draft && (
        <SectionCard className="mt-4">
          {draft.draft_notes && (
            <>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <p className="whitespace-pre-wrap text-sm">{draft.draft_notes}</p>
            </>
          )}

          <CardHeader className={draft.draft_notes ? "mt-6" : undefined}>
            <CardTitle>File Summary</CardTitle>
          </CardHeader>
          <div>
            <DraftSummary draftId={draft.recordset_draft_id} />
          </div>

          <QcReviewsCard draftId={draftId} datasetId={datasetId} />
        </SectionCard>
      )}

      <PublishDraftModal
        open={showPublish}
        onClose={() => setShowPublish(false)}
        draftId={draft?.recordset_draft_id}
        datasetId={datasetId}
        draftName={draft?.draft_name}
        onPublished={() =>
          navigate(
            draft?.recordset_id ? `/recordsets/${draft.recordset_id}` : "/recordsets",
          )
        }
      />

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
