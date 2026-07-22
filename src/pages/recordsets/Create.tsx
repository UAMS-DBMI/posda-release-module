import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DynamicForm from "@/components/DynamicForm";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { Button, LinkButton } from "@/components/ui/Button";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { SectionCard } from "@/components/ui/Card";
import { extractApiError } from "@/lib/apiUtils";
import {
  emptyRecordsetForm,
  recordsetCreatePayload,
  recordsetFormFields,
  useDatasetOptions,
  useRecordsetLookups,
  validateRecordsetForm,
  type RecordsetFormValues,
} from "@/lib/recordsetForm";

type CreateRecordsetResponse = {
  recordset_id?: number;
  data?: {
    recordset_id: number;
  };
  timestamp: string;
};

export default function RecordsetCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<RecordsetFormValues>(() =>
    emptyRecordsetForm(),
  );

  const { recordsetTypes, licenses, isLoading: isLoadingLookups } =
    useRecordsetLookups();
  const { datasets, isLoading: isLoadingDatasets } = useDatasetOptions();
  const isLoadingOptions = isLoadingLookups || isLoadingDatasets;

  const fields = recordsetFormFields({ recordsetTypes, licenses, datasets });

  useEffect(() => {
    const datasetIdFromQuery = searchParams.get("dataset_id");
    if (!datasetIdFromQuery) {
      return;
    }

    setFormData((prev) =>
      prev.dataset_id
        ? prev
        : {
            ...prev,
            dataset_id: datasetIdFromQuery,
          },
    );
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setFieldErrors({});

    const nextFieldErrors = validateRecordsetForm(formData);
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setSaveError("Please fix the highlighted fields.");
      toastError(addToast, "Please fix the highlighted fields.");
      return;
    }
    setIsSaving(true);

    try {
      const response = await fetch("/papi/v1/distribution/recordsets", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(recordsetCreatePayload(formData)),
      });

      if (!response.ok) {
        const fallbackMessage = "Could not create recordset.";
        const json = (await response.json()) as unknown;
        throw new Error(extractApiError(json, fallbackMessage));
      }

      const json = (await response.json()) as CreateRecordsetResponse;
      const newRecordsetId = json.recordset_id ?? json.data?.recordset_id;

      if (!newRecordsetId) {
        throw new Error("No recordset ID returned from create.");
      }

      toastSuccess(addToast, "Recordset saved successfully.");
      navigate(`/recordsets/${newRecordsetId}`);
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setSaveError(caughtError.message);
        toastError(addToast, caughtError.message);
      } else {
        setSaveError("Could not create recordset.");
        toastError(addToast, "Could not create recordset.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <PageShell size="3xl">
      <PageDetailHeader
        title="Create Recordset"
        breadcrumb={{ label: "Recordsets", href: "/recordsets" }}
      />

      <SectionCard>
        {isLoadingOptions && (
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
            Loading dataset and license options...
          </p>
        )}

        {!isLoadingOptions && licenses.length === 0 && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">
            Could not load licenses from the database.
          </p>
        )}

        {!isLoadingOptions && recordsetTypes.length === 0 && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">
            Could not load recordset types from the database.
          </p>
        )}

        <DynamicForm
          onSubmit={handleSubmit}
          values={formData}
          onChange={(next) => {
            setFormData(next);
            setFieldErrors({});
            setSaveError(null);
          }}
          fields={fields}
          errors={fieldErrors}
          className="space-y-3"
          actions={
            <>
              {saveError && (
                <p className="rounded-md bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                  {saveError}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="submit" loading={isSaving || isLoadingOptions}>
                  {isLoadingOptions ? "Loading Options" : "Create Recordset"}
                </Button>

                <LinkButton href="/recordsets" variant="ghost">
                  Cancel
                </LinkButton>
              </div>
            </>
          }
        />
      </SectionCard>
    </PageShell>
  );
}
