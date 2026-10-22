import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Chord, Key } from '@/core';
import {
  chordKey,
  chordSymbol,
  keyName,
  prettyAccidentals,
  reharmonize,
  romanNumeral,
  type ReharmStyle,
} from '@/theory';
import { ChevronDown, Copy, Play, Square } from 'lucide-react';
import { Button, Group, Segmented } from '../kit';
import { cx } from '../lib/cx';
import { playProgression, progressionText } from './ReharmPanel.logic';
import { toast } from './toastStore';

/** A captured progression to reharmonize. */
export interface ReharmSource {
  id: string;
  label: string;
  chords: Chord[];
  key: Key;
}

export interface ReharmPanelProps {
  /** Progressions offered (e.g. the summary's top progressions). */
  sources: readonly ReharmSource[];
  /** Captures a progression on demand (e.g. the chords from the playhead); null when none. */
  capture?: () => Omit<ReharmSource, 'id' | 'label'> | null;
  captureLabel?: string;
  onAudition(chord: Chord): void;
  spellingFollowsKey?: boolean;
  showSlash?: boolean;
  defaultOpen?: boolean;
  /** Time per chord when playing a progression. Default 900 ms. */
  stepMs?: number;
  maxResults?: number;
  className?: string;
}

const STYLES = [
  { value: 'pop', label: 'Pop' },
  { value: 'jazz', label: 'Jazz' },
] as const;

async function copyText(text: string): Promise<void> {
  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (!clip?.writeText) throw new Error('Clipboard unavailable');
  await clip.writeText(text);
}

