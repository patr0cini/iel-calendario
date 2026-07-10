import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import type { EventInput, EventRow } from "../lib/types";

export interface Range {
  from: string;
  to: string;
}

export function useEventsQuery(range: Range | null) {
  return useQuery({
    queryKey: ["events", range?.from, range?.to],
    enabled: range !== null,
    queryFn: ({ signal }) =>
      apiFetch<EventRow[]>(
        `/events?from=${encodeURIComponent(range!.from)}&to=${encodeURIComponent(range!.to)}`,
        { signal },
      ),
  });
}

type Snapshot = [readonly unknown[], EventRow[] | undefined][];

function snapshot(qc: QueryClient): Snapshot {
  return qc.getQueriesData<EventRow[]>({ queryKey: ["events"] });
}

function restore(qc: QueryClient, snap: Snapshot): void {
  for (const [key, data] of snap) qc.setQueryData(key, data);
}

// Optimistic write with rollback (PROMPT.md section 10). Every mutation patches
// the cached event lists immediately and restores them if the request fails.
export function useEventMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["events"] });

  const createEvent = useMutation({
    mutationFn: (input: EventInput) => apiFetch<EventRow>("/events", { method: "POST", body: input }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["events"] });
      const snap = snapshot(qc);
      const optimistic: EventRow = {
        id: `temp-${crypto.randomUUID()}`,
        ministry_id: input.ministry_id,
        title: input.title,
        description: input.description ?? null,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        all_day: input.all_day ?? false,
        location: input.location ?? null,
        status: input.status ?? "proposta",
      };
      qc.setQueriesData<EventRow[]>({ queryKey: ["events"] }, (old) =>
        old ? [...old, optimistic] : old,
      );
      return { snap };
    },
    onError: (_e, _v, ctx) => ctx && restore(qc, ctx.snap),
    onSettled: invalidate,
  });

  const updateEvent = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<EventInput> }) =>
      apiFetch<EventRow>(`/events/${id}`, { method: "PATCH", body: patch }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["events"] });
      const snap = snapshot(qc);
      qc.setQueriesData<EventRow[]>({ queryKey: ["events"] }, (old) =>
        old ? old.map((e) => (e.id === id ? { ...e, ...patch } : e)) : old,
      );
      return { snap };
    },
    onError: (_e, _v, ctx) => ctx && restore(qc, ctx.snap),
    onSettled: invalidate,
  });

  const deleteEvent = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/events/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["events"] });
      const snap = snapshot(qc);
      qc.setQueriesData<EventRow[]>({ queryKey: ["events"] }, (old) =>
        old ? old.filter((e) => e.id !== id) : old,
      );
      return { snap };
    },
    onError: (_e, _v, ctx) => ctx && restore(qc, ctx.snap),
    onSettled: invalidate,
  });

  return { createEvent, updateEvent, deleteEvent };
}
