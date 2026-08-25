import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatInTimeZone } from "date-fns-tz";
import { pt } from "date-fns/locale";

import { useSession } from "../session/SessionProvider";
import { usePeople } from "../hooks/usePeople";
import { useMemberships } from "../hooks/useMemberships";
import { useServiceAdmin, useServiceDetail, useServiceMutations } from "../hooks/useService";
import { TIME_ZONE, isFirstSundayOfMonth } from "../lib/datetime";
import type { Ministry, ServiceDetail } from "../lib/types";
import { RosterEditor, type RosterRow } from "./RosterEditor";
import { SongsEditor } from "./SongsEditor";
import { normalizeText } from "./PersonPicker";
import { ShareButton } from "./ShareButton";
import { LiturgyOrder } from "./LiturgyOrder";
import { CollapsibleSection } from "./CollapsibleSection";
import { MinistryNotes } from "./MinistryNotes";

function formatDate(date: string): string {
  return formatInTimeZone(new Date(`${date}T12:00:00Z`), TIME_ZONE, "EEEE, d 'de' MMMM 'de' yyyy", { locale: pt });
}

export function ServicePage() {
  const { data: dateParam = "" } = useParams();
  const session = useSession();
  const { query, notFound } = useServiceDetail(dateParam);
  const admin = useServiceAdmin(dateParam);
  const people = usePeople(session.canCreate);

  if (query.isLoading) {
    return <Centered>A carregar a ordem do culto…</Centered>;
  }

  if (notFound) {
    return (
      <Centered>
        <p className="mb-4">Não há culto em {formatDate(dateParam)}.</p>
        {session.scope === "admin" && (
          <button
            type="button"
            onClick={() => admin.createService.mutate()}
            disabled={admin.createService.isPending}
            className="btn-primary px-4 py-2 text-sm"
          >
            {admin.createService.isPending ? "A criar…" : "Criar culto nesta data"}
          </button>
        )}
        <Link to="/" className="mt-4 block link text-sm">← Voltar ao calendário</Link>
      </Centered>
    );
  }

  if (query.isError || !query.data) {
    return <Centered>Não foi possível carregar a ordem do culto.</Centered>;
  }

  return <ServiceView detail={query.data} dateParam={dateParam} peopleData={people.data ?? []} session={session} />;
}

