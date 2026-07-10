import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type { EbdClass } from "../../lib/types";
import { Section, ErrorNote, input, btnPrimary, btnDanger } from "./shared";

export function EbdTab() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [ageRange, setAgeRange] = useState("");

  const list = useQuery({
    queryKey: ["ebd-classes"],
    queryFn: () => apiFetch<EbdClass[]>("/ebd-classes"),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["ebd-classes"] });
    void qc.invalidateQueries({ queryKey: ["service"] });
  };

  const create = useMutation({
    mutationFn: () =>
      apiFetch<EbdClass>("/ebd-classes", {
        method: "POST",
        body: { name: name.trim(), age_range: ageRange.trim() || null, sort_order: (list.data?.length ?? 0) + 1 },
      }),
    onSuccess: () => {
      setName("");
      setAgeRange("");
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<EbdClass> }) =>
      apiFetch<EbdClass>(`/ebd-classes/${id}`, { method: "PATCH", body: patch }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/ebd-classes/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-4">
      <Section title="Nova classe">
        <div className="flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: Juniores)" className={input} />
          <input value={ageRange} onChange={(e) => setAgeRange(e.target.value)} placeholder="Idades (ex.: 9-12)" className={input + " w-32"} />
          <button type="button" className={btnPrimary} disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            Criar
          </button>
        </div>
        <ErrorNote error={create.error} />
      </Section>

      <Section title="Classes da Escola Bíblica Dominical">
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {(list.data ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
              <input
                defaultValue={c.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== c.name) update.mutate({ id: c.id, patch: { name: v } });
                }}
                className={input + " min-w-40 flex-1"}
              />
              <input
                defaultValue={c.age_range ?? ""}
                placeholder="idades"
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (v !== c.age_range) update.mutate({ id: c.id, patch: { age_range: v } });
                }}
                className={input + " w-28"}
              />
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={c.active} onChange={(e) => update.mutate({ id: c.id, patch: { active: e.target.checked } })} />
                ativa
              </label>
              <button type="button" className={btnDanger} onClick={() => remove.mutate(c.id)}>
                Apagar
              </button>
            </li>
          ))}
        </ul>
        <ErrorNote error={update.error ?? remove.error} />
      </Section>
    </div>
  );
}
