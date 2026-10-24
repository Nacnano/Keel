import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cx } from '../../lib/cx';

export interface TagEditorProps {
  tags: readonly string[];
  onChange(tags: string[]): Promise<void> | void;
  className?: string;
}

const CHIP =
  'inline-flex h-7 items-center rounded-full text-footnote font-semibold whitespace-nowrap';

/**
 * Tag chips with remove buttons and an "Add tag" chip that opens a small field: Enter or comma
 * adds (and keeps the field open for the next one), Backspace on empty removes the last tag,
 * Escape or blur closes it.
 */
export function TagEditor({ tags, onChange, className }: TagEditorProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const add = (text: string = draft) => {
    const parts = text
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    setDraft('');
    if (!parts.length) return;
    const lower = new Set(tags.map((t) => t.toLowerCase()));
    const fresh = parts.filter((t) => !lower.has(t.toLowerCase()));
    if (fresh.length) void onChange([...tags, ...fresh]);
  };

  return (
    <div className={cx('flex flex-wrap items-center gap-x-3.5 gap-y-1.5', className)}>
      {tags.map((t) => (
        <span
          key={t}
          data-testid="tag-chip"
          className={cx(CHIP, 'gap-0.5 bg-fill-3 pr-0.5 pl-3 text-label-2')}
        >
          {t}
          {/* A 44 pt box around a 24 px circle; the negative margins keep the chip 28 px. */}
          <button
            type="button"
            aria-label={`Remove tag ${t}`}
            onClick={() => void onChange(tags.filter((x) => x !== t))}
            className="group -m-2.5 flex size-11 items-center justify-center rounded-full text-label-3 hover:text-label"
          >
            <span className="flex size-6 items-center justify-center rounded-full transition-colors group-hover:bg-fill-3">
              <X className="size-3.5" aria-hidden />
            </span>
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          aria-label="Add tag"
          placeholder="Tag name"
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(',')) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setDraft('');
              setAdding(false);
            } else if (e.key === 'Backspace' && !draft && tags.length) {
              void onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => {
            add();
            setAdding(false);
          }}
          className={cx(
            CHIP,
            'w-32 bg-fill-3 px-3 font-medium text-label placeholder:text-label-3',
          )}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={cx(
            CHIP,
            // 44 pt tall on touch; without tags the label lines up with the column.
            'gap-1 px-2.5 text-accent transition-colors hover:bg-accent/10 pointer-coarse:h-11',
            !tags.length && '-ml-2.5',
          )}
        >
          <Plus className="size-3.5" aria-hidden />
          {tags.length ? 'Add tag' : 'Add a tag'}
        </button>
      )}
    </div>
  );
}
