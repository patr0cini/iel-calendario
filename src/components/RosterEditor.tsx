import { useState } from "react";

import type { PersonLite } from "../lib/types";
import { PersonPicker, PersonChip } from "./PersonPicker";

export interface RosterRow {
  key: string; // role name, or EBD class id
  label: string;
  /** Current assignees, in order. `name` covers read-only tokens without /people. */
  people: { id: string; name: string | null }[];
}

interface RosterEditorProps {
  title: string;
  color: string;
  rows: RosterRow[];
  people: PersonLite[];
  /** Members of this ministry: suggested first in the search field. */
  memberIds?: Set<string>;
  editable: boolean;
  unavailableIds: Set<string>;
  saving?: boolean;
  onSave: (rows: { key: string; personIds: string[] }[]) => void;
}

// Each role holds any number of people, shown as chips; a search field adds
// more (type a name, matches appear below, ministry members first).
export function RosterEditor({ title, color, rows, people, memberIds, editable, unavailableIds, saving, onSave }: RosterEditorProps) {
  const [selection, setSelection] = useState<Record<string, string[]>>(
    () => Object.fromEntries(rows.map((r) => [r.key, r.people.map((p) => p.id)])),
  );
  const [dirty, setDirty] = useState(false);

  const listFor = (key: string) => selection[key] ?? [];

  const remove = (key: string, index: number) => {
    setSelection((s) => {
      const list = [...(s[key] ?? [])];
      list.splice(index, 1);
      return { ...s, [key]: list };
    });
    setDirty(true);
  };

  const add = (key: string, personId: string) => {
    setSelection((s) => ({ ...s, [key]: [...new Set([...(s[key] ?? []), personId])] }));
    setDirty(true);
  };

  const nameOf = (row: RosterRow, id: string) =>
    people.find((p) => p.id === id)?.full_name ?? row.people.find((p) => p.id === id)?.name ?? "—";

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
          const list = listFor(row.key);
          return (
            <li key={row.key} className="grid grid-cols-[minmax(6rem,9rem)_1fr] items-start gap-2">
              <span className="pt-1.5 text-sm text-black/70 dark:text-white/70">{row.label}</span>
              <div className="flex flex-col gap-1.5">
                {list.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((id, i) => (
                      <PersonChip
                        key={id}
                        name={nameOf(row, id)}
                        unavailable={unavailableIds.has(id)}
                        onRemove={editable ? () => remove(row.key, i) : undefined}
                      />
                    ))}
                  </div>
                )}
                {!editable && list.length === 0 && (
                  <span className="pt-1.5 text-sm text-black/40">— por preencher —</span>
                )}
                {editable && (
                  <PersonPicker
                    people={people}
                    memberIds={memberIds}
                    exclude={new Set(list)}
                    placeholder="Escrever nome para adicionar…"
                    onPick={(p) => add(row.key, p.id)}
                  />
                )}
              </div>
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
              onSave(rows.map((r) => ({ key: r.key, personIds: [...new Set(listFor(r.key))] })));
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
