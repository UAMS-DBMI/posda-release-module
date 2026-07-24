import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DynamicFormField } from "@/components/DynamicForm";
import { apiFetch } from "@/lib/apiFetch";
import { extractArray } from "@/lib/apiUtils";

/**
 * One definition of the dataset edit form -- fields, validation, and payload
 * -- shared by the full page (`pages/datasets/Edit.tsx`) and the in-place
 * modal (`components/DatasetEditModal.tsx`), so the two can't drift.
 */

export type DatasetType = { dataset_type_id: number; dataset_type_name: string };

export type DatasetRecord = {
  dataset_id: number;
  dataset_type_id: number;
  dataset_doi: string;
  dataset_name: string;
  active: boolean;
  when_created: string;
  when_updated: string;
  who_created: number;
  who_updated: number;
};

export type DatasetFormValues = {
  dataset_doi: string;
  dataset_type_id: string;
  dataset_name: string;
  active: boolean;
};

export function useDataset(datasetId: string | number | undefined) {
  return useQuery({
    queryKey: ["dataset", datasetId ?? ""],
    enabled: Boolean(datasetId),
    queryFn: async () => {
      const json = await apiFetch<{ dataset?: DatasetRecord; data?: DatasetRecord }>(
        `/papi/v1/distribution/datasets/${datasetId}`,
      );
      return json.dataset ?? json.data ?? null;
    },
  });
}

export function useDatasetTypes() {
  const query = useQuery({
    queryKey: ["lookup", "dataset-types"],
    staleTime: Infinity,
    queryFn: async () =>
      extractArray<DatasetType>(
        await apiFetch("/papi/v1/distribution/lookups/dataset-types"),
        ["dataset_types", "data", "items", "results"],
      ),
  });
  return { datasetTypes: query.data ?? [], isLoading: query.isLoading };
}

export function datasetToFormValues(dataset: DatasetRecord): DatasetFormValues {
  return {
    dataset_doi: dataset.dataset_doi ?? "",
    dataset_type_id: String(dataset.dataset_type_id),
    dataset_name: dataset.dataset_name,
    active: dataset.active,
  };
}

const PLACEHOLDER = { value: "", label: "--- Select a value ---" };

/** Compact 2-column layout for the edit modal: Name and DOI each span both
 *  columns, Type + Active share a row. */
export function datasetFormFields(
  datasetTypes: DatasetType[],
): Array<DynamicFormField<DatasetFormValues>> {
  return [
    {
      key: "dataset_name",
      label: "Name",
      required: true,
      className: "col-span-2 block",
      controlClassName: "mt-1 input",
    },
    {
      key: "dataset_doi",
      label: "DOI",
      required: true,
      className: "col-span-2 block",
      controlClassName: "mt-1 input",
    },
    {
      key: "dataset_type_id",
      label: "Type",
      type: "select",
      required: true,
      options: [
        PLACEHOLDER,
        ...datasetTypes.map((t) => ({
          value: String(t.dataset_type_id),
          label: t.dataset_type_name,
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

export function validateDatasetForm(values: DatasetFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.dataset_name.trim()) errors.dataset_name = "Name is required.";
  if (!values.dataset_type_id) errors.dataset_type_id = "Type is required.";
  if (!values.dataset_doi.trim()) errors.dataset_doi = "DOI is required.";
  return errors;
}

export function datasetEditPayload(values: DatasetFormValues) {
  return {
    dataset_type_id: Number(values.dataset_type_id),
    dataset_doi: values.dataset_doi.trim(),
    dataset_name: values.dataset_name.trim(),
    active: values.active,
  };
}

export function useSaveDataset(datasetId: string | number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: DatasetFormValues) => {
      const json = await apiFetch<{ dataset?: DatasetRecord; data?: DatasetRecord }>(
        `/papi/v1/distribution/datasets/${datasetId}`,
        { method: "PUT", body: JSON.stringify(datasetEditPayload(values)) },
      );
      return json.dataset ?? json.data ?? null;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dataset", datasetId ?? ""] });
      // The cycle rollup (Setup's dataset row) embeds a snapshot, so it goes
      // stale too -- same reasoning as the WP-link/destination mutations.
      void queryClient.invalidateQueries({ queryKey: ["dataset-cycle"] });
    },
  });
}
