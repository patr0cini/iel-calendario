import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import type {
  DateSelectArg,
  EventClickArg,
  EventDropArg,
  DatesSetArg,
  EventInput as FcEventInput,
} from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import multiMonthPlugin from "@fullcalendar/multimonth";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import ptLocale from "@fullcalendar/core/locales/pt";

import { useSession } from "../session/SessionProvider";
import { useEventsQuery, useEventMutations, type Range } from "../hooks/useEvents";
import { useServicesQuery } from "../hooks/useServices";
import { TIME_ZONE, isFirstSundayOfMonth } from "../lib/datetime";
import type { EventInput, EventRow, Ministry } from "../lib/types";
import { MinistryFilter } from "./MinistryFilter";
import { EventModal } from "./EventModal";

// Sunday service defaults: starts at services.service_time (10:30), shown as a
// 2-hour block (10:30–12:30). Clicking it opens the order of service.
const SERVICE_DURATION_MINUTES = 120;
const SERVICE_COLOR = "#a16207"; // deep gold — distinct from ministry colors

function serviceEndTime(startTime: string): string {
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + SERVICE_DURATION_MINUTES;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

// The filter stores HIDDEN ministry ids, so a ministry created later (e.g. by
// the admin) is visible by default instead of silently filtered out.
const HIDDEN_KEY = "iel.calendar.hidden";

type ModalState =
  | { mode: "create"; defaultStart: string; defaultEnd: string }
  | { mode: "edit" | "view"; event: EventRow }
  | null;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Ocorreu um erro.";
}

