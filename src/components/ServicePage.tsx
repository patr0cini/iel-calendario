import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatInTimeZone } from "date-fns-tz";
import { pt } from "date-fns/locale";

import { useSession } from "../session/SessionProvider";
import { usePeople } from "../hooks/usePeople";
import { useServiceAdmin, useServiceDetail, useServiceMutations } from "../hooks/useService";
import { TIME_ZONE, isFirstSundayOfMonth } from "../lib/datetime";
import type { Ministry, ServiceDetail } from "../lib/types";
import { RosterEditor, type RosterRow } from "./RosterEditor";
import { SongsEditor } from "./SongsEditor";
import { ServiceHeaderCard } from "./ServiceHeaderCard";

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
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {admin.createService.isPending ? "A criar…" : "Criar culto nesta data"}
          </button>
        )}
        <Link to="/" className="mt-4 block text-sm text-blue-600 hover:underline">← Voltar ao calendário</Link>
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
  const { updateHeader, saveAssignments, saveSongs, saveEbd } = useServiceMutations(detail.service.id, dateParam);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const unavailable = useMemo(() => new Set(detail.unavailable_person_ids), [detail.unavailable_person_ids]);
  const bySlug = useMemo(() => new Map(detail.ministries.map((m) => [m.slug, m])), [detail.ministries]);

  const canEditMinistry = (m: Ministry) =>
    session.scope === "admin" || (session.scope === "ministry" && session.ownMinistryId === m.id);
  const ownSlug = session.ownMinistryId ? bySlug.get(session.ownMinistryId)?.slug ?? null : null;
  const canEditSongs = session.scope === "admin" || (session.scope === "ministry" && ownSlug === "louvor");

  const rolesFor = (m: Ministry): RosterRow[] =>
    detail.ministry_roles
      .filter((r) => r.ministry_id === m.id)
      .map((r) => ({
        key: r.name,
        label: r.name,
        people: detail.assignments
          .filter((x) => x.ministry_id === m.id && x.role === r.name && x.person_id)
          .map((x) => ({ id: x.person_id as string, name: x.person_name })),
      }));

  const conflicts = useMemo(() => computeConflicts(detail), [detail]);

  // First Sunday of the month = communion service: the Presbitério section
  // (Partilha da Ceia) appears, and there is no Sunday School.
  const isCeia = isFirstSundayOfMonth(detail.service.service_date);

  const sectionMinistries = (isCeia
    ? ["presbiterio", "louvor", "multimedia", "assistentes"]
    : ["louvor", "multimedia", "assistentes"]
  )
    .map((slug) => bySlug.get(slug))
    .filter((m): m is Ministry => Boolean(m));
  const ebdMinistry = isCeia ? undefined : bySlug.get("ebd");
  const canEditEbd = ebdMinistry ? canEditMinistry(ebdMinistry) : false;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 print-area">
      <div className="mb-4 flex items-center justify-between no-print">
        <Link to="/" className="text-sm text-blue-600 hover:underline">← Calendário</Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        >
          Imprimir
        </button>
      </div>

      <h1 className="text-xl font-bold capitalize sm:text-2xl">{formatDate(detail.service.service_date)}</h1>
      <p className="mb-4 flex items-center gap-2 text-sm text-black/60 dark:text-white/60">
        às {detail.service.service_time.slice(0, 5)}
        {isCeia && (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            Culto de Ceia
          </span>
        )}
      </p>

      <ServiceHeaderCard
        service={detail.service}
        people={peopleData}
        editable={session.scope === "admin"}
        saving={updateHeader.isPending}
        onSave={(patch) => updateHeader.mutate(patch)}
      />

      {(conflicts.length > 0) && (
        <div className="my-4 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="mb-1 font-semibold">⚠️ Avisos</p>
          <ul className="list-inside list-disc space-y-0.5">
            {conflicts.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {/* Louvor: songs + roster */}
        {bySlug.get("louvor") && (
          <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: bySlug.get("louvor")!.color }} aria-hidden />
              Louvor — músicas
              {!canEditSongs && <span className="ml-auto text-xs font-normal text-black/40">🔒</span>}
            </h3>
            <SongsEditor
              songs={detail.songs}
              editable={canEditSongs}
              saving={saveSongs.isPending}
              onSave={(songs) => saveSongs.mutate(songs)}
            />
          </section>
        )}

        {sectionMinistries.map((m) => (
          <RosterEditor
            key={m.id}
            title={m.name}
            color={m.color}
            rows={rolesFor(m)}
            people={peopleData}
            editable={canEditMinistry(m)}
            unavailableIds={unavailable}
            saving={savingKey === m.slug && saveAssignments.isPending}
            onSave={(rows) => {
              setSavingKey(m.slug);
              // One row per person; a role with several people yields several rows.
              saveAssignments.mutate({
                ministry: m.slug,
                assignments: rows.flatMap((r, ri) =>
                  r.personIds.map((personId, i) => ({
                    person_id: personId,
                    role: r.key,
                    sort_order: ri * 10 + i,
                  })),
                ),
              });
            }}
          />
        ))}

        {/* EBD per class */}
        {ebdMinistry && detail.ebd_classes.length > 0 && (
          <RosterEditor
            title="Escola Bíblica Dominical"
            color={ebdMinistry.color}
            rows={detail.ebd_classes.map((c) => ({
              key: c.id,
              label: c.name,
              people: detail.ebd_assignments
                .filter((x) => x.ebd_class_id === c.id && x.person_id)
                .map((x) => ({ id: x.person_id as string, name: x.person_name })),
            }))}
            people={peopleData}
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
      </div>
    </div>
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
