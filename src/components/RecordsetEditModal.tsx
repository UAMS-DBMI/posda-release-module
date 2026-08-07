import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import DynamicForm from "@/components/DynamicForm";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import {
  recordsetEditFormFields,
  recordsetToFormValues,
  useDatasetOptions,
  useRecordset,
  useRecordsetLookups,
  useSaveRecordset,
  validateRecordsetEditForm,
  type RecordsetEditFormValues,
} from "@/lib/recordsetForm";

type RecordsetEditModalProps = {
  open: boolean;
  onClose: () => void;
  recordsetId: string | number | undefined;
  /** For hosts whose list isn't react-query, so the save's cache
   *  invalidation can't refresh it. */
  onSaved?: () => void;
};

const EMPTY: RecordsetEditFormValues = {
  dataset_id: "",
  recordset_doi: "",
  license_id: "",
  recordset_name: "",
  recordset_type_id: "",
  active: true,
};

/** Quick-edit the recordset's own record, including reassigning its dataset,
 *  without leaving the page it was opened from. Shares field config,
 *  validation, and payload with the full `recordsets/Edit.tsx` page via
 *  `lib/recordsetForm.ts`. */
export default function RecordsetEditModal({
  open,
  onClose,
  recordsetId,
  onSaved,
}: RecordsetEditModalProps) {
  const { addToast } = useToast();
  const { data: recordset, isLoading: isLoadingRecordset } = useRecordset(
    open ? recordsetId : undefined,
  );
  const { recordsetTypes, licenses, isLoading: isLoadingLookups } = useRecordsetLookups();
  const { datasets, isLoading: isLoadingDatasets } = useDatasetOptions(open);
  const save = useSaveRecordset(recordsetId);

  const [values, setValues] = useState<RecordsetEditFormValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && recordset) setValues(recordsetToFormValues(recordset));
  }, [open, recordset]);

  async function handleSave() {
    const nextErrors = validateRecordsetEditForm(values);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    try {
      await save.mutateAsync(values);
      toastSuccess(addToast, "Recordset saved.");
      onSaved?.();
      onClose();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not save recordset.");
    }
  }

  const isLoading = isLoadingRecordset || isLoadingLookups || isLoadingDatasets;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Recordset"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      {isLoading ? (
        <LoadingState label="Loading..." />
      ) : (
        <DynamicForm
          values={values}
          onChange={(next) => {
            setValues(next);
            setErrors({});
          }}
          fields={recordsetEditFormFields({ recordsetTypes, licenses, datasets })}
          className="mt-4 grid grid-cols-2 gap-3"
          errors={errors}
        />
      )}
    </Modal>
  );
}
