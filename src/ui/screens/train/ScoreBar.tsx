import { Group, Row } from '@/ui/kit';
import { cx } from '@/ui/lib/cx';
import type { DrillStats } from './stats';

export interface ScoreBarProps {
  score: { correct: number; total: number };
  streak: number;
  /** Stored totals for this drill (all visits). */
  lifetime: DrillStats;
  className?: string;
}

const pct = (correct: number, total: number) =>
  total ? `${Math.round((correct / total) * 100)}%` : '–';

/** Running score, streak and stored accuracy for the current drill, as a short grouped list. */
export function ScoreBar({ score, streak, lifetime, className }: ScoreBarProps) {
  const best = Math.max(lifetime.bestStreak, streak);
  return (
    <Group aria-label="Score" className={className}>
      <Row
        label="This session"
        accessory={
          <span className="tabular">
            {score.correct}/{score.total}
          </span>
        }
      />
      <Row
        label="Streak"
        accessory={
          <span className="tabular">
            <span className={cx(streak >= 3 && 'font-semibold text-accent')}>{streak}</span>
            <span className="text-label-3"> · best {best}</span>
          </span>
        }
      />
      <Row
        label="Accuracy"
        detail="All sessions"
        accessory={
          <span className={cx('tabular', lifetime.attempts > 0 && 'text-label')}>
            {pct(lifetime.correct, lifetime.attempts)}
          </span>
        }
      />
    </Group>
  );
}
