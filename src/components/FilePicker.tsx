import { useEffect, useRef, useState } from "react";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Folder selection populates webkitRelativePath (e.g. "scans/a/1.dcm"); plain
 *  file selection leaves it empty. We key, display, and later store by this path
 *  so subfolder structure is preserved and same-named files don't collide. */
function filePath(f: File): string {
  return f.webkitRelativePath || f.name;
}

type Mode = "files" | "folder";

type FilePickerProps = {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
};

/** Select local files or a whole folder to upload -- multi-select, de-duped by
 *  path+size, with a removable list. Collects the selection; the caller triggers
 *  the upload. A single input can't do both, so a toggle flips webkitdirectory. */
export default function FilePicker({ files, onChange, disabled }: FilePickerProps) {
  const [mode, setMode] = useState<Mode>("files");
  const inputRef = useRef<HTMLInputElement>(null);

  // webkitdirectory has no React/DOM typing, so toggle it as a raw attribute.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (mode === "folder") el.setAttribute("webkitdirectory", "");
    else el.removeAttribute("webkitdirectory");
  }, [mode]);

  return (
    <div>
      <div
        className="mb-2 flex gap-1 rounded-md p-1"
        style={{ background: "var(--surface-alt)" }}
      >
        {(["files", "folder"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => setMode(m)}
            className="flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors"
            style={
              mode === m
                ? { background: "var(--surface)", color: "var(--accent)" }
                : { color: "var(--muted)" }
            }
          >
            {m === "files" ? "Files" : "Folder"}
          </button>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        disabled={disabled}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          const merged = [...files];
          for (const f of picked) {
            if (
              !merged.some(
                (m) => filePath(m) === filePath(f) && m.size === f.size,
              )
            ) {
              merged.push(f);
            }
          }
          onChange(merged);
          e.target.value = ""; // let the same file be re-picked after removal
        }}
        className="block w-full text-sm text-(--muted)
          file:mr-3 file:cursor-pointer file:rounded-md file:border
          file:border-(--border-strong) file:bg-(--surface)
          file:px-3 file:py-1.5 file:text-sm file:font-medium
          file:text-(--foreground) hover:file:bg-(--surface-alt)"
      />

      {files.length > 0 && (
        <ul
          className="mt-3 divide-y rounded-md"
          style={{ borderColor: "var(--border)", border: "1px solid var(--border-strong)" }}
        >
          {files.map((f, i) => (
            <li
              key={`${filePath(f)}-${f.size}-${i}`}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="truncate">
                {filePath(f)}
                <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                  {formatBytes(f.size)}
                </span>
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="shrink-0 text-xs hover:underline"
                style={{ color: "var(--muted)" }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
