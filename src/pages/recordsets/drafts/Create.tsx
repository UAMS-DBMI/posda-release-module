import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DynamicForm, { DynamicFormField } from "@/components/DynamicForm";
import { Button, LinkButton } from "@/components/ui/Button";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { SectionCard } from "@/components/ui/Card";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";

type CreateDraftResponse = {
  recordset_draft_id?: number;
  data?: {
    recordset_draft_id: number;
  };
  timestamp: string;
};

type Recordset = {
  recordset_id: number;
  recordset_name: string;
};

type RecordsetRelease = {
  recordset_release_id: number;
  release_number: number;
  release_date: string;
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

function formatReleaseLabel(release: RecordsetRelease) {
  const date = release.release_date
    ? new Date(release.release_date).toLocaleDateString()
    : "";
  return `v${release.release_number}${date ? ` (${date})` : ""}`;
}

export default function RecordsetDraftCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [recordsets, setRecordsets] = useState<Recordset[]>([]);
  const [recordsetReleases, setRecordsetReleases] = useState<
    RecordsetRelease[]
  >([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isLoadingReleases, setIsLoadingReleases] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    recordset_id: "",
    cloned_from_release_id: "",
    draft_name: "",
    draft_status: "",
    draft_notes: "",
  });

  useEffect(() => {
    async function loadRecordsets() {
      setIsLoadingOptions(true);
      try {
        const response = await fetch(`/papi/v1/distribution/recordsets?limit=1000`, {
          cache: "no-store",
        });

        if (!response.ok) {
          setRecordsets([]);
          return;
        }

        const json = (await response.json()) as unknown;
        const recordsetsArray = extractArray<Recordset>(json, [
          "recordsets",
          "data",
          "items",
          "results",
        ]);
        setRecordsets(recordsetsArray);
      } catch {
        setRecordsets([]);
      } finally {
        setIsLoadingOptions(false);
      }
    }

    void loadRecordsets();
  }, []);

  useEffect(() => {
    const recordsetIdFromQuery = searchParams.get("recordset_id");
    if (!recordsetIdFromQuery) {
      return;
    }

    setFormData((prev) =>
      prev.recordset_id
        ? prev
        : {
            ...prev,
            recordset_id: recordsetIdFromQuery,
          },
    );
  }, [searchParams]);

  useEffect(() => {
    const recordsetId = formData.recordset_id;
    if (!recordsetId) {
      setRecordsetReleases([]);
      setFormData((prev) => ({ ...prev, cloned_from_release_id: "" }));
      return;
    }

    let isMounted = true;
    async function loadReleases() {
      setIsLoadingReleases(true);
      try {
        const response = await fetch(
          `/papi/v1/distribution/recordsets/${recordsetId}/releases?limit=1000`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          setRecordsetReleases([]);
          return;
        }

        const json = (await response.json()) as unknown;
        const releasesArray = extractArray<RecordsetRelease>(json, [
          "releases",
          "data",
          "items",
          "results",
        ]);

        if (!isMounted) {
          return;
        }

        setRecordsetReleases(releasesArray);
      } catch {
        if (!isMounted) {
          return;
        }
        setRecordsetReleases([]);
      } finally {
        if (isMounted) {
          setIsLoadingReleases(false);
        }
      }
    }

    void loadReleases();

    return () => {
      isMounted = false;
    };
  }, [formData.recordset_id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setFieldErrors({});
    setIsSaving(true);

    if (!formData.recordset_id) {
      setFieldErrors({ recordset_id: "Recordset is required." });
      setSaveError("Please fix the highlighted fields.");
      toastError(addToast, "Please fix the highlighted fields.");
      setIsSaving(false);
      return;
    }

    try {
      const response = await fetch(
        `/papi/v1/distribution/recordsets/${formData.recordset_id}/drafts`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            recordset_id: Number(formData.recordset_id),
            cloned_from_release_id: formData.cloned_from_release_id
              ? Number(formData.cloned_from_release_id)
              : null,
            draft_name: formData.draft_name,
            draft_status: formData.draft_status,
            draft_notes: formData.draft_notes,
          }),
        },
      );

      if (!response.ok) {
        const fallbackMessage = "Could not create draft.";

        try {
          const json = (await response.json()) as { error?: string };
          throw new Error(json.error ?? fallbackMessage);
        } catch {
          throw new Error(fallbackMessage);
        }
      }

      const json = (await response.json()) as CreateDraftResponse;
      const newDraftId =
        json.recordset_draft_id ?? json.data?.recordset_draft_id;

      if (!newDraftId) {
        throw new Error("No draft ID returned from create.");
      }

      setSaveSuccess(true);
      toastSuccess(addToast, "Draft saved successfully.");
      navigate(`/recordsets/drafts/${newDraftId}`);
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setSaveError(caughtError.message);
        toastError(addToast, caughtError.message);
      } else {
        setSaveError("Could not create draft.");
        toastError(addToast, "Could not create draft.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  const fields: Array<DynamicFormField<typeof formData>> = [
    {
      key: "recordset_id",
      label: "Recordset",
      type: "select",
      required: true,
      options: [
        { value: "", label: "--- Select a value ---" },
        ...recordsets.map((recordset) => ({
          value: String(recordset.recordset_id),
          label: `${recordset.recordset_id} - ${recordset.recordset_name}`,
        })),
      ],
      controlClassName: "mt-1 select",
    },
    {
      key: "cloned_from_release_id",
      label: "Cloned From Release",
      type: "select",
      options: [
        { value: "", label: "--- Select a value ---" },
        ...recordsetReleases.map((release) => ({
          value: String(release.recordset_release_id),
          label: formatReleaseLabel(release),
        })),
      ],
      helperText: isLoadingReleases
        ? "Loading recordset releases..."
        : undefined,
      controlClassName: "mt-1 select",
    },
    {
      key: "draft_name",
      label: "Draft Name",
      controlClassName: "mt-1 input",
    },
    {
      key: "draft_status",
      label: "Draft Status",
      controlClassName: "mt-1 input",
    },
    {
      key: "draft_notes",
      label: "Draft Notes",
      type: "textarea",
      rows: 5,
      controlClassName: "mt-1 textarea",
    },
  ];

  return (
    <PageShell size="3xl">
      <PageDetailHeader
        title="Create Draft"
        breadcrumb={{ label: "Recordsets", href: "/recordsets" }}
      />

      <SectionCard>
        {isLoadingOptions && (
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
            Loading recordset options...
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
                {isSaving ? "Saving..." : "Create Draft"}
              </Button>

              <LinkButton
                href={
                  formData.recordset_id
                    ? `/recordsets/${formData.recordset_id}`
                    : "/recordsets"
                }
                variant="ghost"
              >
                Back to Recordset
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
            Draft created successfully.
          </p>
        )}
      </SectionCard>
    </PageShell>
  );
}
