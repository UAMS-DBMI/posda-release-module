import { LoadingState } from "@/components/ui/Spinner";
import { useRecordsetReleases } from "@/lib/useRecordsetReleases";

type ReleasePickerProps = {
  recordsetId: number;
  value: number | null;
  onChange: (id: number) => void;
  enabled?: boolean;
  emptyMessage?: string;
};

/** Pick one of a recordset's releases. Used to clone a draft from a release
 *  and to add files from a release. */
export default function ReleasePicker({
  recordsetId,
  value,
  onChange,
  enabled = true,
  emptyMessage = "This recordset has no releases.",
}: ReleasePickerProps) {
  const releases = useRecordsetReleases(recordsetId, enabled);

  if (releases.isLoading) return <LoadingState label="Loading releases..." />;
  if (releases.isError) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        Could not load releases.
      </p>
    );
  }
  if (!releases.data || releases.data.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul
      className="divide-y overflow-hidden rounded-md"
      style={{ borderColor: "var(--border)", border: "1px solid var(--border-strong)" }}
    >
      {releases.data.map((r) => (
        <li key={r.recordset_release_id}>
          <button
            type="button"
            onClick={() => onChange(r.recordset_release_id)}
            className="w-full px-3 py-2 text-left text-sm transition-colors"
            style={
              value === r.recordset_release_id
                ? { background: "var(--surface-alt)" }
                : undefined
            }
          >
            <span className="font-medium">v{r.release_number}</span>
            <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
              {r.file_count.toLocaleString()} files
              {r.release_date
                ? ` · ${new Date(r.release_date).toLocaleDateString()}`
                : ""}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
