import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import { useSession } from "../../session/SessionProvider";
import type { PersonFull } from "../../lib/types";
import { Section, ErrorNote, input, btnPrimary, btnDanger, btnGhost } from "./shared";

interface Membership {
  id: string;
  ministry_id: string;
  person_id: string;
  role: string | null;
}

export function PeopleTab() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const people = useQuery({
    queryKey: ["people", "full"],
    queryFn: () => apiFetch<PersonFull[]>("/people"),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["people"] });
  };

  const create = useMutation({
    mutationFn: (full_name: string) => apiFetch<PersonFull>("/people", { method: "POST", body: { full_name } }),
    onSuccess: () => {
      setNewName("");
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<PersonFull> }) =>
      apiFetch<PersonFull>(`/people/${id}`, { method: "PATCH", body: patch }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/people/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-4">
      <Section title="Nova pessoa">
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome completo"
            className={input + " flex-1"}
          />
          <button
            type="button"
            className={btnPrimary}
            disabled={!newName.trim() || create.isPending}
            onClick={() => create.mutate(newName.trim())}
          >
            Adicionar
          </button>
        </div>
        <ErrorNote error={create.error} />
      </Section>

      <Section title="Pessoas">
        {people.isLoading ? (
          <p className="text-sm text-black/60">A carregar…</p>
        ) : (
          <ul className="divide-y divide-black/10 dark:divide-white/10">
            {(people.data ?? []).map((p) => (
              <li key={p.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    defaultValue={p.full_name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== p.full_name) update.mutate({ id: p.id, patch: { full_name: v } });
                    }}
                    className={input + " min-w-40 flex-1"}
                  />
                  <input
                    defaultValue={p.email ?? ""}
                    placeholder="email"
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== p.email) update.mutate({ id: p.id, patch: { email: v } });
                    }}
                    className={input + " w-48"}
                  />
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={p.active}
                      onChange={(e) => update.mutate({ id: p.id, patch: { active: e.target.checked } })}
                    />
                    ativa
                  </label>
                  <button type="button" className={btnGhost} onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                    Ministérios {expanded === p.id ? "▲" : "▼"}
                  </button>
                  <button type="button" className={btnDanger} onClick={() => remove.mutate(p.id)}>
                    Apagar
                  </button>
                </div>
                {expanded === p.id && <MembershipEditor personId={p.id} />}
              </li>
            ))}
          </ul>
        )}
        <ErrorNote error={update.error ?? remove.error} />
      </Section>
    </div>
  );
}

// Memberships for one person. There is no GET /ministry-members list endpoint;
// membership state lives in the admin's head plus add/remove actions, so we
// track additions optimistically via a local query on ministries + audit-free
// simplicity: we add/remove and show the result of our own actions.
function MembershipEditor({ personId }: { personId: string }) {
  const session = useSession();
  const qc = useQueryClient();
  const [ministryId, setMinistryId] = useState("");
  const [role, setRole] = useState("");

  const memberships = useQuery({
    queryKey: ["memberships", personId],
    queryFn: () => apiFetch<Membership[]>(`/ministry-members?person=${personId}`),
  });

  const add = useMutation({
    mutationFn: () =>
      apiFetch<Membership>("/ministry-members", {
        method: "POST",
        body: { ministry_id: ministryId, person_id: personId, role: role.trim() || null },
      }),
    onSuccess: () => {
      setRole("");
      void qc.invalidateQueries({ queryKey: ["memberships", personId] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/ministry-members/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memberships", personId] }),
  });

  return (
    <div className="mt-2 rounded-md bg-black/[0.03] p-3 dark:bg-white/[0.05]">
      <ul className="mb-2 space-y-1 text-sm">
        {(memberships.data ?? []).map((m) => (
          <li key={m.id} className="flex items-center gap-2">
            <span>{session.ministryById.get(m.ministry_id)?.name ?? "?"}</span>
            {m.role && <span className="text-black/50">· {m.role}</span>}
            <button type="button" className={btnDanger} onClick={() => remove.mutate(m.id)}>✕</button>
          </li>
        ))}
        {memberships.isSuccess && (memberships.data ?? []).length === 0 && (
          <li className="text-black/50">Sem ministérios.</li>
        )}
      </ul>
      <div className="flex flex-wrap gap-2">
        <select value={ministryId} onChange={(e) => setMinistryId(e.target.value)} className={input}>
          <option value="">Ministério…</option>
          {session.ministries.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="função (opcional)" className={input} />
        <button type="button" className={btnPrimary} disabled={!ministryId || add.isPending} onClick={() => add.mutate()}>
          Associar
        </button>
      </div>
      <ErrorNote error={add.error ?? remove.error} />
    </div>
  );
}
