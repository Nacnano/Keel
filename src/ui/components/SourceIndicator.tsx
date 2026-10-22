import type { InputSource } from '@/core';
import { cx } from '../lib/cx';
import { MicIcon, MidiIcon } from './icons';

export interface SourceIndicatorProps {
  source: InputSource | null;
  /** 0..1 */
  level: number;
  active: boolean;
  className?: string;
}

const BARS = 5;

/** Mic / MIDI icon with a small level meter. */
export function SourceIndicator({ source, level, active, className }: SourceIndicatorProps) {
  const lit = active ? Math.round(Math.max(0, Math.min(1, level)) * BARS) : 0;
  const name = source === 'midi' ? 'MIDI' : 'Mic';
  const Icon = source === 'midi' ? MidiIcon : MicIcon;
  return (
    <div
      role="status"
      aria-label={
        active ? `Input ${name}, level ${lit} of ${BARS}` : `Input ${name}, not listening`
      }
      className={cx(
        'flex min-h-11 items-center gap-2 text-sm',
        active ? 'text-zinc-200' : 'text-zinc-600',
        className,
      )}
    >
      <Icon size={18} />
      <span className="font-medium">{name}</span>
      <span className="flex h-4 items-end gap-0.5" aria-hidden>
        {Array.from({ length: BARS }, (_, i) => (
          <span
            key={i}
            className={cx(
              'w-1 rounded-sm transition-colors duration-100',
              i < lit ? 'bg-violet-300' : 'bg-zinc-800',
            )}
            style={{ height: `${40 + i * 15}%` }}
          />
        ))}
      </span>
    </div>
  );
}
