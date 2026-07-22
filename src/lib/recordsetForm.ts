import { useQuery } from "@tanstack/react-query";
import type { DynamicFormField } from "@/components/DynamicForm";
import { apiFetch } from "@/lib/apiFetch";
import { extractArray } from "@/lib/apiUtils";

/**
 * One definition of the recordset create form — fields, validation, and payload
 * — shared by the full page (`pages/recordsets/Create.tsx`) and the in-place
 * modal (`components/CreateRecordsetModal.tsx`), so the two can't drift.
 * Layout and what happens after a successful save stay with each caller.
 */

export type Dataset = { dataset_id: number; dataset_name: string };
export type License = { license_id: number; license_label: string };
export type RecordsetType = {
  recordset_type_id: number;
  recordset_type_name: string;
};

export type RecordsetFormValues = {
  dataset_id: string;
  recordset_doi: string;
  license_id: string;
  recordset_name: string;
  recordset_type_id: string;
  active: boolean;
};

export function emptyRecordsetForm(datasetId?: string): RecordsetFormValues {
  return {
    dataset_id: datasetId ?? "",
    recordset_doi: "",
    license_id: "",
    recordset_name: "",
    recordset_type_id: "",
    active: true,
  };
}

// Reference data: fetched once and shared by key across every caller.
export function useRecordsetLookups() {
  const types = useQuery({
    queryKey: ["lookup", "recordset-types"],
    staleTime: Infinity,
    queryFn: async () =>
      extractArray<RecordsetType>(
        await apiFetch("/papi/v1/distribution/lookups/recordset-types"),
        ["recordset_types", "data", "items", "results"],
      ),
  });

  const licenses = useQuery({
    queryKey: ["lookup", "licenses"],
    staleTime: Infinity,
    queryFn: async () =>
      extractArray<License>(
        await apiFetch("/papi/v1/distribution/lookups/licenses"),
        ["licenses", "data", "items", "results"],
      ),
  });

  return {
    recordsetTypes: types.data ?? [],
    licenses: licenses.data ?? [],
    isLoading: types.isLoading || licenses.isLoading,
  };
}

/** Only the full page needs this — the modal's dataset comes from context. */
export function useDatasetOptions(enabled = true) {
  const datasets = useQuery({
    queryKey: ["lookup", "datasets-for-select"],
    enabled,
    staleTime: 60_000,
    queryFn: async () =>
      extractArray<Dataset>(
        await apiFetch("/papi/v1/distribution/datasets?limit=1000"),
        ["datasets", "data", "items", "results"],
      ),
  });

  return { datasets: datasets.data ?? [], isLoading: datasets.isLoading };
}

const PLACEHOLDER = { value: "", label: "--- Select a value ---" };

type FieldOptions = {
  recordsetTypes: RecordsetType[];
  licenses: License[];
  /** Omit to hide the dataset field entirely (dataset fixed by context). */
  datasets?: Dataset[];
};

export function recordsetFormFields({
  recordsetTypes,
  licenses,
  datasets,
}: FieldOptions): Array<DynamicFormField<RecordsetFormValues>> {
  const datasetField: Array<DynamicFormField<RecordsetFormValues>> = datasets
    ? [
        {
          key: "dataset_id",
          label: "Dataset",
          type: "select",
          required: true,
          options: [
            PLACEHOLDER,
            ...datasets.map((d) => ({
              value: String(d.dataset_id),
              label: `${d.dataset_id} - ${d.dataset_name}`,
            })),
          ],
          controlClassName: "mt-1 select",
        },
      ]
    : [];

  return [
    ...datasetField,
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
        PLACEHOLDER,
        ...recordsetTypes.map((t) => ({
          value: String(t.recordset_type_id),
          label: t.recordset_type_name,
        })),
      ],
      controlClassName: "mt-1 select",
    },
    {
      key: "license_id",
      label: "License",
      type: "select",
      required: true,
      options: [
        PLACEHOLDER,
        ...licenses.map((l) => ({
          value: String(l.license_id),
          label: l.license_label,
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
      key: "active",
      label: "Active",
      type: "checkbox",
      className: "flex items-center gap-2",
      controlClassName: "checkbox",
    },
  ];
}

/** `recordset.license_id` is NOT NULL, so License is required here rather than
 *  surfacing as an opaque database error. */
export function validateRecordsetForm(
  values: RecordsetFormValues,
  { requireDataset = true }: { requireDataset?: boolean } = {},
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (requireDataset && !values.dataset_id) {
    errors.dataset_id = "Dataset is required.";
  }
  if (!values.recordset_name.trim()) {
    errors.recordset_name = "Name is required.";
  }
  if (!values.recordset_type_id) {
    errors.recordset_type_id = "Type is required.";
  }
  if (!values.license_id) {
    errors.license_id = "License is required.";
  }
  return errors;
}

export function recordsetCreatePayload(values: RecordsetFormValues) {
  return {
    dataset_id: Number(values.dataset_id),
    recordset_name: values.recordset_name.trim(),
    recordset_type_id: Number(values.recordset_type_id),
    license_id: Number(values.license_id),
    ...(values.recordset_doi.trim()
      ? { recordset_doi: values.recordset_doi.trim() }
      : {}),
    active: values.active,
  };
}
