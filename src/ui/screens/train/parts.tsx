import type { ReactNode } from 'react';
import type { Key, VocabLevel } from '@/core';
import type { Rng } from '@/theory';
import { Button } from '@/ui/components/Button';
import { cx } from '@/ui/lib/cx';
import type { Playback } from './playback';
import type { DrillStats } from './stats';
import type { Graded, Trainer } from './useTrainer';

/** Props every drill takes from the train screen. */
export interface DrillProps {
  level: VocabLevel;
  /** Keys questions are drawn from. */
  keys: readonly Key[];
  bpm: number;
  playback: Playback;
  /** Stored totals for this drill. */
  lifetime: DrillStats;
  onGraded(correct: boolean, streak: number): void;
  /** Random source; defaults to `Math.random`. */
  rng?: Rng;
}

const STATUS: Record<string, string> = {
  loading: 'Loading piano…',
  playing: 'Listen…',
  answering: 'Your answer?',
};

/** Start / replay / next buttons and a live status line. */
export function PlayControls<Q, A, G extends Graded>({
  trainer,
  startLabel = 'Start',
}: {
  trainer: Trainer<Q, A, G>;
  startLabel?: string;
}) {
  const { phase, sounding } = trainer;
  const status =
    phase === 'playing' ? (sounding ? STATUS.playing : STATUS.loading) : (STATUS[phase] ?? '');
  return (
    <div className="flex flex-wrap items-center gap-3">
      {phase === 'idle' ? (
        <Button variant="primary" size="lg" onClick={trainer.next}>
          {startLabel}
        </Button>
      ) : (
        <>
          <Button size="lg" onClick={trainer.replay} aria-label="Replay">
            <span aria-hidden>↻</span> Replay
          </Button>
          {phase === 'feedback' && (
            <Button variant="primary" size="lg" onClick={trainer.next}>
              Next
            </Button>
          )}
        </>
      )}
      <span
        role="status"
        className="text-xs font-semibold tracking-[0.2em] text-zinc-400 uppercase"
      >
        {status}
      </span>
    </div>
  );
}

/** Right / wrong panel with the correct answer and listening actions. */
export function Feedback({
  correct,
  title,
  children,
  actions,
}: {
  correct: boolean;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section
      aria-label="Feedback"
      className={cx(
        'flex flex-col gap-3 rounded-2xl p-4 ring-1',
        correct ? 'bg-emerald-500/10 ring-emerald-500/30' : 'bg-rose-500/10 ring-rose-500/30',
      )}
    >
      <p className={cx('text-base font-semibold', correct ? 'text-emerald-200' : 'text-rose-200')}>
        {title}
      </p>
      {children && <div className="text-sm text-zinc-300">{children}</div>}
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </section>
  );
}

/** Tappable answer chip with right / wrong marking during feedback. */
export function Chip({
  children,
  onClick,
  selected,
  mark,
  disabled,
  label,
  className,
}: {
  children: ReactNode;
  onClick(): void;
  selected?: boolean;
  mark?: 'right' | 'wrong' | null;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={selected}
      data-mark={mark ?? undefined}
      className={cx(
        'flex min-h-12 flex-col items-center justify-center rounded-xl px-3 py-2 text-sm font-medium',
        'transition-colors duration-150 select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300',
        'disabled:cursor-default',
        mark === 'right'
          ? 'bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/60'
          : mark === 'wrong'
            ? 'bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/60'
            : selected
              ? 'bg-violet-400/20 text-violet-100 ring-1 ring-violet-300/60'
              : 'bg-zinc-800/80 text-zinc-100 hover:bg-zinc-700/80 disabled:hover:bg-zinc-800/80',
        className,
      )}
    >
      {children}
    </button>
  );
}
