import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import type { ServiceHeader } from "../lib/types";
import type { Range } from "./useEvents";

/**
 * Sunday services for the calendar's visible range. The API filters by year,
 * so a range crossing New Year fetches both years.
 */
export function useServicesQuery(range: Range | null) {
  const years: number[] = [];
  if (range) {
    const first = new Date(range.from).getUTCFullYear();
    const last = new Date(range.to).getUTCFullYear();
    for (let y = first; y <= last; y++) years.push(y);
  }

  return useQuery({
    queryKey: ["services", "calendar", years],
    enabled: years.length > 0,
    queryFn: async ({ signal }) => {
      const lists = await Promise.all(
        years.map((y) => apiFetch<ServiceHeader[]>(`/services?year=${y}`, { signal })),
      );
      return lists.flat();
    },
  });
}
