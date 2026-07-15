import type { Ministry } from "../lib/types";

interface MinistryFilterProps {
  ministries: Ministry[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onAll: () => void;
  onNone: () => void;
}

export function MinistryFilter({ ministries, selected, onToggle, onAll, onNone }: MinistryFilterProps) {
  return (
    <aside>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Ministérios
        </h2>
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={onAll} className="link">
            Todos
          </button>
          <button type="button" onClick={onNone} className="link">
            Nenhum
          </button>
        </div>
      </div>
      <ul className="space-y-0.5">
        {ministries.map((m) => (
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
    </aside>
  );
}
