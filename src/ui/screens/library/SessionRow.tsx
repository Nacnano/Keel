import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Ellipsis, Link2, Pencil, Trash2 } from 'lucide-react';
import type { Session } from '@/core';
import { getSessionFull } from '@/data';
import { Button } from '../../kit';
import { chordSymbol, keyLabel, pretty } from '../../lib/chordLabel';
import { cx } from '../../lib/cx';
import { romanNumeral } from '../../lib/numeral';
import { clockLabel } from '../review/timeline';
import { ExportItems } from './ExportMenu';
import { Menu, MenuItem, MenuSeparator } from './Menu';

export interface SessionRowProps {
  session: Session;
  spellingFollowsKey?: boolean;
  onRename(id: string, name: string): Promise<void>;
  onDelete(session: Session): void;
  /** Present when share links are available (sync configured and signed in). */
  onShare?(session: Session): void;
}

/** "Oct 23", or "Oct 23, 2025" outside the current year. */
function shortDate(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/**
 * One saved session in the inset list. The whole row opens the review screen; the ellipsis
 * button above the link holds rename, export, share and delete.
 */
export function SessionRow({
  session: s,
  spellingFollowsKey = true,
  onRename,
  onDelete,
  onShare,
}: SessionRowProps) {
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

  const meta = [
    shortDate(s.createdAt),
    home ? pretty(keyLabel(home, { spellingFollowsKey })) : null,
    clockLabel(s.durationSec),
    s.hasAudio ? 'Audio' : null,
    s.hasMidi ? 'MIDI' : null,
  ].filter(Boolean);

  return (
    <li
      data-testid="session-card"
      className={cx(
        'relative flex min-h-16 items-center gap-1 py-2.5 pr-2 pl-4 transition-colors duration-100',
        !renaming && 'hover:bg-fill-4 active:bg-fill-3',
        'has-[a:focus-visible]:shadow-[inset_0_0_0_2px_var(--jk-accent)]',
      )}
    >
      <div className="min-w-0 flex-1">
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
            className="relative z-10 -mx-2 h-9 w-full rounded-[8px] bg-fill-3 px-2 text-headline text-label outline-none focus-visible:outline-2 focus-visible:outline-accent"
          />
        ) : (
          <h3 className="truncate text-headline text-label">
            <Link
              to={`/review/${s.id}`}
              className="after:absolute after:inset-0 focus-visible:outline-none"
            >
              {s.name}
            </Link>
          </h3>
        )}
        <p className="mt-0.5 truncate text-footnote text-label-2 tabular">{meta.join(' · ')}</p>
        {prog && (
          <p
            className="mt-1 flex items-baseline gap-x-2.5 overflow-hidden text-subhead whitespace-nowrap"
            data-testid="session-progression"
          >
            {prog.chords.map((c, i) => (
              <span key={i} className="inline-flex items-baseline gap-1">
                <span className="font-semibold text-label">
                  {pretty(chordSymbol(c, home, { spellingFollowsKey }))}
                </span>
                {home && (
                  <span className="text-caption font-medium text-accent">
                    {pretty(romanNumeral(c, home))}
                  </span>
                )}
              </span>
            ))}
            <span className="text-footnote text-label-3 tabular">×{prog.count}</span>
          </p>
        )}
      </div>

      <div className="relative z-10 flex items-center">
        <Menu
          align="end"
          width={240}
          aria-label={`Actions for ${s.name}`}
          trigger={(t) => (
            <Button icon variant="plain" aria-label={`More actions for ${s.name}`} {...t}>
              <Ellipsis className="size-5" aria-hidden />
            </Button>
          )}
        >
          <MenuItem
            icon={<Pencil />}
            onSelect={() => {
              setDraft(s.name);
              setRenaming(true);
            }}
          >
            Rename
          </MenuItem>
          <MenuSeparator />
          <ExportItems getFull={() => getSessionFull(s.id)} />
          {onShare && (
            <MenuItem icon={<Link2 />} onSelect={() => onShare(s)}>
              Share link…
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} destructive onSelect={() => onDelete(s)}>
            Delete
          </MenuItem>
        </Menu>
      </div>
      <ChevronRight aria-hidden className="pointer-events-none size-4 shrink-0 text-label-3" />
    </li>
  );
}
