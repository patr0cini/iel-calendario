import { useState } from "react";

import type { PersonLite, ServiceHeader } from "../lib/types";
import { PersonPicker, PersonChip } from "./PersonPicker";

interface ServiceHeaderCardProps {
  service: ServiceHeader;
  /** Preacher candidates: members of Presbitério or Convidados only. */
  preacherOptions: PersonLite[];
  editable: boolean;
  saving?: boolean;
  onSave: (patch: Partial<ServiceHeader>) => void;
}

export function ServiceHeaderCard({ service, preacherOptions, editable, saving, onSave }: ServiceHeaderCardProps) {
  const [theme, setTheme] = useState(service.theme ?? "");
  const [scripture, setScripture] = useState(service.scripture ?? "");
  const [preacherId, setPreacherId] = useState(service.preacher_id ?? "");
  const [preacherName, setPreacherName] = useState(service.preacher_name ?? "");
  const [notes, setNotes] = useState(service.notes ?? "");
  const [dirty, setDirty] = useState(false);

  const touch = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };

  if (!editable) {
    return (
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 card p-4 text-sm sm:p-5">
        <Row label="Tema" value={service.theme} />
        <Row label="Texto" value={service.scripture} />
        <Row label="Pregador" value={service.preacher_name} />
        {service.notes && <Row label="Notas" value={service.notes} />}
      </dl>
    );
  }

  return (
    <div className="space-y-3 card p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tema">
          <input value={theme} onChange={(e) => touch(setTheme)(e.target.value)} className={input} />
        </Field>
        <Field label="Texto">
          <input value={scripture} onChange={(e) => touch(setScripture)(e.target.value)} className={input} />
        </Field>
      </div>
      <Field label="Pregador (Presbitério ou Convidados)">
        {preacherId ? (
          <PersonChip
            name={preacherName || "—"}
            onRemove={() => {
              touch(setPreacherId)("");
              setPreacherName("");
            }}
          />
        ) : preacherOptions.length === 0 ? (
          <p className="text-xs text-black/50 dark:text-white/50">
            Sem candidatos: associa pessoas ao Presbitério ou ao ministério «Convidados» na Administração.
          </p>
        ) : (
          <PersonPicker
            people={preacherOptions}
            placeholder="Procurar pregador…"
            onPick={(p) => {
              touch(setPreacherId)(p.id);
              setPreacherName(p.full_name);
            }}
          />
        )}
      </Field>
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
              preacher_id: preacherId || null,
              notes: notes.trim() || null,
            });
            setDirty(false);
          }}
          className="btn-primary px-3.5 py-1.5 text-sm"
        >
          {saving ? "A guardar…" : "Guardar cabeçalho"}
        </button>
      </div>
    </div>
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

const input = "input-base w-full";
