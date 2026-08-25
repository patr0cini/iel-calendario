import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { pt } from "date-fns/locale";

import { useSession } from "../session/SessionProvider";
import { usePeople } from "../hooks/usePeople";
import { useMemberships } from "../hooks/useMemberships";
import { PersonPicker, PersonChip, normalizeText } from "./PersonPicker";
import { apiFetch } from "../lib/api";
import { TIME_ZONE, isFirstSundayOfMonth } from "../lib/datetime";
import type { AssignmentInput, ServiceDetail, ServiceHeader } from "../lib/types";

// Communion roles ("Ceia", "Partilha da Ceia") only exist on first Sundays.
const isCeiaRole = (name: string) => normalizeText(name).includes("ceia");

const today = () => formatInTimeZone(new Date(), TIME_ZONE, "yyyy-MM-dd");
const shortDate = (d: string) => formatInTimeZone(new Date(`${d}T12:00:00Z`), TIME_ZONE, "d MMM", { locale: pt });

export function EscalaPage() {
  const session = useSession();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const people = usePeople(session.canCreate);
  const { byMinistry: membersByMinistry } = useMemberships(session.canCreate);

  // Only real ministries have rosters: "outro" holds calendar buckets (Culto,
  // Eventos) and people pools (Convidados).
  const selectable = session.ministries.filter((m) => m.category !== "outro");
  const ownSlug = session.ownMinistryId ? session.ministries.find((m) => m.id === session.ownMinistryId)?.slug : undefined;
  const slug = params.get("ministerio") ?? ownSlug ?? selectable[0]?.slug ?? "";
  const ministry = session.ministries.find((m) => m.slug === slug);

  const from = params.get("de") ?? today();
  const to = params.get("ate") ?? `${from.slice(0, 4)}-12-31`;
  const year = from.slice(0, 4);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  const list = useQuery({
    queryKey: ["services", "year", year],
    queryFn: () => apiFetch<ServiceHeader[]>(`/services?year=${year}`),
  });

  const services = useMemo(
    () => (list.data ?? []).filter((s) => s.service_date >= from && s.service_date <= to).slice(0, 26),
    [list.data, from, to],
  );

  const details = useQueries({
    queries: services.map((s) => ({
      queryKey: ["service", s.service_date],
      queryFn: () => apiFetch<ServiceDetail>(`/services?date=${s.service_date}`),
    })),
  });

  const firstDetail = details.find((d) => d.data)?.data;
  const roles = useMemo(
    () => (ministry && firstDetail ? firstDetail.ministry_roles.filter((r) => r.ministry_id === ministry.id) : []),
    [ministry, firstDetail],
  );

  const editable = ministry
    ? session.scope === "admin" || (session.scope === "ministry" && session.ownMinistryId === ministry.id)
    : false;

  const saveCell = useMutation({
    mutationFn: (v: { serviceId: string; date: string; assignments: AssignmentInput[] }) =>
      apiFetch<ServiceDetail>(`/services/${v.serviceId}/assignments?ministry=${slug}`, {
        method: "PUT",
        body: { assignments: v.assignments },
      }),
    onSuccess: (data, v) => qc.setQueryData(["service", v.date], data),
  });

  // The preacher lives on the service (not a roster role) and is scheduled here
  // in the Presbitério's grid. It is exclusive to Presbitério/Convidados.
  const savePreacher = useMutation({
    mutationFn: (v: { serviceId: string; date: string; preacherId: string | null }) =>
      apiFetch<ServiceHeader>(`/services/${v.serviceId}`, {
        method: "PATCH",
        body: { preacher_id: v.preacherId },
      }),
    onSuccess: (_data, v) => qc.invalidateQueries({ queryKey: ["service", v.date] }),
  });

  const isPresbiterio = ministry?.slug === "presbiterio";
  const preacherPeople = useMemo(() => {
    if (!isPresbiterio) return [];
    const allowed = new Set<string>();
    for (const s of ["presbiterio", "convidados"]) {
      const m = session.ministries.find((mm) => mm.slug === s);
      if (m) for (const id of membersByMinistry.get(m.id) ?? []) allowed.add(id);
    }
    return (people.data ?? []).filter((p) => allowed.has(p.id));
  }, [isPresbiterio, session.ministries, membersByMinistry, people.data]);

  const peopleList = people.data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">Escala</h1>
        <select value={slug} onChange={(e) => setParam("ministerio", e.target.value)} className={ctrl}>
          {selectable.map((m) => (
            <option key={m.id} value={m.slug}>{m.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">De <input type="date" value={from} onChange={(e) => setParam("de", e.target.value)} className={ctrl} /></label>
        <label className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">Até <input type="date" value={to} onChange={(e) => setParam("ate", e.target.value)} className={ctrl} /></label>
        {!editable && <span className="text-xs text-zinc-400">🔒 leitura</span>}
      </div>

      {list.isLoading ? (
        <p className="text-sm text-zinc-500">A carregar…</p>
      ) : roles.length === 0 ? (
        <p className="text-sm text-zinc-500">Sem funções definidas para este ministério.</p>
      ) : (
        <div className="card overflow-x-auto p-2 sm:p-3">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white p-2 text-left font-semibold dark:bg-zinc-900">Domingo</th>
                {isPresbiterio && <th className="p-2 text-left font-medium">Pregador</th>}
                {roles.map((r) => (
                  <th key={r.id} className="p-2 text-left font-medium">{r.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.map((s, i) => {
                const detail = details[i]?.data;
                const mine = detail?.assignments.filter((a) => a.ministry_id === ministry?.id) ?? [];
                const unavailable = new Set(detail?.unavailable_person_ids ?? []);
                return (
                  <tr key={s.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="sticky left-0 bg-white p-2 dark:bg-zinc-900">
                      <Link to={`/culto/${s.service_date}`} className="link">{shortDate(s.service_date)}</Link>
                    </td>
                    {isPresbiterio && (
                      <td className="min-w-36 p-1 align-top">
                        <div className="flex flex-col gap-1">
                          {detail?.service.preacher_id ? (
                            <div className="flex flex-wrap gap-1">
                              <PersonChip
                                compact
                                name={detail.service.preacher_name ?? "•"}
                                unavailable={unavailable.has(detail.service.preacher_id)}
                                onRemove={
                                  editable
                                    ? () => savePreacher.mutate({ serviceId: detail.service.id, date: s.service_date, preacherId: null })
                                    : undefined
                                }
                              />
                            </div>
                          ) : (
                            !editable && <span className="text-black/25">—</span>
                          )}
                          {editable && detail && !detail.service.preacher_id && (
                            <PersonPicker
                              compact
                              people={preacherPeople}
                              placeholder="+ pregador…"
                              onPick={(p) => savePreacher.mutate({ serviceId: detail.service.id, date: s.service_date, preacherId: p.id })}
                            />
                          )}
                        </div>
                      </td>
                    )}
                    {roles.map((r) => {
                      // Communion roles only apply to first Sundays.
                      if (isCeiaRole(r.name) && !isFirstSundayOfMonth(s.service_date)) {
                        return (
                          <td key={r.id} className="p-1 align-top">
                            <span className="text-black/20 dark:text-white/20" title="Só nos cultos de ceia">·</span>
                          </td>
                        );
                      }
                      // A role may hold several people (e.g. several "Voz").
                      const assigned = mine.filter((a) => a.role === r.name && a.person_id);

                      // Rebuilds the whole ministry roster for this service after
                      // changing one slot of one role, then saves immediately.
                      const applyChange = (removeIndex: number, addId: string | null) => {
                        if (!detail) return;
                        const byRole = new Map<string, (string | null)[]>(
                          roles.map((rr) => [
                            rr.name,
                            mine.filter((a) => a.role === rr.name && a.person_id).map((a) => a.person_id),
                          ]),
                        );
                        const list = [...(byRole.get(r.name) ?? [])];
                        if (removeIndex >= 0) list.splice(removeIndex, 1);
                        if (addId) list.push(addId);
                        byRole.set(r.name, [...new Set(list)]);
                        const assignments = roles.flatMap((rr, ri) =>
                          (byRole.get(rr.name) ?? []).map((pid, i) => ({
                            person_id: pid,
                            role: rr.name,
                            sort_order: ri * 10 + i,
                          })),
                        );
                        saveCell.mutate({ serviceId: detail.service.id, date: s.service_date, assignments });
                      };

                      return (
                        <td key={r.id} className="min-w-36 p-1 align-top">
                          <div className="flex flex-col gap-1">
                            {assigned.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {assigned.map((a, i) => (
                                  <PersonChip
                                    key={a.id}
                                    compact
                                    name={a.person_name ?? "•"}
                                    unavailable={unavailable.has(a.person_id as string)}
                                    onRemove={editable && detail ? () => applyChange(i, null) : undefined}
                                  />
                                ))}
                              </div>
                            )}
                            {!editable && assigned.length === 0 && <span className="text-black/25">—</span>}
                            {editable && detail && (
                              <PersonPicker
                                compact
                                people={peopleList}
                                memberIds={ministry ? membersByMinistry.get(ministry.id) : undefined}
                                exclude={new Set(assigned.map((a) => a.person_id as string))}
                                placeholder="+ nome…"
                                onPick={(p) => applyChange(-1, p.id)}
                              />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ctrl = "input-base";
