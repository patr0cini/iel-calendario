import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, ApiError } from "../lib/api";
import type { AssignmentInput, ServiceDetail, ServiceHeader, SongInput } from "../lib/types";

export function useServiceDetail(date: string) {
  const query = useQuery({
    queryKey: ["service", date],
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
    queryFn: () => apiFetch<ServiceDetail>(`/services?date=${encodeURIComponent(date)}`),
  });
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  return { query, notFound };
}

// Mutations for a specific service. `date` is the query key to invalidate.
export function useServiceMutations(serviceId: string | undefined, date: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["service", date] });

  const updateHeader = useMutation({
    mutationFn: (patch: Partial<ServiceHeader>) =>
      apiFetch<ServiceHeader>(`/services/${serviceId}`, { method: "PATCH", body: patch }),
    onSuccess: invalidate,
  });

  const saveAssignments = useMutation({
    mutationFn: ({ ministry, assignments }: { ministry: string; assignments: AssignmentInput[] }) =>
      apiFetch<ServiceDetail>(`/services/${serviceId}/assignments?ministry=${ministry}`, {
        method: "PUT",
        body: { assignments },
      }),
    onSuccess: (data) => qc.setQueryData(["service", date], data),
  });

  const saveSongs = useMutation({
    mutationFn: (songs: SongInput[]) =>
      apiFetch<ServiceDetail>(`/services/${serviceId}/songs`, { method: "PUT", body: { songs } }),
    onSuccess: (data) => qc.setQueryData(["service", date], data),
  });

  const saveEbd = useMutation({
    mutationFn: ({ classId, assignments }: { classId: string; assignments: AssignmentInput[] }) =>
      apiFetch<ServiceDetail>(`/services/${serviceId}/ebd?class=${classId}`, {
        method: "PUT",
        body: { assignments },
      }),
    onSuccess: (data) => qc.setQueryData(["service", date], data),
  });

  return { updateHeader, saveAssignments, saveSongs, saveEbd };
}

// Admin-only: create a missing service, or generate a whole year of Sundays.
export function useServiceAdmin(date: string) {
  const qc = useQueryClient();

  const createService = useMutation({
    mutationFn: () => apiFetch<ServiceHeader>("/services", { method: "POST", body: { service_date: date } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service", date] }),
  });

  const generate = useMutation({
    mutationFn: (year: number) =>
      apiFetch<{ year: number; inserted: number }>("/services/generate", { method: "POST", body: { year } }),
  });

  return { createService, generate };
}
