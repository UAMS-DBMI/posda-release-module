import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DynamicForm, { DynamicFormField } from "@/components/DynamicForm";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { Button, LinkButton } from "@/components/ui/Button";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { SectionCard } from "@/components/ui/Card";
import { papiUrl } from "@/lib/papi";

type CreateRecordsetResponse = {
  recordset_id?: number;
  data?: {
    recordset_id: number;
  };
  timestamp: string;
};

type Dataset = {
  dataset_id: number;
  dataset_name: string;
};

type License = {
  license_id: number;
  license_label: string;
};

type RecordsetType = {
  recordset_type_id: number;
  recordset_type_name: string;
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

export default function RecordsetCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [recordsetTypes, setRecordsetTypes] = useState<RecordsetType[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    dataset_id: "",
    recordset_doi: "",
    license_id: "",
    recordset_name: "",
    recordset_type_id: "",
    active: true,
  });

  useEffect(() => {
    async function loadOptions() {
      setIsLoadingOptions(true);
      try {
        const [datasetsRes, licensesRes] = await Promise.all([
          fetch(`${papiUrl("distribution/datasets")}?limit=1000`, { cache: "no-store" }),
          fetch(papiUrl("distribution/lookups/licenses"), { cache: "no-store" }),
        ]);

        const recordsetTypesRes = await fetch(papiUrl("distribution/lookups/recordset-types"), {
          cache: "no-store",
        });

        if (datasetsRes.ok) {
          const datasetsJson = (await datasetsRes.json()) as unknown;
          const datasetsArray = extractArray<Dataset>(datasetsJson, [
            "datasets",
            "data",
            "items",
            "results",
          ]);
          setDatasets(datasetsArray);
        }

        if (licensesRes.ok) {
          const licensesJson = (await licensesRes.json()) as unknown;
          const licensesArray = extractArray<License>(licensesJson, [
            "licenses",
            "data",
            "items",
            "results",
          ]);
          setLicenses(licensesArray);
        }

        if (recordsetTypesRes.ok) {
          const recordsetTypesJson =
            (await recordsetTypesRes.json()) as unknown;
          const recordsetTypesArray = extractArray<RecordsetType>(
            recordsetTypesJson,
            ["recordset_types", "data", "items", "results"],
          );
          setRecordsetTypes(recordsetTypesArray);
        }
      } catch {
        setLicenses([]);
      } finally {
        setIsLoadingOptions(false);
      }
    }

    void loadOptions();
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setFieldErrors({});

    const nextFieldErrors: Record<string, string> = {};
    if (!formData.dataset_id) {
      nextFieldErrors.dataset_id = "Dataset is required.";
    }
    if (!formData.recordset_name.trim()) {
      nextFieldErrors.recordset_name = "Name is required.";
    }
    if (!formData.recordset_type_id) {
      nextFieldErrors.recordset_type_id = "Type is required.";
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setSaveError("Please fix the highlighted fields.");
      toastError(addToast, "Please fix the highlighted fields.");
      return;
    }
    setIsSaving(true);

    try {
      const response = await fetch(papiUrl("distribution/recordsets"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          dataset_id: Number(formData.dataset_id),
          ...(formData.recordset_doi.trim()
            ? { recordset_doi: formData.recordset_doi.trim() }
            : {}),
          license_id: Number(formData.license_id),
          recordset_name: formData.recordset_name,
          recordset_type_id: Number(formData.recordset_type_id),
          active: formData.active,
        }),
      });

      if (!response.ok) {
        const fallbackMessage = "Could not create recordset.";

        try {
          const json = (await response.json()) as { error?: string };
          throw new Error(json.error ?? fallbackMessage);
        } catch {
          throw new Error(fallbackMessage);
        }
      }

      const json = (await response.json()) as CreateRecordsetResponse;
      const newRecordsetId = json.recordset_id ?? json.data?.recordset_id;

      if (!newRecordsetId) {
        throw new Error("No recordset ID returned from create.");
      }

      setSaveSuccess(true);
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

  const fields: Array<DynamicFormField<typeof formData>> = [
    {
      key: "dataset_id",
      label: "Dataset",
      type: "select",
      required: true,
      options: [
        { value: "", label: "--- Select a value ---" },
        ...datasets.map((d) => ({
          value: String(d.dataset_id),
          label: `${d.dataset_id} - ${d.dataset_name}`,
        })),
      ],
      controlClassName: "mt-1 select",
    },
    {
      key: "recordset_doi",
      label: "DOI",
      controlClassName: "mt-1 input",
    },
    {
      key: "license_id",
      label: "License",
      type: "select",
      options: [
        { value: "", label: "--- Select a value ---" },
        ...licenses.map((l) => ({
          value: String(l.license_id),
          label: l.license_label,
        })),
      ],
      controlClassName: "mt-1 select",
    },
    {
      key: "recordset_name",
      label: "Name",
      required: true,
      controlClassName: "mt-1 input",
    },
    {
      key: "recordset_type_id",
      label: "Type",
      type: "select",
      required: true,
      options: [
        { value: "", label: "--- Select a value ---" },
        ...recordsetTypes.map((recordsetType) => ({
          value: String(recordsetType.recordset_type_id),
          label: recordsetType.recordset_type_name,
        })),
      ],
      controlClassName: "mt-1 select",
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

              {saveSuccess && (
                <p className="rounded-md bg-green-100 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                  Recordset created successfully!
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={isSaving || isLoadingOptions}>
                  {isLoadingOptions
                    ? "Loading Options..."
                    : isSaving
                      ? "Creating..."
                      : "Create Recordset"}
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
