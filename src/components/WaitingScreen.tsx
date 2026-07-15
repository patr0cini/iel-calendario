interface WaitingScreenProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function WaitingScreen({ title, message, actionLabel, onAction }: WaitingScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">{message}</p>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-5 btn-primary px-4 py-2 text-sm"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
