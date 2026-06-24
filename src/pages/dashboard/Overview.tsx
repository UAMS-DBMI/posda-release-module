import { Link } from "react-router-dom";
import { useFavorites } from "@/lib/useFavorites";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/Page";

export default function DashboardOverview() {
  const { favorites, isLoading } = useFavorites();

  const datasets = favorites.filter((f) => f.object_type === "dataset");
  const recordsets = favorites.filter((f) => f.object_type === "recordset");

  return (
    <PageShell>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      <CardHeader className="mt-6 mb-0">
        <CardTitle>Favorited Datasets</CardTitle>
      </CardHeader>
      <SectionCard className="mt-1">
        {isLoading && <p className="text-sm">Loading...</p>}
        {!isLoading && datasets.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No favorited datasets.
          </p>
        )}
        {!isLoading && datasets.length > 0 && (
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {datasets.map((f) => (
              <li key={f.favorite_id} className="py-2 first:pt-0 last:pb-0">
                <Link
                  to={`/datasets/${f.object_id}`}
                  className="text-sm font-medium transition-colors hover:text-accent"
                  style={{ color: "var(--accent)" }}
                >
                  {f.object_name || `Dataset ${f.object_id}`}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <CardHeader className="mt-6 mb-0">
        <CardTitle>Favorited Recordsets</CardTitle>
      </CardHeader>
      <SectionCard className="mt-1">
        {isLoading && <p className="text-sm">Loading...</p>}
        {!isLoading && recordsets.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No favorited recordsets.
          </p>
        )}
        {!isLoading && recordsets.length > 0 && (
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {recordsets.map((f) => (
              <li key={f.favorite_id} className="py-2 first:pt-0 last:pb-0">
                <Link
                  to={`/recordsets/${f.object_id}`}
                  className="text-sm font-medium transition-colors hover:text-accent"
                  style={{ color: "var(--accent)" }}
                >
                  {f.object_name || `Recordset ${f.object_id}`}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}
