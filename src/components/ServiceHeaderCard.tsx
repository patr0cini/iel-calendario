import { useState } from "react";

import type { PersonLite, ServiceHeader } from "../lib/types";

interface ServiceHeaderCardProps {
  service: ServiceHeader;
  people: PersonLite[];
  editable: boolean;
  saving?: boolean;
  onSave: (patch: Partial<ServiceHeader>) => void;
}

export function ServiceHeaderCard({ service, people, editable, saving, onSave }: ServiceHeaderCardProps) {
  const [theme, setTheme] = useState(service.theme ?? "");
  const [scripture, setScripture] = useState(service.scripture ?? "");
  const [leaderId, setLeaderId] = useState(service.leader_id ?? "");
  const [preacherId, setPreacherId] = useState(service.preacher_id ?? "");
  const [notes, setNotes] = useState(service.notes ?? "");
  const [dirty, setDirty] = useState(false);

  const touch = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };

  if (!editable) {
    return (
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
        <Row label="Tema" value={service.theme} />
        <Row label="Texto" value={service.scripture} />
        <Row label="Dirigente" value={service.leader_name} />
        <Row label="Pregador" value={service.preacher_name} />
        {service.notes && <Row label="Notas" value={service.notes} />}
      </dl>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tema">
          <input value={theme} onChange={(e) => touch(setTheme)(e.target.value)} className={input} />
        </Field>
        <Field label="Texto">
          <input value={scripture} onChange={(e) => touch(setScripture)(e.target.value)} className={input} />
        </Field>
        <Field label="Dirigente">
          <PersonSelect value={leaderId} people={people} onChange={touch(setLeaderId)} />
        </Field>
        <Field label="Pregador">
          <PersonSelect value={preacherId} people={people} onChange={touch(setPreacherId)} />
        </Field>
      </div>
      <Field label="Notas">
        <textarea value={notes} onChange={(e) => touch(setNotes)(e.target.value)} rows={2} className={input} />
      </Field>
      <div className="flex justify-end">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => {
            onSave({
              theme: theme.trim() || null,
              scripture: scripture.trim() || null,
              leader_id: leaderId || null,
              preacher_id: preacherId || null,
              notes: notes.trim() || null,
            });
            setDirty(false);
          }}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "A guardar…" : "Guardar cabeçalho"}
        </button>
      </div>
    </div>
  );
}

function PersonSelect({ value, people, onChange }: { value: string; people: PersonLite[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={input}>
      <option value="">—</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>{p.full_name}</option>
      ))}
    </select>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-black/50 dark:text-white/50">{label}</dt>
      <dd>{value || <span className="text-black/30">—</span>}</dd>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">{label}</span>
      {children}
    </label>
  );
}

const input = "w-full rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-neutral-800";
