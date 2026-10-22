import type { HTMLAttributes } from 'react';
import { cx } from '../lib/cx';

export type BadgeTone = 'neutral' | 'accent' | 'live' | 'ok' | 'warn';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-fill-3 text-label-2',
  accent: 'bg-accent/15 text-accent',
  live: 'bg-live/15 text-live',
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/15 text-warn',
};

export function Badge({
  tone = 'neutral',
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center rounded-full px-2.5 text-caption font-semibold',
        TONE[tone],
        className,
      )}
      {...rest}
    />
  );
}
