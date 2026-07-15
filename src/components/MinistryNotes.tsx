import { useState } from "react";

import type { MinistryNote } from "../lib/types";

interface MinistryNotesProps {
  notes: MinistryNote[];
  editable: boolean;
  saving?: boolean;
  onAdd: (body: string, recurring: boolean) => void;
  onRemove: (id: string) => void;
}

// Notes for a ministry inside one service. A note is either pinned to this
// service or recurring ("repetir sempre") — recurring ones carry a badge so it
// is obvious they show on every Sunday.
export function MinistryNotes({ notes, editable, saving, onAdd, onRemove }: MinistryNotesProps) {
  const [body, setBody] = useState("");
  const [recurring, setRecurring] = useState(false);

  const add = () => {
    if (!body.trim()) return;
    onAdd(body.trim(), recurring);
    setBody("");
    setRecurring(false);
  };

  return (
    <div className="mt-4 border-t border-zinc-200/70 pt-3 dark:border-white/[0.08]">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Notas
      </h4>

      {notes.length === 0 && <p className="text-sm text-zinc-400">Sem notas.</p>}
      <ul className="space-y-1.5">
        {notes.map((n) => (
          <li
            key={n.id}
            className="flex items-start gap-2 rounded-lg bg-zinc-900/[0.03] px-2.5 py-1.5 text-sm dark:bg-white/[0.04]"
          >
            <span className="min-w-0 flex-1 whitespace-pre-wrap">{n.body}</span>
            {n.service_id === null && (
              <span className="shrink-0 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
                sempre
              </span>
            )}
            {editable && (
              <button
                type="button"
                onClick={() => onRemove(n.id)}
                aria-label="Remover nota"
                className="shrink-0 text-zinc-400 hover:text-red-600 no-print"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      {editable && (
        <div className="mt-2 space-y-2 no-print">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Nova nota…"
            rows={2}
            className="input-base w-full"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-300 accent-indigo-600"
              />
              Repetir sempre (mostrar em todos os cultos)
            </label>
            <button
              type="button"
              onClick={add}
              disabled={!body.trim() || saving}
              className="btn-primary px-3 py-1 text-xs"
            >
              Adicionar nota
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
