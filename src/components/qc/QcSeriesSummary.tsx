import { useMemo } from "react";
import type { QcModalityCount, QcStatusCount } from "@/lib/useQc";
import DynamicTable from "@/components/DynamicTable";
import { StatusBadge } from "@/components/ui/StatusBadge";

type ModalityProgress = {
  modality: string;
  pending: number;
  approved: number;
  rejected: number;
  flagged: number;
  total: number;
};

/** Read-only series-status summary for a QC review: status badges with counts
 *  plus a per-modality progress table. Shared by the review-detail page and the
 *  cycle's Verify Manage modal. */
export default function QcSeriesSummary({
  byStatus,
  byModality,
}: {
  byStatus: QcStatusCount[];
  byModality: QcModalityCount[];
}) {
  const seriesTotal = byStatus.reduce((sum, s) => sum + s.count, 0);

  const modalityProgress = useMemo<ModalityProgress[]>(() => {
    const map = new Map<string, ModalityProgress>();
    for (const r of byModality) {
      const row =
        map.get(r.modality) ??
        {
          modality: r.modality,
          pending: 0,
          approved: 0,
          rejected: 0,
          flagged: 0,
          total: 0,
        };
      if (r.qc_status === "pending") row.pending += r.count;
      else if (r.qc_status === "approved") row.approved += r.count;
      else if (r.qc_status === "rejected") row.rejected += r.count;
      else if (r.qc_status === "flagged") row.flagged += r.count;
      row.total += r.count;
      map.set(r.modality, row);
    }
    return Array.from(map.values());
  }, [byModality]);

  if (seriesTotal === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        No series.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {byStatus.map((s) => (
          <span
            key={s.qc_status}
            className="inline-flex items-center gap-2 text-sm"
          >
            <StatusBadge status={s.qc_status} />
            <span className="font-medium">{s.count.toLocaleString()}</span>
          </span>
        ))}
      </div>

      {modalityProgress.length > 0 && (
        <DynamicTable
          rows={modalityProgress}
          getRowKey={(row) => row.modality}
          columns={[
            { key: "modality", label: "Modality" },
            { key: "pending", label: "Pending" },
            { key: "approved", label: "Approved" },
            { key: "rejected", label: "Rejected" },
            { key: "flagged", label: "Flagged" },
            { key: "total", label: "Total" },
          ]}
        />
      )}
    </div>
  );
}
