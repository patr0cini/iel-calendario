import { Routes, Route, Navigate, NavLink, Outlet } from "react-router-dom";

import { SessionProvider, useSession, signOutMicrosoft } from "./session/SessionProvider";
import { clearSession } from "./lib/session";
import { CalendarPage } from "./components/CalendarPage";
import { ServicePage } from "./components/ServicePage";
import { EscalaPage } from "./components/EscalaPage";
import { AdminPage } from "./components/admin/AdminPage";
import { SharePage } from "./components/SharePage";
import { VersionBadge } from "./components/VersionBadge";

const SCOPE_LABEL = { admin: "Presbitério", ministry: "Ministério", readonly: "Leitura" } as const;

/** Drops both doors: the ministry link token and the Microsoft session. */
async function signOut(withMicrosoft: boolean) {
  clearSession();
  if (withMicrosoft) {
    await signOutMicrosoft(); // redirects away
    return;
  }
  window.location.reload();
}

function NavBar() {
  const session = useSession();
  const own = session.ownMinistryId ? session.ministryById.get(session.ownMinistryId) : null;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    "rounded-lg px-2 py-1.5 text-sm font-medium transition-colors sm:px-3 " +
    (isActive
      ? "bg-indigo-600/10 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300"
      : "text-zinc-600 hover:bg-zinc-900/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white");

  return (
    <header className="no-print sticky top-0 z-40 border-b border-zinc-900/5 bg-white/75 backdrop-blur-md dark:border-white/[0.06] dark:bg-zinc-950/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <NavLink to="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-sm">
            I
          </span>
          <span className="hidden text-[15px] font-bold tracking-tight sm:block">
            Calendário <span className="text-indigo-600 dark:text-indigo-400">IEL</span>
          </span>
        </NavLink>

        <nav className="ml-0.5 flex items-center gap-0.5 sm:ml-4 sm:gap-1">
          <NavLink to="/" end className={linkClass}>
            Calendário
          </NavLink>
          <NavLink to="/escalas" className={linkClass}>
            Escalas
          </NavLink>
          {session.scope === "admin" && (
            <NavLink to="/admin" className={linkClass}>
              <span className="sm:hidden">Admin</span>
              <span className="hidden sm:inline">Administração</span>
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <span
            className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-zinc-900/10 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:border-white/15 dark:text-zinc-300"
            title={session.personName ?? own?.name ?? undefined}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: own?.color ?? "#6366f1" }}
              aria-hidden
            />
            <span className="max-w-[7.5rem] truncate sm:max-w-none">
              {session.personName ?? own?.name ?? SCOPE_LABEL[session.scope]}
            </span>
          </span>
          {/* Always offered: a link session must be droppable too, otherwise a
              shared device keeps whoever opened the link signed in forever. */}
          <button
            type="button"
            onClick={() => void signOut(session.signedInWithMicrosoft)}
            className="shrink-0 text-xs font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        {/* Public: signed share link — no login, sits outside SessionProvider. */}
        <Route path="/partilha/:serviceId" element={<SharePage />} />

        <Route element={<AuthedLayout />}>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/culto/:data" element={<ServicePage />} />
          <Route path="/escalas" element={<EscalaPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      {/* Outside the provider so the version is visible on the sign-in screen too. */}
      <VersionBadge />
    </>
  );
}

// Pathless layout: the authenticated app (everything except public share links).
function AuthedLayout() {
  return (
    <SessionProvider>
      <NavBar />
      <Outlet />
    </SessionProvider>
  );
}
