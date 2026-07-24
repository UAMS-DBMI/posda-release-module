import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastSuccess } from "@/components/toastHelpers";
import { useDestinationLookups } from "@/lib/recordsetForm";
import {
  useRecordsetDestinations,
  useSaveRecordsetDestination,
  type RecordsetDestination,
} from "@/lib/recordsetDestinations";

type RecordsetDestinationModalProps = {
  open: boolean;
  onClose: () => void;
  recordsetId: string | number | undefined;
  /** Pass an existing destination row to edit; omit/null to add a new one. */
  editing?: RecordsetDestination | null;
};

/** Add or edit one destination for a recordset. Shared by `recordsets/Detail.tsx`
 *  and the cycle Setup stage, both backed by the same `PUT
 *  .../destinations/{id}` upsert. */
export default function RecordsetDestinationModal({
  open,
  onClose,
  recordsetId,
  editing,
}: RecordsetDestinationModalProps) {
  const { addToast } = useToast();
  const { destinations, transferModes, isLoading: lookupsLoading } =
    useDestinationLookups();
  const { data: configured, isLoading: configuredLoading } =
    useRecordsetDestinations(recordsetId);
  const save = useSaveRecordsetDestination(recordsetId);

  const [destinationId, setDestinationId] = useState<number | null>(null);
  const [transferModeId, setTransferModeId] = useState<number | null>(null);
  const [defaultDisplay, setDefaultDisplay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(editing);
  const isLoading = lookupsLoading || configuredLoading;

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setDestinationId(editing.destination_id);
      setTransferModeId(editing.transfer_mode_id);
      setDefaultDisplay(editing.default_display);
    } else {
      setDestinationId(null);
      setTransferModeId(transferModes[0]?.transfer_mode_id ?? null);
      setDefaultDisplay(false);
    }
    // Only re-run when the modal opens or which row it's editing changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const configuredIds = new Set((configured ?? []).map((d) => d.destination_id));
  const availableDestinations = destinations.filter(
    (d) => !configuredIds.has(d.destination_id),
  );

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
              <span className="block text-sm font-medium">Destination</span>
              <span className="text-sm">{editing?.destination_name}</span>
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

          <div>
            <label className="block text-sm font-medium">Transfer Mode</label>
            <select
              value={transferModeId ?? ""}
              onChange={(e) => setTransferModeId(Number(e.target.value))}
              className="select mt-1 w-full"
            >
              <option value="">Select a transfer mode...</option>
              {transferModes.map((tm) => (
                <option key={tm.transfer_mode_id} value={tm.transfer_mode_id}>
                  {tm.transfer_mode_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="dest_default_display"
              checked={defaultDisplay}
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
        </div>
      )}
    </Modal>
  );
}
