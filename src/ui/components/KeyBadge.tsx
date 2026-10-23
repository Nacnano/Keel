import type { Key, KeyEstimate } from '@/core';
import { ChevronDown } from 'lucide-react';
import { keyLabel, pretty } from '../lib/chordLabel';
import { cx } from '../lib/cx';
import { Popover } from '../kit/Popover';

export interface KeyBadgeProps {
  keyEstimate: KeyEstimate | null;
  spellingFollowsKey?: boolean;
  className?: string;
  primaryOnly?: boolean;
}

const label = (k: Key, spellingFollowsKey: boolean) => pretty(keyLabel(k, { spellingFollowsKey }));

/**
 * Toolbar title: "C major · A minor" with the winner bold and a confidence dot.
 * Tap for the alternatives.
 */
export function KeyBadge({
  keyEstimate,
  spellingFollowsKey = true,
  className,
  primaryOnly,
}: KeyBadgeProps) {
  if (!keyEstimate) {
    if (primaryOnly)
      return (
        <p
          className={cx(
            'flex min-h-11 items-center text-title-2 text-label-3 sm:text-title-1',
            className,
          )}
        >
          Finding the key…
        </p>
      );
    return (
      <div
        className={cx('flex min-h-11 items-center justify-center gap-2 text-label-3', className)}
      >
        <span className="text-footnote font-medium tracking-wide uppercase">Key</span>
        <span className="text-headline">—</span>
      </div>
    );
  }

  const winner = keyEstimate;
  const major = winner.mode === 'major' ? winner : winner.relative;
  const minor = winner.mode === 'minor' ? winner : winner.relative;
  const pct = Math.round(Math.max(0, Math.min(1, winner.confidence)) * 100);
  const tone = pct >= 70 ? 'bg-ok' : pct >= 45 ? 'bg-warn' : 'bg-label-3';
  const part = (k: Key) => (
    <span
      className={k.mode === winner.mode ? 'font-semibold text-label' : 'font-normal text-label-2'}
    >
      {label(k, spellingFollowsKey)}
    </span>
  );

  return (
    <Popover
      // End-aligned panels are clamped to the viewport on both sides (start-aligned ones
      // could run off a 390 px phone when the key sits in the middle of the screen).
      align="end"
      width={280}
      aria-label="Key alternatives"
      trigger={(p) => (
        <button
          type="button"
          {...p}
          aria-label={`Key ${label(winner, spellingFollowsKey)}, ${pct}% confident. Show alternatives`}
          className={cx(
            'flex min-h-11 max-w-full items-center gap-2 rounded-control px-2 transition-colors hover:bg-fill-4',
            primaryOnly
              ? 'px-3 text-title-2 tracking-tight sm:text-title-1'
              : 'text-subhead sm:gap-2.5 sm:px-2.5 sm:text-headline',
            className,
          )}
        >
          {!primaryOnly && <span aria-hidden className={cx('size-2 rounded-full', tone)} />}
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            {primaryOnly ? (
              <>
                <span className="font-normal text-label-2">Key</span>
                {part(winner)}
                <ChevronDown
                  className="size-5 self-center text-label-3 sm:size-6"
                  strokeWidth={2.25}
                  aria-hidden
                />
              </>
            ) : (
              <>
                {part(major)}
                <span className="hidden text-label-4 sm:inline">·</span>
                <span className="hidden sm:inline">{part(minor)}</span>
              </>
            )}
          </span>
        </button>
      )}
    >
      <div className="px-2 pt-1 pb-2">
        <div className="flex items-baseline justify-between">
          <span className="text-headline font-semibold">{label(winner, spellingFollowsKey)}</span>
          <span className="text-footnote text-label-2 tabular">{pct}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fill-3">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <p className="px-2 pt-1 pb-1 text-caption font-medium tracking-wide text-label-2 uppercase">
        Other candidates
      </p>
      {winner.alternatives.length === 0 ? (
        <p className="px-2 pb-2 text-subhead text-label-2">No close alternatives.</p>
      ) : (
        <ul className="flex flex-col">
          {winner.alternatives.map((a) => (
            <li
              key={`${a.tonic}-${a.mode}`}
              className="flex items-center justify-between gap-3 rounded-[8px] px-2 py-1.5 text-subhead"
            >
              <span className="text-label">{label(a, spellingFollowsKey)}</span>
              <span className="flex items-center gap-2">
                <span className="h-1 w-14 overflow-hidden rounded-full bg-fill-3">
                  <span
                    className="block h-full bg-label-3"
                    style={{ width: `${Math.round(a.score * 100)}%` }}
                  />
                </span>
                <span className="w-10 text-right text-label-2 tabular">
                  {Math.round(a.score * 100)}%
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}
