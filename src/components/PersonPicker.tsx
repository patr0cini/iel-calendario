import { useMemo, useRef, useState } from "react";

import type { PersonLite } from "../lib/types";

/** Diacritic- and case-insensitive text for matching ("João" ~ "joao"). */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

interface PersonPickerProps {
  people: PersonLite[];
  /** Members of the relevant ministry — listed first in suggestions. */
  memberIds?: Set<string>;
  /** Ids never suggested (already picked). */
  exclude?: Set<string>;
  placeholder?: string;
  compact?: boolean;
  onPick: (person: PersonLite) => void;
}

const MAX_SUGGESTIONS = 8;

// Search-as-you-type person selector: typing filters names live; suggestions
// appear below with the ministry's members first. Keyboard: ↑ ↓ Enter Esc.
export function PersonPicker({ people, memberIds, exclude, placeholder, compact, onPick }: PersonPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const q = normalizeText(query.trim());
    const pool = people.filter((p) => !exclude?.has(p.id));
    const matches = q ? pool.filter((p) => normalizeText(p.full_name).includes(q)) : pool;
    if (!memberIds || memberIds.size === 0) return matches.slice(0, MAX_SUGGESTIONS).map((p) => ({ p, member: false }));
    const members = matches.filter((p) => memberIds.has(p.id)).map((p) => ({ p, member: true }));
    const others = matches.filter((p) => !memberIds.has(p.id)).map((p) => ({ p, member: false }));
    return [...members, ...others].slice(0, MAX_SUGGESTIONS);
  }, [people, memberIds, exclude, query]);

  const firstOtherIndex = suggestions.findIndex((s) => !s.member);
  const hasGroups = Boolean(memberIds && memberIds.size > 0) && firstOtherIndex > 0;

  const pick = (person: PersonLite) => {
    onPick(person);
    setQuery("");
    setOpen(false);
    setHighlight(0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions[highlight]) pick(suggestions[highlight].p);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        placeholder={placeholder ?? "Procurar pessoa…"}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        className={
          (compact
            ? "w-full rounded border border-dashed border-black/20 px-1.5 py-1 text-sm "
            : "w-full rounded-md border border-dashed border-black/20 px-2 py-1.5 text-sm ") +
          "bg-transparent placeholder:text-black/40 focus:border-indigo-500 focus:border-solid dark:border-white/20 dark:placeholder:text-white/40"
        }
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-black/10 bg-white py-1 text-sm shadow-lg dark:border-white/15 dark:bg-zinc-800">
          {suggestions.map((s, i) => (
            <li key={s.p.id}>
              {hasGroups && i === firstOtherIndex && (
                <div className="border-t border-black/10 px-2 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-black/40 dark:border-white/10 dark:text-white/40">
                  Outras pessoas
                </div>
              )}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // fire before the input blurs
                  pick(s.p);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={
                  "block w-full px-2 py-1.5 text-left " +
                  (i === highlight ? "bg-indigo-600 text-white" : "")
                }
              >
                {s.p.full_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() !== "" && suggestions.length === 0 && (
        <div className="absolute left-0 right-0 z-30 mt-1 rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm text-black/50 shadow-lg dark:border-white/15 dark:bg-zinc-800 dark:text-white/50">
          Sem resultados.
        </div>
      )}
    </div>
  );
}

/** Small removable name chip used next to a PersonPicker. */
export function PersonChip({
  name,
  unavailable,
  onRemove,
  compact,
}: {
  name: string;
  unavailable?: boolean;
  onRemove?: () => void;
  compact?: boolean;
}) {
  return (
    <span
      className={
        (compact ? "px-1.5 py-0.5 text-xs " : "px-2 py-1 text-sm ") +
        "inline-flex items-center gap-1 rounded-full " +
        (unavailable
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
          : "bg-black/[0.06] dark:bg-white/10")
      }
    >
      {name}
      {unavailable && "⚠️"}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${name}`}
          className="text-black/40 hover:text-red-600 dark:text-white/40"
        >
          ✕
        </button>
      )}
    </span>
  );
}
