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
import { cx } from '../lib/cx';
import { Button } from './Button';
import { playProgression, progressionText } from './ReharmPanel.logic';
import { Segmented } from './Segmented';
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
          <span className="text-base font-semibold text-white">
            {prettyAccidentals(chordSymbol(c, keyContext, { spellingFollowsKey, showSlash }))}
          </span>
          <span className="text-xs text-zinc-500">{prettyAccidentals(numerals[j] ?? '')}</span>
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

  const card = cx('rounded-2xl bg-zinc-900/40 p-4 ring-1 ring-zinc-900', className);
  return (
    <section aria-label="Reharmonize" className={card}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          if (open) stop();
          setOpen((o) => !o);
        }}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-violet-300"
      >
        <h2 className="text-xs font-medium tracking-widest text-zinc-500 uppercase">Reharmonize</h2>
        <span aria-hidden className="ml-auto text-zinc-500">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div id={bodyId} className="mt-3 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {all.length > 0 && (
              <div role="group" aria-label="Progression" className="flex flex-wrap gap-1.5">
                {all.map((s) => (
                  <Button
                    key={s.id}
                    variant="ghost"
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
              <Button variant="secondary" onClick={doCapture}>
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

          {!source ? (
            <p className="text-sm text-zinc-500">
              No progression to work with yet. Play to a spot and use the chords at the playhead.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-zinc-950/60 px-3 py-2">
                <span className="text-xs tracking-widest text-zinc-500 uppercase">Original</span>
                <ChordRow
                  chords={source.chords}
                  numerals={source.chords.map((c) => romanNumeral(c, source.key))}
                  keyContext={source.key}
                  spellingFollowsKey={spellingFollowsKey}
                  showSlash={showSlash}
                />
                <span className="text-sm text-violet-200">
                  {prettyAccidentals(keyName(source.key, { spellingFollowsKey }))}
                </span>
                <Button
                  variant="ghost"
                  className="ml-auto"
                  aria-label="Play original"
                  onClick={() => play('original', source.chords)}
                >
                  {playing === 'original' ? 'Stop' : 'Play'}
                </Button>
              </div>

              {alternatives.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No {style} alternatives for this progression. Try the other style.
                </p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {alternatives.map((alt, i) => {
                    const id = `alt:${i}`;
                    return (
                      <li
                        key={alt.chords.map(chordKey).join(' ')}
                        data-testid="reharm-alternative"
                        className="flex flex-col gap-2 rounded-xl bg-zinc-950/60 px-3 py-2"
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
                              variant="ghost"
                              aria-label={`Play alternative ${i + 1}`}
                              onClick={() => play(id, alt.chords)}
                            >
                              {playing === id ? 'Stop' : 'Play'}
                            </Button>
                            <Button
                              variant="ghost"
                              aria-label={`Copy alternative ${i + 1}`}
                              onClick={() => copy(alt.chords, source.key)}
                            >
                              Copy
                            </Button>
                          </span>
                        </div>
                        <p className="text-sm text-zinc-400">{prettyAccidentals(alt.reason)}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
