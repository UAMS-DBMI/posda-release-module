import { useQuery } from "@tanstack/react-query";

type User = {
  user_id: number;
  user_name: string;
  full_name: string | null;
};

async function fetchUsers(): Promise<Map<number, string>> {
  const res = await fetch("/papi/v1/distribution/lookups/users");
  if (!res.ok) return new Map();
  const json = (await res.json()) as { data?: User[] } | User[];
  const users: User[] = Array.isArray(json) ? json : (json.data ?? []);
  const map = new Map<number, string>();
  for (const u of users) map.set(u.user_id, u.user_name);
  return map;
}

export function useUsers(): Map<number, string> {
  const { data } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
    staleTime: 10 * 60 * 1000, // 10 minutes — small table, names rarely change
    placeholderData: new Map(),
  });
  return data ?? new Map();
}
