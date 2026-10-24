import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '../lib/cx';
import { useMediaQuery } from '../lib/useMediaQuery';
import { Button } from './Button';

const modalPanels: HTMLElement[] = [];
const inertRoots = new WeakMap<HTMLElement, { count: number; previous: string | null }>();
const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function focusable(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    const style = getComputedStyle(element);
    return (
      element.tabIndex >= 0 &&
      !element.closest('[hidden], [inert]') &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  });
}

export interface SheetProps {
  open: boolean;
  onClose(): void;
  title?: ReactNode;
  /** Header actions next to the close button. */
  actions?: ReactNode;
  children: ReactNode;
  /** `side` on wide screens (inspector), bottom sheet on narrow; `center` for dialogs. */
  placement?: 'auto' | 'side' | 'bottom' | 'center';
  /** Keep page interactive (no scrim) — used by the jam inspector. */
  modeless?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * Sheet / inspector. Side panel on ≥1024 px, bottom sheet below. Escape closes.
 * Renders in a portal so it escapes overflow containers.
 */
export function Sheet({
  open,
  onClose,
  title,
  actions,
  children,
  placement = 'auto',
  modeless,
  className,
  ...aria
}: SheetProps) {
  const wide = useMediaQuery('(min-width: 1024px)', true);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const resolved = placement === 'auto' ? (wide ? 'side' : 'bottom') : placement;

  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = !modeless ? document.getElementById('root') : null;
    if (!modeless) {
      modalPanels.push(panel);
      if (root) {
        const lease = inertRoots.get(root) ?? { count: 0, previous: root.getAttribute('inert') };
        lease.count += 1;
        inertRoots.set(root, lease);
        root.setAttribute('inert', '');
      }
      (focusable(panel)[0] ?? panel).focus();
    }
    const isActive = () => (modeless ? modalPanels.length === 0 : modalPanels.at(-1) === panel);
    const onKey = (e: KeyboardEvent) => {
      if (!isActive()) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
      if (modeless || e.key !== 'Tab') return;
      const controls = focusable(panel);
      const first = controls[0] ?? panel;
      const last = controls.at(-1) ?? panel;
      if (
        !panel.contains(document.activeElement) ||
        document.activeElement === panel ||
        (e.shiftKey ? document.activeElement === first : document.activeElement === last)
      ) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    const onFocus = (e: FocusEvent) => {
      if (!modeless && isActive() && !panel.contains(e.target as Node)) {
        (focusable(panel)[0] ?? panel).focus();
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      if (modeless) return;
      const wasActive = modalPanels.at(-1) === panel;
      const index = modalPanels.indexOf(panel);
      if (index >= 0) modalPanels.splice(index, 1);
      if (root) {
        const lease = inertRoots.get(root);
        if (lease && --lease.count === 0) {
          if (lease.previous === null) root.removeAttribute('inert');
          else root.setAttribute('inert', lease.previous);
          inertRoots.delete(root);
        }
      }
      if (wasActive && previousFocus?.isConnected && !previousFocus.closest('[inert]')) {
        previousFocus.focus();
      }
    };
  }, [open, modeless]);

  if (!open || typeof document === 'undefined') return null;

  const panel = (
    <div
      ref={panelRef}
      tabIndex={-1}
      role={modeless ? 'complementary' : 'dialog'}
      aria-modal={modeless ? undefined : true}
      aria-label={aria['aria-label'] ?? (typeof title === 'string' ? title : undefined)}
      className={cx(
        'flex flex-col overflow-hidden bg-bg text-label shadow-elevated',
        resolved === 'side' &&
          'anim-slide-in-right fixed top-16 right-3 bottom-3 z-40 w-[380px] max-w-[calc(100vw-1.5rem)] rounded-sheet',
        resolved === 'bottom' &&
          'anim-slide-up fixed inset-x-0 bottom-0 z-40 max-h-[82vh] rounded-t-sheet',
        resolved === 'center' &&
          'anim-rise fixed top-1/2 left-1/2 z-40 max-h-[calc(100dvh-2rem)] w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-sheet',
        className,
      )}
    >
      {resolved === 'bottom' && (
        <div className="flex justify-center pt-2" aria-hidden>
          <span className="h-1.5 w-9 rounded-full bg-fill" />
        </div>
      )}
      {(title || actions) && (
        <div className="flex min-h-13 items-center gap-2 px-4 pt-1">
          <h2 className="min-w-0 flex-1 truncate text-headline font-semibold">{title}</h2>
          {actions}
          <Button icon size="md" variant="gray" round aria-label="Close" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        {children}
      </div>
    </div>
  );

  return createPortal(
    <>
      {!modeless && (
        <div
          aria-hidden
          onClick={onClose}
          className="anim-fade-in fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px]"
        />
      )}
      {panel}
    </>,
    document.body,
  );
}
