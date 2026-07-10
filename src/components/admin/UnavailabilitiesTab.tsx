import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import { usePeople } from "../../hooks/usePeople";
import type { Unavailability } from "../../lib/types";
import { Section, ErrorNote, input, btnPrimary, btnDanger } from "./shared";

export function UnavailabilitiesTab() {
  const qc = useQueryClient();
  const people = usePeople(true);
  const [personId, setPersonId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");

  const list = useQuery({
    queryKey: ["unavailabilities"],
    queryFn: () => apiFetch<Unavailability[]>("/unavailabilities"),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["unavailabilities"] });
    // Conflict warnings on service pages depend on these.
    void qc.invalidateQueries({ queryKey: ["service"] });
  };

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Unavailability>("/unavailabilities", {
        method: "POST",
        body: { person_id: personId, start_date: from, end_date: to, reason: reason.trim() || null },
      }),
    onSuccess: () => {
      setReason("");
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/unavailabilities/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-4">
      <Section title="Declarar indisponibilidade">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-xs">
            Pessoa
            <select value={personId} onChange={(e) => setPersonId(e.target.value)} className={input + " mt-1 block"}>
              <option value="">—</option>
              {(people.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            De
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input + " mt-1 block"} />
          </label>
          <label className="block text-xs">
            Até
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input + " mt-1 block"} />
          </label>
          <label className="block text-xs">
            Motivo
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="opcional" className={input + " mt-1 block"} />
          </label>
          <button
            type="button"
            className={btnPrimary}
            disabled={!personId || !from || !to || create.isPending}
            onClick={() => create.mutate()}
          >
            Declarar
          </button>
        </div>
        <ErrorNote error={create.error} />
      </Section>

      <Section title="Indisponibilidades declaradas">
        {list.isLoading ? (
          <p className="text-sm text-black/60">A carregar…</p>
        ) : (list.data ?? []).length === 0 ? (
          <p className="text-sm text-black/50">Nenhuma.</p>
        ) : (
          <ul className="divide-y divide-black/10 text-sm dark:divide-white/10">
            {(list.data ?? []).map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2">
                <span className="font-medium">{u.person_name ?? "?"}</span>
                <span className="text-black/60">{u.start_date} → {u.end_date}</span>
                {u.reason && <span className="text-black/50">· {u.reason}</span>}
                <button type="button" className={btnDanger + " ml-auto"} onClick={() => remove.mutate(u.id)}>
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
        <ErrorNote error={remove.error} />
      </Section>
    </div>
  );
}
