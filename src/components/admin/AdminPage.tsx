import { useState } from "react";
import { Link } from "react-router-dom";

import { useSession } from "../../session/SessionProvider";
import { TokensTab } from "./TokensTab";
import { PeopleTab } from "./PeopleTab";
import { MinistriesTab } from "./MinistriesTab";
import { EbdTab } from "./EbdTab";
import { UnavailabilitiesTab } from "./UnavailabilitiesTab";
import { AuditTab } from "./AuditTab";
import { SystemTab } from "./SystemTab";

const TABS = [
  { key: "tokens", label: "Tokens", el: <TokensTab /> },
  { key: "pessoas", label: "Pessoas", el: <PeopleTab /> },
  { key: "ministerios", label: "Ministérios", el: <MinistriesTab /> },
  { key: "ebd", label: "EBD", el: <EbdTab /> },
  { key: "indisponibilidades", label: "Indisponibilidades", el: <UnavailabilitiesTab /> },
  { key: "auditoria", label: "Auditoria", el: <AuditTab /> },
  { key: "sistema", label: "Sistema", el: <SystemTab /> },
] as const;

export function AdminPage() {
  const session = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("tokens");

  // The server enforces authorization on every route; this gate is UX only.
  if (session.scope !== "admin") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">Sem permissão</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          A administração está reservada ao Presbitério.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          ← Voltar ao calendário
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <Link to="/" className="text-sm text-blue-600 hover:underline">← Calendário</Link>
          <h1 className="text-xl font-bold">Administração</h1>
        </div>
      </div>

      <nav className="mb-4 flex flex-wrap gap-1 border-b border-black/10 dark:border-white/10" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={
              "-mb-px rounded-t-md px-3 py-2 text-sm font-medium " +
              (tab === t.key
                ? "border border-b-0 border-black/10 bg-white dark:border-white/10 dark:bg-neutral-900"
                : "text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white")
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {TABS.find((t) => t.key === tab)?.el}
    </div>
  );
}
