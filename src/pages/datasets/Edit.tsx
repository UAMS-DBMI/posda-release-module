import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DynamicForm, { DynamicFormField } from "@/components/DynamicForm";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { Button, LinkButton } from "@/components/ui/Button";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { SectionCard } from "@/components/ui/Card";
import { papiUrl } from "@/lib/papi";

type Dataset = {
  dataset_id: number;
  dataset_type_id: number;
  dataset_type_name: string;
  dataset_doi: string;
  dataset_name: string;
  active: boolean;
  when_created: string;
  when_updated: string;
  who_created: string;
  who_updated: string;
};

type DatasetResponse = {
  dataset?: Dataset;
  data?: Dataset;
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

export default function DatasetEdit() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { dataset_id: datasetId } = useParams<{ dataset_id: string }>();
  const [data, setData] = useState<DatasetResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datasetTypes, setDatasetTypes] = useState<DatasetType[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    dataset_doi: "",
    dataset_type_id: "",
    dataset_name: "",
    active: false,
  });

  useEffect(() => {
    async function loadDatasetTypes() {
      try {
        const response = await fetch(papiUrl("distribution/lookups/dataset-types"), {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const json = (await response.json()) as unknown;
        setDatasetTypes(
          extractArray<DatasetType>(json, ["data", "dataset_types"]),
        );
      } catch {
        setDatasetTypes([]);
      }
    }

    void loadDatasetTypes();
  }, []);

  useEffect(() => {
    if (!datasetId) {
      setError("Could not load dataset id.");
      setData(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function loadDataset() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(papiUrl(`distribution/datasets/${datasetId}`), {
          cache: "no-store",
        });

        if (!response.ok) {
          const fallbackMessage = `Could not load dataset ${datasetId}.`;

          try {
            const json = (await response.json()) as { error?: string };
            throw new Error(json.error ?? fallbackMessage);
          } catch {
            throw new Error(fallbackMessage);
          }
        }

        const json = (await response.json()) as DatasetResponse;

        if (!isMounted) {
          return;
        }

        const dataset = json.dataset ?? json.data;
        setData({ ...json, dataset });

        if (dataset) {
          setFormData({
            dataset_doi: dataset.dataset_doi,
            dataset_type_id: String(dataset.dataset_type_id),
            dataset_name: dataset.dataset_name,
            active: dataset.active,
          });
        }
      } catch (caughtError) {
        if (!isMounted) {
          return;
        }

        if (caughtError instanceof Error) {
          setError(caughtError.message);
        } else {
          setError(`Could not load dataset ${datasetId}.`);
        }

        setData(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadDataset();

    return () => {
      isMounted = false;
    };
  }, [datasetId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setFieldErrors({});

    const nextFieldErrors: Record<string, string> = {};

    if (!formData.dataset_doi.trim()) {
      nextFieldErrors.dataset_doi = "DOI is required.";
    }

    if (!formData.dataset_type_id) {
      nextFieldErrors.dataset_type_id = "Type is required.";
    }

    if (!formData.dataset_name.trim()) {
      nextFieldErrors.dataset_name = "Name is required.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setSaveError("Please fix the highlighted fields.");
      toastError(addToast, "Please fix the highlighted fields.");
      return;
    }

    if (!datasetId) {
      setSaveError("Could not save dataset: missing dataset id.");
      toastError(addToast, "Could not save dataset: missing dataset id.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(papiUrl(`distribution/datasets/${datasetId}`), {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          dataset_type_id: Number(formData.dataset_type_id),
          dataset_doi: formData.dataset_doi,
          dataset_name: formData.dataset_name,
          active: formData.active,
        }),
      });

      if (!response.ok) {
        const fallbackMessage = `Could not save dataset ${datasetId}.`;

        try {
          const json = (await response.json()) as { error?: string };
          throw new Error(json.error ?? fallbackMessage);
        } catch {
          throw new Error(fallbackMessage);
        }
      }

      setSaveSuccess(true);
      toastSuccess(addToast, "Dataset saved successfully.");
      navigate(`/datasets/${datasetId}`);
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setSaveError(caughtError.message);
        toastError(addToast, caughtError.message);
      } else {
        setSaveError(`Could not save dataset ${datasetId}.`);
        toastError(addToast, `Could not save dataset ${datasetId}.`);
      }
    } finally {
      setIsSaving(false);
    }
  }

  const dataset = data?.dataset ?? data?.data ?? null;
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
        title="Edit Dataset"
        breadcrumb={{ label: "Dataset", href: datasetId ? `/datasets/${datasetId}` : "/datasets" }}
      />

      <SectionCard>
        {datasetTypes.length === 0 && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">
            Could not load dataset types from the database.
          </p>
        )}

        {isLoading && <p className="text-sm">Loading...</p>}

        {!isLoading && error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
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
              fields={fields}
              className="space-y-3"
              errors={fieldErrors}
              actions={
                <>
                  <div className="space-y-1 rounded-md px-3 py-2 text-xs" style={{ background: "var(--surface-alt)", border: "1px solid var(--border-strong)", color: "var(--muted)" }}>
                    <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Created:</span>{" "}{new Date(dataset.when_created).toLocaleString()} by {dataset.who_created}</p>
                    <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Updated:</span>{" "}{new Date(dataset.when_updated).toLocaleString()} by {dataset.who_updated}</p>
                  </div>

                  {saveError && (
                    <p className="rounded-md bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                      {saveError}
                    </p>
                  )}

                  {saveSuccess && (
                    <p className="rounded-md bg-green-100 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                      Dataset saved successfully!
                    </p>
                  )}

                  <div className="flex gap-3 pt-2">
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save Changes"}
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
