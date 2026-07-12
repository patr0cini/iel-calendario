import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { pt } from "date-fns/locale";

import { useSession } from "../session/SessionProvider";
import { usePeople } from "../hooks/usePeople";
import { apiFetch } from "../lib/api";
import { TIME_ZONE } from "../lib/datetime";
import type { AssignmentInput, ServiceDetail, ServiceHeader } from "../lib/types";

const today = () => formatInTimeZone(new Date(), TIME_ZONE, "yyyy-MM-dd");
const shortDate = (d: string) => formatInTimeZone(new Date(`${d}T12:00:00Z`), TIME_ZONE, "d MMM", { locale: pt });

export function EscalaPage() {
  const session = useSession();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const people = usePeople(session.canCreate);

  const selectable = session.ministries.filter((m) => m.slug !== "presbiterio");
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

  const peopleList = people.data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/" className="text-sm text-blue-600 hover:underline">← Calendário</Link>
        <h1 className="text-xl font-bold">Escala</h1>
        <select value={slug} onChange={(e) => setParam("ministerio", e.target.value)} className={ctrl}>
          {selectable.map((m) => (
            <option key={m.id} value={m.slug}>{m.name}</option>
          ))}
        </select>
        <label className="text-sm">De <input type="date" value={from} onChange={(e) => setParam("de", e.target.value)} className={ctrl} /></label>
        <label className="text-sm">Até <input type="date" value={to} onChange={(e) => setParam("ate", e.target.value)} className={ctrl} /></label>
        {!editable && <span className="text-xs text-black/40">🔒 leitura</span>}
      </div>

      {list.isLoading ? (
        <p className="text-sm text-black/60">A carregar…</p>
      ) : roles.length === 0 ? (
        <p className="text-sm text-black/60">Sem funções definidas para este ministério.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white p-2 text-left font-semibold dark:bg-neutral-900">Domingo</th>
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
                    <td className="sticky left-0 bg-white p-2 dark:bg-neutral-900">
                      <Link to={`/culto/${s.service_date}`} className="text-blue-600 hover:underline">{shortDate(s.service_date)}</Link>
                    </td>
                    {roles.map((r) => {
                      // A role may hold several people (e.g. several "Voz").
                      const assigned = mine.filter((a) => a.role === r.name && a.person_id);

                      // Rebuilds the whole ministry roster for this service after
                      // changing one slot of one role, then saves immediately.
                      const applyChange = (slotIndex: number, newValue: string) => {
                        if (!detail) return;
                        const byRole = new Map<string, (string | null)[]>(
                          roles.map((rr) => [
                            rr.name,
                            mine.filter((a) => a.role === rr.name && a.person_id).map((a) => a.person_id),
                          ]),
                        );
                        const list = [...(byRole.get(r.name) ?? [])];
                        if (slotIndex === -1) list.push(newValue);
                        else if (newValue === "") list.splice(slotIndex, 1);
                        else list[slotIndex] = newValue;
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

                      const cellSelect = (value: string, slotIndex: number, isUnavail: boolean) => (
                        <select
                          key={slotIndex}
                          value={value}
                          className={"w-full rounded border px-1 py-1 text-sm dark:bg-neutral-800 " + (isUnavail ? "border-amber-500" : "border-black/10 dark:border-white/10")}
                          onChange={(e) => applyChange(slotIndex, e.target.value)}
                        >
                          <option value="">{slotIndex === -1 ? "+" : "— remover —"}</option>
                          {peopleList.map((p) => (
                            <option key={p.id} value={p.id}>{p.full_name}</option>
                          ))}
                        </select>
                      );

                      return (
                        <td key={r.id} className="p-1 align-top">
                          {editable && detail ? (
                            <div className="flex flex-col gap-1">
                              {assigned.map((a, i) => cellSelect(a.person_id as string, i, unavailable.has(a.person_id as string)))}
                              {cellSelect("", -1, false)}
                            </div>
                          ) : (
                            <span>
                              {assigned.length === 0 ? (
                                <span className="text-black/25">—</span>
                              ) : (
                                assigned.map((a, i) => {
                                  const isUnavail = unavailable.has(a.person_id as string);
                                  return (
                                    <span key={a.id} className={isUnavail ? "text-amber-600" : ""}>
                                      {i > 0 && <span className="text-black/40">, </span>}
                                      {a.person_name ?? "•"}
                                      {isUnavail && " ⚠️"}
                                    </span>
                                  );
                                })
                              )}
                            </span>
                          )}
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

const ctrl = "rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-neutral-800";
