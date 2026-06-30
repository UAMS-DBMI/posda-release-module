import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type Favorite = {
  favorite_id: number;
  object_type: "dataset" | "recordset";
  object_id: number;
  object_name: string;
  when_created: string;
  when_updated: string | null;
  parent_dataset_name: string | null;
};

type FavoritesResult = {
  favorites: Favorite[];
  favoriteKeys: Set<string>;
  isLoading: boolean;
  toggle: (
    objectType: "dataset" | "recordset",
    objectId: number,
    objectName?: string,
  ) => Promise<void>;
};

const QUERY_KEY = ["favorites"] as const;

async function fetchFavorites(): Promise<Favorite[]> {
  const res = await fetch("/papi/v1/distribution/favorites");
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: Favorite[] };
  return json.data ?? [];
}

export function useFavorites(): FavoritesResult {
  const queryClient = useQueryClient();

  const { data: favorites = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchFavorites,
    staleTime: 60_000,
  });

  const favoriteKeys = new Set(
    favorites.map((f) => `${f.object_type}:${f.object_id}`),
  );

  const addMutation = useMutation({
    mutationFn: async ({
      objectType,
      objectId,
    }: {
      objectType: "dataset" | "recordset";
      objectId: number;
      objectName: string;
    }) => {
      const res = await fetch("/papi/v1/distribution/favorites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ object_type: objectType, object_id: objectId }),
      });
      if (!res.ok) throw new Error("Failed to add favorite");
      const json = (await res.json()) as { data: Favorite | null };
      return json.data;
    },
    onSuccess: (newFav, { objectName }) => {
      if (!newFav) return;
      queryClient.setQueryData<Favorite[]>(QUERY_KEY, (prev = []) => [
        ...prev,
        { ...newFav, object_name: newFav.object_name || objectName },
      ]);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async ({
      objectType,
      objectId,
    }: {
      objectType: "dataset" | "recordset";
      objectId: number;
    }) => {
      const res = await fetch(
        `/papi/v1/distribution/favorites/${objectType}/${objectId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to remove favorite");
    },
    onSuccess: (_data, { objectType, objectId }) => {
      queryClient.setQueryData<Favorite[]>(QUERY_KEY, (prev = []) =>
        prev.filter(
          (f) => !(f.object_type === objectType && f.object_id === objectId),
        ),
      );
    },
  });

  async function toggle(
    objectType: "dataset" | "recordset",
    objectId: number,
    objectName = "",
  ) {
    const isFav = favorites.some(
      (f) => f.object_type === objectType && f.object_id === objectId,
    );
    if (isFav) {
      await removeMutation.mutateAsync({ objectType, objectId });
    } else {
      await addMutation.mutateAsync({ objectType, objectId, objectName });
    }
  }

  return { favorites, favoriteKeys, isLoading, toggle };
}
