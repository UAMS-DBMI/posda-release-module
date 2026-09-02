import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DynamicForm from "@/components/DynamicForm";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastSuccess } from "@/components/toastHelpers";
import { apiFetch } from "@/lib/apiFetch";
import {
  emptyRecordsetForm,
  recordsetCreatePayload,
  recordsetFormFields,
  useRecordsetLookups,
  validateRecordsetForm,
  type RecordsetFormValues,
} from "@/lib/recordsetForm";

export type CreatedRecordset = {
  recordset_id: number;
  recordset_name: string;
};

type CreateRecordsetModalProps = {
  open: boolean;
  onClose: () => void;
  datasetId: string | undefined;
  onCreated?: (recordset: CreatedRecordset) => void;
};

/** Creates a recordset without leaving the page, so a curator mid-cycle isn't
 *  navigated out of the wizard. Same fields, validation, and payload as the
 *  full create page — only the dataset is fixed by context. */
export default function CreateRecordsetModal({
  open,
  onClose,
  datasetId,
  onCreated,
}: CreateRecordsetModalProps) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const [values, setValues] = useState<RecordsetFormValues>(() =>
    emptyRecordsetForm(datasetId),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const { recordsetTypes, isLoading } = useRecordsetLookups();
  const fields = recordsetFormFields({ recordsetTypes });

  const create = useMutation({
    mutationFn: async () => {
      const json = await apiFetch<{
        recordset_id?: number;
        data?: { recordset_id: number };
      }>("/papi/v1/distribution/recordsets", {
        method: "POST",
        body: JSON.stringify(recordsetCreatePayload(values)),
      });
      const id = json.data?.recordset_id ?? json.recordset_id;
      if (!id) throw new Error("No recordset ID returned from create.");
      return { recordset_id: id, recordset_name: values.recordset_name.trim() };
    },
  });

  function reset() {
    setValues(emptyRecordsetForm(datasetId));
    setFieldErrors({});
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError(null);
    // The dataset is fixed by context, so it isn't a field to validate.
    const errors = validateRecordsetForm(values, { requireDataset: false });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError("Please fix the highlighted fields.");
      return;
    }

    try {
      const created = await create.mutateAsync();
      await queryClient.invalidateQueries({
        queryKey: ["dataset-cycle", datasetId ?? ""],
      });
      toastSuccess(addToast, `Created recordset "${created.recordset_name}".`);
      onCreated?.(created);
      reset();
      onClose();
    } catch (e) {
      // Stay open so the entered values survive a failure.
      setError(e instanceof Error ? e.message : "Could not create recordset.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="New Recordset"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} loading={create.isPending}>
            Create Recordset
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          A recordset holds one kind of data in this dataset — radiology images,
          clinical data, annotations — and is what a release cycle versions.
        </p>

        {isLoading && <LoadingState label="Loading options..." />}

        {!isLoading && (
          <DynamicForm
            values={values}
            fields={fields}
            onChange={setValues}
            errors={fieldErrors}
            className="space-y-3"
          />
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    </Modal>
  );
}
