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
  datasetFormFields,
  datasetToFormValues,
  useDataset,
  useDatasetTypes,
  useSaveDataset,
  validateDatasetForm,
  type DatasetFormValues,
} from "@/lib/datasetForm";

const EMPTY: DatasetFormValues = {
  dataset_doi: "",
  dataset_type_id: "",
  dataset_name: "",
  active: false,
};

export default function DatasetEdit() {
  const navigate = useNavigate();
  const userMap = useUsers();
  const { addToast } = useToast();
  const { dataset_id: datasetId } = useParams<{ dataset_id: string }>();

  const { data: dataset, isLoading, isError, error } = useDataset(datasetId);
  const { datasetTypes, isLoading: isLoadingTypes } = useDatasetTypes();
  const save = useSaveDataset(datasetId);

  const [formData, setFormData] = useState<DatasetFormValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (dataset) setFormData(datasetToFormValues(dataset));
  }, [dataset]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);

    const nextFieldErrors = validateDatasetForm(formData);
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setSaveError("Please fix the highlighted fields.");
      toastError(addToast, "Please fix the highlighted fields.");
      return;
    }
    setFieldErrors({});

    try {
      await save.mutateAsync(formData);
      toastSuccess(addToast, "Dataset saved successfully.");
      navigate(`/datasets/${datasetId}`);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : `Could not save dataset ${datasetId}.`;
      setSaveError(message);
      toastError(addToast, message);
    }
  }

  return (
    <PageShell size="3xl">
      <PageDetailHeader
        title="Edit Dataset"
        breadcrumb={{ label: "Dataset", href: datasetId ? `/datasets/${datasetId}` : "/datasets" }}
      />

      <SectionCard>
        {!isLoadingTypes && datasetTypes.length === 0 && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">
            Could not load dataset types from the database.
          </p>
        )}

        {(isLoading || isLoadingTypes) && <LoadingState />}

        {!isLoading && isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {error instanceof Error ? error.message : `Could not load dataset ${datasetId}.`}
          </p>
        )}

        {!isLoading && dataset && (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Dataset ID</label>
              <input
                type="text"
                value={dataset.dataset_id}
                disabled
                className="mt-1 input input-muted"
              />
            </div>

            <DynamicForm
              onSubmit={handleSubmit}
              values={formData}
              onChange={(next) => {
                setFormData(next);
                setFieldErrors({});
                setSaveError(null);
              }}
              fields={datasetFormFields(datasetTypes)}
              className="space-y-3"
              errors={fieldErrors}
              actions={
                <>
                  <div className="space-y-1 rounded-md px-3 py-2 text-xs" style={{ background: "var(--surface-alt)", border: "1px solid var(--border-strong)", color: "var(--muted)" }}>
                    <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Created:</span>{" "}{new Date(dataset.when_created).toLocaleString()} by {userMap.get(dataset.who_created) ?? "—"}</p>
                    <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Updated:</span>{" "}{new Date(dataset.when_updated).toLocaleString()} by {userMap.get(dataset.who_updated) ?? "—"}</p>
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

                    <LinkButton href={`/datasets/${datasetId}`} variant="ghost">
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
