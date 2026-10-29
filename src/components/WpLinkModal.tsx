import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Spinner";
import { useToast } from "@/components/Toast";
import { toastError, toastSuccess, toastWarning } from "@/components/toastHelpers";
import {
  searchWpObjects,
  useCreateWpObject,
  useDeleteWpLink,
  useSaveWpLink,
  useWpMap,
  type WpObjectTypeOption,
  type WpSearchResult,
} from "@/lib/wpObjectMap";

export type { WpObjectTypeOption };

type WpLinkModalProps = {
  open: boolean;
  onClose: () => void;
  posdaObjectType: "dataset" | "recordset";
  posdaObjectId: number | undefined;
  typeOptions: WpObjectTypeOption[];
  /** What is being linked, shown under the title (e.g. "Recordset · CT"). */
  subject?: string;
  /** Offered in Link Existing while the search box is empty. */
  suggestions?: WpSearchResult[];
  suggestionsLabel?: string;
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** WP titles come back HTML-escaped (e.g. "&#8211;" for an en dash) --
 *  decode via a detached textarea, which never executes markup, only
 *  resolves entities. */
function decodeHtmlEntities(text: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

function WpResultList({
  items,
  onPick,
}: {
  items: WpSearchResult[];
  onPick: (item: WpSearchResult) => void;
}) {
  return (
    <ul
      className="max-h-64 overflow-y-auto divide-y rounded"
      style={{ border: "1px solid var(--border-strong)" }}
    >
      {items.map((r) => (
        <li
          key={r.id}
          className="flex cursor-pointer items-center justify-between gap-4 px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          onClick={() => onPick(r)}
        >
          <span className="text-sm">
            <span className="font-medium">{decodeHtmlEntities(r.title)}</span>
            <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
              {r.status}
            </span>
          </span>
          <span className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
            ID {r.id}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Link an existing WP post to a Posda object, or create one as a new draft.
 *  Shared by `recordsets/Detail.tsx`, `datasets/Detail.tsx`, and the cycle
 *  Setup stage, all backed by the same `wp_object_map` row. */
export default function WpLinkModal({
  open,
  onClose,
  posdaObjectType,
  posdaObjectId,
  typeOptions,
  subject,
  suggestions = [],
  suggestionsLabel = "Suggestions",
}: WpLinkModalProps) {
  const { addToast } = useToast();
  const [mode, setMode] = useState<"link" | "create" | "unlink">("link");
  const [wpObjectType, setWpObjectType] = useState(typeOptions[0]?.value ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WpSearchResult[]>([]);
  // What `results` answers -- results only show while it matches the box,
  // so a paste or edit never displays another search's "No results."
  const [searched, setSearched] = useState<{ term: string; endpoint: string } | null>(
    null,
  );
  const [isSearching, setIsSearching] = useState(false);
  const latestSearch = useRef(0);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: wpMap } = useWpMap(posdaObjectType, posdaObjectId);
  const saveLink = useSaveWpLink(posdaObjectType, posdaObjectId);
  const createObject = useCreateWpObject(posdaObjectType, posdaObjectId);
  const deleteLink = useDeleteWpLink(posdaObjectType, posdaObjectId);

  const selectedOption =
    typeOptions.find((o) => o.value === wpObjectType) ?? typeOptions[0];
  const endpoint = selectedOption?.searchEndpoint;
  const term = query.trim();
  const hasCurrentResults =
    searched !== null && searched.term === term && searched.endpoint === endpoint;

  const runSearch = useCallback(
    async (searchTerm: string) => {
      if (!searchTerm || !endpoint) return;
      // A slower earlier search must not overwrite a newer one.
      const requestId = ++latestSearch.current;
      setIsSearching(true);
      try {
        const found = await searchWpObjects(endpoint, searchTerm);
        if (requestId !== latestSearch.current) return;
        setResults(found);
        setSearched({ term: searchTerm, endpoint });
      } catch (e) {
        if (requestId !== latestSearch.current) return;
        setError(e instanceof Error ? e.message : "Search failed.");
      } finally {
        if (requestId === latestSearch.current) setIsSearching(false);
      }
    },
    [endpoint],
  );

  // Search as the user types or pastes, once the text settles.
  useEffect(() => {
    if (mode !== "link" || !term) return;
    const timer = setTimeout(() => void runSearch(term), 300);
    return () => clearTimeout(timer);
  }, [mode, term, runSearch]);

  function reset() {
    latestSearch.current++;
    setMode("link");
    setQuery("");
    setResults([]);
    setSearched(null);
    setIsSearching(false);
    setTitle("");
    setSlug("");
    setSlugEdited(false);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleLink(result: WpSearchResult) {
    setError(null);
    try {
      const { warning } = await saveLink.mutateAsync({
        existingMapId: wpMap?.map_id,
        wp_object_type: wpObjectType,
        wp_object_id: result.id,
        wp_edit_url: result.edit_url,
        wp_view_url: result.view_url,
      });
      if (warning) {
        toastWarning(addToast, warning);
      } else {
        toastSuccess(addToast, "WordPress link saved.");
      }
      handleClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save link.";
      setError(msg);
      toastError(addToast, msg);
    }
  }

  function pickResult(result: WpSearchResult) {
    if (!saveLink.isPending) void handleLink(result);
  }

  async function handleUnlink() {
    if (!wpMap) return;
    setError(null);
    try {
      await deleteLink.mutateAsync(wpMap.map_id);
      toastSuccess(addToast, "WordPress link removed.");
      handleClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not remove link.";
      setError(msg);
      toastError(addToast, msg);
    }
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setError(null);
    try {
      const { warning } = await createObject.mutateAsync({
        wp_object_type: wpObjectType,
        title: title.trim(),
        slug: slug.trim() || undefined,
      });
      if (warning) {
        toastWarning(addToast, warning);
      } else {
        toastSuccess(addToast, "WordPress draft created and linked.");
      }
      handleClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not create WordPress object.";
      setError(msg);
      toastError(addToast, msg);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Link WordPress"
      size="lg"
      footer={
        <Button variant="ghost" onClick={handleClose}>
          Cancel
        </Button>
      }
    >
      {subject && (
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          {subject}
        </p>
      )}
      <div className="mt-4 space-y-4">
        <div
          className="inline-flex rounded-md p-0.5"
          style={{ background: "var(--surface-alt)" }}
        >
          <Button
            size="sm"
            variant={mode === "link" ? "primary" : "ghost"}
            className={mode === "link" ? undefined : "bg-transparent!"}
            onClick={() => setMode("link")}
          >
            Link Existing
          </Button>
          <Button
            size="sm"
            variant={mode === "create" ? "primary" : "ghost"}
            className={mode === "create" ? undefined : "bg-transparent!"}
            onClick={() => setMode("create")}
          >
            Create New
          </Button>
          {wpMap && (
            <Button
              size="sm"
              variant={mode === "unlink" ? "primary" : "ghost"}
              className={
                mode === "unlink"
                  ? "bg-red-600! hover:bg-red-700!"
                  : "bg-transparent! text-red-600! dark:text-red-400!"
              }
              onClick={() => setMode("unlink")}
            >
              Unlink
            </Button>
          )}
        </div>

        {mode !== "unlink" && typeOptions.length > 1 && (
          <div>
            <label className="block text-sm font-medium">Type</label>
            <select
              value={wpObjectType}
              onChange={(e) => setWpObjectType(e.target.value)}
              className="select mt-1 w-full"
            >
              {typeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {mode === "link" ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runSearch(term);
                }}
                placeholder="Search by title..."
                className="input flex-1"
                autoFocus
              />
              <Button
                onClick={() => void runSearch(term)}
                disabled={isSearching || !term}
              >
                {isSearching ? "…" : "Search"}
              </Button>
            </div>
            {!term && suggestions.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                  {suggestionsLabel}
                </p>
                <WpResultList items={suggestions} onPick={pickResult} />
              </div>
            )}
            {hasCurrentResults && results.length > 0 && (
              <WpResultList items={results} onPick={pickResult} />
            )}
            {term && isSearching && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Searching…
              </p>
            )}
            {!isSearching && hasCurrentResults && results.length === 0 && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No results.
              </p>
            )}
          </div>
        ) : mode === "unlink" ? (
          <div
            className="space-y-3 rounded-md bg-red-50 p-4 dark:bg-red-900/15"
            style={{ border: "1px solid var(--border-strong)" }}
          >
            <p className="text-sm text-red-700 dark:text-red-400">
              Remove the link between this {posdaObjectType} and its
              WordPress page?
            </p>
            <p className="text-xs text-red-700/80 dark:text-red-400/80">
              This only removes the connection in Posda — the WordPress post
              itself is not deleted or changed.
            </p>
            <Button
              className="bg-red-600! hover:bg-red-700!"
              loading={deleteLink.isPending}
              onClick={() => void handleUnlink()}
            >
              Confirm Unlink
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (!slugEdited) setSlug(slugify(e.target.value));
                }}
                placeholder="Title for the new WordPress draft"
                className="input mt-1 w-full"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugEdited(true);
                }}
                className="input mt-1 w-full"
              />
            </div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Created as a draft — data entry continues in WordPress.
            </p>
            <Button
              onClick={() => void handleCreate()}
              loading={createObject.isPending}
              disabled={!title.trim()}
            >
              Create Draft
            </Button>
          </div>
        )}

        {saveLink.isPending && <LoadingState label="Saving..." />}
      </div>
    </Modal>
  );
}
