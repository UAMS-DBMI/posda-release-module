import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DynamicForm, { DynamicFormField } from "@/components/DynamicForm";
import { Button, LinkButton } from "@/components/ui/Button";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { SectionCard } from "@/components/ui/Card";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { papiUrl } from "@/lib/papi";

type CreateDatasetReleaseResponse = {
  dataset_release_id?: number;
  data?: {
    dataset_release_id: number;
  };
  timestamp: string;
};

type Dataset = {
  dataset_id: number;
  dataset_name: string;
};

type DatasetRelease = {
  release_number?: number;
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

export default function DatasetReleaseCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    dataset_id: "",
    release_number: "",
    release_date: "",
    release_notes: "",
  });

  useEffect(() => {
    async function loadDatasets() {
      setIsLoadingOptions(true);
      try {
        const response = await fetch(`${papiUrl("distribution/datasets")}?limit=1000`, {
          cache: "no-store",
        });

        if (!response.ok) {
          setDatasets([]);
          return;
        }

        const json = (await response.json()) as unknown;
        const datasetsArray = extractArray<Dataset>(json, [
          "datasets",
          "data",
          "items",
          "results",
        ]);
        setDatasets(datasetsArray);
      } catch {
        setDatasets([]);
      } finally {
        setIsLoadingOptions(false);
      }
    }

    void loadDatasets();
  }, []);

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

  useEffect(() => {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    setFormData((prev) =>
      prev.release_date
        ? prev
        : {
            ...prev,
            release_date: todayIso,
          },
    );
  }, []);

  useEffect(() => {
    const datasetId = formData.dataset_id;
    if (!datasetId || formData.release_number) {
      return;
    }

    let isMounted = true;

    async function loadReleaseNumber() {
      try {
        const response = await fetch(
          `${papiUrl(`distribution/datasets/${datasetId}/releases`)}?limit=1000`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          return;
        }

        const json = (await response.json()) as unknown;
        const releases = extractArray<DatasetRelease>(json, [
          "releases",
          "data",
          "items",
          "results",
        ]);
        const maxRelease = releases.reduce((max, release) => {
          const number = Number(release.release_number);
          return Number.isFinite(number) && number > max ? number : max;
        }, 0);

        if (!isMounted) {
          return;
        }

        setFormData((prev) =>
          prev.release_number
            ? prev
            : {
                ...prev,
                release_number: String(maxRelease + 1),
              },
        );
      } catch {
        if (!isMounted) {
          return;
        }
        setFormData((prev) =>
          prev.release_number
            ? prev
            : {
                ...prev,
                release_number: "1",
              },
        );
      }
    }

    void loadReleaseNumber();

    return () => {
      isMounted = false;
    };
  }, [formData.dataset_id, formData.release_number]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setFieldErrors({});
    setIsSaving(true);

    if (!formData.dataset_id) {
      setFieldErrors({ dataset_id: "Dataset is required." });
      setSaveError("Please fix the highlighted fields.");
      toastError(addToast, "Please fix the highlighted fields.");
      setIsSaving(false);
      return;
    }

    try {
      const response = await fetch(
        papiUrl(`distribution/datasets/${formData.dataset_id}/releases`),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            release_number: Number(formData.release_number),
            release_date: formData.release_date,
            release_notes: formData.release_notes,
          }),
        },
      );

      if (!response.ok) {
        const fallbackMessage = "Could not create dataset release.";

        try {
          const json = (await response.json()) as { error?: string };
          throw new Error(json.error ?? fallbackMessage);
        } catch {
          throw new Error(fallbackMessage);
        }
      }

      const json = (await response.json()) as CreateDatasetReleaseResponse;
      const newReleaseId =
        json.dataset_release_id ?? json.data?.dataset_release_id;

      if (!newReleaseId) {
        throw new Error("No dataset release ID returned from create.");
      }

      setSaveSuccess(true);
      toastSuccess(addToast, "Dataset release saved successfully.");
      navigate(`/datasets/releases/${newReleaseId}`);
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setSaveError(caughtError.message);
        toastError(addToast, caughtError.message);
      } else {
        setSaveError("Could not create dataset release.");
        toastError(addToast, "Could not create dataset release.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  const fields: Array<DynamicFormField<typeof formData>> = [
    {
      key: "dataset_id",
      label: "Dataset",
      type: "select",
      required: true,
      options: [
        { value: "", label: "--- Select a value ---" },
        ...datasets.map((dataset) => ({
          value: String(dataset.dataset_id),
          label: `${dataset.dataset_id} - ${dataset.dataset_name}`,
        })),
      ],
      controlClassName: "mt-1 select",
    },
    {
      key: "release_number",
      label: "Release Number",
      type: "number",
      inputMode: "numeric",
      controlClassName: "mt-1 input",
    },
    {
      key: "release_date",
      label: "Release Date",
      type: "date",
      controlClassName: "mt-1 input",
    },
    {
      key: "release_notes",
      label: "Release Notes",
      type: "textarea",
      rows: 5,
      controlClassName: "mt-1 textarea",
    },
  ];

  return (
    <PageShell size="3xl">
      <PageDetailHeader
        title="Create Dataset Release"
        breadcrumb={{ label: "Datasets", href: "/datasets" }}
      />

      <SectionCard>
        {isLoadingOptions && (
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
            Loading dataset options...
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
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Create Release"}
              </Button>

              <LinkButton
                href={
                  formData.dataset_id
                    ? `/datasets/${formData.dataset_id}`
                    : "/datasets"
                }
                variant="ghost"
              >
                Back to Dataset
              </LinkButton>
            </div>
          }
        />

        {saveError && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            {saveError}
          </p>
        )}

        {saveSuccess && !saveError && (
          <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">
            Dataset release created successfully.
          </p>
        )}
      </SectionCard>
    </PageShell>
  );
}
