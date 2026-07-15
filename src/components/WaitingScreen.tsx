interface WaitingScreenProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function WaitingScreen({ title, message, actionLabel, onAction, secondaryLabel, onSecondary }: WaitingScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-sm p-8 text-center">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {actionLabel && onAction && (
            <button type="button" onClick={onAction} className="btn-primary px-4 py-2 text-sm">
              {actionLabel}
            </button>
          )}
          {secondaryLabel && onSecondary && (
            <button type="button" onClick={onSecondary} className="btn-outline px-4 py-2 text-sm">
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
