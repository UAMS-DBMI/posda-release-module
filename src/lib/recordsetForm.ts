import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
export type RecordsetType = {
  recordset_type_id: number;
  recordset_type_name: string;
};
export type Destination = {
  destination_id: number;
  destination_name: string;
  destination_abbr: string;
};
export type RecordsetFormValues = {
  dataset_id: string;
  recordset_doi: string;
  recordset_name: string;
  recordset_type_id: string;
  active: boolean;
};

export function emptyRecordsetForm(datasetId?: string): RecordsetFormValues {
  return {
    dataset_id: datasetId ?? "",
    recordset_doi: "",
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

  return {
    recordsetTypes: types.data ?? [],
    isLoading: types.isLoading,
  };
}

// Destination lookup. Not used by the create form itself -- shared with
// RecordsetDestinationModal, which manages a recordset's destinations as a
// separate action.
export function useDestinationLookups() {
  const destinations = useQuery({
    queryKey: ["lookup", "destinations"],
    staleTime: Infinity,
    queryFn: async () =>
      extractArray<Destination>(
        await apiFetch("/papi/v1/distribution/lookups/destinations"),
        ["destinations", "data", "items", "results"],
      ),
  });

  return {
    destinations: destinations.data ?? [],
    isLoading: destinations.isLoading,
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
  /** Omit to hide the dataset field entirely (dataset fixed by context). */
  datasets?: Dataset[];
};

export function recordsetFormFields({
  recordsetTypes,
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
  return errors;
}

export function recordsetCreatePayload(values: RecordsetFormValues) {
  return {
    dataset_id: Number(values.dataset_id),
    recordset_name: values.recordset_name.trim(),
    recordset_type_id: Number(values.recordset_type_id),
    ...(values.recordset_doi.trim()
      ? { recordset_doi: values.recordset_doi.trim() }
      : {}),
    active: values.active,
  };
}

/**
 * Edit form -- fields, validation, and payload -- shared by the full page
 * (`pages/recordsets/Edit.tsx`) and the in-place modal
 * (`components/RecordsetEditModal.tsx`). Kept separate from the create form
 * above because the field layouts differ. Includes a dataset selector so a
 * recordset can be reassigned from either surface.
 */

export type RecordsetRecord = {
  recordset_id: number;
  recordset_doi: string;
  dataset_id: number;
  /** Joined lookup labels; present on reads, not needed for the edit form. */
  dataset_name?: string;
  recordset_type_name?: string;
  recordset_name: string;
  recordset_type_id: number;
  active: boolean;
  when_created: string;
  when_updated: string;
  who_created: number;
  who_updated: number;
};

export type RecordsetEditFormValues = {
  dataset_id: string;
  recordset_doi: string;
  recordset_name: string;
  recordset_type_id: string;
  active: boolean;
};

export function useRecordset(recordsetId: string | number | undefined) {
  return useQuery({
    queryKey: ["recordset", recordsetId ?? ""],
    enabled: Boolean(recordsetId),
    queryFn: async () => {
      const json = await apiFetch<{ recordset?: RecordsetRecord; data?: RecordsetRecord }>(
        `/papi/v1/distribution/recordsets/${recordsetId}`,
      );
      return json.recordset ?? json.data ?? null;
    },
  });
}

/** The API represents "no DOI yet" as the literal string "-". */
export function recordsetToFormValues(recordset: RecordsetRecord): RecordsetEditFormValues {
  return {
    dataset_id: String(recordset.dataset_id),
    recordset_doi:
      recordset.recordset_doi && recordset.recordset_doi !== "-" ? recordset.recordset_doi : "",
    recordset_name: recordset.recordset_name ?? "",
    recordset_type_id: String(recordset.recordset_type_id),
    active: recordset.active,
  };
}

/** Compact 2-column layout for the edit modal: Dataset, Name, DOI and Type
 *  each span both columns on their own row; Active sits on the last. */
export function recordsetEditFormFields({
  recordsetTypes,
  datasets,
}: {
  recordsetTypes: RecordsetType[];
  datasets: Dataset[];
}): Array<DynamicFormField<RecordsetEditFormValues>> {
  return [
    {
      key: "dataset_id",
      label: "Dataset",
      type: "select",
      required: true,
      className: "col-span-2 block",
      options: [
        PLACEHOLDER,
        ...datasets.map((d) => ({
          value: String(d.dataset_id),
          label: `${d.dataset_id} - ${d.dataset_name}`,
        })),
      ],
      controlClassName: "mt-1 select",
    },
    {
      key: "recordset_name",
      label: "Name",
      required: true,
      className: "col-span-2 block",
      controlClassName: "mt-1 input",
    },
    {
      key: "recordset_doi",
      label: "DOI",
      className: "col-span-2 block",
      controlClassName: "mt-1 input",
    },
    {
      key: "recordset_type_id",
      label: "Type",
      type: "select",
      required: true,
      className: "col-span-2 block",
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
      key: "active",
      label: "Active",
      type: "checkbox",
      className: "flex items-center gap-2 self-end pb-2",
      controlClassName: "checkbox",
    },
  ];
}

export function validateRecordsetEditForm(
  values: RecordsetEditFormValues,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.dataset_id) errors.dataset_id = "Dataset is required.";
  if (!values.recordset_name.trim()) errors.recordset_name = "Name is required.";
  if (!values.recordset_type_id) errors.recordset_type_id = "Type is required.";
  return errors;
}

export function recordsetEditPayload(values: RecordsetEditFormValues) {
  return {
    dataset_id: Number(values.dataset_id),
    recordset_name: values.recordset_name.trim(),
    recordset_type_id: Number(values.recordset_type_id),
    // Always sent, null when blank. Omitting it read as "leave the DOI alone",
    // so clearing the field silently kept the old value.
    recordset_doi: values.recordset_doi.trim() || null,
    active: values.active,
  };
}

export function useSaveRecordset(recordsetId: string | number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: RecordsetEditFormValues) => {
      const json = await apiFetch<{ recordset?: RecordsetRecord; data?: RecordsetRecord }>(
        `/papi/v1/distribution/recordsets/${recordsetId}`,
        { method: "PUT", body: JSON.stringify(recordsetEditPayload(values)) },
      );
      return json.recordset ?? json.data ?? null;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recordset", recordsetId ?? ""] });
      void queryClient.invalidateQueries({ queryKey: ["dataset-cycle"] });
    },
  });
}
