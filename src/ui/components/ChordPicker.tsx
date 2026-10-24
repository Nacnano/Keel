import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_PITCH_CLASSES } from '@/core';
import type { Chord, ChordQuality, Key, PitchClass, VocabLevel } from '@/core';
import { chordSymbol, noteName, pretty } from '../lib/chordLabel';
import { cx } from '../lib/cx';
import { romanNumeral } from '../lib/numeral';
import { levelOf, qualitiesForLevel } from '../screens/review/vocab';
import { Button, Segmented, Select, Sheet, Switch } from '../kit';

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
  /**
   * Other chords in the session with the same root and quality as `initial` (this one
   * included). Above one, a "Change every …" switch shows, on by default.
   */
  sameCount?: number;
  onClose(): void;
  /** `all`: change every chord with the same root and quality, not just this one. */
  onSave(chord: Chord | null, all: boolean): void;
}

const LEVEL_OPTIONS: Array<{ value: VocabLevel; label: string; title: string }> = [
  { value: 1, label: 'Simple', title: 'Simple: triads and sus chords' },
  { value: 2, label: 'With 7ths', title: 'With 7ths: sevenths, 6 and add9' },
  { value: 3, label: 'Everything', title: 'Everything: extensions and alterations' },
];

/**
 * Centered sheet to fix a detected chord: root, quality (filtered by vocabulary level), optional bass,
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
  sameCount = 1,
  onClose,
  onSave,
}: ChordPickerProps) {
  const [all, setAll] = useState(true);
  const offerAll = initial !== null && sameCount > 1;
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

  // Focus moves into the sheet (the selected root) and back to the edited chord on close.
  const rootGroup = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    rootGroup.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    return () => prev?.focus?.();
  }, [open]);

  const chip = (selected: boolean) =>
    cx(
      'min-h-11 rounded-control text-subhead font-semibold transition-colors duration-100',
      selected ? 'bg-action text-accent-fg' : 'bg-fill-3 text-label hover:bg-fill-2',
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      placement="center"
      title={atLabel ? `Edit chord at ${atLabel}` : 'Edit chord'}
      className="max-h-[92vh]"
    >
      <div className="flex flex-col gap-5 pt-1">
        <div className="flex items-end justify-between gap-3">
          <div aria-live="polite">
            <div
              data-testid="picker-preview"
              className="text-large-title font-bold tracking-tight text-label"
            >
              {preview}
            </div>
            <div className="h-5 text-subhead font-medium text-accent">{numeral}</div>
          </div>
          <Button
            variant="gray"
            size="sm"
            pressed={none}
            onClick={() => setNone((v) => !v)}
            aria-label="No chord"
          >
            N.C.
          </Button>
        </div>

        <fieldset disabled={none} className="flex flex-col gap-5 disabled:opacity-40">
          <div>
            <span className="mb-2 block text-footnote font-medium text-label-2">Root</span>
            <div
              ref={rootGroup}
              role="radiogroup"
              aria-label="Root"
              className="grid grid-cols-6 gap-1.5"
            >
              {ALL_PITCH_CLASSES.map((pc) => (
                <button
                  key={pc}
                  type="button"
                  role="radio"
                  aria-checked={root === pc}
                  onClick={() => setRoot(pc)}
                  className={chip(root === pc)}
                >
                  {pretty(noteName(pc, keyContext, spell))}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-footnote font-medium text-label-2">Quality</span>
              <Segmented<VocabLevel>
                aria-label="Chord vocabulary"
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
                  className={cx(chip(quality === q), 'min-w-14 px-2.5 font-medium')}
                >
                  {pretty(chordSymbol({ root, quality: q }, keyContext, spell))}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-footnote font-medium text-label-2">Bass</span>
            <Select
              inline
              aria-label="Bass"
              options={bassOptions}
              value={bass === null ? '' : String(bass)}
              onChange={(v) => setBass(v === '' ? null : (Number(v) as PitchClass))}
            />
          </div>
        </fieldset>

        {offerAll && initial && (
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-cell bg-fill-4 px-3 py-2">
            <span className="text-subhead text-label">
              Change every{' '}
              {pretty(chordSymbol(initial, keyContext, { ...spell, showSlash: false }))} in this
              session
              <span className="block text-footnote text-label-2">{sameCount} chords</span>
            </span>
            <Switch
              aria-label={`Change every ${pretty(chordSymbol(initial, keyContext, { ...spell, showSlash: false }))} in this session`}
              checked={all}
              onChange={setAll}
            />
          </label>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="filled" loading={saving} onClick={() => onSave(chord, offerAll && all)}>
            Save chord
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
