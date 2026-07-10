import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import { useSession } from "../../session/SessionProvider";
import type { Scope, TokenRecord } from "../../lib/types";
import { Section, ErrorNote, input, btnPrimary, btnDanger } from "./shared";

type NewToken = TokenRecord & { token: string };

export function TokensTab() {
  const session = useSession();
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>("ministry");
  const [ministryId, setMinistryId] = useState("");
  const [label, setLabel] = useState("");
  // The clear token is shown exactly once, right after creation.
  const [created, setCreated] = useState<NewToken | null>(null);

  const list = useQuery({
    queryKey: ["tokens"],
    queryFn: () => apiFetch<TokenRecord[]>("/tokens"),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<NewToken>("/tokens", {
        method: "POST",
        body: {
          scope,
          ministry_id: scope === "admin" ? null : ministryId || null,
          label: label.trim() || null,
        },
      }),
    onSuccess: (data) => {
      setCreated(data);
      setLabel("");
      void qc.invalidateQueries({ queryKey: ["tokens"] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch<TokenRecord>(`/tokens/${id}/revoke`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tokens"] }),
  });

  const ministryName = (id: string | null) =>
    id ? session.ministryById.get(id)?.name ?? "?" : "—";
  const accessUrl = (token: string) => `${window.location.origin}${import.meta.env.BASE_URL}#t=${token}`;

  return (
    <div className="space-y-4">
      <Section title="Novo token">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-xs">
            Âmbito
            <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} className={input + " mt-1 block"}>
              <option value="ministry">Ministério</option>
              <option value="readonly">Só leitura</option>
              <option value="admin">Admin (Presbitério)</option>
            </select>
          </label>
          {scope !== "admin" && (
            <label className="block text-xs">
              Ministério {scope === "ministry" ? "" : "(opcional)"}
              <select value={ministryId} onChange={(e) => setMinistryId(e.target.value)} className={input + " mt-1 block"}>
                <option value="">—</option>
                {session.ministries.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-xs">
            Etiqueta
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex.: Louvor 2026" className={input + " mt-1 block"} />
          </label>
          <button
            type="button"
            className={btnPrimary}
            disabled={create.isPending || (scope === "ministry" && !ministryId)}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "A criar…" : "Criar token"}
          </button>
        </div>
        <ErrorNote error={create.error} />

        {created && (
          <div className="mt-4 rounded-lg border border-emerald-400 bg-emerald-50 p-3 dark:border-emerald-700 dark:bg-emerald-950/40">
            <p className="mb-1 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              Token criado — copia o link agora. Não voltará a ser mostrado.
            </p>
            <code className="block select-all break-all rounded bg-white/70 p-2 text-xs dark:bg-black/30">
              {accessUrl(created.token)}
            </code>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className={btnPrimary}
                onClick={() => void navigator.clipboard.writeText(accessUrl(created.token))}
              >
                Copiar link
              </button>
              <button type="button" className={btnDanger} onClick={() => setCreated(null)}>
                Fechar
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Tokens emitidos">
        {list.isLoading ? (
          <p className="text-sm text-black/60">A carregar…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-black/50 dark:text-white/50">
                  <th className="p-2">Etiqueta</th>
                  <th className="p-2">Âmbito</th>
                  <th className="p-2">Ministério</th>
                  <th className="p-2">Criado</th>
                  <th className="p-2">Último uso</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {(list.data ?? []).map((t) => (
                  <tr key={t.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="p-2">{t.label ?? <span className="text-black/30">—</span>}</td>
                    <td className="p-2">{t.scope}</td>
                    <td className="p-2">{ministryName(t.ministry_id)}</td>
                    <td className="p-2">{t.created_at.slice(0, 10)}</td>
                    <td className="p-2">{t.last_used_at ? t.last_used_at.slice(0, 16).replace("T", " ") : "nunca"}</td>
                    <td className="p-2">
                      {t.revoked_at ? (
                        <span className="text-red-600">revogado</span>
                      ) : (
                        <span className="text-emerald-600">ativo</span>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      {!t.revoked_at && (
                        <button type="button" className={btnDanger} disabled={revoke.isPending} onClick={() => revoke.mutate(t.id)}>
                          Revogar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ErrorNote error={revoke.error} />
      </Section>
    </div>
  );
}
