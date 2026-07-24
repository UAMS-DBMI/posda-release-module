import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import DynamicForm from "@/components/DynamicForm";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import {
  datasetFormFields,
  datasetToFormValues,
  useDataset,
  useDatasetTypes,
  useSaveDataset,
  validateDatasetForm,
  type DatasetFormValues,
} from "@/lib/datasetForm";

type DatasetEditModalProps = {
  open: boolean;
  onClose: () => void;
  datasetId: string | number | undefined;
};

const EMPTY: DatasetFormValues = {
  dataset_doi: "",
  dataset_type_id: "",
  dataset_name: "",
  active: true,
};

/** Quick-edit the dataset's own record without leaving the page it was
 *  opened from. Shares field config/validation/payload with the full
 *  `datasets/Edit.tsx` page via `lib/datasetForm.ts`. */
export default function DatasetEditModal({
  open,
  onClose,
  datasetId,
}: DatasetEditModalProps) {
  const { addToast } = useToast();
  const { data: dataset, isLoading: isLoadingDataset } = useDataset(
    open ? datasetId : undefined,
  );
  const { datasetTypes, isLoading: isLoadingTypes } = useDatasetTypes();
  const save = useSaveDataset(datasetId);

  const [values, setValues] = useState<DatasetFormValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && dataset) setValues(datasetToFormValues(dataset));
  }, [open, dataset]);

  async function handleSave() {
    const nextErrors = validateDatasetForm(values);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    try {
      await save.mutateAsync(values);
      toastSuccess(addToast, "Dataset saved.");
      onClose();
    } catch (e) {
      toastError(addToast, e instanceof Error ? e.message : "Could not save dataset.");
    }
  }

  const isLoading = isLoadingDataset || isLoadingTypes;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Dataset"
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
          fields={datasetFormFields(datasetTypes)}
          className="mt-4 grid grid-cols-2 gap-3"
          errors={errors}
        />
      )}
    </Modal>
  );
}
