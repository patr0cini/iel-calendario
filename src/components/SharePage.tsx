import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

// Public order-of-service view, reached via a signed share link. No login: it
// fetches the signed HTML from the Supabase `share` function and renders it in
// a sandboxed iframe on our own domain. (Supabase serves that HTML as
// text/plain to prevent phishing on supabase.co, so it can't be opened there
// directly — here it renders correctly, UTF-8 and all.)
export function SharePage() {
  const { serviceId } = useParams();
  const [params] = useSearchParams();
  const ministry = params.get("ministry") ?? "all";
  const sig = params.get("sig") ?? "";

  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = import.meta.env.VITE_FUNCTIONS_URL;
    const url = `${base}/share/${serviceId}?ministry=${encodeURIComponent(ministry)}&sig=${encodeURIComponent(sig)}`;
    let cancelled = false;
    fetch(url)
      .then((r) => {
        if (r.status === 403) throw new Error("Este link é inválido ou foi revogado.");
        if (!r.ok) throw new Error("Não foi possível abrir a ordem do culto.");
        return r.text();
      })
      .then((text) => !cancelled && setHtml(text))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Erro."));
    return () => {
      cancelled = true;
    };
  }, [serviceId, ministry, sig]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="card max-w-sm p-8">
          <h1 className="text-lg font-semibold">Ordem do culto</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  if (html === null) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm text-zinc-500">
        A carregar…
      </div>
    );
  }

  return (
    <iframe
      title="Ordem do culto"
      srcDoc={html}
      sandbox=""
      className="fixed inset-0 h-full w-full border-0"
    />
  );
}
