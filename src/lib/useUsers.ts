import { useEffect, useState } from "react";

type User = {
  user_id: number;
  user_name: string;
  full_name: string | null;
};

export function useUsers(): Map<number, string> {
  const [userMap, setUserMap] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    fetch("/papi/v1/distribution/lookups/users", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: User[] } | User[] | null) => {
        if (!json) return;
        const users: User[] = Array.isArray(json) ? json : (json.data ?? []);
        const map = new Map<number, string>();
        for (const u of users) {
          map.set(u.user_id, u.user_name);
        }
        setUserMap(map);
      })
      .catch(() => {});
  }, []);

  return userMap;
}
