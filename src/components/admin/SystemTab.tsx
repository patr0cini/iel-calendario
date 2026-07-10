import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import { useServiceAdmin } from "../../hooks/useService";
import type { SyncFailedEvent } from "../../lib/types";
import { formatRange } from "../../lib/datetime";
import { Section, ErrorNote, input, btnPrimary } from "./shared";

export function SystemTab() {
  const [year, setYear] = useState(new Date().getFullYear() + 1);
  const { generate } = useServiceAdmin("");

  // Failed Outlook syncs (PROMPT §7/§10). Empty while Phase 6 is off.
  const failed = useQuery({
    queryKey: ["events", "sync-failed"],
    queryFn: () => apiFetch<SyncFailedEvent[]>("/events?sync_state=failed"),
  });

  return (
    <div className="space-y-4">
      <Section title="Geração dos domingos">
        <p className="mb-2 text-sm text-black/60 dark:text-white/60">
          Cria um culto (10:30) por cada domingo do ano. Correr duas vezes não duplica.
        </p>
        <div className="flex items-end gap-2">
          <label className="block text-xs">
            Ano
            <input
              type="number"
              value={year}
              min={2020}
              max={2100}
              onChange={(e) => setYear(Number(e.target.value))}
              className={input + " mt-1 block w-28"}
            />
          </label>
          <button type="button" className={btnPrimary} disabled={generate.isPending} onClick={() => generate.mutate(year)}>
            {generate.isPending ? "A gerar…" : "Gerar domingos"}
          </button>
        </div>
        {generate.isSuccess && (
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
            {generate.data.inserted} culto(s) criados para {generate.data.year}.
            {generate.data.inserted === 0 && " (já existiam todos)"}
          </p>
        )}
        <ErrorNote error={generate.error} />
      </Section>

      <Section title="Sincronização com o Outlook — falhas">
        {failed.isLoading ? (
          <p className="text-sm text-black/60">A carregar…</p>
        ) : (failed.data ?? []).length === 0 ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Sem falhas de sincronização. (O módulo do Outlook é a Fase 6; enquanto estiver
            desligado, esta lista fica vazia.)
          </p>
        ) : (
          <ul className="divide-y divide-black/10 text-sm dark:divide-white/10">
            {(failed.data ?? []).map((e) => (
              <li key={e.id} className="py-2">
                <p className="font-medium">{e.title}</p>
                <p className="text-black/60">{formatRange(e.starts_at, e.ends_at, e.all_day)}</p>
                <p className="text-red-600">
                  {e.sync_attempts} tentativas — {e.sync_error ?? "erro desconhecido"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
