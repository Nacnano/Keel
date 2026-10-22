import { useMemo, useState } from 'react';
import { ALL_PITCH_CLASSES } from '@/core';
import type { Chord, ChordQuality, Key, PitchClass, VocabLevel } from '@/core';
import { chordSymbol, noteName, pretty } from '../lib/chordLabel';
import { cx } from '../lib/cx';
import { romanNumeral } from '../lib/numeral';
import { levelOf, qualitiesForLevel } from '../screens/review/vocab';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Segmented } from './Segmented';
import { Select } from './Select';

export interface ChordPickerProps {
  open: boolean;
  /** Chord being edited (`null` = "no chord"). */
  initial: Chord | null;
  /** Key at the chord's time, for spelling and the numeral preview. */
  keyContext: Key | null;
  /** Starting vocabulary level (the session's); the picker can widen it. */
  level: VocabLevel;
  /** Shown in the title, e.g. "1:23". */
  atLabel?: string;
  spellingFollowsKey?: boolean;
  saving?: boolean;
  onClose(): void;
  onSave(chord: Chord | null): void;
}

const LEVEL_OPTIONS: Array<{ value: VocabLevel; label: string; title: string }> = [
  { value: 1, label: 'Triads', title: 'Triads and sus chords' },
  { value: 2, label: '7ths', title: 'Sevenths, 6 and add9' },
  { value: 3, label: 'Jazz', title: 'Extensions and alterations' },
];

/**
 * Dialog to fix a detected chord: root, quality (filtered by vocabulary level), optional bass,
 * or "no chord". Mount with `key={recordId}` so its state resets per chord.
 */
export function ChordPicker({
  open,
  initial,
  keyContext,
  level: initialLevel,
  atLabel,
  spellingFollowsKey = true,
  saving = false,
  onClose,
  onSave,
}: ChordPickerProps) {
  const [none, setNone] = useState(initial === null);
  const [root, setRoot] = useState<PitchClass>(initial?.root ?? keyContext?.tonic ?? 0);
  const [quality, setQuality] = useState<ChordQuality>(initial?.quality ?? 'maj');
  const [bass, setBass] = useState<PitchClass | null>(
    initial?.bass !== undefined && initial.bass !== initial.root ? initial.bass : null,
  );
  const [level, setLevel] = useState<VocabLevel>(() =>
    initial ? (Math.max(initialLevel, levelOf(initial.quality)) as VocabLevel) : initialLevel,
  );

  const spell = { spellingFollowsKey };
  const qualities = useMemo(() => {
    const list = qualitiesForLevel(level);
    return list.includes(quality) ? list : [...list, quality];
  }, [level, quality]);

  const chord: Chord | null = none
    ? null
    : bass !== null && bass !== root
      ? { root, quality, bass }
      : { root, quality };
  const preview = chord ? pretty(chordSymbol(chord, keyContext, spell)) : 'N.C.';
  const numeral = chord && keyContext ? pretty(romanNumeral(chord, keyContext)) : '';

  const bassOptions = [
    { value: '', label: 'Root (no slash)' },
    ...ALL_PITCH_CLASSES.map((pc) => ({
      value: String(pc),
      label: pretty(noteName(pc, keyContext, spell)),
    })),
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={atLabel ? `Edit chord at ${atLabel}` : 'Edit chord'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={saving} onClick={() => onSave(chord)}>
            {saving ? 'Saving…' : 'Save chord'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-end justify-between gap-3">
          <div aria-live="polite">
            <div data-testid="picker-preview" className="text-4xl font-semibold text-white">
              {preview}
            </div>
            <div className="h-5 text-sm text-zinc-400">{numeral}</div>
          </div>
          <Button size="md" pressed={none} onClick={() => setNone((v) => !v)} aria-label="No chord">
            N.C.
          </Button>
        </div>

        <fieldset disabled={none} className="flex flex-col gap-5 disabled:opacity-40">
          <div>
            <span className="mb-2 block text-sm font-medium text-zinc-300">Root</span>
            <div role="radiogroup" aria-label="Root" className="grid grid-cols-6 gap-1.5">
              {ALL_PITCH_CLASSES.map((pc) => (
                <button
                  key={pc}
                  type="button"
                  role="radio"
                  aria-checked={root === pc}
                  onClick={() => setRoot(pc)}
                  className={cx(
                    'min-h-11 rounded-lg text-sm font-semibold transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-violet-300',
                    root === pc
                      ? 'bg-violet-400 text-zinc-950'
                      : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
                  )}
                >
                  {pretty(noteName(pc, keyContext, spell))}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-300">Quality</span>
              <Segmented<VocabLevel>
                aria-label="Chord vocabulary"
                size="sm"
                options={LEVEL_OPTIONS}
                value={level}
                onChange={setLevel}
              />
            </div>
            <div
              role="radiogroup"
              aria-label="Quality"
              className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto pr-1"
            >
              {qualities.map((q) => (
                <button
                  key={q}
                  type="button"
                  role="radio"
                  aria-checked={quality === q}
                  aria-label={q}
                  onClick={() => setQuality(q)}
                  className={cx(
                    'min-h-11 min-w-14 rounded-lg px-2.5 text-sm font-medium transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-violet-300',
                    quality === q
                      ? 'bg-violet-400 text-zinc-950'
                      : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
                  )}
                >
                  {pretty(chordSymbol({ root, quality: q }, keyContext, spell))}
                </button>
              ))}
            </div>
          </div>

          <Select
            label="Bass"
            options={bassOptions}
            value={bass === null ? '' : String(bass)}
            onChange={(v) => setBass(v === '' ? null : (Number(v) as PitchClass))}
          />
        </fieldset>
      </div>
    </Dialog>
  );
}
