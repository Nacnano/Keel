import { cx } from '../lib/cx';
import { useToastStore } from './toastStore';
import type { ToastTone } from './toastStore';

const TONE: Record<ToastTone, string> = {
  info: 'bg-zinc-800 text-zinc-100',
  success: 'bg-zinc-800 text-violet-200',
  error: 'bg-rose-950 text-rose-100 ring-rose-800',
};

/** Renders queued toasts bottom-centre. Mount once per screen (or once in the app shell). */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={cx(
            'pointer-events-auto min-h-11 rounded-xl px-4 py-2 text-sm shadow-lg ring-1 ring-zinc-700',
            TONE[t.tone],
          )}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
