import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Chord, ChordRecord, Key, Marker } from '@/core';
import { chordSymbol, keyLabel, pretty, sameChordFamily } from '../lib/chordLabel';
import { compressRepeats } from '../lib/compress';
import type { Segment } from '../lib/compress';
import { romanNumeral } from '../lib/numeral';
import { cx } from '../lib/cx';
import { MARKER_LABEL } from '../lib/markers';
import { BookmarkIcon, FlagIcon } from './icons';

export interface TimelineKeyEntry {
  t: number;
  key: Key;
}

export interface TimelineProps {
  timeline: ChordRecord[];
  keyHistory?: TimelineKeyEntry[];
  markers?: Marker[];
  onAudition?(chord: Chord): void;
  showSlash?: boolean;
  spellingFollowsKey?: boolean;
  /** `center` puts a short, finished timeline on the screen's axis (it still scrolls when long). */
  align?: 'start' | 'center';
  className?: string;
}

type Entry =
  | { type: 'key'; t: number; key: Key; first: boolean }
  | { type: 'marker'; t: number; marker: Marker }
  | { type: 'chords'; key: Key | null; segments: Segment<ChordRecord>[]; last: boolean };

/** Same root and quality family: a bass or added-tone change is not a new chord. */
const eqRecord = (a: ChordRecord, b: ChordRecord) => sameChordFamily(a.chord, b.chord);

/** Key chips and section flags share one pill shape so the row reads as one system. */
const PILL =
  'mx-1 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-footnote font-semibold whitespace-nowrap';

const FADE = '32px';

