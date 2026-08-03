import SparkMD5 from "spark-md5";
import { extractApiError } from "@/lib/apiUtils";

const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB

/** MD5 of a file, hashed in chunks so large files don't all sit in memory.
 *  Posda's import endpoint is content-addressed and verifies this digest. */
export async function md5File(file: File): Promise<string> {
  const spark = new SparkMD5.ArrayBuffer();
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    spark.append(await chunk.arrayBuffer());
    offset += CHUNK_SIZE;
  }
  return spark.end();
}

/** Import one file into Posda via the shared importer, returning its file_id.
 *  `name` is the path to record (a folder upload's relative subpath, else the
 *  basename). Identical bytes de-dupe to the existing file. */
async function importFile(file: File, name: string): Promise<number> {
  const digest = await md5File(file);
  const params = new URLSearchParams({ digest, localpath: name });
  const res = await fetch(`/papi/v1/import/file?${params.toString()}`, {
    method: "POST",
    body: file,
  });
  if (!res.ok) {
    throw new Error(
      extractApiError(await res.json().catch(() => ({})), "Could not import file."),
    );
  }
  const json = (await res.json()) as { file_id: number };
  return json.file_id;
}

/** Pull the file attached to the recordset's WP download object into the draft.
 *  The backend resolves draft -> recordset -> download object -> media source
 *  and imports it under the media's original filename. */
export async function pullWpFileToDraft(draftId: number): Promise<void> {
  const res = await fetch(
    `/papi/v1/distribution/recordsets/drafts/${draftId}/files/from-wp`,
    { method: "POST" },
  );
  if (!res.ok) {
    throw new Error(
      extractApiError(
        await res.json().catch(() => ({})),
        "Could not pull the WordPress file.",
      ),
    );
  }
}

/** Import local files, then add them to a draft as one membership batch under
 *  their own filenames (kept even for DICOM -- the user chose these names). */
export async function uploadFilesToDraft(
  draftId: number,
  files: File[],
): Promise<number> {
  const imported: { file_id: number; file_name: string }[] = [];
  for (const file of files) {
    // Folder uploads carry a relative subpath; keep it as the stored filename.
    const name = file.webkitRelativePath || file.name;
    imported.push({ file_id: await importFile(file, name), file_name: name });
  }

  const res = await fetch(
    `/papi/v1/distribution/recordsets/drafts/${draftId}/files/add`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files: imported }),
    },
  );
  if (!res.ok) {
    throw new Error(
      extractApiError(
        await res.json().catch(() => ({})),
        "Could not add uploaded files.",
      ),
    );
  }
  return files.length;
}
