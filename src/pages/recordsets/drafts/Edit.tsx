import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DynamicForm, { DynamicFormField } from "@/components/DynamicForm";
import { Button, LinkButton } from "@/components/ui/Button";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";
import { SectionCard } from "@/components/ui/Card";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess } from "@/components/toastHelpers";
import { papiUrl } from "@/lib/papi";

type Draft = {
  recordset_draft_id: number;
  recordset_id: number;
  cloned_from_release_id: number | null;
  draft_name: string;
  draft_status: string;
  draft_notes: string;
  when_created?: string;
  who_created?: string;
  when_updated?: string;
  who_updated?: string;
};

type DraftResponse = {
  draft?: Draft;
  data?: Draft;
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

export default function RecordsetDraftEdit() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { draft_id: draftId } = useParams<{ draft_id: string }>();
  const [recordsets, setRecordsets] = useState<Recordset[]>([]);
  const [recordsetReleases, setRecordsetReleases] = useState<
    RecordsetRelease[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
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
    if (!draftId) return;
    let isMounted = true;

    async function loadDraft() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const [draftResponse, recordsetsResponse] = await Promise.all([
          fetch(papiUrl(`recordsets/drafts/${draftId}`), { cache: "no-store" }),
          fetch(`${papiUrl("recordsets")}?limit=1000`, { cache: "no-store" }),
        ]);

        if (!draftResponse.ok) {
          throw new Error(`Could not load draft ${draftId}.`);
        }

        const draftJson = (await draftResponse.json()) as DraftResponse;
        const draft = draftJson.draft ?? draftJson.data ?? null;
        if (!draft) {
          throw new Error("Draft payload missing from response.");
        }

        if (recordsetsResponse.ok) {
          const recordsetsJson = (await recordsetsResponse.json()) as unknown;
          const recordsetsArray = extractArray<Recordset>(recordsetsJson, [
            "recordsets",
            "data",
            "items",
            "results",
          ]);
          setRecordsets(recordsetsArray);
        }

        if (!isMounted) {
          return;
        }

        setFormData({
          recordset_id: String(draft.recordset_id ?? ""),
          cloned_from_release_id: draft.cloned_from_release_id
            ? String(draft.cloned_from_release_id)
            : "",
          draft_name: draft.draft_name ?? "",
          draft_status: draft.draft_status ?? "",
          draft_notes: draft.draft_notes ?? "",
        });
      } catch (caughtError) {
        if (!isMounted) {
          return;
        }

        if (caughtError instanceof Error) {
          setLoadError(caughtError.message);
        } else {
          setLoadError("Could not load draft.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadDraft();

    return () => {
      isMounted = false;
    };
  }, [draftId]);

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
          `${papiUrl(`recordsets/${recordsetId}/releases`)}?limit=1000`,
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
    if (!draftId) {
      return;
    }

    setSaveError(null);
    setFieldErrors({});
    setSaveSuccess(false);

    const nextFieldErrors: Record<string, string> = {};
    if (!formData.recordset_id) {
      nextFieldErrors.recordset_id = "Recordset is required.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setSaveError("Please fix the highlighted fields.");
      toastError(addToast, "Please fix the highlighted fields.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(papiUrl(`recordsets/drafts/${draftId}`), {
        method: "PUT",
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
      });

      if (!response.ok) {
        const fallbackMessage = "Could not update draft.";

        try {
          const json = (await response.json()) as { error?: string };
          throw new Error(json.error ?? fallbackMessage);
        } catch {
          throw new Error(fallbackMessage);
        }
      }

      setSaveSuccess(true);
      toastSuccess(addToast, "Draft saved successfully.");
      navigate(`/recordsets/drafts/${draftId}`);
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setSaveError(caughtError.message);
        toastError(addToast, caughtError.message);
      } else {
        setSaveError("Could not update draft.");
        toastError(addToast, "Could not update draft.");
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
        title="Edit Draft"
        breadcrumb={{ label: "Draft", href: draftId ? `/recordsets/drafts/${draftId}` : "/recordsets" }}
      />

      {isLoading && <p className="mt-4 text-sm">Loading draft...</p>}

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
                    draftId ? `/recordsets/drafts/${draftId}` : "/recordsets"
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
              Draft updated successfully.
            </p>
          )}
        </SectionCard>
      )}
    </PageShell>
  );
}
