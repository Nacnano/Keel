import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { keyPool } from '@/theory';
import type { KeySet, ModeSet, Rng } from '@/theory';
import { LevelSelector } from '../components/LevelSelector';
import { Segmented } from '../components/Segmented';
import { ChordQualityDrill } from './train/ChordQualityDrill';
import { KeyDrill } from './train/KeyDrill';
import { ProgressionDrill } from './train/ProgressionDrill';
import { createPianoPlayback, TEMPO_BPM } from './train/playback';
import type { Playback, Tempo } from './train/playback';
import { useTrainStorage } from './train/stats';
import type { DrillId } from './train/stats';
import type { DrillProps } from './train/parts';

const DRILL_OPTIONS = [
  { value: 'quality' as const, label: 'Chords', title: 'Chord quality' },
  { value: 'progression' as const, label: 'Progressions', title: 'Progression numerals' },
  { value: 'key' as const, label: 'Keys', title: 'Key' },
];

const DRILL_HINT: Record<DrillId, string> = {
  quality: 'Hear a chord, name its quality.',
  progression: 'A cadence sets the key, then four chords: pick a numeral for each.',
  key: 'Hear a phrase that ends on a cadence, pick the key.',
};

const KEYSET_OPTIONS = [
  { value: 'white' as const, label: 'White keys', title: 'Tonics C D E F G A B' },
  { value: 'all' as const, label: 'All 12' },
];

const MODES_OPTIONS = [
  { value: 'major' as const, label: 'Major' },
  { value: 'both' as const, label: 'Major + minor' },
];

const TEMPO_OPTIONS = [
  { value: 'slow' as const, label: 'Slow', title: `${TEMPO_BPM.slow} bpm` },
  { value: 'medium' as const, label: 'Medium', title: `${TEMPO_BPM.medium} bpm` },
  { value: 'fast' as const, label: 'Fast', title: `${TEMPO_BPM.fast} bpm` },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold tracking-widest text-zinc-500 uppercase">{label}</span>
      {children}
    </div>
  );
}

export interface TrainScreenProps {
  /** Injected for tests; defaults to the shared sampled piano. */
  playback?: Playback;
  rng?: Rng;
}

/** Ear training: chord quality, progression numerals, key (DESIGN.md §3.4). */
export function TrainScreen({ playback: injected, rng }: TrainScreenProps = {}) {
  const { stats, prefs, record, setPrefs } = useTrainStorage();
  const playback = useMemo(() => injected ?? createPianoPlayback(), [injected]);
  useEffect(() => () => playback.stop(), [playback]);

  const keys = useMemo(() => keyPool(prefs.keySet, prefs.modes), [prefs.keySet, prefs.modes]);
  const drill = prefs.drill;
  const props: DrillProps = {
    level: prefs.level,
    keys,
    bpm: TEMPO_BPM[prefs.tempo],
    playback,
    lifetime: stats[drill],
    onGraded: (correct, streak) => record(drill, correct, streak),
    rng,
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 pb-[max(env(safe-area-inset-bottom),24px)]">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Train</h1>
            <p className="text-sm text-zinc-500">{DRILL_HINT[drill]}</p>
          </div>
          <Segmented
            aria-label="Drill"
            options={DRILL_OPTIONS}
            value={drill}
            onChange={(d: DrillId) => {
              playback.stop();
              setPrefs({ drill: d });
            }}
          />
        </header>

        <section
          aria-label="Difficulty"
          className="flex flex-wrap gap-x-6 gap-y-4 rounded-2xl bg-zinc-900/40 p-4 ring-1 ring-zinc-900"
        >
          <Field label="Chords">
            <LevelSelector value={prefs.level} onChange={(level) => setPrefs({ level })} />
          </Field>
          {drill !== 'quality' && (
            <>
              <Field label="Keys">
                <Segmented<KeySet>
                  aria-label="Key set"
                  options={KEYSET_OPTIONS}
                  value={prefs.keySet}
                  onChange={(keySet) => setPrefs({ keySet })}
                />
              </Field>
              <Field label="Modes">
                <Segmented<ModeSet>
                  aria-label="Modes"
                  options={MODES_OPTIONS}
                  value={prefs.modes}
                  onChange={(modes) => setPrefs({ modes })}
                />
              </Field>
            </>
          )}
          <Field label="Tempo">
            <Segmented<Tempo>
              aria-label="Tempo"
              options={TEMPO_OPTIONS}
              value={prefs.tempo}
              onChange={(tempo) => setPrefs({ tempo })}
            />
          </Field>
        </section>

        {drill === 'quality' && <ChordQualityDrill key="quality" {...props} />}
        {drill === 'progression' && <ProgressionDrill key="progression" {...props} />}
        {drill === 'key' && <KeyDrill key="key" {...props} />}
      </div>
    </div>
  );
}
