import { useState } from "react";

import type { PersonLite } from "../lib/types";

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
  /** Members of this ministry: listed first; everyone else under "Outras pessoas". */
  memberIds?: Set<string>;
  editable: boolean;
  unavailableIds: Set<string>;
  saving?: boolean;
  onSave: (rows: { key: string; personIds: string[] }[]) => void;
}

// Ministry members first, the rest grouped at the bottom — borrowing someone
// from another ministry stays possible without drowning the common case.
export function PersonOptions({
  people,
  memberIds,
  exclude,
}: {
  people: PersonLite[];
  memberIds?: Set<string>;
  exclude?: Set<string>;
}) {
  const visible = exclude ? people.filter((p) => !exclude.has(p.id)) : people;
  if (!memberIds || memberIds.size === 0) {
    return (
      <>
        {visible.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name}
          </option>
        ))}
      </>
    );
  }
  const members = visible.filter((p) => memberIds.has(p.id));
  const others = visible.filter((p) => !memberIds.has(p.id));
  return (
    <>
      {members.map((p) => (
        <option key={p.id} value={p.id}>
          {p.full_name}
        </option>
      ))}
      {others.length > 0 && (
        <optgroup label="— Outras pessoas —">
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

// Each role holds any number of people (e.g. several "Voz" in Louvor).
// Selecting "— remover —" on a slot drops it; the trailing select adds one.
export function RosterEditor({ title, color, rows, people, memberIds, editable, unavailableIds, saving, onSave }: RosterEditorProps) {
  const [selection, setSelection] = useState<Record<string, string[]>>(
    () => Object.fromEntries(rows.map((r) => [r.key, r.people.map((p) => p.id)])),
  );
  const [dirty, setDirty] = useState(false);

  const listFor = (key: string) => selection[key] ?? [];

  const setSlot = (key: string, index: number, value: string) => {
    setSelection((s) => {
      const list = [...(s[key] ?? [])];
      if (value === "") list.splice(index, 1);
      else list[index] = value;
      return { ...s, [key]: list };
    });
    setDirty(true);
  };

  const addSlot = (key: string, value: string) => {
    if (!value) return;
    setSelection((s) => ({ ...s, [key]: [...(s[key] ?? []), value] }));
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
              {editable ? (
                <div className="flex flex-col gap-1">
                  {list.map((personId, i) => {
                    const unavailable = unavailableIds.has(personId);
                    return (
                      <select
                        key={`${row.key}-${i}`}
                        value={personId}
                        onChange={(e) => setSlot(row.key, i, e.target.value)}
                        className={
                          "w-full rounded-md border px-2 py-1.5 text-sm dark:bg-neutral-800 " +
                          (unavailable ? "border-amber-500" : "border-black/15 dark:border-white/15")
                        }
                      >
                        <option value="">— remover —</option>
                        <PersonOptions people={people} memberIds={memberIds} />
                      </select>
                    );
                  })}
                  <select
                    value=""
                    onChange={(e) => addSlot(row.key, e.target.value)}
                    className="w-full rounded-md border border-dashed border-black/20 px-2 py-1.5 text-sm text-black/50 dark:border-white/20 dark:bg-neutral-800 dark:text-white/50"
                  >
                    <option value="">+ adicionar pessoa…</option>
                    <PersonOptions people={people} memberIds={memberIds} exclude={new Set(list)} />
                  </select>
                </div>
              ) : (
                <span className="pt-1.5 text-sm">
                  {list.length === 0 ? (
                    <span className="text-black/40">— por preencher —</span>
                  ) : (
                    list.map((id, i) => (
                      <span key={id} className={unavailableIds.has(id) ? "text-amber-600" : ""}>
                        {i > 0 && <span className="text-black/40">, </span>}
                        {nameOf(row, id)}
                        {unavailableIds.has(id) && " ⚠️"}
                      </span>
                    ))
                  )}
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
              // Dedupe accidental repeats of the same person within a role.
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
