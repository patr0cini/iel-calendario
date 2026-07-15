import { useState } from "react";

import type { MomentKey, PersonLite, ServiceDetail, ServiceHeader, ServiceMoment } from "../lib/types";
import { MOMENT_LABEL, songsAfter, songsBefore } from "../lib/liturgy";
import { PersonPicker, PersonChip } from "./PersonPicker";

interface LiturgyOrderProps {
  detail: ServiceDetail;
  isCeia: boolean;
  people: PersonLite[];
  preacherOptions: PersonLite[];
  /** Only the Presbitério shapes the liturgy. */
  editable: boolean;
  saving: boolean;
  onSaveHeader: (patch: Partial<ServiceHeader>) => void;
  onSaveMoment: (moment: MomentKey, patch: Partial<ServiceMoment>) => void;
}

// The service read as an ordered outline. Each step is a numbered row; the
// sermon and the two worship blocks carry their own detail.
export function LiturgyOrder(props: LiturgyOrderProps) {
  const { detail, isCeia, people, preacherOptions, editable, saving, onSaveHeader, onSaveMoment } = props;
  const momentOf = (key: MomentKey) => detail.moments.find((m) => m.moment === key);

  const steps: { key: string; node: React.ReactNode }[] = [];
  const push = (key: string, node: React.ReactNode) => steps.push({ key, node });

  push(
    "boas_vindas",
    <MomentRow
      key="boas_vindas"
      moment="boas_vindas"
      data={momentOf("boas_vindas")}
      people={people}
      editable={editable}
      saving={saving}
      onSave={onSaveMoment}
    />,
  );
  push("louvor1", <SongsRow key="louvor1" title="Louvor e adoração" songs={songsBefore(detail.songs)} />);
  push(
    "leitura_oracao",
    <MomentRow
      key="leitura_oracao"
      moment="leitura_oracao"
      data={momentOf("leitura_oracao")}
      people={people}
      editable={editable}
      saving={saving}
      withScripture
      onSave={onSaveMoment}
    />,
  );
  push(
    "pregacao",
    <SermonRow
      key="pregacao"
      service={detail.service}
      preacherOptions={preacherOptions}
      editable={editable}
      saving={saving}
      onSave={onSaveHeader}
    />,
  );
  if (isCeia) {
    push("ceia", <CommunionRow key="ceia" detail={detail} />);
  }
  push("louvor2", <SongsRow key="louvor2" title="Louvor e adoração" songs={songsAfter(detail.songs)} />);
  for (const key of ["oferta", "anuncios", "despedida"] as MomentKey[]) {
    push(
      key,
      <MomentRow
        key={key}
        moment={key}
        data={momentOf(key)}
        people={people}
        editable={editable}
        saving={saving}
        onSave={onSaveMoment}
      />,
    );
  }

  return (
    <section className="card overflow-hidden">
      <h2 className="border-b border-zinc-200/70 px-4 py-3 text-sm font-semibold dark:border-white/[0.08] sm:px-5">
        Ordem do culto
      </h2>
      <ol className="divide-y divide-zinc-200/70 dark:divide-white/[0.08]">
        {steps.map((s, i) => (
          <li key={s.key} className="flex gap-3 px-4 py-3 sm:gap-4 sm:px-5">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-900/[0.06] text-xs font-semibold text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">{s.node}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold">{children}</h3>;
}

/** Welcome / reading+prayer / offering / announcements / farewell. */
function MomentRow({
  moment,
  data,
  people,
  editable,
  saving,
  withScripture,
  onSave,
}: {
  moment: MomentKey;
  data?: ServiceMoment;
  people: PersonLite[];
  editable: boolean;
  saving: boolean;
  withScripture?: boolean;
  onSave: (moment: MomentKey, patch: Partial<ServiceMoment>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState(data?.person_id ?? "");
  const [personName, setPersonName] = useState(data?.person_name ?? "");
  const [scripture, setScripture] = useState(data?.scripture ?? "");
  const [notes, setNotes] = useState(data?.notes ?? "");

  const save = () => {
    onSave(moment, {
      person_id: personId || null,
      scripture: withScripture ? scripture.trim() || null : null,
      notes: notes.trim() || null,
    });
    setOpen(false);
  };

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <StepTitle>{MOMENT_LABEL[moment]}</StepTitle>
          <div className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {data?.person_name ?? <span className="text-zinc-400/70">— por preencher —</span>}
            {withScripture && data?.scripture && <span> · {data.scripture}</span>}
          </div>
          {data?.notes && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{data.notes}</p>}
        </div>
        {editable && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="link shrink-0 text-xs no-print">
            {open ? "Fechar" : "Editar"}
          </button>
        )}
      </div>

      {editable && open && (
        <div className="mt-3 space-y-2 rounded-lg bg-zinc-900/[0.03] p-3 no-print dark:bg-white/[0.04]">
          {personId ? (
            <PersonChip
              name={personName || "—"}
              onRemove={() => {
                setPersonId("");
                setPersonName("");
              }}
            />
          ) : (
            <PersonPicker
              people={people}
              placeholder="Quem é responsável?"
              onPick={(p) => {
                setPersonId(p.id);
                setPersonName(p.full_name);
              }}
            />
          )}
          {withScripture && (
            <input
              value={scripture}
              onChange={(e) => setScripture(e.target.value)}
              placeholder="Texto bíblico (ex.: Salmo 23)"
              className="input-base w-full"
            />
          )}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas"
            rows={2}
            className="input-base w-full"
          />
          <div className="flex justify-end">
            <button type="button" onClick={save} disabled={saving} className="btn-primary px-3 py-1 text-xs">
              {saving ? "A guardar…" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** A worship block: song names only (the Louvor section holds the detail). */
function SongsRow({ title, songs }: { title: string; songs: ServiceDetail["songs"] }) {
  return (
    <>
      <StepTitle>{title}</StepTitle>
      {songs.length === 0 ? (
        <p className="mt-0.5 text-sm text-zinc-400/70">— sem músicas —</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {songs.map((s) => (
            <li key={s.id} className="text-sm text-zinc-600 dark:text-zinc-300">
              {s.title}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CommunionRow({ detail }: { detail: ServiceDetail }) {
  const presbiterio = detail.ministries.find((m) => m.slug === "presbiterio");
  const people = detail.assignments
    .filter((a) => a.ministry_id === presbiterio?.id && a.person_name)
    .map((a) => a.person_name as string);
  return (
    <>
      <StepTitle>Ceia</StepTitle>
      <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
        {people.length > 0 ? people.join(", ") : <span className="text-zinc-400/70">— por preencher —</span>}
      </p>
    </>
  );
}

function SermonRow({
  service,
  preacherOptions,
  editable,
  saving,
  onSave,
}: {
  service: ServiceHeader;
  preacherOptions: PersonLite[];
  editable: boolean;
  saving: boolean;
  onSave: (patch: Partial<ServiceHeader>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [preacherId, setPreacherId] = useState(service.preacher_id ?? "");
  const [preacherName, setPreacherName] = useState(service.preacher_name ?? "");
  const [theme, setTheme] = useState(service.theme ?? "");
  const [scripture, setScripture] = useState(service.scripture ?? "");
  const [aux, setAux] = useState(service.scripture_aux ?? "");

  const save = () => {
    onSave({
      preacher_id: preacherId || null,
      theme: theme.trim() || null,
      scripture: scripture.trim() || null,
      scripture_aux: aux.trim() || null,
    });
    setOpen(false);
  };

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <StepTitle>Pregação</StepTitle>
          <dl className="mt-1 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-0.5 text-sm">
            <Row label="Pregador" value={service.preacher_name} />
            <Row label="Tema" value={service.theme} />
            <Row label="Texto" value={service.scripture} />
            {service.scripture_aux && <Row label="Textos aux." value={service.scripture_aux} />}
          </dl>
        </div>
        {editable && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="link shrink-0 text-xs no-print">
            {open ? "Fechar" : "Editar"}
          </button>
        )}
      </div>

      {editable && open && (
        <div className="mt-3 space-y-2 rounded-lg bg-zinc-900/[0.03] p-3 no-print dark:bg-white/[0.04]">
          {preacherId ? (
            <PersonChip
              name={preacherName || "—"}
              onRemove={() => {
                setPreacherId("");
                setPreacherName("");
              }}
            />
          ) : preacherOptions.length === 0 ? (
            <p className="text-xs text-zinc-500">
              Sem candidatos: associa pessoas ao Presbitério ou aos «Convidados» na Administração.
            </p>
          ) : (
            <PersonPicker
              people={preacherOptions}
              placeholder="Procurar pregador (Presbitério ou Convidados)…"
              onPick={(p) => {
                setPreacherId(p.id);
                setPreacherName(p.full_name);
              }}
            />
          )}
          <input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Tema" className="input-base w-full" />
          <input
            value={scripture}
            onChange={(e) => setScripture(e.target.value)}
            placeholder="Texto principal"
            className="input-base w-full"
          />
          <input
            value={aux}
            onChange={(e) => setAux(e.target.value)}
            placeholder="Textos auxiliares"
            className="input-base w-full"
          />
          <div className="flex justify-end">
            <button type="button" onClick={save} disabled={saving} className="btn-primary px-3 py-1 text-xs">
              {saving ? "A guardar…" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-zinc-400 dark:text-zinc-500">{label}</dt>
      <dd className="text-zinc-600 dark:text-zinc-300">{value || <span className="text-zinc-400/70">—</span>}</dd>
    </>
  );
}
