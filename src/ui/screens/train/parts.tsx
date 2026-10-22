import type { ReactNode } from 'react';
import { Check, CircleCheck, CircleX, Play, RotateCcw, X } from 'lucide-react';
import type { Key, VocabLevel } from '@/core';
import type { Rng } from '@/theory';
import { Button } from '@/ui/kit';
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
  idle: 'Tap to hear the first one',
  loading: 'Loading piano…',
  playing: 'Listen…',
  answering: 'Your answer?',
  feedback: 'Tap to hear it again',
};

/**
 * The drill's centre: one large round play / replay button, the question as a title and a
 * live status line; Next appears once the answer is graded.
 */
export function PlayControls<Q, A, G extends Graded>({
  trainer,
  prompt,
  startLabel = 'Start',
}: {
  trainer: Trainer<Q, A, G>;
  prompt: ReactNode;
  startLabel?: string;
}) {
  const { phase, sounding } = trainer;
  const status =
    phase === 'playing' ? (sounding ? STATUS.playing : STATUS.loading) : (STATUS[phase] ?? '');
  const idle = phase === 'idle';
  const feedback = phase === 'feedback';
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Button
        variant={feedback ? 'gray' : 'filled'}
        icon
        round
        aria-label={idle ? startLabel : 'Replay'}
        onClick={idle ? trainer.next : trainer.replay}
        className={cx('size-20', phase === 'playing' && sounding && 'anim-pulse-soft')}
      >
        {idle ? (
          <Play className="ml-1 size-8 fill-current" aria-hidden />
        ) : (
          <RotateCcw className="size-7" aria-hidden />
        )}
      </Button>
      <div className="flex flex-col gap-1">
        <h2 className="text-title-2 font-bold text-label">{prompt}</h2>
        <p role="status" className="text-subhead text-label-2">
          {status}
        </p>
      </div>
      {feedback && (
        <Button variant="filled" size="lg" className="min-w-40" onClick={trainer.next}>
          Next
        </Button>
      )}
    </div>
  );
}

/** Right / wrong row with the correct answer and listening actions. */
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
  const Icon = correct ? CircleCheck : CircleX;
  return (
    <section
      aria-label="Feedback"
      className="anim-rise flex flex-col gap-2 rounded-card bg-surface px-4 py-3.5"
    >
      <p
        className={cx(
          'flex items-center gap-2 text-headline font-semibold',
          correct ? 'text-ok' : 'text-live',
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden />
        {title}
      </p>
      {children && <div className="text-subhead text-label-2">{children}</div>}
      {actions && <div className="-mx-3 flex flex-wrap gap-1">{actions}</div>}
    </section>
  );
}

/** Answer button (gray, large) with right / wrong marking during feedback. */
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
    <Button
      variant="gray"
      size="lg"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      pressed={selected}
      data-mark={mark ?? undefined}
      className={cx(
        'w-full px-3',
        mark === 'right' && 'ring-2 ring-ok ring-inset',
        mark === 'wrong' && 'ring-2 ring-live ring-inset',
        className,
      )}
      trailing={
        mark === 'right' ? (
          <Check className="size-4 shrink-0 text-ok" aria-hidden />
        ) : mark === 'wrong' ? (
          <X className="size-4 shrink-0 text-live" aria-hidden />
        ) : undefined
      }
    >
      {children}
    </Button>
  );
}
