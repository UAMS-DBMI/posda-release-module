import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastSuccess } from "@/components/toastHelpers";
import {
  transferModeIdForDestination,
  useDestinationLookups,
} from "@/lib/recordsetForm";
import {
  useRecordsetDestinations,
  useSaveRecordsetDestination,
} from "@/lib/recordsetDestinations";

type RecordsetDestinationModalProps = {
  open: boolean;
  onClose: () => void;
  recordsetId: string | number | undefined;
  /** Pass an existing destination's id to edit it; omit/null to add a new one.
   *  The row itself is looked up from this recordset's own configured
   *  destinations, so callers don't need to hold the full row. */
  editingDestinationId?: number | null;
};

/** Add or edit one destination for a recordset. Shared by `recordsets/Detail.tsx`
 *  and the cycle Setup stage, both backed by the same `PUT
 *  .../destinations/{id}` upsert. */
export default function RecordsetDestinationModal({
  open,
  onClose,
  recordsetId,
  editingDestinationId,
}: RecordsetDestinationModalProps) {
  const { addToast } = useToast();
  const { destinations, transferModes, isLoading: lookupsLoading } =
    useDestinationLookups();
  const { data: configured, isLoading: configuredLoading } =
    useRecordsetDestinations(recordsetId);
  const save = useSaveRecordsetDestination(recordsetId);

  const [destinationId, setDestinationId] = useState<number | null>(null);
  const [defaultDisplay, setDefaultDisplay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = editingDestinationId != null;
  const isLoading = lookupsLoading || configuredLoading;
  const editing =
    (editingDestinationId != null &&
      configured?.find((d) => d.destination_id === editingDestinationId)) ||
    null;
  // A recordset's first destination is always its default -- the backend
  // forces this regardless of what's submitted, so reflect it rather than
  // showing an unchecked box that saves as checked.
  const isFirstDestination = !isEditing && (configured?.length ?? 0) === 0;

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setDestinationId(editing.destination_id);
      setDefaultDisplay(editing.default_display);
    } else if (!isEditing) {
      setDestinationId(null);
      setDefaultDisplay(isFirstDestination);
    }
    // Only re-run when the modal opens, which row it's editing, or once that
    // row's data arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingDestinationId, editing, isFirstDestination]);

  const configuredIds = new Set((configured ?? []).map((d) => d.destination_id));
  const availableDestinations = destinations.filter(
    (d) => !configuredIds.has(d.destination_id),
  );

  // Transfer mode is hidden from the user — each destination is hardcoded to
  // one mode (see transferModeIdForDestination).
  const selectedDestination =
    destinations.find((d) => d.destination_id === destinationId) ?? null;
  const transferModeId = selectedDestination
    ? transferModeIdForDestination(selectedDestination.destination_abbr, transferModes)
    : null;

  async function handleSave() {
    if (!destinationId || !transferModeId) return;
    setError(null);
    try {
      await save.mutateAsync({
        destination_id: destinationId,
        default_display: defaultDisplay,
        default_transfer_mode_id: transferModeId,
      });
      toastSuccess(
        addToast,
        isEditing ? "Destination updated." : "Destination added.",
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save destination.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit Destination" : "New Destination"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            loading={save.isPending}
            disabled={!destinationId || !transferModeId}
          >
            Save
          </Button>
        </>
      }
    >
      {isLoading ? (
        <LoadingState label="Loading options..." />
      ) : (
        <div className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {isEditing ? (
            <div>
              <label className="block text-sm font-medium">Destination</label>
              <input
                type="text"
                value={editing?.destination_name ?? ""}
                readOnly
                className="mt-1 input w-full opacity-60"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium">Destination</label>
              <select
                value={destinationId ?? ""}
                onChange={(e) => setDestinationId(Number(e.target.value))}
                className="select mt-1 w-full"
              >
                <option value="">Select a destination...</option>
                {availableDestinations.map((d) => (
                  <option key={d.destination_id} value={d.destination_id}>
                    {d.destination_name} ({d.destination_abbr})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="dest_default_display"
              checked={defaultDisplay}
              disabled={isFirstDestination}
              onChange={(e) => setDefaultDisplay(e.target.checked)}
              className="h-4 w-4"
            />
            <label
              htmlFor="dest_default_display"
              className="text-sm font-medium"
            >
              Default Display
            </label>
          </div>
          {isFirstDestination && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              A recordset's first destination is always its default.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
