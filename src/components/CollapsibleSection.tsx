import { useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  color?: string;
  /** Short summary shown while collapsed (e.g. "3 de 6 preenchidas"). */
  summary?: string;
  locked?: boolean;
  /** Leaders of the ministry, shown in the header. */
  leaders?: string[];
  defaultOpen?: boolean;
  children: ReactNode;
}

// Ministry blocks in the order of service start collapsed: the page opens as a
// readable overview instead of a wall of forms. Print always shows everything.
export function CollapsibleSection({
  title,
  color,
  summary,
  locked,
  leaders,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-zinc-900/[0.02] dark:hover:bg-white/[0.03] sm:px-5"
      >
        {color && (
          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: color }} aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
            {title}
            {locked && <span className="text-xs font-normal text-zinc-400">🔒</span>}
          </span>
          {(summary || leaders?.length) && (
            <span className="mt-0.5 block truncate text-xs text-zinc-400 dark:text-zinc-500">
              {leaders?.length ? `Líder: ${leaders.join(", ")}` : ""}
              {leaders?.length && summary ? " · " : ""}
              {summary}
            </span>
          )}
        </span>
        <span
          aria-hidden
          className={"shrink-0 text-zinc-400 transition-transform no-print " + (open ? "rotate-180" : "")}
        >
          ▾
        </span>
      </button>

      {/* `print-open` keeps the content in the printed sheet even when collapsed. */}
      <div className={(open ? "block" : "hidden print-open") + " border-t border-zinc-200/70 px-4 py-4 dark:border-white/[0.08] sm:px-5"}>
        {children}
      </div>
    </section>
  );
}
