import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DynamicForm, { DynamicFormField } from "@/components/DynamicForm";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { Button, LinkButton } from "@/components/ui/Button";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { SectionCard } from "@/components/ui/Card";
import { papiUrl } from "@/lib/papi";

type Recordset = {
  recordset_id: number;
  recordset_doi: string;
  dataset_id: number;
  dataset_name: string;
  license_id: number;
  license_label: string;
  recordset_name?: string;
  recordset_type_id: number;
  recordset_type_name: string;
  active: boolean;
  when_created: string;
  when_updated: string;
  who_created: string;
  who_updated: string;
};

type RecordsetResponse = {
  recordset?: Recordset;
  data?: Recordset;
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

export default function RecordsetEdit() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { recordset_id: recordsetId } = useParams<{ recordset_id: string }>();
  const [data, setData] = useState<RecordsetResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
    active: false,
  });

  function getErrorMessage(payload: unknown, fallbackMessage: string) {
    if (!payload || typeof payload !== "object") {
      return fallbackMessage;
    }

    const errorPayload = payload as {
      error?: string | { message?: string; details?: unknown };
    };

    if (typeof errorPayload.error === "string") {
      return errorPayload.error;
    }

    if (errorPayload.error?.message) {
      return errorPayload.error.message;
    }

    return fallbackMessage;
  }

  useEffect(() => {
    let isMounted = true;

    async function loadOptions() {
      setIsLoadingOptions(true);

      try {
        const [datasetsRes, licensesRes, recordsetTypesRes] = await Promise.all(
          [
            fetch(`${papiUrl("distribution/datasets")}?limit=1000`, { cache: "no-store" }),
            fetch(papiUrl("distribution/lookups/licenses"), { cache: "no-store" }),
            fetch(papiUrl("distribution/lookups/recordset-types"), { cache: "no-store" }),
          ],
        );

        if (datasetsRes.ok) {
          const datasetsJson = (await datasetsRes.json()) as unknown;
          setDatasets(
            extractArray<Dataset>(datasetsJson, ["data", "datasets"]),
          );
        }

        if (licensesRes.ok) {
          const licensesJson = (await licensesRes.json()) as unknown;
          setLicenses(
            extractArray<License>(licensesJson, ["data", "licenses"]),
          );
        }

        if (recordsetTypesRes.ok) {
          const recordsetTypesJson =
            (await recordsetTypesRes.json()) as unknown;
          setRecordsetTypes(
            extractArray<RecordsetType>(recordsetTypesJson, [
              "data",
              "recordset_types",
            ]),
          );
        }
      } catch {
        setDatasets([]);
        setLicenses([]);
        setRecordsetTypes([]);
      } finally {
        setIsLoadingOptions(false);
      }
    }

    void loadOptions();

    async function loadRecordset() {
      if (!recordsetId) {
        setError("Could not load recordset id.");
        setData(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(papiUrl(`distribution/recordsets/${recordsetId}`), {
          cache: "no-store",
        });

        if (!response.ok) {
          const fallbackMessage = `Could not load recordset ${recordsetId}.`;

          try {
            const json = (await response.json()) as { error?: string };
            throw new Error(json.error ?? fallbackMessage);
          } catch {
            throw new Error(fallbackMessage);
          }
        }

        const json = (await response.json()) as RecordsetResponse;
        const recordset = json.recordset ?? json.data;

        if (!isMounted) {
          return;
        }

        setData({ ...json, recordset });

        if (recordset) {
          setFormData({
            dataset_id: String(recordset.dataset_id),
            recordset_doi:
              recordset.recordset_doi && recordset.recordset_doi !== "-"
                ? recordset.recordset_doi
                : "",
            license_id: String(recordset.license_id),
            recordset_name: recordset.recordset_name ?? "",
            recordset_type_id: String(recordset.recordset_type_id),
            active: recordset.active,
          });
        }
      } catch (caughtError) {
        if (!isMounted) {
          return;
        }

        if (caughtError instanceof Error) {
          setError(caughtError.message);
        } else {
          setError(`Could not load recordset ${recordsetId}.`);
        }

        setData(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadRecordset();

    return () => {
      isMounted = false;
    };
  }, [recordsetId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);
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

    if (!recordsetId) {
      setSaveError("Could not save recordset: missing recordset id.");
      toastError(addToast, "Could not save recordset: missing recordset id.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(papiUrl(`distribution/recordsets/${recordsetId}`), {
        method: "PUT",
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
        const fallbackMessage = `Could not save recordset ${recordsetId}.`;

        try {
          const json = (await response.json()) as unknown;
          throw new Error(getErrorMessage(json, fallbackMessage));
        } catch {
          throw new Error(fallbackMessage);
        }
      }

      toastSuccess(addToast, "Recordset saved successfully.");
      navigate(`/recordsets/${recordsetId}`);
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setSaveError(caughtError.message);
        toastError(addToast, caughtError.message);
      } else {
        setSaveError(`Could not save recordset ${recordsetId}.`);
        toastError(addToast, `Could not save recordset ${recordsetId}.`);
      }
    } finally {
      setIsSaving(false);
    }
  }

  const recordset = data?.recordset ?? data?.data ?? null;
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
      controlClassName: "mt-1 select input-muted",
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
        ...licenses.map((license) => ({
          value: String(license.license_id),
          label: license.license_label,
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
        title="Edit Recordset"
        breadcrumb={{ label: "Recordset", href: recordsetId ? `/recordsets/${recordsetId}` : "/recordsets" }}
      />

      <SectionCard>
        {isLoadingOptions && (
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
            Loading dataset, license, and recordset type options...
          </p>
        )}

        {isLoading && <p className="text-sm">Loading...</p>}

        {!isLoading && error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
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
                  <div className="space-y-1 rounded-md px-3 py-2 text-xs" style={{ background: "var(--surface-alt)", border: "1px solid var(--border-strong)", color: "var(--muted)" }}>
                    <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Created:</span>{" "}{new Date(recordset.when_created).toLocaleString()} by {recordset.who_created}</p>
                    <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Updated:</span>{" "}{new Date(recordset.when_updated).toLocaleString()} by {recordset.who_updated}</p>
                  </div>

                  {saveError && (
                    <p className="rounded-md bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                      {saveError}
                    </p>
                  )}

                  <div className="flex gap-3 pt-2">
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save Changes"}
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
