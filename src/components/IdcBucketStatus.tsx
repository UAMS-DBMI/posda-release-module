import { useState } from "react";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { Button } from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { StatusBadge, type BadgeVariant } from "@/components/ui/StatusBadge";
import {
  idcBucketStatusLabel,
  idcCanSetReady,
  idcVersionClosed,
  useIdcBucketStatus,
  useSetIdcReady,
} from "@/lib/idcBucket";

const VARIANTS: Record<string, BadgeVariant> = {
  "Ready for processing": "info",
  Processing: "info",
  Processed: "success",
  Errored: "danger",
};

/** Where a finished upload stands with IDC, read live from its `status.json`.
 *  Replaces the transfer's `success` pill, which it implies. */
export function IdcBucketPill({ transferId }: { transferId: number }) {
  const { data } = useIdcBucketStatus(transferId);
  if (!data) return <StatusBadge status="success" />;
  const variant = data.status === null ? "warning" : (VARIANTS[data.status] ?? "neutral");
  return (
    <span title={data.unavailable_reason ?? undefined}>
      <StatusBadge
        status={data.status ?? "unknown"}
        label={idcBucketStatusLabel(data)}
        variant={variant}
      />
    </span>
  );
}

/** Set to Ready and Queue for a finished IDC transfer. Queue goes away once IDC
 *  has started, since a change then needs a new version. */
export function IdcTransferActions({
  transferId,
  onQueue,
}: {
  transferId: number;
  onQueue: () => void;
}) {
  const { addToast } = useToast();
  const { data } = useIdcBucketStatus(transferId);
  const setReady = useSetIdcReady(transferId);
  const [confirming, setConfirming] = useState(false);

  function handleSetReady() {
    setReady.mutate(undefined, {
      onSuccess: () => {
        toastSuccess(addToast, "This version is ready for IDC.");
        setConfirming(false);
      },
      onError: (e) =>
        toastError(addToast, e instanceof Error ? e.message : "Could not set it to Ready."),
    });
  }

  return (
    <>
      {idcCanSetReady(data) && (
        <Button size="sm" onClick={() => setConfirming(true)}>
          Set to Ready
        </Button>
      )}
      {!idcVersionClosed(data) && (
        <Button size="sm" variant="ghost" onClick={onQueue}>
          Queue
        </Button>
      )}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Set to Ready for IDC?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={setReady.isPending}>
              Cancel
            </Button>
            <Button onClick={handleSetReady} loading={setReady.isPending}>
              Set to Ready
            </Button>
          </>
        }
      >
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          IDC can pick this version up at any time from now on. Once IDC has
          started on it, a change needs a new version. Until then, pushing it again
          puts it back to Draft.
        </p>
      </Modal>
    </>
  );
}
