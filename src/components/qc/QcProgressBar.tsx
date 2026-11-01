/** QC progress as one segmented bar -- approved (green), rejected (red),
 *  flagged (amber), with pending as the empty track -- labelled approved/total.
 *  A rejection shows up here rather than needing its own indicator. Shared by
 *  Verify's recordset rows and the review rows in their expand. */
export default function QcProgressBar({
  approved,
  rejected,
  flagged,
  total,
}: {
  approved: number;
  rejected: number;
  flagged: number;
  total: number;
}) {
  const pending = total - approved - rejected - flagged;
  const width = (n: number) => (total === 0 ? "0%" : `${(n / total) * 100}%`);
  const breakdown = [
    `${approved.toLocaleString()} approved`,
    `${rejected.toLocaleString()} rejected`,
    `${flagged.toLocaleString()} flagged`,
    `${pending.toLocaleString()} pending`,
  ].join(" · ");

  return (
    <div className="flex items-center gap-2" title={breakdown}>
      <div
        role="img"
        aria-label={breakdown}
        className="flex h-1.5 w-24 overflow-hidden rounded-full"
        style={{ background: "var(--border)" }}
      >
        <div className="h-full bg-green-600 dark:bg-green-500" style={{ width: width(approved) }} />
        <div className="h-full bg-red-600 dark:bg-red-500" style={{ width: width(rejected) }} />
        <div className="h-full bg-amber-500 dark:bg-amber-400" style={{ width: width(flagged) }} />
      </div>
      <span>
        {approved.toLocaleString()}/{total.toLocaleString()}
      </span>
    </div>
  );
}
