import { useEffect, useLayoutEffect, useRef } from 'react';

export interface UndoBarProps {
  message: string;
  onUndo(): void;
  onDismiss(): void;
  /** Auto-dismiss after this many ms. Default 8000. */
  durationMs?: number;
}

/** Bottom toast with an Undo action (the shared Toaster has no actions). */
export function UndoBar({ message, onUndo, onDismiss, durationMs = 8000 }: UndoBarProps) {
  const dismiss = useRef(onDismiss);
  useLayoutEffect(() => {
    dismiss.current = onDismiss;
  });
  useEffect(() => {
    const t = setTimeout(() => dismiss.current(), durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex min-h-12 items-center gap-3 rounded-xl bg-zinc-800 py-1 pr-1 pl-4 text-sm text-zinc-100 shadow-xl ring-1 ring-zinc-700"
      >
        <span>{message}</span>
        <button
          type="button"
          onClick={onUndo}
          className="min-h-11 rounded-lg px-4 font-semibold text-violet-300 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-violet-300"
        >
          Undo
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="min-h-11 min-w-11 rounded-lg text-zinc-400 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-violet-300"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
