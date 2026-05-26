import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DynamicForm, { DynamicFormField } from "@/components/DynamicForm";
import { Button, LinkButton } from "@/components/ui/Button";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { SectionCard } from "@/components/ui/Card";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { papiUrl } from "@/lib/papi";

type DatasetRelease = {
  dataset_release_id: number;
  dataset_id: number;
  release_number: number;
  release_date: string;
  release_notes: string;
  when_created?: string;
  who_created?: string;
  when_updated?: string;
  who_updated?: string;
};

type DatasetReleaseResponse = {
  dataset_release?: DatasetRelease;
  data?: DatasetRelease;
  release?: DatasetRelease;
  timestamp: string;
};

type Dataset = {
  dataset_id: number;
  dataset_name: string;
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

function toDateInput(value?: string) {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

export default function DatasetReleaseEdit() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { release_id: releaseId } = useParams<{ release_id: string }>();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    dataset_id: "",
    release_number: "",
    release_date: "",
    release_notes: "",
  });

  useEffect(() => {
    if (!releaseId) return;
    let isMounted = true;

    async function loadRelease() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const [releaseResponse, datasetsResponse] = await Promise.all([
          fetch(papiUrl(`distribution/datasets/releases/${releaseId}`), { cache: "no-store" }),
          fetch(`${papiUrl("distribution/datasets")}?limit=1000`, { cache: "no-store" }),
        ]);

        if (!releaseResponse.ok) {
          throw new Error(`Could not load dataset release ${releaseId}.`);
        }

        const releaseJson =
          (await releaseResponse.json()) as DatasetReleaseResponse;
        const release =
          releaseJson.dataset_release ??
          releaseJson.data ??
          releaseJson.release ??
          null;

        if (!release) {
          throw new Error("Release payload missing from response.");
        }

        if (datasetsResponse.ok) {
          const datasetsJson = (await datasetsResponse.json()) as unknown;
          const datasetsArray = extractArray<Dataset>(datasetsJson, [
            "datasets",
            "data",
            "items",
            "results",
          ]);
          setDatasets(datasetsArray);
        }

        if (!isMounted) {
          return;
        }

        setFormData({
          dataset_id: String(release.dataset_id ?? ""),
          release_number: String(release.release_number ?? ""),
          release_date: toDateInput(release.release_date),
          release_notes: release.release_notes ?? "",
        });
      } catch (caughtError) {
        if (!isMounted) {
          return;
        }

        if (caughtError instanceof Error) {
          setLoadError(caughtError.message);
        } else {
          setLoadError("Could not load dataset release.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadRelease();

    return () => {
      isMounted = false;
    };
  }, [releaseId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!releaseId) {
      return;
    }

    setSaveError(null);
    setFieldErrors({});
    setSaveSuccess(false);

    const nextFieldErrors: Record<string, string> = {};
    if (!formData.dataset_id) {
      nextFieldErrors.dataset_id = "Dataset is required.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setSaveError("Please fix the highlighted fields.");
      toastError(addToast, "Please fix the highlighted fields.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(papiUrl(`distribution/datasets/releases/${releaseId}`), {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          dataset_id: Number(formData.dataset_id),
          release_number: Number(formData.release_number),
          release_date: formData.release_date,
          release_notes: formData.release_notes,
        }),
      });

      if (!response.ok) {
        const fallbackMessage = "Could not update dataset release.";

        try {
          const json = (await response.json()) as { error?: string };
          throw new Error(json.error ?? fallbackMessage);
        } catch {
          throw new Error(fallbackMessage);
        }
      }

      setSaveSuccess(true);
      toastSuccess(addToast, "Dataset release saved successfully.");
      navigate(`/datasets/releases/${releaseId}`);
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setSaveError(caughtError.message);
        toastError(addToast, caughtError.message);
      } else {
        setSaveError("Could not update dataset release.");
        toastError(addToast, "Could not update dataset release.");
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
        title="Edit Dataset Release"
        breadcrumb={{ label: "Dataset Release", href: releaseId ? `/datasets/releases/${releaseId}` : "/datasets" }}
      />

      {isLoading && <p className="mt-4 text-sm">Loading release...</p>}

      {!isLoading && loadError && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">
          {loadError}
        </p>
      )}

      {!isLoading && !loadError && (
        <SectionCard>
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
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>

                <LinkButton
                  href={
                    releaseId ? `/datasets/releases/${releaseId}` : "/datasets"
                  }
                  variant="ghost"
                >
                  Cancel
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
              Dataset release updated successfully.
            </p>
          )}
        </SectionCard>
      )}
    </PageShell>
  );
}
