import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import type { Key, Session } from '@/core';
import { chartNumeral, chartSymbol, getChartPreview, getSessionFull, type ChartRow } from '@/data';
import { Button } from '../../kit';
import { keyLabel, pretty } from '../../lib/chordLabel';
import { cx } from '../../lib/cx';
import { clockLabel } from '../review/timeline';
import { DownloadItems, ShareItem, ShareLinkItem } from './ShareItems';
import { Menu, MenuItem, MenuSeparator } from './Menu';

export interface SessionRowProps {
  session: Session;
  spellingFollowsKey?: boolean;
  onRename(id: string, name: string): Promise<void>;
  onDelete(session: Session): void;
  /** Present when cloud share links are available (sync configured). */
  onShareLink?(session: Session): void;
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

/** The first row of the session's folded chart, loaded once per edit of the session. */
function useChartPreview(id: string, updatedAt: number) {
  const [preview, setPreview] = useState<{ row: ChartRow; key: Key | null; keys: Key[] } | null>(
    null,
  );
  useEffect(() => {
    let alive = true;
    getChartPreview(id).then(
      (p) => alive && setPreview(p),
      () => alive && setPreview(null),
    );
    return () => {
      alive = false;
    };
  }, [id, updatedAt]);
  return preview;
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
  onShareLink,
}: SessionRowProps) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(s.name);
  const preview = useChartPreview(s.id, s.updatedAt);
  // The chart's keys once loaded (no wobbles, one per song), the summary's until then.
  const homeKeys = preview?.keys ?? (s.summary?.keys[0] ? [s.summary.keys[0].key] : []);

  const commit = async () => {
    setRenaming(false);
    const name = draft.trim();
    if (name && name !== s.name) await onRename(s.id, name);
    else setDraft(s.name);
  };

  const meta = [
    shortDate(s.createdAt),
    homeKeys.length
      ? homeKeys.map((k) => pretty(keyLabel(k, { spellingFollowsKey }))).join(' · ')
      : null,
    clockLabel(s.durationSec),
    s.hasAudio ? 'Audio' : null,
    s.hasMidi ? 'MIDI' : null,
  ].filter(Boolean);

  return (
    <li
      data-testid="session-card"
      className={cx(
        'relative flex min-h-16 items-center gap-1 py-4 pr-2 pl-4 transition-colors duration-100',
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
          <h3 className="text-headline text-label">
            {/* The whole row is the link (after:inset-0); its own box is 44 pt tall for touch. */}
            <Link
              to={`/review/${s.id}`}
              className="-my-[11px] block truncate py-[11px] after:absolute after:inset-0 focus-visible:outline-none"
            >
              {s.name}
            </Link>
          </h3>
        )}
        <p className="mt-0.5 truncate text-footnote text-label-2 tabular">{meta.join(' · ')}</p>
        {preview && (
          <p
            className="mt-1 flex items-baseline gap-x-2.5 overflow-hidden text-subhead whitespace-nowrap"
            data-testid="session-progression"
          >
            {preview.row.map((seg, i) => (
              <span key={i} className="inline-flex items-baseline gap-x-2.5">
                {seg.chords.map((c, j) => (
                  <span key={j} className="inline-flex items-baseline gap-1">
                    <span className="font-semibold text-label">
                      {chartSymbol(c, preview.key, { spellingFollowsKey, showSlash: false })}
                    </span>
                    {preview.key && (
                      <span className="text-caption font-medium text-accent">
                        {chartNumeral(c, preview.key)}
                      </span>
                    )}
                  </span>
                ))}
                {seg.repeat > 1 && (
                  <span className="text-footnote text-label-3 tabular">×{seg.repeat}</span>
                )}
              </span>
            ))}
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
          <ShareItem getFull={() => getSessionFull(s.id)} />
          {onShareLink && <ShareLinkItem onSelect={() => onShareLink(s)} />}
          <MenuSeparator />
          <DownloadItems getFull={() => getSessionFull(s.id)} />
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
