// Small shared UI bits for the admin tabs.

export const input =
  "input-base";
export const btnPrimary =
  "btn-primary px-3.5 py-1.5 text-sm";
export const btnGhost =
  "rounded-md px-2 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/10";
export const btnDanger =
  "rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="mt-2 text-sm text-red-600">
      {error instanceof Error ? error.message : "Ocorreu um erro."}
    </p>
  );
}
