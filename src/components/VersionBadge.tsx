// The commit this site was built from, in the corner. Lets anyone check at a
// glance whether what is online is the latest version — and click through to
// the exact code behind it.

const REPO = "https://github.com/patr0cini/iel-calendario";

function builtAtLabel(): string {
  try {
    return new Intl.DateTimeFormat("pt-PT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Lisbon",
    }).format(new Date(__APP_BUILT_AT__));
  } catch {
    return "?";
  }
}

export function VersionBadge() {
  const isDev = __APP_COMMIT__ === "dev";
  const label = `Versão ${__APP_COMMIT__} · publicada a ${builtAtLabel()}`;

  const className =
    "fixed bottom-2 right-2 z-30 rounded-full bg-zinc-900/[0.04] px-2 py-0.5 font-mono text-[10px] " +
    "text-zinc-400 transition-colors hover:text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-500 " +
    "dark:hover:text-zinc-300 no-print";

  if (isDev) {
    return (
      <span className={className} title={label}>
        dev
      </span>
    );
  }

  return (
    <a
      href={`${REPO}/commit/${__APP_COMMIT__}`}
      target="_blank"
      rel="noreferrer"
      className={className}
      title={label}
    >
      {__APP_COMMIT__}
    </a>
  );
}
