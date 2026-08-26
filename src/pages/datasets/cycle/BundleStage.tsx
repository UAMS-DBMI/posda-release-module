import { useState } from "react";
import ExpandableTable from "@/components/ExpandableTable";
import FinalizeReleaseModal from "@/components/FinalizeReleaseModal";
import PublishDraftModal from "@/components/PublishDraftModal";
import RecordsetLink from "@/components/RecordsetLink";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import {
  useBundledRecordsets,
  useExcludeRecordsetRelease,
  useIncludeRecordsetRelease,
} from "@/lib/datasetReleaseForm";
import { useRecordsetReleases } from "@/lib/useRecordsetReleases";
import { useUsers } from "@/lib/useUsers";
import {
  isCycleActive,
  isPublishable,
  unbundledRecordsets,
  type CycleRecordset,
} from "@/lib/useCycle";
import { useCycleContext } from "./CycleLayout";

/** Pick which frozen version of a recordset the dataset release carries.
 *  Lazily fetched -- most rows are never expanded, and latest is the default. */
function VersionPicker({
  recordsetId,
  bundledReleaseId,
  disabled,
  onPick,
}: {
  recordsetId: number;
  bundledReleaseId: number | null;
  disabled: boolean;
  onPick: (recordsetReleaseId: number) => void;
}) {
  const releases = useRecordsetReleases(recordsetId, true);
  const userMap = useUsers();

  if (releases.isLoading) return <LoadingState />;
  if (releases.isError) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        Could not load this recordset&apos;s releases.
      </p>
    );
  }
  const rows = releases.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        No frozen releases yet.
      </p>
    );
  }

  // Newest first -- the endpoint orders ascending, but the recent versions are
  // the ones a curator is choosing between.
  const newestFirst = [...rows].sort(
    (a, b) => Number(b.release_number) - Number(a.release_number),
  );

  return (
    <div className="space-y-2 text-sm">
      <p style={{ color: "var(--muted)" }}>
        Which version this recordset contributes to the release.
      </p>
      <ul
        className="divide-y overflow-hidden rounded-md"
        style={{
          borderColor: "var(--border)",
          border: "1px solid var(--border-strong)",
        }}
      >
        {newestFirst.map((r) => {
          const current = r.recordset_release_id === bundledReleaseId;
          return (
            <li
              key={r.recordset_release_id}
              className="flex items-start justify-between gap-3 px-3 py-2"
              style={current ? { background: "var(--surface-alt)" } : undefined}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">v{r.release_number}</span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {r.file_count.toLocaleString()} file
                    {r.file_count === 1 ? "" : "s"}
                    {r.release_date
                      ? ` · ${new Date(r.release_date).toLocaleDateString()}`
                      : ""}
                    {r.who_created != null
                      ? ` · by ${userMap.get(r.who_created) ?? "—"}`
                      : ""}
                  </span>
                </div>
                {r.release_notes && (
                  <p
                    className="mt-0.5 whitespace-pre-wrap text-xs"
                    style={{ color: "var(--muted)" }}
                  >
                    {r.release_notes}
                  </p>
                )}
                {r.release_doi && (
                  <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                    {r.release_doi}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                {current ? (
                  <StatusBadge
                    status="current"
                    variant="success"
                    label="Current"
                  />
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => onPick(r.recordset_release_id)}
                  >
                    Include
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function BundleStage() {
  const { cycle, datasetId } = useCycleContext();
  const { addToast } = useToast();
  const release = cycle.dataset_release;
  const releaseId = release?.dataset_release_id;
  const cycleActive = isCycleActive(cycle);
  const unbundled = unbundledRecordsets(cycle);

  const bundled = useBundledRecordsets(releaseId);
  const include = useIncludeRecordsetRelease(releaseId, datasetId);
  const exclude = useExcludeRecordsetRelease(releaseId, datasetId);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [publishFor, setPublishFor] = useState<CycleRecordset | null>(null);
  const [showFinalize, setShowFinalize] = useState(false);

  // `bundled` is released-only, so it is what will actually ship -- right for
  // the finalize modal, wrong for this table, which has to show a recordset
  // being drafted as already in the release. That comes from the cycle payload
  // (`release_in_cycle`), which includes draft members.

  const busy = include.isPending || exclude.isPending;

  function pick(recordsetReleaseId: number) {
    include.mutate(recordsetReleaseId, {
      onSuccess: () => toastSuccess(addToast, "Release updated."),
      onError: (e) =>
        toastError(
          addToast,
          e instanceof Error ? e.message : "Could not update the release.",
        ),
    });
  }

  function drop(recordsetReleaseId: number) {
    exclude.mutate(recordsetReleaseId, {
      onSuccess: () => toastSuccess(addToast, "Release updated."),
      onError: (e) =>
        toastError(
          addToast,
          e instanceof Error ? e.message : "Could not update the release.",
        ),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {release ? (
          <>
            <span className="font-medium">
              v{release.release_number}
              {release.release_date &&
                ` · ${new Date(release.release_date).toLocaleDateString()}`}
            </span>
            <StatusBadge status={release.release_status} />
            {release.release_doi && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {release.release_doi}
              </span>
            )}
          </>
        ) : (
          <span style={{ color: "var(--muted)" }}>No dataset release yet.</span>
        )}
        {cycleActive && (
          <Button size="sm" onClick={() => setShowFinalize(true)}>
            Finalize Release
          </Button>
        )}
      </div>

      {!cycleActive && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No cycle in progress — start one from the banner above to compose a
          release.
        </p>
      )}

      {unbundled.length > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          ⚠ {unbundled.length} recordset{unbundled.length === 1 ? " is" : "s are"}{" "}
          not in this release
          {release ? ` (v${release.release_number})` : ""} — include{" "}
          {unbundled.length === 1 ? "it" : "them"} below if{" "}
          {unbundled.length === 1 ? "it" : "they"} should ship.
        </p>
      )}

      {bundled.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Could not load what this release contains.
        </p>
      )}

      <ExpandableTable
        headers={["Recordset", "Frozen At", "Contributing", "In Release", ""]}
        rows={cycle.recordsets}
        getRowKey={(r) => r.recordset_id}
        expandLabel="versions"
        expandedKey={expandedId}
        onExpandedKeyChange={(k) => setExpandedId(k as number | null)}
        canExpand={(r) => r.latest_release !== null}
        emptyMessage="This dataset has no recordsets yet."
        renderExpanded={(r) => (
          <VersionPicker
            recordsetId={r.recordset_id}
            bundledReleaseId={r.release_in_cycle?.recordset_release_id ?? null}
            disabled={!cycleActive || busy}
            onPick={pick}
          />
        )}
        renderCells={(r) => {
          const inRelease = r.release_in_cycle;
          const latest = r.latest_release;
          const readyDraft = isPublishable(r) ? r.open_draft : null;
          // A draft member has no number yet -- it is claimed at publish.
          const memberIsDraft = inRelease?.release_status === "draft";
          // Carrying a version older than the one just frozen is legitimate,
          // but worth showing rather than hiding. Only meaningful for a
          // published member: a draft is by definition not one of the versions
          // `latest` is chosen from.
          const behind =
            inRelease != null &&
            !memberIsDraft &&
            latest != null &&
            inRelease.recordset_release_id !== latest.recordset_release_id;

          return (
            <>
              <td className="px-2 py-1">
                <RecordsetLink id={r.recordset_id} name={r.recordset_name} />
              </td>
              <td className="px-2 py-1">
                {latest ? `v${latest.release_number}` : "—"}
              </td>
              <td className="px-2 py-1">
                {inRelease ? (
                  <span className="flex items-center gap-2">
                    {memberIsDraft ? "next version" : `v${inRelease.release_number}`}
                    {memberIsDraft && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--muted)" }}
                        title="Still a draft -- publish it before finalizing"
                      >
                        unpublished
                      </span>
                    )}
                    {behind && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--muted)" }}
                        title="An older version than this recordset's latest release"
                      >
                        carried forward
                      </span>
                    )}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-2 py-1">
                {inRelease ? (
                  <StatusBadge
                    status="bundled"
                    variant={memberIsDraft ? "warning" : "success"}
                    label={memberIsDraft ? "Draft" : "Yes"}
                  />
                ) : latest ? (
                  <StatusBadge status="unbundled" variant="warning" label="No" />
                ) : (
                  <span style={{ color: "var(--muted)" }}>—</span>
                )}
              </td>
              <td className="px-2 py-1">
                <div className="flex items-center justify-end gap-2">
                  {readyDraft && (
                    <Button
                      size="sm"
                      onClick={() => setPublishFor(r)}
                      title="Freeze this recordset's draft into a new release"
                    >
                      Publish
                    </Button>
                  )}
                  {cycleActive && latest && !inRelease && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => pick(latest.recordset_release_id)}
                    >
                      Include
                    </Button>
                  )}
                  {cycleActive && inRelease && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => drop(inRelease.recordset_release_id)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </td>
            </>
          );
        }}
      />

      <FinalizeReleaseModal
        open={showFinalize}
        onClose={() => setShowFinalize(false)}
        releaseId={releaseId}
        datasetId={datasetId}
        releaseNumber={release?.release_number}
        bundled={bundled.data ?? []}
        omittedCount={unbundled.length}
      />

      <PublishDraftModal
        open={publishFor !== null}
        onClose={() => setPublishFor(null)}
        draftId={publishFor?.open_draft?.recordset_draft_id}
        datasetId={datasetId}
        draftName={publishFor?.open_draft?.draft_name}
      />
    </div>
  );
}
