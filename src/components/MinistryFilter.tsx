import { useState } from "react";

import type { Ministry } from "../lib/types";

interface MinistryFilterProps {
  ministries: Ministry[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onAll: () => void;
  onNone: () => void;
}

// On phones the list starts collapsed (a slim header with a counter) so the
// calendar is immediately visible; on lg+ it is always expanded. Entries are
// grouped: real ministries first, then buckets like Culto/Eventos/Convidados.
export function MinistryFilter({ ministries, selected, onToggle, onAll, onNone }: MinistryFilterProps) {
  const [open, setOpen] = useState(false);

  const groups: { label: string; items: Ministry[] }[] = [
    { label: "Ministérios", items: ministries.filter((m) => m.category !== "outro") },
    { label: "Outros", items: ministries.filter((m) => m.category === "outro") },
  ].filter((g) => g.items.length > 0);

  return (
    <aside>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 lg:pointer-events-none"
          aria-expanded={open}
        >
          Filtrar
          <span className="rounded-full bg-zinc-900/[0.06] px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-zinc-500 dark:bg-white/10 dark:text-zinc-400 lg:hidden">
            {selected.size}/{ministries.length}
          </span>
          <span
            aria-hidden
            className={"text-zinc-400 transition-transform lg:hidden " + (open ? "rotate-180" : "")}
          >
            ▾
          </span>
        </button>
        <div className={(open ? "flex" : "hidden") + " gap-2 text-xs lg:flex"}>
          <button type="button" onClick={onAll} className="link">
            Todos
          </button>
          <button type="button" onClick={onNone} className="link">
            Nenhum
          </button>
        </div>
      </div>

      <div className={(open ? "block" : "hidden") + " mt-2 space-y-3 lg:block"}>
        {groups.map((group) => (
          <div key={group.label}>
            <h3 className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {group.label}
            </h3>
            <ul className="space-y-0.5">
              {group.items.map((m) => (
                <li key={m.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.06]">
                    <input
                      type="checkbox"
                      checked={selected.has(m.id)}
                      onChange={() => onToggle(m.id)}
                      className="h-4 w-4 rounded border-zinc-300 accent-indigo-600"
                    />
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: m.color }}
                      aria-hidden
                    />
                    <span className={"text-sm " + (selected.has(m.id) ? "" : "text-zinc-400 dark:text-zinc-500")}>
                      {m.name}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