function ServiceView({
  detail,
  dateParam,
  peopleData,
  session,
}: {
  detail: ServiceDetail;
  dateParam: string;
  peopleData: { id: string; full_name: string }[];
  session: ReturnType<typeof useSession>;
}) {
  const { updateHeader, saveAssignments, saveSongs, saveEbd, saveMoment, addNote, removeNote } =
    useServiceMutations(detail.service.id, dateParam);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const { byMinistry: membersByMinistry } = useMemberships(session.canCreate);

  const notesOf = (ministryId: string) => detail.ministry_notes.filter((n) => n.ministry_id === ministryId);
  const leadersOf = (ministryId: string) =>
    detail.leaders.filter((l) => l.ministry_id === ministryId).map((l) => l.person_name ?? "?");

  const unavailable = useMemo(() => new Set(detail.unavailable_person_ids), [detail.unavailable_person_ids]);
  const bySlug = useMemo(() => new Map(detail.ministries.map((m) => [m.slug, m])), [detail.ministries]);

  const canEditMinistry = (m: Ministry) =>
    session.scope === "admin" || (session.scope === "ministry" && session.ownMinistryId === m.id);
  // Look up by id: `bySlug` is keyed by slug, not by id.
  const ownSlug = session.ownMinistryId
    ? detail.ministries.find((m) => m.id === session.ownMinistryId)?.slug ?? null
    : null;
  const canEditSongs = session.scope === "admin" || (session.scope === "ministry" && ownSlug === "louvor");

  // First Sunday of the month = communion service: the Presbitério section
  // (Partilha da Ceia) appears, and there is no Sunday School. Communion roles
  // ("Ceia", "Partilha da Ceia") only exist on those Sundays.
  const isCeia = isFirstSundayOfMonth(detail.service.service_date);
  const isCeiaRole = (name: string) => normalizeText(name).includes("ceia");

  const rolesFor = (m: Ministry): RosterRow[] =>
    detail.ministry_roles
      .filter((r) => r.ministry_id === m.id && (isCeia || !isCeiaRole(r.name)))
      .map((r) => ({
        key: r.name,
        label: r.name,
        people: detail.assignments
          .filter((x) => x.ministry_id === m.id && x.role === r.name && x.person_id)
          .map((x) => ({ id: x.person_id as string, name: x.person_name })),
      }));

  const conflicts = useMemo(() => computeConflicts(detail), [detail]);

  // Data-driven sections: any ministry with defined roles gets a roster block
  // (so new ministries appear automatically). EBD has its own block; the
  // Presbitério (Partilha da Ceia) only shows on communion Sundays.
  const ministriesWithRoles = new Set(detail.ministry_roles.map((r) => r.ministry_id));
  const sectionMinistries = detail.ministries.filter(
    (m: Ministry) =>
      ministriesWithRoles.has(m.id) &&
      m.category !== "outro" &&
      m.slug !== "ebd" &&
      (m.slug !== "presbiterio" || isCeia),
  );
  const ebdMinistry = isCeia ? undefined : bySlug.get("ebd");
  const canEditEbd = ebdMinistry ? canEditMinistry(ebdMinistry) : false;

  // The preacher comes from any ministry flagged supplies_preachers
  // (Pregadores, Presbitério, Convidados — configured in the DB).
  const preacherOptions = useMemo(() => {
    const allowed = new Set<string>();
    for (const m of detail.ministries) {
      if (!m.supplies_preachers) continue;
      for (const id of membersByMinistry.get(m.id) ?? []) allowed.add(id);
    }
    return peopleData.filter((p) => allowed.has(p.id));
  }, [detail.ministries, membersByMinistry, peopleData]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 print-area">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold capitalize tracking-tight sm:text-2xl">
            {formatDate(detail.service.service_date)}
          </h1>
          <p className="mt-0.5 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            às {detail.service.service_time.slice(0, 5)}
            {isCeia && (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                Culto de Ceia
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <ShareButton
            serviceId={detail.service.id}
            ministries={[...sectionMinistries, ...(ebdMinistry ? [ebdMinistry] : [])]}
          />
          <button type="button" onClick={() => window.print()} className="btn-outline px-3.5 py-1.5 text-sm">
            Imprimir
          </button>
        </div>
      </div>

      <LiturgyOrder
        key={detail.service.id}
        detail={detail}
        isCeia={isCeia}
        people={peopleData}
        preacherOptions={preacherOptions}
        editable={session.scope === "admin"}
        saving={updateHeader.isPending || saveMoment.isPending}
        onSaveHeader={(patch) => updateHeader.mutate(patch)}
        onSaveMoment={(moment, patch) => saveMoment.mutate({ moment, ...patch })}
      />

      {(conflicts.length > 0) && (
        <div className="my-4 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="mb-1 font-semibold">⚠️ Avisos</p>
          <ul className="list-inside list-disc space-y-0.5">
            {conflicts.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Ministérios
      </h2>
      <div className="space-y-3">
        {sectionMinistries.map((m) => {
          const rows = rolesFor(m);
          const filled = rows.filter((r) => r.people.length > 0).length;
          const isLouvor = m.slug === "louvor";
          return (
            <CollapsibleSection
              key={m.id}
              title={m.name}
              color={m.color}
              leaders={leadersOf(m.id)}
              locked={!canEditMinistry(m)}
              summary={`${filled}/${rows.length} funções preenchidas`}
            >
              {isLouvor && (
                <div className="mb-4">
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Músicas
                    {!canEditSongs && <span className="font-normal normal-case">🔒</span>}
                  </h4>
                  <SongsEditor
                    songs={detail.songs}
                    editable={canEditSongs}
                    saving={saveSongs.isPending}
                    onSave={(songs) => saveSongs.mutate(songs)}
                  />
                </div>
              )}
              <RosterEditor
                title={isLouvor ? "Escala" : m.name}
                color={m.color}
                bare
                rows={rows}
                people={peopleData}
                memberIds={membersByMinistry.get(m.id)}
                editable={canEditMinistry(m)}
                unavailableIds={unavailable}
                saving={savingKey === m.slug && saveAssignments.isPending}
                onSave={(saved) => {
                  setSavingKey(m.slug);
                  // One row per person; a role with several people yields several rows.
                  saveAssignments.mutate({
                    ministry: m.slug,
                    assignments: saved.flatMap((r, ri) =>
                      r.personIds.map((personId, i) => ({
                        person_id: personId,
                        role: r.key,
                        sort_order: ri * 10 + i,
                      })),
                    ),
                  });
                }}
              />
              <MinistryNotes
                notes={notesOf(m.id)}
                editable={canEditMinistry(m)}
                saving={addNote.isPending || removeNote.isPending}
                onAdd={(body, recurring) =>
                  addNote.mutate({
                    ministry_id: m.id,
                    service_id: recurring ? null : detail.service.id,
                    body,
                  })
                }
                onRemove={(noteId) => removeNote.mutate(noteId)}
              />
            </CollapsibleSection>
          );
        })}

        {/* EBD: lesson + per-class roster (no Sunday School on communion Sundays) */}
        {ebdMinistry && (
          <CollapsibleSection
            title={ebdMinistry.name}
            color={ebdMinistry.color}
            leaders={leadersOf(ebdMinistry.id)}
            locked={!canEditEbd}
            summary={detail.service.ebd_theme ?? "sem tema definido"}
          >
            <EbdLessonCard
              key={detail.service.id}
              service={detail.service}
              editable={canEditEbd}
              saving={updateHeader.isPending}
              onSave={(patch) => updateHeader.mutate(patch)}
            />
            {detail.ebd_classes.length > 0 && (
              <RosterEditor
                title="Classes"
                color={ebdMinistry.color}
                bare
                rows={detail.ebd_classes.map((c) => ({
                  key: c.id,
                  label: c.name,
                  people: detail.ebd_assignments
                    .filter((x) => x.ebd_class_id === c.id && x.person_id)
                    .map((x) => ({ id: x.person_id as string, name: x.person_name })),
                }))}
                people={peopleData}
                memberIds={membersByMinistry.get(ebdMinistry.id)}
                editable={canEditEbd}
                unavailableIds={unavailable}
                saving={savingKey === "ebd" && saveEbd.isPending}
                onSave={(rows) => {
                  setSavingKey("ebd");
                  // One PUT per class (each class is its own roster).
                  for (const r of rows) {
                    saveEbd.mutate({
                      classId: r.key,
                      assignments: r.personIds.map((personId, i) => ({
                        person_id: personId,
                        role: "Professor",
                        sort_order: i,
                      })),
                    });
                  }
                }}
              />
            )}
            <MinistryNotes
              notes={notesOf(ebdMinistry.id)}
              editable={canEditEbd}
              saving={addNote.isPending || removeNote.isPending}
              onAdd={(body, recurring) =>
                addNote.mutate({
                  ministry_id: ebdMinistry.id,
                  service_id: recurring ? null : detail.service.id,
                  body,
                })
              }
              onRemove={(noteId) => removeNote.mutate(noteId)}
            />
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}

// Lesson theme + notes for the Sunday School, editable by EBD or admin.
function EbdLessonCard({
  service,
  editable,
  saving,
  onSave,
}: {
  service: ServiceDetail["service"];
  editable: boolean;
  saving: boolean;
  onSave: (patch: { ebd_theme: string | null; ebd_notes: string | null }) => void;
}) {
  const [theme, setTheme] = useState(service.ebd_theme ?? "");
  const [notes, setNotes] = useState(service.ebd_notes ?? "");
  const [dirty, setDirty] = useState(false);

  return (
    <section className="card p-4 sm:p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        Escola Bíblica Dominical — lição
        {!editable && <span className="ml-auto text-xs font-normal text-black/40 dark:text-white/40">🔒</span>}
      </h3>
      {editable ? (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">Tema da lição</span>
            <input
              value={theme}
              onChange={(e) => {
                setTheme(e.target.value);
                setDirty(true);
              }}
              className="input-base w-full"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">Notas</span>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setDirty(true);
              }}
              rows={2}
              className="input-base w-full"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => {
                onSave({ ebd_theme: theme.trim() || null, ebd_notes: notes.trim() || null });
                setDirty(false);
              }}
              className="btn-primary px-3.5 py-1.5 text-sm"
            >
              {saving ? "A guardar…" : "Guardar lição"}
            </button>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-black/50 dark:text-white/50">Tema da lição</dt>
          <dd>{service.ebd_theme || <span className="text-black/30">—</span>}</dd>
          {service.ebd_notes && (
            <>
              <dt className="text-black/50 dark:text-white/50">Notas</dt>
              <dd>{service.ebd_notes}</dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}

function computeConflicts(detail: ServiceDetail): string[] {
  const out: string[] = [];
  const ministryName = new Map(detail.ministries.map((m) => [m.id, m.name]));
  const className = new Map(detail.ebd_classes.map((c) => [c.id, c.name]));

  const slots: { id: string; name: string; where: string }[] = [];
  for (const a of detail.assignments) {
    if (a.person_id) slots.push({ id: a.person_id, name: a.person_name ?? "?", where: `${ministryName.get(a.ministry_id) ?? ""} · ${a.role}` });
  }
  for (const a of detail.ebd_assignments) {
    if (a.person_id) slots.push({ id: a.person_id, name: a.person_name ?? "?", where: `EBD · ${className.get(a.ebd_class_id) ?? ""}` });
  }

  const byPerson = new Map<string, { name: string; where: string[] }>();
  for (const s of slots) {
    const e = byPerson.get(s.id) ?? { name: s.name, where: [] };
    e.where.push(s.where);
    byPerson.set(s.id, e);
  }

  const unavailable = new Set(detail.unavailable_person_ids);
  for (const [id, e] of byPerson) {
    if (e.where.length > 1) out.push(`${e.name} está em ${e.where.length} funções: ${e.where.join(", ")}.`);
    if (unavailable.has(id)) out.push(`${e.name} está escalado(a) mas indisponível nesta data.`);
  }
  return out;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-black/70 dark:text-white/70">{children}</div>
  );
}
