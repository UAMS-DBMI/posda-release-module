import {
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
  const { dataset_id: datasetId } = useParams<{ dataset_id: string }>();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const cycle = useDatasetCycle(datasetId);

  const data = cycle.data;
  const activeStage = stageFromPath(pathname);

  // Old `/cycle?stage=qc` → `/cycle/verify`.
  const legacyStage = searchParams.get("stage");
  if (legacyStage && LEGACY_STAGE[legacyStage]) {
    return (
      <Navigate to={stagePath(datasetId, LEGACY_STAGE[legacyStage])} replace />
    );
  }

  // Bare `/cycle` → open where the cycle actually is. (Overview page: step 8.)
  if (activeStage === null && data) {
    const summaries = stageSummaries(data);
    return (
      <Navigate to={stagePath(datasetId, firstUnfinishedStage(summaries))} replace />
    );
  }

  const summaries = data ? stageSummaries(data) : null;
  const tabs: TabItem[] = summaries
    ? STAGE_ORDER.map((key) => ({
        key,
        label: STAGE_LABELS[key],
        detail: summaries[key].detail,
        state: summaries[key].state,
        href: stagePath(datasetId, key),
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
              (data.latest_dataset_release
                ? ` · v${data.latest_dataset_release.release_number} (${data.latest_dataset_release.release_status})`
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

      {data && (
        <>
          <CycleNextAction
            cycle={data}
            datasetId={datasetId}
            onGoToStage={(stage) => navigate(stagePath(datasetId, stage))}
          />

          <SectionCard className="mt-4">
            <Tabs
              tabs={tabs}
              active={activeStage ?? "setup"}
              onChange={(key) => navigate(stagePath(datasetId, key as StageKey))}
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
