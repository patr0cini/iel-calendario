import { useEffect, useRef, useState } from "react";

import type { EventInput, EventRow, EventStatus, Ministry } from "../lib/types";
import { isoToLocalInput, localInputToIso } from "../lib/datetime";

type Mode = "create" | "edit" | "view";

interface EventModalProps {
  mode: Mode;
  ministries: Ministry[];
  defaultMinistryId: string;
  event?: EventRow;
  defaultStart?: string; // ISO, for create
  defaultEnd?: string; // ISO, for create
  saving?: boolean;
  onClose: () => void;
  onSave: (input: EventInput) => void;
  onDelete?: () => void;
}

const STATUS_LABELS: Record<EventStatus, string> = {
  proposta: "Proposta",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
};

export function EventModal(props: EventModalProps) {
  const { mode, ministries, defaultMinistryId, event, defaultStart, defaultEnd, saving, onClose, onSave, onDelete } = props;
  const readOnly = mode === "view";

  const [ministryId, setMinistryId] = useState(event?.ministry_id ?? defaultMinistryId);
  const [title, setTitle] = useState(event?.title ?? "");
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [start, setStart] = useState(isoToLocalInput(event?.starts_at ?? defaultStart ?? new Date().toISOString()));
  const [end, setEnd] = useState(isoToLocalInput(event?.ends_at ?? defaultEnd ?? new Date().toISOString()));
  const [location, setLocation] = useState(event?.location ?? "");
  const [status, setStatus] = useState<EventStatus>(event?.status ?? "proposta");
  const [description, setDescription] = useState(event?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    if (!readOnly) titleRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, readOnly]);

  function submit() {
    if (!title.trim()) return setError("O título é obrigatório.");
    const startsIso = localInputToIso(start);
    const endsIso = localInputToIso(end);
    if (endsIso < startsIso) return setError("O fim não pode ser antes do início.");
    setError(null);
    onSave({
      ministry_id: ministryId,
      title: title.trim(),
      description: description.trim() || null,
      starts_at: startsIso,
      ends_at: endsIso,
      all_day: allDay,
      location: location.trim() || null,
      status,
    });
  }

  const heading = mode === "create" ? "Novo evento" : mode === "edit" ? "Editar evento" : title;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl dark:bg-zinc-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{heading}</h2>
          <button type="button" onClick={onClose} className="text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white" aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <Field label="Título">
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={readOnly}
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Ministério">
              <select
                value={ministryId}
                onChange={(e) => setMinistryId(e.target.value)}
                disabled={readOnly || ministries.length <= 1}
                className={inputClass}
              >
                {ministries.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estado">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as EventStatus)}
                disabled={readOnly}
                className={inputClass}
              >
                {(Object.keys(STATUS_LABELS) as EventStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Início">
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} disabled={readOnly} className={inputClass} />
            </Field>
            <Field label="Fim">
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} disabled={readOnly} className={inputClass} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} disabled={readOnly} className="h-4 w-4" />
            Dia inteiro
          </label>

          <Field label="Local">
            <input value={location} onChange={(e) => setLocation(e.target.value)} disabled={readOnly} className={inputClass} />
          </Field>

          <Field label="Descrição">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} rows={3} className={inputClass} />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {!readOnly && (
          <div className="mt-6 flex items-center justify-between">
            {onDelete ? (
              <button type="button" onClick={onDelete} disabled={saving} className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
                Apagar
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn-outline px-4 py-2 text-sm">
                Cancelar
              </button>
              <button type="button" onClick={submit} disabled={saving} className="btn-primary px-4 py-2 text-sm">
                {saving ? "A guardar…" : "Guardar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputClass =
  "input-base w-full px-3 py-2 disabled:bg-zinc-100 disabled:text-zinc-500 dark:disabled:bg-white/5 dark:disabled:text-white/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">{label}</span>
      {children}
    </label>
  );
}
