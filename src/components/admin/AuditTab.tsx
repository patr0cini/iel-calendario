import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type { AuditRow } from "../../lib/types";
import { Section } from "./shared";

const ACTION_LABEL: Record<string, string> = {
  create: "criou",
  update: "editou",
  delete: "apagou",
};

export function AuditTab() {
  const audit = useQuery({
    queryKey: ["audit"],
    queryFn: () => apiFetch<AuditRow[]>("/audit?limit=200"),
  });

  return (
    <Section title="Auditoria (últimas 200 ações)">
      {audit.isLoading ? (
        <p className="text-sm text-black/60">A carregar…</p>
      ) : audit.isError ? (
        <p className="text-sm text-red-600">Não foi possível carregar a auditoria.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-black/50 dark:text-white/50">
                <th className="p-2">Quando</th>
                <th className="p-2">Quem (token)</th>
                <th className="p-2">Ação</th>
                <th className="p-2">Entidade</th>
                <th className="p-2">Ministério</th>
              </tr>
            </thead>
            <tbody>
              {(audit.data ?? []).map((r) => (
                <tr key={r.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="whitespace-nowrap p-2">{r.at.slice(0, 16).replace("T", " ")}</td>
                  <td className="p-2">
                    {r.token_label ?? <span className="text-black/40">{r.token_scope ?? "—"}</span>}
                  </td>
                  <td className="p-2">{ACTION_LABEL[r.action] ?? r.action}</td>
                  <td className="p-2"><code className="text-xs">{r.entity}</code></td>
                  <td className="p-2">{r.ministry_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
