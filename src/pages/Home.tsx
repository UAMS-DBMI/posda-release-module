import { useNavigate } from "react-router-dom";
import DynamicTable from "@/components/DynamicTable";
import FavoriteStar from "@/components/FavoriteStar";
import { useFavorites, type Favorite } from "@/lib/useFavorites";
import { CardHeader, CardTitle, SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";

const byUpdatedDesc = (
  a: { when_updated: string | null },
  b: { when_updated: string | null },
) => {
  if (!a.when_updated) return 1;
  if (!b.when_updated) return -1;
  return new Date(b.when_updated).getTime() - new Date(a.when_updated).getTime();
};

const formatDate = (value: unknown) =>
  value ? new Date(value as string).toLocaleString() : "-";

export default function Home() {
  const navigate = useNavigate();
  const { favorites, isLoading, favoriteKeys, toggle } = useFavorites();

  const datasets = favorites
    .filter((f) => f.object_type === "dataset")
    .sort(byUpdatedDesc);

  const recordsets = favorites
    .filter((f) => f.object_type === "recordset")
    .sort(byUpdatedDesc);

  return (
    <PageShell>
      <PageDetailHeader title="Dashboard" />

      <CardHeader className="mt-6 mb-0">
        <CardTitle>Favorite Datasets</CardTitle>
      </CardHeader>
      <SectionCard className="mt-1">
        {isLoading ? (
          <p className="text-sm">Loading...</p>
        ) : (
          <DynamicTable<Favorite>
            rows={datasets}
            columns={[
              { key: "object_name", label: "Name" },
              { key: "when_updated", label: "Updated" },
              {
                key: "favorite_id",
                label: "",
                sortable: false,
                render: (_value, row) => (
                  <FavoriteStar
                    size={20}
                    filled={favoriteKeys.has(`dataset:${row.object_id}`)}
                    onClick={() =>
                      void toggle("dataset", row.object_id, row.object_name)
                    }
                  />
                ),
              },
            ]}
            formatters={{ when_updated: formatDate }}
            emptyMessage="No favorite datasets."
            onRowClick={(row) => navigate(`/datasets/${row.object_id}`)}
            getRowKey={(row) => row.favorite_id}
          />
        )}
      </SectionCard>

      <CardHeader className="mt-6 mb-0">
        <CardTitle>Favorite Recordsets</CardTitle>
      </CardHeader>
      <SectionCard className="mt-1">
        {isLoading ? (
          <p className="text-sm">Loading...</p>
        ) : (
          <DynamicTable<Favorite>
            rows={recordsets}
            columns={[
              { key: "object_name", label: "Name" },
              { key: "parent_dataset_name", label: "Dataset" },
              { key: "when_updated", label: "Updated" },
              {
                key: "favorite_id",
                label: "",
                sortable: false,
                render: (_value, row) => (
                  <FavoriteStar
                    size={20}
                    filled={favoriteKeys.has(`recordset:${row.object_id}`)}
                    onClick={() =>
                      void toggle("recordset", row.object_id, row.object_name)
                    }
                  />
                ),
              },
            ]}
            formatters={{ when_updated: formatDate }}
            emptyMessage="No favorite recordsets."
            onRowClick={(row) => navigate(`/recordsets/${row.object_id}`)}
            getRowKey={(row) => row.favorite_id}
          />
        )}
      </SectionCard>
    </PageShell>
  );
}
