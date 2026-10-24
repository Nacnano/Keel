import { useEffect, useMemo } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { VocabLevel } from '@/core';
import { keyPool } from '@/theory';
import type { KeySet, ModeSet, Rng } from '@/theory';
import { Button, Group, Page, Popover, Row, Segmented } from '../kit';
import { ChordQualityDrill } from './train/ChordQualityDrill';
import { KeyDrill } from './train/KeyDrill';
import { ProgressionDrill } from './train/ProgressionDrill';
import { createPianoPlayback, TEMPO_BPM } from './train/playback';
import type { Playback, Tempo } from './train/playback';
import { useTrainStorage } from './train/stats';
import type { DrillId, TrainPrefs } from './train/stats';
import type { DrillProps } from './train/parts';
import { LEVEL_OPTIONS } from './settings/labels';

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

interface TrainOptionsProps {
  drill: DrillId;
  prefs: TrainPrefs;
  setPrefs(patch: Partial<TrainPrefs>): void;
}

/** Level, key set, modes and tempo, behind one toolbar button. */
function TrainOptions({ drill, prefs, setPrefs }: TrainOptionsProps) {
  return (
    <Popover
      align="end"
      width={320}
      aria-label="Training options"
      trigger={(t) => (
        <Button
          variant="plain"
          leading={<SlidersHorizontal className="size-[18px]" aria-hidden />}
          {...t}
        >
          Options
        </Button>
      )}
    >
      <div className="flex flex-col gap-3 py-1">
        <Group title="Chords">
          <Row
            label="Detail"
            stacked
            accessory={
              <Segmented<VocabLevel>
                fill
                aria-label="Chord detail"
                options={LEVEL_OPTIONS}
                value={prefs.level}
                onChange={(level) => setPrefs({ level })}
              />
            }
          />
        </Group>
        {drill !== 'quality' && (
          <Group title="Keys">
            <Row
              label="Tonics"
              stacked
              accessory={
                <Segmented<KeySet>
                  fill
                  aria-label="Key set"
                  options={KEYSET_OPTIONS}
                  value={prefs.keySet}
                  onChange={(keySet) => setPrefs({ keySet })}
                />
              }
            />
            <Row
              label="Modes"
              stacked
              accessory={
                <Segmented<ModeSet>
                  fill
                  aria-label="Modes"
                  options={MODES_OPTIONS}
                  value={prefs.modes}
                  onChange={(modes) => setPrefs({ modes })}
                />
              }
            />
          </Group>
        )}
        <Group title="Playback">
          <Row
            label="Tempo"
            stacked
            accessory={
              <Segmented<Tempo>
                fill
                aria-label="Tempo"
                options={TEMPO_OPTIONS}
                value={prefs.tempo}
                onChange={(tempo) => setPrefs({ tempo })}
              />
            }
          />
        </Group>
      </div>
    </Popover>
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
    <Page
      title="Ear training"
      subtitle={DRILL_HINT[drill]}
      back={{ to: '/tools', label: 'Tools' }}
      actions={<TrainOptions drill={drill} prefs={prefs} setPrefs={setPrefs} />}
    >
      <div className="px-4">
        <Segmented
          fill
          aria-label="Drill"
          options={DRILL_OPTIONS}
          value={drill}
          onChange={(d: DrillId) => {
            playback.stop();
            setPrefs({ drill: d });
          }}
        />
      </div>
      <div className="mx-auto w-full max-w-xl px-4 pt-6">
        {drill === 'quality' && <ChordQualityDrill key="quality" {...props} />}
        {drill === 'progression' && <ProgressionDrill key="progression" {...props} />}
        {drill === 'key' && <KeyDrill key="key" {...props} />}
      </div>
    </Page>
  );
}
