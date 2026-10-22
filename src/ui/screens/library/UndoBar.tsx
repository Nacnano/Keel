import { useEffect, useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface UndoBarProps {
  message: string;
  onUndo(): void;
  onDismiss(): void;
  /** Auto-dismiss after this many ms. Default 8000. */
  durationMs?: number;
}

/** Material pill above the tab bar with an Undo action (same look as the shared toasts). */
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
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-50 flex justify-center px-4 lg:bottom-6">
      <div
        role="status"
        className="anim-rise material pointer-events-auto flex min-h-11 max-w-full items-center gap-1 rounded-full py-1 pr-1 pl-5 text-subhead font-medium text-label shadow-elevated"
      >
        <span className="min-w-0 truncate pr-2">{message}</span>
        <button
          type="button"
          onClick={onUndo}
          className="min-h-9 shrink-0 rounded-full bg-accent/15 px-4 font-semibold text-accent transition-colors hover:bg-accent/25"
        >
          Undo
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-label-2 transition-colors hover:bg-fill-3"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