function ChordRow({
  chords,
  numerals,
  keyContext,
  spellingFollowsKey,
  showSlash,
}: {
  chords: readonly Chord[];
  numerals: readonly string[];
  keyContext: Key;
  spellingFollowsKey: boolean;
  showSlash: boolean;
}) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {chords.map((c, j) => (
        <span key={j} className="flex flex-col items-center leading-tight">
          <span className="text-body font-semibold text-label">
            {prettyAccidentals(chordSymbol(c, keyContext, { spellingFollowsKey, showSlash }))}
          </span>
          <span className="text-caption font-medium text-accent">
            {prettyAccidentals(numerals[j] ?? '')}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Review-screen "Reharmonize": alternative harmonisations of a captured progression. */
export function ReharmPanel({
  sources,
  capture,
  captureLabel = 'From playhead',
  onAudition,
  spellingFollowsKey = true,
  showSlash = true,
  defaultOpen = false,
  stepMs = 900,
  maxResults,
  className,
}: ReharmPanelProps) {
  const bodyId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [style, setStyle] = useState<ReharmStyle>('pop');
  const [captured, setCaptured] = useState<ReharmSource | null>(null);
  const all = useMemo(
    () => (captured ? [captured, ...sources] : [...sources]),
    [captured, sources],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const source = all.find((s) => s.id === selectedId) ?? all[0] ?? null;

  const alternatives = useMemo(
    () => (source ? reharmonize(source.chords, source.key, { style, maxResults }) : []),
    [source, style, maxResults],
  );

  // One progression sounds at a time.
  const [playing, setPlaying] = useState<string | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  const stop = useCallback(() => {
    cancel.current?.();
    cancel.current = null;
    setPlaying(null);
  }, []);
  useEffect(() => () => cancel.current?.(), []);
  const play = (id: string, chords: readonly Chord[]) => {
    cancel.current?.();
    if (playing === id) {
      cancel.current = null;
      setPlaying(null);
      return;
    }
    setPlaying(id);
    cancel.current = playProgression(chords, onAudition, stepMs, () => {
      cancel.current = null;
      setPlaying(null);
    });
  };

  const copy = (chords: readonly Chord[], key: Key) => {
    const text = progressionText(chords, key, { spellingFollowsKey, showSlash });
    copyText(text).then(
      () => toast('Copied progression', { tone: 'success', durationMs: 1500 }),
      () => toast(`Could not copy. ${text}`, { tone: 'error' }),
    );
  };

  const doCapture = () => {
    const got = capture?.();
    if (!got || got.chords.length === 0) {
      toast('No chords at the playhead to reharmonize.', { tone: 'info' });
      return;
    }
    stop();
    const id = `capture:${got.chords.map(chordKey).join(' ')}`;
    setCaptured({ ...got, id, label: captureLabel });
    setSelectedId(id);
  };

  const playLabel = (id: string) => (playing === id ? 'Stop' : 'Play');
  const playIcon = (id: string) =>
    playing === id ? (
      <Square className="size-3.5 fill-current" aria-hidden />
    ) : (
      <Play className="size-3.5 fill-current" aria-hidden />
    );

  return (
    <section aria-label="Reharmonize" className={className}>
      <Group>
        <h2>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => {
              if (open) stop();
              setOpen((o) => !o);
            }}
            className="flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 hover:bg-fill-4 active:bg-fill-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-headline text-label">Reharmonize</span>
              <span className="block text-footnote text-label-2">
                Other ways to harmonise a progression
              </span>
            </span>
            <ChevronDown
              aria-hidden
              className={cx(
                'size-4 shrink-0 text-label-3 transition-transform duration-200 ease-out-expo',
                open && 'rotate-180',
              )}
            />
          </button>
        </h2>

        {open && (
          <div id={bodyId} className="flex flex-col gap-3 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {all.length > 0 && (
                <div role="group" aria-label="Progression" className="flex flex-wrap gap-1.5">
                  {all.map((s) => (
                    <Button
                      key={s.id}
                      variant="gray"
                      size="sm"
                      pressed={s.id === source?.id}
                      onClick={() => {
                        stop();
                        setSelectedId(s.id);
                      }}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
              )}
              {capture && (
                <Button variant="plain" size="sm" onClick={doCapture}>
                  Use chords at playhead
                </Button>
              )}
              <Segmented
                className="ml-auto"
                size="sm"
                aria-label="Style"
                options={STYLES}
                value={style}
                onChange={(v) => {
                  stop();
                  setStyle(v);
                }}
              />
            </div>
          </div>
        )}

        {open && !source && (
          <p className="px-4 py-3 text-subhead text-label-2">
            No progression to work with yet. Play to a spot and use the chords at the playhead.
          </p>
        )}

        {open && source && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-fill-4 px-4 py-3">
            <span className="text-caption font-medium tracking-wide text-label-2 uppercase">
              Original
            </span>
            <ChordRow
              chords={source.chords}
              numerals={source.chords.map((c) => romanNumeral(c, source.key))}
              keyContext={source.key}
              spellingFollowsKey={spellingFollowsKey}
              showSlash={showSlash}
            />
            <span className="text-subhead text-label-2">
              {prettyAccidentals(keyName(source.key, { spellingFollowsKey }))}
            </span>
            <Button
              variant="plain"
              size="sm"
              className="ml-auto"
              aria-label="Play original"
              leading={playIcon('original')}
              onClick={() => play('original', source.chords)}
            >
              {playLabel('original')}
            </Button>
          </div>
        )}

        {open && source && alternatives.length === 0 && (
          <p className="px-4 py-3 text-subhead text-label-2">
            No {style} alternatives for this progression. Try the other style.
          </p>
        )}

        {open &&
          source &&
          alternatives.map((alt, i) => {
            const id = `alt:${i}`;
            return (
              <div
                key={alt.chords.map(chordKey).join(' ')}
                data-testid="reharm-alternative"
                className="flex flex-col gap-1.5 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <ChordRow
                    chords={alt.chords}
                    numerals={alt.numerals}
                    keyContext={source.key}
                    spellingFollowsKey={spellingFollowsKey}
                    showSlash={showSlash}
                  />
                  <span className="ml-auto flex gap-1">
                    <Button
                      variant="plain"
                      size="sm"
                      aria-label={`Play alternative ${i + 1}`}
                      leading={playIcon(id)}
                      onClick={() => play(id, alt.chords)}
                    >
                      {playLabel(id)}
                    </Button>
                    <Button
                      variant="plain"
                      size="sm"
                      aria-label={`Copy alternative ${i + 1}`}
                      leading={<Copy className="size-3.5" aria-hidden />}
                      onClick={() => copy(alt.chords, source.key)}
                    >
                      Copy
                    </Button>
                  </span>
                </div>
                <p className="text-footnote text-label-2">{prettyAccidentals(alt.reason)}</p>
              </div>
            );
          })}
      </Group>
    </section>
  );
}
