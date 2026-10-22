import { cx } from '../lib/cx';
import { useToastStore } from './toastStore';
import type { ToastTone } from './toastStore';

const TONE: Record<ToastTone, string> = {
  info: 'bg-zinc-800 text-zinc-100',
  success: 'bg-zinc-800 text-violet-200',
  error: 'bg-rose-950 text-rose-100 ring-rose-800',
};

const SHELL = 'pointer-events-auto min-h-11 rounded-xl text-sm shadow-lg ring-1 ring-zinc-700';

/** Renders queued toasts bottom-centre. Mount once per screen (or once in the app shell). */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => {
        const action = t.action;
        if (!action) {
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => dismiss(t.id)}
              className={cx(SHELL, 'px-4 py-2', TONE[t.tone])}
            >
              {t.message}
            </button>
          );
        }
        return (
          <div key={t.id} className={cx(SHELL, 'flex items-center', TONE[t.tone])}>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="min-h-11 py-2 pr-2 pl-4 text-left"
            >
              {t.message}
            </button>
            <button
              type="button"
              onClick={() => {
                dismiss(t.id);
                action.onClick();
              }}
              className="min-h-11 rounded-r-xl px-4 py-2 font-semibold text-violet-300 hover:text-violet-100 focus-visible:outline-2 focus-visible:outline-violet-400"
            >
              {action.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
