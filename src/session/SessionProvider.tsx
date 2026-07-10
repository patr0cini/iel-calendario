import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import { getToken } from "../lib/session";
import type { AuthResolve, EventRow, Ministry, Scope } from "../lib/types";
import { WaitingScreen } from "../components/WaitingScreen";

interface Session {
  scope: Scope;
  ownMinistryId: string | null;
  permissions: string[];
  ministries: Ministry[];
  ministryById: Map<string, Ministry>;
  /** May this token create/edit events at all? */
  canCreate: boolean;
  /** May this token edit/delete this specific event? */
  canEditEvent: (event: Pick<EventRow, "ministry_id">) => boolean;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const hasToken = getToken() !== null;

  const auth = useQuery({
    queryKey: ["auth", "resolve"],
    enabled: hasToken,
    retry: 3,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 8000), // ride out a cold start
    queryFn: () => apiFetch<AuthResolve>("/auth/resolve", { method: "POST" }),
  });

  const ministries = useQuery({
    queryKey: ["ministries"],
    enabled: hasToken && auth.isSuccess,
    queryFn: () => apiFetch<Ministry[]>("/ministries"),
  });

  if (!hasToken) {
    return <NoAccess />;
  }

  if (auth.isError || ministries.isError) {
    const message = (auth.error ?? ministries.error) instanceof Error
      ? String((auth.error ?? ministries.error))
      : "Erro desconhecido";
    return (
      <WaitingScreen
        title="Não foi possível ligar"
        message={message}
        actionLabel="Tentar de novo"
        onAction={() => {
          void auth.refetch();
          void ministries.refetch();
        }}
      />
    );
  }

  if (!auth.isSuccess || !ministries.isSuccess) {
    return <WaitingScreen title="A ligar…" message="Pode demorar uns segundos se o servidor estiver a acordar." />;
  }

  const list = ministries.data;
  const ministryById = new Map(list.map((m) => [m.id, m]));
  const scope = auth.data.scope;
  const ownMinistryId = auth.data.ministry?.id ?? null;

  const session: Session = {
    scope,
    ownMinistryId,
    permissions: auth.data.permissions,
    ministries: list,
    ministryById,
    canCreate: scope !== "readonly",
    canEditEvent: (event) =>
      scope === "admin" || (scope === "ministry" && event.ministry_id === ownMinistryId),
  };

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

function NoAccess() {
  return (
    <WaitingScreen
      title="Sem acesso"
      message="Este link não contém um token de acesso. Pede ao Presbitério o link do teu ministério."
    />
  );
}
