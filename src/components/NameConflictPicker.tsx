import type { NameConflictChoice } from "@/lib/draftUploads";

/** Replace-or-skip choice for incoming non-DICOM files whose name a different
 *  draft file already uses. A draft never holds both, so there is no "keep
 *  both"; replace is the default. Shared by every add source's Merge. */
export default function NameConflictPicker({
  count,
  value,
  onChange,
}: {
  count: number;
  value: NameConflictChoice;
  onChange: (value: NameConflictChoice) => void;
}) {
  const choices: { key: NameConflictChoice; label: string }[] = [
    { key: "replace", label: "Replace them" },
    { key: "skip", label: "Skip them" },
  ];
  return (
    <fieldset className="text-sm">
      <legend>
        {count.toLocaleString()} file{count === 1 ? "" : "s"} share
        {count === 1 ? "s" : ""} a name with a file already in the draft:
      </legend>
      <div className="mt-1 flex gap-4">
        {choices.map((c) => (
          <label key={c.key} className="flex items-center gap-2">
            <input
              type="radio"
              name="name-conflict"
              checked={value === c.key}
              onChange={() => onChange(c.key)}
            />
            {c.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
