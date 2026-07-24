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
};

const EMPTY: RecordsetEditFormValues = {
  recordset_doi: "",
  license_id: "",
  recordset_name: "",
  recordset_type_id: "",
  active: true,
};

/** Quick-edit the recordset's own record without leaving the page it was
 *  opened from. No dataset selector -- fixed by context, unlike the full
 *  `recordsets/Edit.tsx` page, which allows reassigning it. Shares field
 *  config/validation/payload with that page via `lib/recordsetForm.ts`. */
export default function RecordsetEditModal({
  open,
  onClose,
  recordsetId,
}: RecordsetEditModalProps) {
  const { addToast } = useToast();
  const { data: recordset, isLoading: isLoadingRecordset } = useRecordset(
    open ? recordsetId : undefined,
  );
  const { recordsetTypes, licenses, isLoading: isLoadingLookups } = useRecordsetLookups();
  const save = useSaveRecordset(recordsetId, recordset?.dataset_id);

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
      onClose();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not save recordset.");
    }
  }

  const isLoading = isLoadingRecordset || isLoadingLookups;

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
          fields={recordsetEditFormFields({ recordsetTypes, licenses })}
          className="mt-4 grid grid-cols-2 gap-3"
          errors={errors}
        />
      )}
    </Modal>
  );
}
