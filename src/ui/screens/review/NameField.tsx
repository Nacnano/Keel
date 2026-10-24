import { useRef, useState } from 'react';
import { cx } from '../../lib/cx';

export interface NameFieldProps {
  value: string;
  onCommit(name: string): Promise<void> | void;
  label?: string;
  className?: string;
}

/**
 * Inline editable name: looks like a title, tap to edit in place. Enter or blur saves, Escape reverts,
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
      size={Math.max(8, Math.min(40, shown.length + 1))}
      title="Rename"
      className={cx(
        'min-h-9 max-w-full min-w-0 truncate rounded-[8px] pointer-coarse:min-h-11 bg-transparent px-2 text-label [field-sizing:content]',
        'transition-colors duration-100 hover:bg-fill-4 focus:bg-fill-3',
        className,
      )}
    />
  );
}
