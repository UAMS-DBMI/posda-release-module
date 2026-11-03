import { useQuery } from "@tanstack/react-query";

/** How much of a manifest a preview reads. An imaging manifest can run to
 *  hundreds of thousands of rows; the start of it is enough to check by eye. */
const MAX_PREVIEW_BYTES = 1024 * 1024;
const MAX_PREVIEW_ROWS = 250;

/** RFC 4180 CSV: quoted fields may hold commas, line breaks and doubled quotes,
 *  which manifest fields like the abstract do. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch !== '"') {
        field += ch;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

/** Read the start of a file, cancelling the download once there's enough. */
async function readStart(url: string): Promise<{ text: string; truncated: boolean }> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok || !res.body) throw new Error("Could not load this manifest.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return { text: text + decoder.decode(), truncated: false };
    bytes += value.length;
    text += decoder.decode(value, { stream: true });
    if (bytes >= MAX_PREVIEW_BYTES) {
      void reader.cancel();
      return { text, truncated: true };
    }
  }
}

export type ManifestFormat = "csv" | "text";

export type ManifestPreview =
  | { format: "text"; text: string; truncated: boolean }
  | {
      format: "csv";
      headers: string[];
      rows: Record<string, string>[];
      truncated: boolean;
    };

async function loadPreview(url: string, format: ManifestFormat): Promise<ManifestPreview> {
  const { text, truncated } = await readStart(url);
  if (format === "text") return { format, text, truncated };

  const [headers = [], ...records] = parseCsv(text);
  // A cut-off read ends mid-row, so its last row is incomplete.
  const complete = truncated ? records.slice(0, -1) : records;
  const shown = complete.slice(0, MAX_PREVIEW_ROWS);
  return {
    format,
    headers,
    rows: shown.map((record) =>
      Object.fromEntries(headers.map((h, i) => [h, record[i] ?? ""])),
    ),
    truncated: truncated || complete.length > MAX_PREVIEW_ROWS,
  };
}

export function useManifestPreview(url: string | null, format: ManifestFormat) {
  return useQuery({
    queryKey: ["manifest-preview", url, format],
    enabled: url !== null,
    queryFn: () => loadPreview(url as string, format),
  });
}
