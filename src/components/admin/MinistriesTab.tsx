import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type { Ministry, MinistryRole } from "../../lib/types";
import { Section, ErrorNote, input, btnPrimary, btnDanger, btnGhost } from "./shared";

export function MinistriesTab() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newColor, setNewColor] = useState("#2563eb");

  const list = useQuery({
    queryKey: ["ministries"],
    queryFn: () => apiFetch<Ministry[]>("/ministries"),
  });

  const invalidate = () => {
    // Ministries feed the session provider, calendar colors and filters.
    void qc.invalidateQueries({ queryKey: ["ministries"] });
  };

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Ministry>("/ministries", {
        method: "POST",
        body: { name: newName.trim(), slug: newSlug.trim(), color: newColor, sort_order: (list.data?.length ?? 0) + 1 },
      }),
    onSuccess: () => {
      setNewName("");
      setNewSlug("");
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Ministry> }) =>
      apiFetch<Ministry>(`/ministries/${id}`, { method: "PATCH", body: patch }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/ministries/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-4">
      <Section title="Novo ministério">
        <div className="flex flex-wrap items-center gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome" className={input} />
          <input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="slug (ex.: intercessao)" className={input} />
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-black/15" aria-label="Cor" />
          <button
            type="button"
            className={btnPrimary}
            disabled={!newName.trim() || !newSlug.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            Criar
          </button>
        </div>
        <ErrorNote error={create.error} />
      </Section>

      <Section title="Ministérios">
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {(list.data ?? []).map((m) => (
            <li key={m.id} className="py-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  defaultValue={m.color}
                  onBlur={(e) => e.target.value !== m.color && update.mutate({ id: m.id, patch: { color: e.target.value } })}
                  className="h-7 w-10 cursor-pointer rounded border border-black/15"
                  aria-label={`Cor de ${m.name}`}
                />
                <input
                  defaultValue={m.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== m.name) update.mutate({ id: m.id, patch: { name: v } });
                  }}
                  className={input + " min-w-40 flex-1"}
                />
                <code className="text-xs text-black/40">{m.slug}</code>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={m.active} onChange={(e) => update.mutate({ id: m.id, patch: { active: e.target.checked } })} />
                  ativo
                </label>
                <button type="button" className={btnGhost} onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
                  Funções {expanded === m.id ? "▲" : "▼"}
                </button>
                <button type="button" className={btnDanger} onClick={() => remove.mutate(m.id)}>
                  Apagar
                </button>
              </div>
              {expanded === m.id && <RolesEditor ministry={m} />}
            </li>
          ))}
        </ul>
        <ErrorNote error={update.error ?? remove.error} />
      </Section>
    </div>
  );
}

// Editable list of functions for one ministry (PROMPT §13 decision: the
// Presbitério manages these; assignments reference them by name).
function RolesEditor({ ministry }: { ministry: Ministry }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string[] | null>(null);

  const roles = useQuery({
    queryKey: ["ministry-roles", ministry.id],
    queryFn: () => apiFetch<MinistryRole[]>(`/ministries/${ministry.id}/roles`),
  });

  const save = useMutation({
    mutationFn: (names: string[]) =>
      apiFetch<MinistryRole[]>(`/ministries/${ministry.id}/roles`, {
        method: "PUT",
        body: { roles: names.map((name, i) => ({ name, sort_order: i })) },
      }),
    onSuccess: (data) => {
      qc.setQueryData(["ministry-roles", ministry.id], data);
      setDraft(null);
      // Service pages embed roles; refresh them next time they're opened.
      void qc.invalidateQueries({ queryKey: ["service"] });
    },
  });

  const names = draft ?? (roles.data ?? []).map((r) => r.name);

  const set = (i: number, v: string) => setDraft(names.map((n, j) => (j === i ? v : n)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= names.length) return;
    const next = [...names];
    [next[i], next[j]] = [next[j], next[i]];
    setDraft(next);
  };

  return (
    <div className="mt-2 rounded-md bg-black/[0.03] p-3 dark:bg-white/[0.05]">
      {roles.isLoading ? (
        <p className="text-sm text-black/60">A carregar…</p>
      ) : (
        <>
          <ul className="space-y-1">
            {names.map((n, i) => (
              <li key={i} className="flex items-center gap-1">
                <input value={n} onChange={(e) => set(i, e.target.value)} className={input + " flex-1"} />
                <button type="button" className={btnGhost} onClick={() => move(i, -1)} aria-label="Subir">↑</button>
                <button type="button" className={btnGhost} onClick={() => move(i, 1)} aria-label="Descer">↓</button>
                <button type="button" className={btnDanger} onClick={() => setDraft(names.filter((_, j) => j !== i))} aria-label="Remover">✕</button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between">
            <button type="button" className={btnGhost + " text-indigo-600 dark:text-indigo-400"} onClick={() => setDraft([...names, ""])}>
              + Função
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={draft === null || save.isPending}
              onClick={() => save.mutate(names.map((n) => n.trim()).filter(Boolean))}
            >
              {save.isPending ? "A guardar…" : "Guardar funções"}
            </button>
          </div>
          <ErrorNote error={save.error} />
        </>
      )}
    </div>
  );
}
