import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ActivitySourcePicker, {
  type ActivitySource,
} from "@/components/ActivitySourcePicker";
import CreateRecordsetModal from "@/components/CreateRecordsetModal";
import { Button, LinkButton } from "@/components/ui/Button";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import {
  useDatasetCycle,
  useStartCycleDrafts,
  type CreatedCycleDraft,
  type CycleRecordset,
} from "@/lib/useCycle";

type Step = "pick" | "sources" | "done";

const STEP_TITLES: Record<Step, string> = {
  pick: "Step 1 of 2 — Recordsets",
  sources: "Step 2 of 2 — Sources",
  done: "Cycle started",
};

/** A recordset can start a cycle only if it has no open draft. */
function eligibility(recordset: CycleRecordset): string | null {
  if (recordset.open_draft) {
    return `Already has an open draft (${recordset.open_draft.draft_name})`;
  }
  return null;
}

export default function StartCycle() {
  const { dataset_id: datasetId } = useParams<{ dataset_id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const cycle = useDatasetCycle(datasetId);
  const start = useStartCycleDrafts(datasetId);

  const [step, setStep] = useState<Step>("pick");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sources, setSources] = useState<Record<number, ActivitySource | null>>({});
  const [created, setCreated] = useState<CreatedCycleDraft[]>([]);

  const data = cycle.data;
  const recordsets = data?.recordsets ?? [];
  const selectable = recordsets.filter((r) => eligibility(r) === null);
  const chosen = recordsets.filter((r) => selected.has(r.recordset_id));
  const allSourced = chosen.every((r) => sources[r.recordset_id]);

  function toggle(recordsetId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(recordsetId)) next.delete(recordsetId);
      else next.add(recordsetId);
      return next;
    });
  }

  async function handleCreateDrafts() {
    const items = chosen
      .map((r) => ({
        recordset_id: r.recordset_id,
        activity_timepoint_id: sources[r.recordset_id]?.timepointId ?? 0,
      }))
      .filter((i) => i.activity_timepoint_id > 0);

    try {
      const drafts = await start.mutateAsync(items);
      setCreated(drafts);
      setStep("done");
      toastSuccess(
        addToast,
        `Created ${drafts.length} draft${drafts.length === 1 ? "" : "s"}.`,
      );
    } catch (e) {
      toastError(
        addToast,
        e instanceof Error ? e.message : "Could not start the cycle.",
      );
    }
  }

  const backToCycle = `/datasets/${datasetId}/cycle`;

  return (
    <PageShell size="5xl">
      <PageDetailHeader
        title="Start a Release Cycle"
        breadcrumbs={[
          { label: "Datasets", href: "/datasets" },
          {
            label: data?.dataset_name ?? `Dataset ${datasetId}`,
            href: `/datasets/${datasetId}`,
          },
          { label: "Release Cycle", href: backToCycle },
        ]}
        subtitle={STEP_TITLES[step]}
        actions={
          <LinkButton size="sm" variant="ghost" href={backToCycle}>
            Cancel
          </LinkButton>
        }
      />

      {cycle.isLoading && (
        <SectionCard className="mt-4">
          <LoadingState />
        </SectionCard>
      )}

      {data && step === "pick" && (
        <SectionCard className="mt-4">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            A new draft is created for each recordset you pick.
          </p>
          <p className="mb-3 mt-2 text-sm" style={{ color: "var(--muted)" }}>
            Recordsets you leave unselected keep their current release and are
            carried forward unchanged into the next dataset release.
          </p>

          {recordsets.length === 0 && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              This dataset has no recordsets yet. A recordset holds one kind of
              data — radiology images, clinical data, annotations — and is what a
              release cycle actually versions. Add at least one to begin.
            </p>
          )}

          {recordsets.length > 0 && selectable.length === 0 && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Every recordset already has an open draft — this cycle is already
              underway.
            </p>
          )}

          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {recordsets.map((r) => {
              const blockedReason = eligibility(r);
              return (
                <li key={r.recordset_id} className="py-2">
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={blockedReason !== null}
                      checked={selected.has(r.recordset_id)}
                      onChange={() => toggle(r.recordset_id)}
                    />
                    <span>
                      <span className="font-medium">{r.recordset_name}</span>
                      <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                        {r.recordset_type_name}
                        {r.latest_release
                          ? ` · frozen at v${r.latest_release.release_number}`
                          : " · never released"}
                      </span>
                      {blockedReason && (
                        <span className="block text-xs" style={{ color: "var(--muted)" }}>
                          {blockedReason}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              disabled={selected.size === 0}
              onClick={() => setStep("sources")}
            >
              {selected.size === 0
                ? "Next — Sources"
                : `Next — Sources (${selected.size} selected)`}
            </Button>

            {/* Always available: a cycle may be the moment a curator realises
                another recordset belongs in this dataset. */}
            <Button
              variant={recordsets.length === 0 ? "primary" : "ghost"}
              onClick={() => setShowCreate(true)}
            >
              Create a Recordset
            </Button>
          </div>
        </SectionCard>
      )}

      {data && step === "sources" && (
        <div className="mt-4 space-y-4">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Each draft is filled with the files from the timepoint you pick. The
            latest timepoint is selected automatically.
          </p>

          {chosen.map((r) => (
            <div key={r.recordset_id}>
              <CardHeader className="mb-0">
                <CardTitle>{r.recordset_name}</CardTitle>
                {sources[r.recordset_id] && (
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {sources[r.recordset_id]?.fileCount.toLocaleString()} files
                  </span>
                )}
              </CardHeader>
              <SectionCard className="mt-1">
                <ActivitySourcePicker
                  value={sources[r.recordset_id] ?? null}
                  onChange={(next) =>
                    setSources((prev) => ({ ...prev, [r.recordset_id]: next }))
                  }
                />
              </SectionCard>
            </div>
          ))}

          <SectionCard>
            <p className="mb-3 text-sm">
              {allSourced
                ? `Ready: ${chosen.length} draft${chosen.length === 1 ? "" : "s"} will be created and filled.`
                : "Choose an activity and timepoint for each recordset above."}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => void handleCreateDrafts()}
                disabled={!allSourced}
                loading={start.isPending}
              >
                Create {chosen.length} Draft{chosen.length === 1 ? "" : "s"}
              </Button>
              <Button variant="ghost" onClick={() => setStep("pick")}>
                Back
              </Button>
            </div>
          </SectionCard>
        </div>
      )}

      {step === "done" && (
        <SectionCard className="mt-4">
          <p className="text-sm">
            Created {created.length} draft{created.length === 1 ? "" : "s"}:
          </p>
          <ul className="mt-3 divide-y" style={{ borderColor: "var(--border)" }}>
            {created.map((d) => (
              <li key={d.recordset_draft_id} className="py-2 text-sm">
                <Link
                  to={`/recordsets/drafts/${d.recordset_draft_id}`}
                  className="font-medium hover:text-accent"
                  style={{ color: "var(--accent)" }}
                >
                  {d.draft_name}
                </Link>
                <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                  {d.file_count.toLocaleString()} files
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
            Next: set up QC on these drafts. Publishing is blocked until at least
            one review completes.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button onClick={() => navigate(`${backToCycle}?stage=qc`)}>
              Go to QC
            </Button>
            <LinkButton variant="ghost" href={backToCycle}>
              Back to Cycle
            </LinkButton>
          </div>
        </SectionCard>
      )}

      <CreateRecordsetModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        datasetId={datasetId}
        // Pre-select it: creating one here means you intend to use it.
        onCreated={(rs) =>
          setSelected((prev) => new Set(prev).add(rs.recordset_id))
        }
      />
    </PageShell>
  );
}
