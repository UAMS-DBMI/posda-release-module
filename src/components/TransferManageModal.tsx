import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import TransferSettingsForm from "@/components/transfers/TransferSettingsForm";

/** Destination settings and manifest generation for one transfer, without
 *  leaving the cycle. The stage's expanded row already shows what the transfer
 *  carries, so this modal is settings only. */
export default function TransferManageModal({
  open,
  onClose,
  transferId,
  transferName,
  destinationAbbr,
  destinationName,
}: {
  open: boolean;
  onClose: () => void;
  transferId: number | undefined;
  transferName: string | undefined;
  destinationAbbr: string | undefined;
  destinationName: string | undefined;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={transferName ?? "Transfer"}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      {transferId != null && destinationAbbr && destinationName ? (
        <TransferSettingsForm
          transferId={transferId}
          destinationAbbr={destinationAbbr}
          destinationName={destinationName}
        />
      ) : null}
    </Modal>
  );
}
