import { useState } from "react";

import type { Song, SongInput, SongMoment } from "../lib/types";

const MOMENTS: { value: SongMoment; label: string }[] = [
  { value: "abertura", label: "Abertura" },
  { value: "adoracao", label: "Adoração" },
  { value: "ceia", label: "Ceia" },
  { value: "final", label: "Final" },
  { value: "outro", label: "Outro" },
];

interface Draft {
  title: string;
  author: string;
  song_key: string;
  moment: SongMoment;
}

function toDraft(s: Song): Draft {
  return { title: s.title, author: s.author ?? "", song_key: s.song_key ?? "", moment: s.moment };
}

interface SongsEditorProps {
  songs: Song[];
  editable: boolean;
  saving?: boolean;
  onSave: (songs: SongInput[]) => void;
}

export function SongsEditor({ songs, editable, saving, onSave }: SongsEditorProps) {
  const [drafts, setDrafts] = useState<Draft[]>(() => songs.map(toDraft));
  const [dirty, setDirty] = useState(false);

  const update = (i: number, patch: Partial<Draft>) => {
    setDrafts((d) => d.map((row, j) => (j === i ? { ...row, ...patch } : row)));
    setDirty(true);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= drafts.length) return;
    setDrafts((d) => {
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  };
  const remove = (i: number) => {
    setDrafts((d) => d.filter((_, j) => j !== i));
    setDirty(true);
  };
  const add = () => {
    setDrafts((d) => [...d, { title: "", author: "", song_key: "", moment: "outro" }]);
    setDirty(true);
  };

  if (!editable) {
    return (
      <ol className="space-y-1">
        {songs.length === 0 && <li className="text-sm text-black/50">Sem músicas.</li>}
        {songs.map((s) => (
          <li key={s.id} className="text-sm">
            <span className="font-medium">{s.title}</span>
            {s.song_key && <span className="text-black/50"> · {s.song_key}</span>}
            {s.author && <span className="text-black/50"> · {s.author}</span>}
            <span className="ml-1 text-xs text-black/40">
              ({MOMENTS.find((m) => m.value === s.moment)?.label})
            </span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="space-y-2">
      {drafts.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border border-black/10 p-2 dark:border-white/10">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input placeholder="Título" value={row.title} onChange={(e) => update(i, { title: e.target.value })} className={cell + " col-span-2 sm:col-span-1"} />
            <input placeholder="Autor" value={row.author} onChange={(e) => update(i, { author: e.target.value })} className={cell} />
            <input placeholder="Tom" value={row.song_key} onChange={(e) => update(i, { song_key: e.target.value })} className={cell} />
            <select value={row.moment} onChange={(e) => update(i, { moment: e.target.value as SongMoment })} className={cell}>
              {MOMENTS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1 text-black/50">
            <button type="button" onClick={() => move(i, -1)} aria-label="Subir" className="px-1 hover:text-black dark:hover:text-white">↑</button>
            <button type="button" onClick={() => move(i, 1)} aria-label="Descer" className="px-1 hover:text-black dark:hover:text-white">↓</button>
            <button type="button" onClick={() => remove(i)} aria-label="Remover" className="px-1 text-red-500 hover:text-red-700">✕</button>
          </div>
        </div>
      ))}
      <div className="flex justify-between">
        <button type="button" onClick={add} className="rounded-md px-3 py-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40">
          + Música
        </button>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => {
            onSave(
              drafts
                .filter((d) => d.title.trim())
                .map((d, i) => ({
                  position: i,
                  title: d.title.trim(),
                  author: d.author.trim() || null,
                  song_key: d.song_key.trim() || null,
                  moment: d.moment,
                })),
            );
            setDirty(false);
          }}
          className="btn-primary px-3.5 py-1.5 text-sm"
        >
          {saving ? "A guardar…" : "Guardar músicas"}
        </button>
      </div>
    </div>
  );
}

const cell = "input-base w-full";
