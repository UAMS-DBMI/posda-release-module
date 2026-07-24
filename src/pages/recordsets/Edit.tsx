import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DynamicForm from "@/components/DynamicForm";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { Button, LinkButton } from "@/components/ui/Button";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { SectionCard } from "@/components/ui/Card";
import { useUsers } from "@/lib/useUsers";
import { LoadingState } from "@/components/ui/Spinner";
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

const EMPTY: RecordsetEditFormValues = {
  recordset_doi: "",
  license_id: "",
  recordset_name: "",
  recordset_type_id: "",
  active: false,
};

export default function RecordsetEdit() {
  const navigate = useNavigate();
  const userMap = useUsers();
  const { addToast } = useToast();
  const { recordset_id: recordsetId } = useParams<{ recordset_id: string }>();

  const { data: recordset, isLoading, isError, error } = useRecordset(recordsetId);
  const { recordsetTypes, licenses, isLoading: isLoadingLookups } = useRecordsetLookups();
  const { datasets, isLoading: isLoadingDatasets } = useDatasetOptions();

  const [formData, setFormData] = useState<RecordsetEditFormValues>(EMPTY);
  const [datasetId, setDatasetId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useSaveRecordset(recordsetId, datasetId ? Number(datasetId) : undefined);

  useEffect(() => {
    if (recordset) {
      setFormData(recordsetToFormValues(recordset));
      setDatasetId(String(recordset.dataset_id));
    }
  }, [recordset]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);

    const nextFieldErrors = validateRecordsetEditForm(formData);
    if (!datasetId) {
      nextFieldErrors.dataset_id = "Dataset is required.";
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setSaveError("Please fix the highlighted fields.");
      toastError(addToast, "Please fix the highlighted fields.");
      return;
    }
    setFieldErrors({});

    try {
      await save.mutateAsync(formData);
      toastSuccess(addToast, "Recordset saved successfully.");
      navigate(`/recordsets/${recordsetId}`);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : `Could not save recordset ${recordsetId}.`;
      setSaveError(message);
      toastError(addToast, message);
    }
  }

  const isLoadingOptions = isLoadingLookups || isLoadingDatasets;

  return (
    <PageShell size="3xl">
      <PageDetailHeader
        title="Edit Recordset"
        breadcrumb={{ label: "Recordset", href: recordsetId ? `/recordsets/${recordsetId}` : "/recordsets" }}
      />

      <SectionCard>
        {isLoadingOptions && (
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
            Loading dataset, license, and recordset type options...
          </p>
        )}

        {isLoading && <LoadingState />}

        {!isLoading && isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {error instanceof Error ? error.message : `Could not load recordset ${recordsetId}.`}
          </p>
        )}

        {!isLoading && recordset && (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Recordset ID</label>
              <input
                type="text"
                value={recordset.recordset_id}
                disabled
                className="mt-1 input input-muted"
              />
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Dataset</label>
              <select
                value={datasetId}
                onChange={(e) => {
                  setDatasetId(e.target.value);
                  setFieldErrors({});
                  setSaveError(null);
                }}
                className="mt-1 select"
              >
                <option value="">--- Select a value ---</option>
                {datasets.map((d) => (
                  <option key={d.dataset_id} value={d.dataset_id}>
                    {d.dataset_id} - {d.dataset_name}
                  </option>
                ))}
              </select>
              {fieldErrors.dataset_id && (
                <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.dataset_id}</p>
              )}
            </div>

            <DynamicForm
              onSubmit={handleSubmit}
              values={formData}
              onChange={(next) => {
                setFormData(next);
                setFieldErrors({});
                setSaveError(null);
              }}
              fields={recordsetEditFormFields({ recordsetTypes, licenses })}
              errors={fieldErrors}
              className="space-y-3"
              actions={
                <>
                  <div className="metadata-panel">
                    <p><strong>Created:</strong>{" "}{new Date(recordset.when_created).toLocaleString()} by {userMap.get(recordset.who_created) ?? "—"}</p>
                    <p><strong>Updated:</strong>{" "}{new Date(recordset.when_updated).toLocaleString()} by {userMap.get(recordset.who_updated) ?? "—"}</p>
                  </div>

                  {saveError && (
                    <p className="rounded-md bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                      {saveError}
                    </p>
                  )}

                  <div className="flex gap-3 pt-2">
                    <Button type="submit" loading={save.isPending}>
                      Save Changes
                    </Button>

                    <LinkButton
                      href={`/recordsets/${recordsetId}`}
                      variant="ghost"
                    >
                      Cancel
                    </LinkButton>
                  </div>
                </>
              }
            />
          </>
        )}
      </SectionCard>
    </PageShell>
  );
}
