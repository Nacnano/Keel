import { useState } from 'react';
import { cx } from '../../lib/cx';

export interface TagEditorProps {
  tags: readonly string[];
  onChange(tags: string[]): Promise<void> | void;
  className?: string;
}

/** Tag chips with remove buttons and an input: Enter or comma adds, Backspace on empty removes. */
export function TagEditor({ tags, onChange, className }: TagEditorProps) {
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
    <div className={cx('flex flex-wrap items-center gap-1.5', className)}>
      {tags.map((t) => (
        <span
          key={t}
          data-testid="tag-chip"
          className="flex min-h-8 items-center gap-1 rounded-full bg-zinc-800 py-0.5 pr-0.5 pl-3 text-sm text-zinc-200"
        >
          {t}
          <button
            type="button"
            aria-label={`Remove tag ${t}`}
            onClick={() => void onChange(tags.filter((x) => x !== t))}
            className="flex size-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-700 hover:text-white focus-visible:outline-2 focus-visible:outline-violet-300"
          >
            ×
          </button>
        </span>
      ))}
      <input
        aria-label="Add tag"
        placeholder={tags.length ? 'Add tag' : 'Add a tag…'}
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
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            void onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => add()}
        className="min-h-11 w-28 rounded-lg bg-transparent px-2 text-sm text-zinc-200 placeholder:text-zinc-600 hover:bg-zinc-900 focus:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-violet-300"
      />
    </div>
  );
}
