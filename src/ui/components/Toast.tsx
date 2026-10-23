import { cx } from '../lib/cx';
import { useToastStore } from './toastStore';
import type { ToastTone } from './toastStore';

const TONE: Record<ToastTone, string> = {
  info: 'text-label',
  success: 'text-label',
  error: 'text-live',
};

const SHELL = 'material min-h-11 rounded-full text-subhead font-medium shadow-elevated anim-rise';

/**
 * Renders queued toasts bottom-centre (above the tab bar). Mount once in the app shell.
 * Plain toasts are status text that taps pass straight through, so a confirmation never
 * blocks the next tap on the control underneath; only toasts with an action take taps.
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
    >
      {toasts.map((t) => {
        const action = t.action;
        if (!action) {
          return (
            <p
              key={t.id}
              className={cx(SHELL, 'pointer-events-none flex items-center px-5 py-2', TONE[t.tone])}
            >
              {t.message}
            </p>
          );
        }
        return (
          <div
            key={t.id}
            className={cx(SHELL, 'pointer-events-auto flex items-center pr-1', TONE[t.tone])}
          >
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="min-h-11 py-2 pr-2 pl-5 text-left"
            >
              {t.message}
            </button>
            <button
              type="button"
              onClick={() => {
                dismiss(t.id);
                action.onClick();
              }}
              className="min-h-9 rounded-full bg-accent/15 px-4 font-semibold text-accent hover:bg-accent/25"
            >
              {action.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
