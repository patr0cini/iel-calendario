import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import type { PersonLite } from "../lib/types";

/** People directory for assignment pickers. Not available to readonly tokens. */
export function usePeople(enabled: boolean) {
  return useQuery({
    queryKey: ["people"],
    enabled,
    queryFn: () => apiFetch<PersonLite[]>("/people"),
  });
}
