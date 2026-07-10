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
    <aside className="w-full shrink-0 sm:w-56">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Ministérios</h2>
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={onAll} className="text-blue-600 hover:underline">
            Todos
          </button>
          <button type="button" onClick={onNone} className="text-blue-600 hover:underline">
            Nenhum
          </button>
        </div>
      </div>
      <ul className="space-y-1">
        {ministries.map((m) => (
          <li key={m.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5">
              <input
                type="checkbox"
                checked={selected.has(m.id)}
                onChange={() => onToggle(m.id)}
                className="h-4 w-4 rounded border-black/30"
              />
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: m.color }}
                aria-hidden
              />
              <span className="text-sm">{m.name}</span>
            </label>
          </li>
        ))}
      </ul>
    </aside>
  );
}
