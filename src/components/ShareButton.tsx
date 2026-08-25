import { useEffect, useState } from "react";

import { apiFetch } from "../lib/api";
import type { Ministry } from "../lib/types";

interface ShareButtonProps {
  serviceId: string;
  /** Ministries offered as scoped shares (besides "Culto completo"). */
  ministries: Ministry[];
}

// Generates signed public links (no token needed by the recipient) and offers
// copy / native share. One link for the whole service, one per ministry.
export function ShareButton({ serviceId, ministries }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("all");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUrl(null);
    setCopied(false);
    setError(false);
    let cancelled = false;
    apiFetch<{ url: string }>(`/services/${serviceId}/share-link?ministry=${encodeURIComponent(scope)}`)
      .then((r) => {
        if (cancelled) return;
        // The server returns a Supabase URL; the shareable page lives on our own
        // domain (Supabase can't serve rendered HTML). Rebuild it with the sig.
        const sig = new URL(r.url).searchParams.get("sig") ?? "";
        const appUrl = `${window.location.origin}${import.meta.env.BASE_URL}partilha/${serviceId}?ministry=${encodeURIComponent(scope)}&sig=${sig}`;
        setUrl(appUrl);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [open, scope, serviceId]);

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const nativeShare = async () => {
    if (!url) return;
    try {
      await navigator.share({ title: "Ordem do culto", url });
    } catch {
      // user cancelled the share sheet
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-outline px-3.5 py-1.5 text-sm"
      >
        Partilhar
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-black/10 bg-white p-4 shadow-lg dark:border-white/15 dark:bg-zinc-900">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Partilhar ordem do culto</h3>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white">✕</button>
          </div>

          <label className="mb-3 block text-xs">
            Âmbito
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="mt-1 block input-base w-full"
            >
              <option value="all">Culto completo (todos os ministérios)</option>
              {ministries.map((m) => (
                <option key={m.id} value={m.slug}>Só {m.name}</option>
              ))}
            </select>
          </label>

          {error ? (
            <p className="text-sm text-red-600">Não foi possível gerar o link.</p>
          ) : !url ? (
            <p className="text-sm text-black/50">A gerar link…</p>
          ) : (
            <>
              <code className="block select-all break-all rounded bg-black/5 p-2 text-[11px] dark:bg-white/10">{url}</code>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={copy} className="btn-primary px-3.5 py-1.5 text-sm">
                  {copied ? "Copiado ✓" : "Copiar link"}
                </button>
                {"share" in navigator && (
                  <button type="button" onClick={nativeShare} className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10">
                    Partilhar…
                  </button>
                )}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-black/50 dark:text-white/50">
                Quem tiver o link vê esta página (só este culto), sem precisar de acesso à plataforma.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
