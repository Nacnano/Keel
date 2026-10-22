import { useEffect, useId, useRef, useState } from 'react';
import type { Key, KeyEstimate } from '@/core';
import { keyLabel, pretty } from '../lib/chordLabel';
import { cx } from '../lib/cx';

export interface KeyBadgeProps {
  keyEstimate: KeyEstimate | null;
  spellingFollowsKey?: boolean;
  className?: string;
}

const label = (k: Key, spellingFollowsKey: boolean) => pretty(keyLabel(k, { spellingFollowsKey }));

/** "G major / E minor" with the winner bold, a confidence bar and an alternatives popover. */
export function KeyBadge({ keyEstimate, spellingFollowsKey = true, className }: KeyBadgeProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!keyEstimate) {
    return (
      <div className={cx('flex min-h-11 items-center gap-2 text-zinc-500', className)}>
        <span className="text-xs tracking-widest uppercase">Key</span>
        <span className="text-lg">—</span>
      </div>
    );
  }

  const winner = keyEstimate;
  const major = winner.mode === 'major' ? winner : winner.relative;
  const minor = winner.mode === 'minor' ? winner : winner.relative;
  const pct = Math.round(Math.max(0, Math.min(1, winner.confidence)) * 100);
  const part = (k: Key) => (
    <span
      className={k.mode === winner.mode ? 'font-semibold text-white' : 'font-normal text-zinc-500'}
    >
      {label(k, spellingFollowsKey)}
    </span>
  );

  return (
    <div ref={root} className={cx('relative', className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={`Key ${label(winner, spellingFollowsKey)}, ${pct}% confident. Show alternatives`}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex min-h-11 items-center gap-3 rounded-xl px-3 text-lg transition-colors',
          'hover:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-violet-300',
        )}
      >
        <span className="text-xs tracking-widest text-zinc-500 uppercase">Key</span>
        <span className="flex items-baseline gap-1.5">
          {part(major)}
          <span className="text-zinc-600">/</span>
          {part(minor)}
        </span>
        <span className="flex items-center gap-2" aria-hidden>
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
            <span
              className="block h-full rounded-full bg-violet-400 transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="w-9 text-right text-sm text-zinc-400 tabular-nums">{pct}%</span>
        </span>
      </button>
      {open && (
        <div
          id={popId}
          role="dialog"
          aria-label="Key alternatives"
          className="absolute top-full left-0 z-40 mt-2 w-64 rounded-2xl bg-zinc-900 p-3 shadow-2xl ring-1 ring-zinc-800"
        >
          <p className="mb-2 px-1 text-xs tracking-widest text-zinc-500 uppercase">
            Other candidates
          </p>
          {winner.alternatives.length === 0 ? (
            <p className="px-1 text-sm text-zinc-400">No close alternatives.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {winner.alternatives.map((a) => (
                <li
                  key={`${a.tonic}-${a.mode}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-sm"
                >
                  <span className="text-zinc-200">{label(a, spellingFollowsKey)}</span>
                  <span className="flex items-center gap-2">
                    <span className="h-1 w-14 overflow-hidden rounded-full bg-zinc-800">
                      <span
                        className="block h-full bg-zinc-500"
                        style={{ width: `${Math.round(a.score * 100)}%` }}
                      />
                    </span>
                    <span className="w-8 text-right text-zinc-500 tabular-nums">
                      {Math.round(a.score * 100)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
