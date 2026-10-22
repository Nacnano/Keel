import { useEffect, useId, useRef, useState } from 'react';
import type { SessionFull } from '@/data';
import { Button } from '../../components/Button';
import { toast } from '../../components/toastStore';
import { cx } from '../../lib/cx';
import { copyChart, downloadChart, downloadJSON } from './exportActions';

export interface ExportMenuProps {
  /** Loads the full session on demand (library cards only hold the session row). */
  getFull(): Promise<SessionFull | undefined>;
  label?: string;
  className?: string;
  align?: 'left' | 'right';
}

/** "Export" button with copy chart / download text / download JSON. */
export function ExportMenu({
  getFull,
  label = 'Export',
  className,
  align = 'right',
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (fn: (full: SessionFull) => void | Promise<void>) => async () => {
    setOpen(false);
    try {
      const full = await getFull();
      if (!full) throw new Error('Session not found');
      await fn(full);
    } catch (err) {
      toast(`Export failed: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'error',
      });
    }
  };

  const item =
    'flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-zinc-100 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-violet-300';

  return (
    <div ref={root} className={cx('relative', className)}>
      <Button
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className={cx(
            'absolute top-full z-30 mt-1 w-52 rounded-xl bg-zinc-900 p-1 shadow-xl ring-1 ring-zinc-800',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={run(async (full) => {
              const how = await copyChart(full);
              toast(how === 'copied' ? 'Chord chart copied' : 'Chord chart downloaded', {
                tone: 'success',
              });
            })}
          >
            Copy chord chart
          </button>
          <button type="button" role="menuitem" className={item} onClick={run(downloadChart)}>
            Download chart (.txt)
          </button>
          <button type="button" role="menuitem" className={item} onClick={run(downloadJSON)}>
            Download JSON
          </button>
        </div>
      )}
    </div>
  );
}
