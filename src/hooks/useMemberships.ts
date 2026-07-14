import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";

interface MembershipRow {
  id: string;
  ministry_id: string;
  person_id: string;
  role: string | null;
}

/**
 * ministry_id -> set of member person_ids. Admin sees every ministry; a
 * ministry token only gets its own rows (the API filters), which is all it can
 * edit anyway. Used to put a ministry's own members first in person pickers.
 */
export function useMemberships(enabled: boolean) {
  const query = useQuery({
    queryKey: ["memberships", "all"],
    enabled,
    queryFn: () => apiFetch<MembershipRow[]>("/ministry-members"),
  });

  const byMinistry = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const row of query.data ?? []) {
      let set = map.get(row.ministry_id);
      if (!set) {
        set = new Set();
        map.set(row.ministry_id, set);
      }
      set.add(row.person_id);
    }
    return map;
  }, [query.data]);

  return { byMinistry, isLoading: query.isLoading };
}
