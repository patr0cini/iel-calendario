import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import { getToken } from "../lib/session";
import { hasMicrosoftAccount, initMicrosoft, microsoftEnabled, signInMicrosoft, signOutMicrosoft } from "../lib/msal";
import type { AuthResolve, EventRow, Ministry, Scope } from "../lib/types";
import { WaitingScreen } from "../components/WaitingScreen";

interface Session {
  scope: Scope;
  /** Primary ministry (a link token only ever has one). */
  ownMinistryId: string | null;
  /** Every ministry this session may edit (a Microsoft sign-in may have several). */
  ownMinistryIds: string[];
  permissions: string[];
  ministries: Ministry[];
  ministryById: Map<string, Ministry>;
  /** Who is signed in via Microsoft, if anyone. */
  personName: string | null;
  signedInWithMicrosoft: boolean;
  canCreate: boolean;
  canEditEvent: (event: Pick<EventRow, "ministry_id">) => boolean;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

export { signOutMicrosoft };

export function SessionProvider({ children }: { children: ReactNode }) {
  // MSAL must settle a redirect before we know whether we have an account.
  const [msReady, setMsReady] = useState(!microsoftEnabled);
  useEffect(() => {
    if (!microsoftEnabled) return;
    initMicrosoft().finally(() => setMsReady(true));
  }, []);

  const hasLink = getToken() !== null;
  const hasMicrosoft = msReady && hasMicrosoftAccount();
  const hasIdentity = hasLink || hasMicrosoft;

  const auth = useQuery({
    queryKey: ["auth", "resolve"],
    enabled: msReady && hasIdentity,
    retry: 3,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 8000), // ride out a cold start
    queryFn: () => apiFetch<AuthResolve>("/auth/resolve", { method: "POST" }),
  });

  const ministries = useQuery({
    queryKey: ["ministries"],
    enabled: auth.isSuccess,
    queryFn: () => apiFetch<Ministry[]>("/ministries"),
  });

  if (!msReady) {
    return <WaitingScreen title="A ligar…" message="Um momento." />;
  }

  if (!hasIdentity) {
    return <SignIn />;
  }

  if (auth.isError || ministries.isError) {
    const err = auth.error ?? ministries.error;
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return (
      <WaitingScreen
        title="Não foi possível entrar"
        message={message}
        actionLabel="Tentar de novo"
        onAction={() => {
          void auth.refetch();
          void ministries.refetch();
        }}
        secondaryLabel={hasMicrosoft ? "Terminar sessão" : undefined}
        onSecondary={hasMicrosoft ? () => void signOutMicrosoft() : undefined}
      />
    );
  }

  if (!auth.isSuccess || !ministries.isSuccess) {
    return <WaitingScreen title="A ligar…" message="Pode demorar uns segundos se o servidor estiver a acordar." />;
  }

  const list = ministries.data;
  const ownMinistryIds = auth.data.ministries?.map((m) => m.id) ?? (auth.data.ministry ? [auth.data.ministry.id] : []);
  const scope = auth.data.scope;

  const session: Session = {
    scope,
    ownMinistryId: ownMinistryIds[0] ?? null,
    ownMinistryIds,
    permissions: auth.data.permissions,
    ministries: list,
    ministryById: new Map(list.map((m) => [m.id, m])),
    personName: auth.data.person?.full_name ?? null,
    signedInWithMicrosoft: hasMicrosoft,
    canCreate: scope !== "readonly",
    canEditEvent: (event) =>
      scope === "admin" || (scope === "ministry" && ownMinistryIds.includes(event.ministry_id)),
  };

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

function SignIn() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-sm p-8 text-center">
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-bold text-white shadow-sm">
          I
        </span>
        <h1 className="text-lg font-semibold">Calendário IEL</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Entra com a conta da Igreja, ou abre o link do teu ministério.
        </p>

        {microsoftEnabled && (
          <button
            type="button"
            onClick={() => void signInMicrosoft()}
            className="btn-outline mt-5 flex w-full items-center justify-center gap-2.5 px-4 py-2.5 text-sm"
          >
            <MicrosoftLogo />
            Iniciar sessão com a Microsoft
          </button>
        )}

        <p className="mt-5 text-xs leading-relaxed text-zinc-400 dark:text-zinc-500">
          Não tens conta Microsoft? Usa o link que o Presbitério te enviou — é pessoal, não o partilhes.
        </p>
      </div>
    </div>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
