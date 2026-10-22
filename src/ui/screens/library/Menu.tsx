import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../lib/cx';

/*
  Local kit addition: an action menu. Same look and placement as kit `Popover`, but it closes
  when an item is chosen, uses menu semantics (role="menu" / "menuitem") and arrow-key focus.
  Candidate for `src/ui/kit` once another screen needs it.
*/

export interface MenuTriggerProps {
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
  onClick(): void;
}

export interface MenuProps {
  trigger(props: MenuTriggerProps): ReactNode;
  /** Items; call `close` from an item to dismiss the menu (MenuItem does this for you). */
  children: ReactNode;
  align?: 'start' | 'end';
  width?: number;
  'aria-label'?: string;
}

export function Menu({ trigger, children, align = 'end', width = 240, ...aria }: MenuProps) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left =
        align === 'end'
          ? Math.max(8, Math.min(a.right - width, vw - width - 8))
          : Math.max(8, Math.min(a.left, vw - width - 8));
      // Flip above the trigger when there is no room below (rows near the bottom of the list).
      const h = panel.current?.offsetHeight ?? 0;
      const below = a.bottom + 6;
      const top = h && below + h > vh - 8 && a.top - 6 - h > 8 ? a.top - 6 - h : below;
      setPos({ top, left });
    };
    place();
    // Measure again once the panel has rendered (its height decides the flip).
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(place) : 0;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, align, width]);

  // Focus the first item on open; on close hand focus back to the trigger unless something
  // else (an inline rename field, a dialog) has taken it.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      if (!wasOpen.current) items(panel.current)[0]?.focus({ preventScroll: true });
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) {
      anchor.current?.querySelector<HTMLElement>('button, a, [tabindex]')?.focus();
    }
  }, [open]);

  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items(panel.current);
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length].focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i < 0 ? -1 : i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(-1);
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <>
      <span ref={anchor} className="inline-flex">
        {trigger({
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          'aria-controls': open ? id : undefined,
          onClick: () => setOpen((v) => !v),
        })}
      </span>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="menu"
            aria-label={aria['aria-label']}
            onKeyDown={onPanelKey}
            onClick={(e) => {
              const item = (e.target as HTMLElement).closest('[role="menuitem"]');
              if (item && !(item as HTMLButtonElement).disabled) setOpen(false);
            }}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
            className="anim-rise material fixed z-50 max-h-[70vh] overflow-y-auto rounded-card p-1.5 text-label shadow-elevated"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

function items(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
}

export interface MenuItemProps {
  onSelect(): void;
  children: ReactNode;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  /** Shown under the label (e.g. why the item is disabled); linked via aria-describedby. */
  hint?: ReactNode;
}

export function MenuItem({ onSelect, children, icon, destructive, disabled, hint }: MenuItemProps) {
  const hintId = useId();
  return (
    <>
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onClick={onSelect}
        className={cx(
          'flex min-h-11 w-full items-center gap-3 rounded-[8px] px-3 text-left text-subhead',
          'transition-colors duration-100 hover:bg-fill-4 focus-visible:bg-fill-4 focus-visible:outline-none',
          'disabled:pointer-events-none disabled:opacity-40',
          destructive ? 'text-live' : 'text-label',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {icon && (
          <span
            aria-hidden
            className={cx(
              'shrink-0 [&>svg]:size-[18px]',
              destructive ? 'text-live' : 'text-label-2',
            )}
          >
            {icon}
          </span>
        )}
      </button>
      {hint && (
        <p id={hintId} className="px-3 pb-2 text-caption text-label-2">
          {hint}
        </p>
      )}
    </>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="mx-3 my-1 h-px bg-separator" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pt-2 pb-1 text-caption font-medium tracking-wide text-label-2 uppercase">
      {children}
    </p>
  );
}
