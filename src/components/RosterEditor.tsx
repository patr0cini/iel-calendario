import { useState } from "react";

import type { PersonLite } from "../lib/types";

export interface RosterRow {
  key: string; // role name, or EBD class id
  label: string;
  personId: string | null;
  personName?: string | null; // for read-only display without the people list
}

interface RosterEditorProps {
  title: string;
  color: string;
  rows: RosterRow[];
  people: PersonLite[];
  editable: boolean;
  unavailableIds: Set<string>;
  saving?: boolean;
  onSave: (rows: { key: string; personId: string | null }[]) => void;
}

export function RosterEditor({ title, color, rows, people, editable, unavailableIds, saving, onSave }: RosterEditorProps) {
  const [selection, setSelection] = useState<Record<string, string | null>>(
    () => Object.fromEntries(rows.map((r) => [r.key, r.personId])),
  );
  const [dirty, setDirty] = useState(false);

  const nameFor = (row: RosterRow) => {
    const id = selection[row.key] ?? null;
    if (!id) return "— por preencher —";
    return people.find((p) => p.id === id)?.full_name ?? row.personName ?? "—";
  };

  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: color }} aria-hidden />
        {title}
        {!editable && <span className="ml-auto text-xs font-normal text-black/40 dark:text-white/40">🔒 bloqueado</span>}
      </h3>

      <ul className="space-y-2">
        {rows.length === 0 && <li className="text-sm text-black/50">Sem funções definidas.</li>}
        {rows.map((row) => {
          const current = selection[row.key] ?? null;
          const unavailable = current !== null && unavailableIds.has(current);
          return (
            <li key={row.key} className="grid grid-cols-[minmax(6rem,9rem)_1fr] items-center gap-2">
              <span className="text-sm text-black/70 dark:text-white/70">{row.label}</span>
              {editable ? (
                <select
                  value={current ?? ""}
                  onChange={(e) => {
                    setSelection((s) => ({ ...s, [row.key]: e.target.value || null }));
                    setDirty(true);
                  }}
                  className={
                    "w-full rounded-md border px-2 py-1.5 text-sm dark:bg-neutral-800 " +
                    (unavailable ? "border-amber-500" : "border-black/15 dark:border-white/15")
                  }
                >
                  <option value="">— por preencher —</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={"text-sm " + (unavailable ? "text-amber-600" : "")}>
                  {nameFor(row)}
                  {unavailable && " ⚠️"}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {editable && rows.length > 0 && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => {
              onSave(rows.map((r) => ({ key: r.key, personId: selection[r.key] ?? null })));
              setDirty(false);
            }}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "A guardar…" : "Guardar"}
          </button>
        </div>
      )}
    </section>
  );
}