/** Fade whichever edge has more chords beyond it, instead of cutting a chord in half. */
function edgeMask(left: boolean, right: boolean): string | undefined {
  if (!left && !right) return undefined;
  const stops = [
    left ? `transparent 0, #000 ${FADE}` : '#000 0',
    right ? `#000 calc(100% - ${FADE}), transparent 100%` : '#000 100%',
  ];
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/** Split the chord list at key changes and markers, then compress repeats inside each run. */
function buildEntries(
  timeline: ChordRecord[],
  keyHistory: TimelineKeyEntry[],
  markers: Marker[],
): Entry[] {
  const chords = timeline.filter((r) => r.chord);
  const bounds = [
    ...keyHistory.map((k, i) => ({ type: 'key' as const, t: k.t, key: k.key, first: i === 0 })),
    ...markers.map((m) => ({ type: 'marker' as const, t: m.t, marker: m })),
  ].sort((a, b) => a.t - b.t);

  const out: Entry[] = [];
  let ci = 0;
  let key: Key | null = null;
  const pushRun = (until: number) => {
    const run: ChordRecord[] = [];
    while (ci < chords.length && chords[ci].t < until) run.push(chords[ci++]);
    if (run.length) {
      out.push({ type: 'chords', key, segments: compressRepeats(run, eqRecord), last: false });
    }
  };
  for (const b of bounds) {
    pushRun(b.t);
    if (b.type === 'key') key = b.key;
    out.push(b);
  }
  pushRun(Infinity);
  for (let i = out.length - 1; i >= 0; i--) {
    const e = out[i];
    if (e.type === 'chords') {
      e.last = true;
      break;
    }
  }
  return out;
}

/** Index inside `seg.items` of the newest chord, or -1 when the newest chord is elsewhere. */
function newestIndex(seg: Segment<ChordRecord>, runLength: number): number {
  const pos = runLength - 1;
  const end = seg.start + seg.items.length * seg.repeat;
  if (pos < seg.start || pos >= end) return -1;
  return (pos - seg.start) % seg.items.length;
}

/**
 * Horizontal chord history, newest on the right. Repeats are compressed (`[G D Em C] ×4`),
 * key changes and structure markers split the runs. Stays pinned to the newest chord unless
 * the user has scrolled back.
 */
export function Timeline({
  timeline,
  keyHistory = [],
  markers = [],
  onAudition,
  showSlash = true,
  spellingFollowsKey = true,
  align = 'start',
  className,
}: TimelineProps) {
  const entries = useMemo(
    () => buildEntries(timeline, keyHistory, markers),
    [timeline, keyHistory, markers],
  );
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measureEdges = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollWidth - el.scrollLeft - el.clientWidth > 1;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollLeft = el.scrollWidth;
    measureEdges();
  }, [entries, measureEdges]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measureEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureEdges]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) pinned.current = el.scrollWidth - el.scrollLeft - el.clientWidth < 48;
    measureEdges();
  };
  const mask = edgeMask(edges.left, edges.right);

  const chip = (rec: ChordRecord, key: Key | null, newest: boolean) => {
    const c = rec.chord!;
    const symbol = pretty(chordSymbol(c, key, { spellingFollowsKey, showSlash }));
    const numeral = key ? pretty(romanNumeral(c, key)) : '';
    return (
      <button
        key={rec.id}
        type="button"
        data-testid="timeline-chord"
        aria-label={`${symbol}${numeral ? `, ${numeral}` : ''}. Play`}
        aria-current={newest ? 'true' : undefined}
        onClick={() => onAudition?.(c)}
        className={cx(
          'flex min-h-14 min-w-12 flex-col items-center justify-center rounded-control px-2.5 py-1',
          'transition-colors duration-150 hover:bg-fill-4 active:bg-fill-3',
          newest ? 'text-accent' : 'text-label',
        )}
      >
        <span className="text-2xl leading-tight font-semibold whitespace-nowrap">{symbol}</span>
        <span className="h-4 text-caption leading-4 text-label-2">{numeral}</span>
      </button>
    );
  };

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      role="list"
      aria-label="Chord timeline"
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      className={cx('overflow-x-auto overscroll-x-contain [scrollbar-width:thin]', className)}
    >
      {entries.length === 0 ? (
        <p role="listitem" className="flex min-h-16 items-center px-1 text-subhead text-label-3">
          Chords you play will appear here.
        </p>
      ) : (
        <div
          className={cx(
            'flex min-h-16 w-max items-center gap-1.5 pr-2',
            align === 'center' && 'mx-auto',
          )}
        >
          {entries.map((e, i) => {
            if (e.type === 'key') {
              return (
                <span
                  role="listitem"
                  key={`k${i}`}
                  data-testid="timeline-key"
                  className={cx(PILL, 'bg-accent/12 text-accent')}
                >
                  {e.first ? '' : '→ '}
                  {pretty(keyLabel(e.key, { spellingFollowsKey }))}
                </span>
              );
            }
            if (e.type === 'marker') {
              const bookmark = e.marker.kind === 'bookmark';
              const text = e.marker.label ?? MARKER_LABEL[e.marker.kind];
              return (
                <span
                  role="listitem"
                  key={e.marker.id}
                  data-testid="timeline-marker"
                  className={cx(PILL, 'bg-warn/14 text-warn')}
                >
                  {bookmark ? <BookmarkIcon size={13} /> : <FlagIcon size={13} />}
                  <span>{text}</span>
                </span>
              );
            }
            const runLength = e.segments.reduce((n, s) => n + s.items.length * s.repeat, 0);
            return e.segments.map((seg) => {
              const newest = e.last ? newestIndex(seg, runLength) : -1;
              const chips = seg.items.map((rec, j) => chip(rec, e.key, j === newest));
              if (seg.repeat === 1) {
                return (
                  <div role="listitem" key={`s${i}-${seg.start}`} className="flex items-center">
                    {chips}
                  </div>
                );
              }
              return (
                <div
                  role="listitem"
                  key={`s${i}-${seg.start}`}
                  data-testid="timeline-repeat"
                  className="flex items-center rounded-cell bg-fill-4 pr-2"
                >
                  <span aria-hidden className="pl-1 text-2xl text-label-4">
                    [
                  </span>
                  {chips}
                  <span aria-hidden className="text-2xl text-label-4">
                    ]
                  </span>
                  <span className="ml-1.5 text-callout font-semibold text-accent tabular-nums">
                    ×{seg.repeat}
                  </span>
                </div>
              );
            });
          })}
        </div>
      )}
    </div>
  );
}
