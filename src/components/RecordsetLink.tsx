import { Link } from "react-router-dom";

/** Recordset links leave the cycle, so they open in a new tab -- the only
 *  navigation allowed off a cycle page. Also used by the drafts table on
 *  `recordsets/Detail`, which links drafts rather than recordsets. */
export default function RecordsetLink({
  id,
  name,
  to,
}: {
  id?: number;
  name: string;
  /** Override the target path; defaults to the recordset page for `id`. */
  to?: string;
}) {
  return (
    <Link
      to={to ?? `/recordsets/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-accent"
      style={{ color: "var(--accent)" }}
    >
      {name}
    </Link>
  );
}
