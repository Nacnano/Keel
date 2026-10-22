import { useState } from 'react';
import { Link } from 'react-router';
import type { Session } from '@/core';
import { getSessionFull } from '@/data';
import { Button } from '../../components/Button';
import { chordSymbol, keyLabel, pretty } from '../../lib/chordLabel';
import { cx } from '../../lib/cx';
import { romanNumeral } from '../../lib/numeral';
import { clockLabel } from '../review/timeline';
import { ExportMenu } from './ExportMenu';

export interface SessionCardProps {
  session: Session;
  spellingFollowsKey?: boolean;
  activeTag: string | null;
  onTag(tag: string): void;
  onRename(id: string, name: string): Promise<void>;
  onDelete(session: Session): void;
}

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' });

/** One saved session: whole card opens the review screen; actions sit above the link. */
export function SessionCard({
  session: s,
  spellingFollowsKey = true,
  activeTag,
  onTag,
  onRename,
  onDelete,
}: SessionCardProps) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(s.name);
  const home = s.summary?.keys[0]?.key ?? null;
  const prog = s.summary?.topProgressions[0];

  const commit = async () => {
    setRenaming(false);
    const name = draft.trim();
    if (name && name !== s.name) await onRename(s.id, name);
    else setDraft(s.name);
  };

  return (
    <article
      data-testid="session-card"
      aria-labelledby={`card-${s.id}`}
      className="relative flex flex-col gap-3 rounded-2xl bg-zinc-900/50 p-4 ring-1 ring-zinc-800 transition-colors focus-within:ring-violet-400/60 hover:bg-zinc-900"
    >
      <div className="flex items-start gap-2">
        {renaming ? (
          <input
            autoFocus
            aria-label="Session name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commit();
              if (e.key === 'Escape') {
                setDraft(s.name);
                setRenaming(false);
              }
            }}
            className="relative z-10 min-h-11 min-w-0 flex-1 rounded-lg bg-zinc-950 px-2 text-lg font-semibold text-white ring-1 ring-violet-400/60 outline-none"
          />
        ) : (
          <h2 id={`card-${s.id}`} className="min-w-0 flex-1 text-lg font-semibold text-white">
            <Link
              to={`/review/${s.id}`}
              className="block truncate rounded-md after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
            >
              {s.name}
            </Link>
          </h2>
        )}
        <span className="pt-1 text-sm text-zinc-400 tabular-nums">{clockLabel(s.durationSec)}</span>
      </div>

      <p className="flex flex-wrap gap-x-3 text-sm text-zinc-400">
        <span>{fmtDate(s.createdAt)}</span>
        {home && (
          <span className="text-violet-200">{pretty(keyLabel(home, { spellingFollowsKey }))}</span>
        )}
        {s.summary && <span>{s.summary.chordCount} chords</span>}
        {s.hasAudio && <span>Audio</span>}
        {s.hasMidi && <span>MIDI</span>}
      </p>

      {prog && (
        <p className="flex flex-wrap items-baseline gap-x-2 text-base">
          {prog.chords.map((c, i) => (
            <span key={i} className="font-semibold text-zinc-100">
              {pretty(chordSymbol(c, home, { spellingFollowsKey }))}
              {home && (
                <span className="ml-1 text-xs font-normal text-zinc-500">
                  {pretty(romanNumeral(c, home))}
                </span>
              )}
            </span>
          ))}
          <span className="text-sm text-zinc-500">×{prog.count}</span>
        </p>
      )}

      <div className="relative z-10 mt-auto flex flex-wrap items-center gap-1.5">
        {s.tags.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={activeTag === t}
            onClick={() => onTag(t)}
            className={cx(
              'min-h-8 rounded-full px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-violet-300',
              activeTag === t
                ? 'bg-violet-400 text-zinc-950'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
            )}
          >
            {t}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            aria-label={`Rename ${s.name}`}
            onClick={() => {
              setDraft(s.name);
              setRenaming(true);
            }}
          >
            Rename
          </Button>
          <ExportMenu getFull={() => getSessionFull(s.id)} />
          <Button variant="ghost" aria-label={`Delete ${s.name}`} onClick={() => onDelete(s)}>
            Delete
          </Button>
        </div>
      </div>
    </article>
  );
}
