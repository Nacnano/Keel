import { useRef, useState } from 'react';
import { cx } from '../../lib/cx';

export interface NameFieldProps {
  value: string;
  onCommit(name: string): Promise<void> | void;
  label?: string;
  className?: string;
}

/**
 * Inline editable name: looks like text, edits in place. Enter or blur saves, Escape reverts,
 * an empty name reverts.
 */
export function NameField({ value, onCommit, label = 'Session name', className }: NameFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const shown = draft ?? value;

  const commit = async () => {
    const next = (draft ?? '').trim();
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (draft === null || !next || next === value) return;
    await onCommit(next);
  };

  return (
    <input
      aria-label={label}
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setDraft(value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className={cx(
        'min-h-11 w-full min-w-0 rounded-lg bg-transparent px-2 -mx-2 text-white',
        'hover:bg-zinc-900 focus:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-violet-300',
        className,
      )}
    />
  );
}
