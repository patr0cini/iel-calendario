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
        <Link to="/" className="mt-4 inline-block link text-sm">
          ← Voltar ao calendário
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-xl font-bold tracking-tight">Administração</h1>

      <nav
        className="mb-5 flex w-fit max-w-full flex-wrap gap-1 rounded-xl bg-zinc-900/[0.05] p-1 dark:bg-white/[0.07]"
        role="tablist"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors " +
              (tab === t.key
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100")
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
