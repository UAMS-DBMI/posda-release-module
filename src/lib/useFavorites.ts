import { useCallback, useEffect, useState } from "react";

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

export function useFavorites(): FavoritesResult {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/papi/v1/distribution/favorites", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: Favorite[] } | null) => {
        if (json?.data) setFavorites(json.data);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const favoriteKeys = new Set(
    favorites.map((f) => `${f.object_type}:${f.object_id}`),
  );

  const toggle = useCallback(
    async (
      objectType: "dataset" | "recordset",
      objectId: number,
      objectName = "",
    ) => {
      const isFav = favorites.some(
        (f) => f.object_type === objectType && f.object_id === objectId,
      );
      if (isFav) {
        const res = await fetch(
          `/papi/v1/distribution/favorites/${objectType}/${objectId}`,
          { method: "DELETE" },
        );
        if (res.ok) {
          setFavorites((prev) =>
            prev.filter(
              (f) =>
                !(f.object_type === objectType && f.object_id === objectId),
            ),
          );
        }
      } else {
        const res = await fetch("/papi/v1/distribution/favorites", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ object_type: objectType, object_id: objectId }),
        });
        if (res.ok) {
          const json = (await res.json()) as { data: Favorite | null };
          if (json.data) {
            setFavorites((prev) => [
              ...prev,
              { ...json.data!, object_name: json.data!.object_name || objectName },
            ]);
          }
        }
      }
    },
    [favorites],
  );

  return { favorites, favoriteKeys, isLoading, toggle };
}