export function CalendarPage() {
  const session = useSession();
  const navigate = useNavigate();
  const calendarRef = useRef<FullCalendar>(null);

  const [range, setRange] = useState<Range | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const [hidden, setHidden] = useState<Set<string>>(() => readStoredHidden());
  useEffect(() => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
  }, [hidden]);
  const selected = useMemo(
    () => new Set(session.ministries.filter((m) => !hidden.has(m.id)).map((m) => m.id)),
    [session.ministries, hidden],
  );

  const eventsQuery = useEventsQuery(range);
  const servicesQuery = useServicesQuery(range);
  const { createEvent, updateEvent, deleteEvent } = useEventMutations();
  const saving = createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;

  // Sunday services belong to the "Culto" ministry: its checkbox hides them and
  // its color (editable in Administração) paints them.
  const cultoMinistry = session.ministries.find((m) => m.slug === "culto");

  const fcEvents: FcEventInput[] = useMemo(() => {
    const rows = eventsQuery.data ?? [];
    const ministryEvents: FcEventInput[] = rows
      .filter((e) => selected.has(e.ministry_id))
      .map((e) => {
        const color = session.ministryById.get(e.ministry_id)?.color ?? "#64748b";
        return {
          id: e.id,
          title: e.title,
          start: e.starts_at,
          end: e.ends_at,
          allDay: e.all_day,
          backgroundColor: color,
          borderColor: color,
          editable: session.canEditEvent(e),
          classNames: e.status === "cancelada" ? ["opacity-50", "line-through"] : [],
          extendedProps: { row: e },
        };
      });

    const showServices = !cultoMinistry || selected.has(cultoMinistry.id);
    const serviceColor = cultoMinistry?.color ?? SERVICE_COLOR;
    // Naive datetimes (no offset) are interpreted in the calendar's timezone.
    const serviceEvents: FcEventInput[] = !showServices
      ? []
      : (servicesQuery.data ?? []).map((s) => {
          const startTime = s.service_time.slice(0, 5);
          const base = s.label?.trim() || (isFirstSundayOfMonth(s.service_date) ? "Culto de Ceia" : "Culto");
          return {
            id: `svc-${s.id}`,
            title: s.theme ? `${base} — ${s.theme}` : base,
            start: `${s.service_date}T${startTime}:00`,
            end: `${s.service_date}T${serviceEndTime(startTime)}:00`,
            backgroundColor: serviceColor,
            borderColor: serviceColor,
            editable: false,
            classNames: ["cursor-pointer"],
            extendedProps: { serviceDate: s.service_date },
          };
        });

    return [...ministryEvents, ...serviceEvents];
  }, [eventsQuery.data, servicesQuery.data, selected, session, cultoMinistry]);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setRange({ from: arg.start.toISOString(), to: arg.end.toISOString() });
  }, []);

  const handleSelect = useCallback(
    (arg: DateSelectArg) => {
      if (!session.canCreate) return;
      setModal({ mode: "create", defaultStart: arg.start.toISOString(), defaultEnd: arg.end.toISOString() });
      calendarRef.current?.getApi().unselect();
    },
    [session.canCreate],
  );

  const handleEventClick = useCallback(
    (arg: EventClickArg) => {
      // Sunday services open the order of service, not the event modal.
      const serviceDate = arg.event.extendedProps.serviceDate as string | undefined;
      if (serviceDate) {
        navigate(`/culto/${serviceDate}`);
        return;
      }
      const row = arg.event.extendedProps.row as EventRow;
      setModal({ mode: session.canEditEvent(row) ? "edit" : "view", event: row });
    },
    [session, navigate],
  );

  // List view rows get a ministry tag after the title, so the continuous list
  // reads "activity — ministry" without needing the colored dot legend.
  const decorateListRow = useCallback(
    (info: { event: { extendedProps: Record<string, unknown> }; el: HTMLElement; view: { type: string } }) => {
      if (!info.view.type.startsWith("list")) return;
      const row = info.event.extendedProps.row as EventRow | undefined;
      if (!row) return; // cultos already say "Culto" in the title
      const ministry = session.ministryById.get(row.ministry_id);
      if (!ministry) return;
      const titleEl = info.el.querySelector(".fc-list-event-title");
      if (!titleEl) return;
      const tag = document.createElement("span");
      tag.textContent = ministry.name;
      tag.style.cssText =
        `margin-left:8px;font-size:0.72em;font-weight:600;padding:1px 8px;border-radius:9999px;` +
        `background:${ministry.color}22;color:${ministry.color};vertical-align:middle;`;
      titleEl.appendChild(tag);
    },
    [session],
  );

  // Drag/resize: FullCalendar moves the event immediately; on failure we revert.
  const handleMove = useCallback(
    async (arg: EventDropArg | EventResizeDoneArg) => {
      const row = arg.event.extendedProps.row as EventRow;
      const patch: Partial<EventInput> = {
        starts_at: arg.event.start!.toISOString(),
        all_day: arg.event.allDay,
      };
      if (arg.event.end) patch.ends_at = arg.event.end.toISOString();
      try {
        await updateEvent.mutateAsync({ id: row.id, patch });
      } catch (e) {
        arg.revert();
        setPageError(errorMessage(e));
      }
    },
    [updateEvent],
  );

  async function handleSave(input: EventInput) {
    try {
      if (modal?.mode === "create") await createEvent.mutateAsync(input);
      else if (modal?.mode === "edit") await updateEvent.mutateAsync({ id: modal.event.id, patch: input });
      setModal(null);
    } catch (e) {
      setPageError(errorMessage(e));
    }
  }

  async function handleDelete() {
    if (modal?.mode !== "edit") return;
    try {
      await deleteEvent.mutateAsync(modal.event.id);
      setModal(null);
    } catch (e) {
      setPageError(errorMessage(e));
    }
  }

  // Keyboard shortcuts A M S D (PROMPT §10).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modal) return;
      const el = e.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return;
      const api = calendarRef.current?.getApi();
      if (!api) return;
      const map: Record<string, string> = { a: "multiMonthYear", m: "dayGridMonth", s: "timeGridWeek", d: "timeGridDay", l: "listYear" };
      const view = map[e.key.toLowerCase()];
      if (view) {
        api.changeView(view);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  const modalMinistries: Ministry[] =
    modal?.mode === "view" || session.scope === "admin"
      ? session.ministries
      : session.ministries.filter((m) => m.id === session.ownMinistryId);
  const defaultMinistryId = session.ownMinistryId ?? session.ministries[0]?.id ?? "";

  return (
    <div className="mx-auto max-w-6xl px-3 py-5 sm:px-6">
      {pageError && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <span>{pageError}</span>
          <button type="button" onClick={() => setPageError(null)} aria-label="Fechar">✕</button>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="card h-fit shrink-0 p-4 lg:w-60">
          <MinistryFilter
            ministries={session.ministries}
            selected={selected}
            onToggle={(id) =>
              setHidden((prev) => {
                const next = new Set(prev);
                next.has(id) ? next.delete(id) : next.add(id);
                return next;
              })
            }
            onAll={() => setHidden(new Set())}
            onNone={() => setHidden(new Set(session.ministries.map((m) => m.id)))}
          />
        </div>

        <div className="card min-w-0 flex-1 p-3 sm:p-5">
          {eventsQuery.isError && (
            <p className="mb-2 text-sm text-red-600">Não foi possível carregar os eventos.</p>
          )}
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, multiMonthPlugin, listPlugin, interactionPlugin, luxonPlugin]}
            timeZone={TIME_ZONE}
            locale={ptLocale}
            firstDay={1}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "multiMonthYear,dayGridMonth,timeGridWeek,timeGridDay,listYear",
            }}
            buttonText={{ today: "Hoje" }}
            views={{
              multiMonthYear: { buttonText: "Ano" },
              dayGridMonth: { buttonText: "Mês" },
              timeGridWeek: { buttonText: "Semana" },
              timeGridDay: { buttonText: "Dia" },
              listYear: { buttonText: "Lista" },
            }}
            noEventsContent="Sem atividades neste período."
            height="auto"
            nowIndicator
            selectable={session.canCreate}
            selectMirror
            editable
            events={fcEvents}
            datesSet={handleDatesSet}
            select={handleSelect}
            eventClick={handleEventClick}
            eventDrop={handleMove}
            eventResize={handleMove}
            eventDidMount={decorateListRow}
          />
        </div>
      </div>

      {modal && (
        <EventModal
          mode={modal.mode}
          ministries={modalMinistries}
          defaultMinistryId={defaultMinistryId}
          event={modal.mode === "create" ? undefined : modal.event}
          defaultStart={modal.mode === "create" ? modal.defaultStart : undefined}
          defaultEnd={modal.mode === "create" ? modal.defaultEnd : undefined}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onDelete={modal.mode === "edit" ? handleDelete : undefined}
        />
      )}
    </div>
  );
}


function readStoredHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}
