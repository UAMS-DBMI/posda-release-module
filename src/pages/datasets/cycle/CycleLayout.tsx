import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import CycleNextAction from "@/components/CycleNextAction";
import { LinkButton } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { LoadingState } from "@/components/ui/Spinner";
import Tabs, { type TabItem } from "@/components/ui/Tabs";
import {
  firstUnfinishedStage,
  stageSummaries,
  stagePath,
  STAGE_BLURBS,
  STAGE_LABELS,
  STAGE_ORDER,
  useDatasetCycle,
  type DatasetCycle,
  type StageKey,
} from "@/lib/useCycle";

/** Passed to each stage page through the router Outlet. */
export type CycleContext = {
  cycle: DatasetCycle;
  datasetId: string | undefined;
};

export function useCycleContext(): CycleContext {
  return useOutletContext<CycleContext>();
}

// Legacy `?stage=` values → new stage routes, so old links survive.
const LEGACY_STAGE: Record<string, StageKey> = {
  draft: "assemble",
  qc: "verify",
  release: "bundle",
  distribute: "transfer",
  // pass-throughs for the new names
  setup: "setup",
  assemble: "assemble",
  verify: "verify",
  bundle: "bundle",
  transfer: "transfer",
  disseminate: "disseminate",
};

function stageFromPath(pathname: string): StageKey | null {
  const match = pathname.match(/\/cycle\/([^/?]+)/);
  const seg = match?.[1];
  return seg && STAGE_ORDER.includes(seg as StageKey) ? (seg as StageKey) : null;
}

export default function CycleLayout() {
  const { dataset_id: datasetId, release_id: releaseId } = useParams<{
    dataset_id: string;
    release_id: string;
  }>();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const cycle = useDatasetCycle(datasetId, releaseId);

  const data = cycle.data;
  const activeStage = stageFromPath(pathname);

  // The release this view is pinned to. Unpinned, every redirect below lands on
  // the latest -- which is what the bare `/cycle` entry point is for.
  const pinnedId = releaseId ?? data?.dataset_release?.dataset_release_id;

  // Old `/cycle?stage=qc` → `/cycle/verify`.
  const legacyStage = searchParams.get("stage");
  if (legacyStage && LEGACY_STAGE[legacyStage]) {
    return (
      <Navigate
        to={stagePath(datasetId, pinnedId, LEGACY_STAGE[legacyStage])}
        replace
      />
    );
  }

  // Bare `/cycle` -> open where the cycle actually is, pinned to the release it
  // resolved to. (Overview page: step 8.)
  if (activeStage === null && data) {
    const summaries = stageSummaries(data);
    return (
      <Navigate
        to={stagePath(datasetId, pinnedId, firstUnfinishedStage(summaries))}
        replace
      />
    );
  }

  // A dataset with no release at all cannot be pinned; the stages handle the
  // "start a cycle" state themselves.
  const viewingOlder =
    data?.dataset_release != null &&
    data.latest_dataset_release_id != null &&
    data.dataset_release.dataset_release_id !== data.latest_dataset_release_id;

  const summaries = data ? stageSummaries(data) : null;
  const tabs: TabItem[] = summaries
    ? STAGE_ORDER.map((key) => ({
        key,
        label: STAGE_LABELS[key],
        detail: summaries[key].detail,
        state: summaries[key].state,
        href: stagePath(datasetId, pinnedId, key),
      }))
    : [];

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title={data ? `${data.dataset_name} — Release Cycle` : "Release Cycle"}
        breadcrumbs={[
          { label: "Datasets", href: "/datasets" },
          ...(datasetId
            ? [
                {
                  label: data?.dataset_name ?? `Dataset ${datasetId}`,
                  href: `/datasets/${datasetId}`,
                },
              ]
            : []),
        ]}
        subtitle={
          data
            ? `${data.dataset_type_name} · ${data.recordsets.length} recordset${data.recordsets.length === 1 ? "" : "s"}` +
              (data.dataset_release
                ? ` · v${data.dataset_release.release_number} (${data.dataset_release.release_status})`
                : " · no release yet")
            : undefined
        }
        actions={
          datasetId ? (
            <LinkButton size="sm" variant="ghost" href={`/datasets/${datasetId}`}>
              Dataset Details
            </LinkButton>
          ) : undefined
        }
      />

      {cycle.isLoading && (
        <SectionCard>
          <LoadingState />
        </SectionCard>
      )}

      {cycle.isError && (
        <SectionCard>
          <p className="text-sm text-red-600 dark:text-red-400">
            Could not load the release cycle for this dataset.
          </p>
        </SectionCard>
      )}

      {viewingOlder && data?.dataset_release && (
        <SectionCard className="mb-4">
          <p className="text-sm text-amber-600 dark:text-amber-400">
            ⚠ Viewing release v{data.dataset_release.release_number} (
            {data.dataset_release.release_status}), which is not the current
            cycle.{" "}
            <Link
              className="underline"
              to={stagePath(
                datasetId,
                data.latest_dataset_release_id ?? undefined,
                activeStage ?? "setup",
              )}
            >
              Go to the current cycle
            </Link>
            .
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Bundle, Transfer and Disseminate show this release. Setup, Assemble
            and Verify show the recordsets&apos; current state — drafts and QC
            belong to a recordset, not to a past release.
          </p>
        </SectionCard>
      )}

      {data && (
        <>
          <CycleNextAction
            cycle={data}
            datasetId={datasetId}
            onGoToStage={(stage) => navigate(stagePath(datasetId, pinnedId, stage))}
          />

          <SectionCard className="mt-4">
            <Tabs
              tabs={tabs}
              active={activeStage ?? "setup"}
              onChange={(key) =>
                navigate(stagePath(datasetId, pinnedId, key as StageKey))
              }
              idPrefix="cycle"
              className="mb-4"
            />

            {activeStage && STAGE_BLURBS[activeStage] && (
              <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
                {STAGE_BLURBS[activeStage]}
              </p>
            )}

            <Outlet context={{ cycle: data, datasetId } satisfies CycleContext} />
          </SectionCard>
        </>
      )}
    </PageShell>
  );
}
