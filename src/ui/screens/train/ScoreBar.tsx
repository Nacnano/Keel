import { cx } from '@/ui/lib/cx';
import type { DrillStats } from './stats';

export interface ScoreBarProps {
  score: { correct: number; total: number };
  streak: number;
  /** Stored totals for this drill (all visits). */
  lifetime: DrillStats;
  className?: string;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">{label}</dt>
      <dd
        className={cx(
          'text-lg font-semibold tabular-nums',
          accent ? 'text-violet-200' : 'text-zinc-100',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

const pct = (correct: number, total: number) =>
  total ? `${Math.round((correct / total) * 100)}%` : '–';

/** Running score, streak and stored accuracy for the current drill. */
export function ScoreBar({ score, streak, lifetime, className }: ScoreBarProps) {
  return (
    <dl
      aria-label="Score"
      className={cx(
        'grid grid-cols-4 gap-3 rounded-2xl bg-zinc-900/40 px-4 py-3 ring-1 ring-zinc-900',
        className,
      )}
    >
      <Stat label="Score" value={`${score.correct}/${score.total}`} />
      <Stat label="Streak" value={String(streak)} accent={streak >= 3} />
      <Stat label="Best" value={String(Math.max(lifetime.bestStreak, streak))} />
      <Stat
        label="Accuracy"
        value={pct(lifetime.correct, lifetime.attempts)}
        accent={lifetime.attempts > 0}
      />
    </dl>
  );
}
