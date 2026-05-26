import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DynamicForm, { DynamicFormField } from "@/components/DynamicForm";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { Button, LinkButton } from "@/components/ui/Button";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { SectionCard } from "@/components/ui/Card";
import { papiUrl } from "@/lib/papi";

type CreateDatasetResponse = {
  dataset_id?: number;
  data?: {
    dataset_id: number;
  };
  timestamp: string;
};

type DatasetType = {
  dataset_type_id: number;
  dataset_type_name: string;
};

function extractArray<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const source = payload as Record<string, unknown>;

  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value as T[];
    }
  }

  return [];
}

export default function DatasetCreate() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [datasetTypes, setDatasetTypes] = useState<DatasetType[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    dataset_doi: "",
    dataset_type_id: "",
    dataset_name: "",
    active: true,
  });

  useEffect(() => {
    async function loadDatasetTypes() {
      setIsLoadingOptions(true);
      try {
        const response = await fetch(papiUrl("lookups/dataset-types"), {
          cache: "no-store",
        });

        if (response.ok) {
          const json = (await response.json()) as unknown;
          setDatasetTypes(extractArray<DatasetType>(json, ["data", "dataset_types"]));
        }
      } catch {
        // leave datasetTypes empty, error shown below
      } finally {
        setIsLoadingOptions(false);
      }
    }

    void loadDatasetTypes();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setFieldErrors({});

    const nextFieldErrors: Record<string, string> = {};
    if (!formData.dataset_name.trim()) {
      nextFieldErrors.dataset_name = "Name is required.";
    }
    if (!formData.dataset_type_id) {
      nextFieldErrors.dataset_type_id = "Type is required.";
    }
    if (!formData.dataset_doi.trim()) {
      nextFieldErrors.dataset_doi = "DOI is required.";
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setSaveError("Please fix the highlighted fields.");
      toastError(addToast, "Please fix the highlighted fields.");
      return;
    }
    setIsSaving(true);

    try {
      const response = await fetch(papiUrl("datasets"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          dataset_type_id: Number(formData.dataset_type_id),
          dataset_name: formData.dataset_name,
          dataset_doi: formData.dataset_doi,
          active: formData.active,
        }),
      });

      if (!response.ok) {
        const fallbackMessage = "Could not create dataset.";

        try {
          const json = (await response.json()) as { error?: string };
          throw new Error(json.error ?? fallbackMessage);
        } catch {
          throw new Error(fallbackMessage);
        }
      }

      const json = (await response.json()) as CreateDatasetResponse;
      const newDatasetId = json.dataset_id ?? json.data?.dataset_id;

      if (!newDatasetId) {
        throw new Error("No dataset ID returned from create.");
      }

      setSaveSuccess(true);
      toastSuccess(addToast, "Dataset saved successfully.");
      navigate(`/datasets/${newDatasetId}`);
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setSaveError(caughtError.message);
        toastError(addToast, caughtError.message);
      } else {
        setSaveError("Could not create dataset.");
        toastError(addToast, "Could not create dataset.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  const fields: Array<DynamicFormField<typeof formData>> = [
    {
      key: "dataset_doi",
      label: "DOI",
      required: true,
      controlClassName: "mt-1 input",
    },
    {
      key: "dataset_type_id",
      label: "Type",
      type: "select",
      required: true,
      options: [
        { value: "", label: "--- Select a value ---" },
        ...datasetTypes.map((datasetType) => ({
          value: String(datasetType.dataset_type_id),
          label: datasetType.dataset_type_name,
        })),
      ],
      controlClassName: "mt-1 select",
    },
    {
      key: "dataset_name",
      label: "Name",
      required: true,
      controlClassName: "mt-1 input",
    },
    {
      key: "active",
      label: "Active",
      type: "checkbox",
      className: "flex items-center gap-2",
      controlClassName: "checkbox",
    },
  ];

  return (
    <PageShell size="3xl">
      <PageDetailHeader
        title="Create Dataset"
        breadcrumb={{ label: "Datasets", href: "/datasets" }}
      />

      <SectionCard>
        {isLoadingOptions && (
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
            Loading options...
          </p>
        )}

        {!isLoadingOptions && datasetTypes.length === 0 && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">
            Could not load dataset types from the database.
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

              {saveSuccess && (
                <p className="rounded-md bg-green-100 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                  Dataset created successfully!
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={isSaving || isLoadingOptions}>
                  {isLoadingOptions ? "Loading Options..." : isSaving ? "Creating..." : "Create Dataset"}
                </Button>

                <LinkButton href="/datasets" variant="ghost">
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
