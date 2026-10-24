import { useMemo } from 'react';
import type { Chord, Key, MidiNote, VocabLevel } from '@/core';
import { Segmented, Sheet } from '../../kit';
import { TryNext } from '../../components/TryNext';
import { ScaleHelper } from '../../components/ScaleHelper';
import { VoicingPanel } from '../../components/VoicingPanel';
import { ModulationHints } from '../../components/ModulationHints';
import { suggestNext } from '../../lib/suggest';
import { useSteadyChord } from './useSteadyChord';

export type InspectorTab = 'next' | 'scales' | 'voicings';

const INSPECTOR_TABS: ReadonlyArray<{ value: InspectorTab; label: string }> = [
  { value: 'next', label: 'Next' },
  { value: 'scales', label: 'Scales' },
  { value: 'voicings', label: 'Voicings' },
];

export interface JamInspectorProps {
  open: boolean;
  onClose(): void;
  tab: InspectorTab;
  onTab(tab: InspectorTab): void;
  /** The live chord (null while nothing confident is heard). */
  chord: Chord | null;
  confidence: number;
  keyContext: Key | null;
  level: VocabLevel;
  spellingFollowsKey: boolean;
  onAudition(chord: Chord): void;
  onPlayNotes(notes: MidiNote[]): void;
  /**
   * `side`: a column over the right edge (the listening column moves clear of it).
   * `half`: a half-height bottom sheet (`min(42dvh, 420px)`); the listening screen keeps the chord
   * and Finish above it.
   */
  layout: 'side' | 'half';
}

/**
 * Ideas on demand: what to play next (and where the key could go), which scale fits, how to
 * voice it. Everything follows the last chord that held for about a second, not every frame.
 */
export function JamInspector(p: JamInspectorProps) {
  const steady = useSteadyChord(p.chord);
  const tonic = p.keyContext?.tonic;
  const mode = p.keyContext?.mode;
  const key = useMemo<Key | null>(
    () => (tonic === undefined || !mode ? null : { tonic, mode }),
    [tonic, mode],
  );
  const suggestions = useMemo(
    () => suggestNext(key, steady.recent, p.level),
    [key, steady.recent, p.level],
  );
  return (
    <Sheet
      open={p.open}
      onClose={p.onClose}
      modeless
      title="Ideas"
      aria-label="Ideas"
      placement={p.layout === 'side' ? 'side' : 'bottom'}
      className={p.layout === 'half' ? 'h-[min(42dvh,420px)]' : undefined}
    >
      <Segmented
        fill
        size="sm"
        aria-label="Idea type"
        options={INSPECTOR_TABS}
        value={p.tab}
        onChange={p.onTab}
        className="mb-4"
      />
      {p.tab === 'next' && (
        <div className="flex flex-col gap-5">
          <TryNext
            detailed
            suggestions={suggestions}
            keyContext={key}
            onAudition={p.onAudition}
            spellingFollowsKey={p.spellingFollowsKey}
          />
          {key && (
            <section aria-labelledby="ideas-change-key" className="flex flex-col gap-2">
              <h3
                id="ideas-change-key"
                className="px-1 text-footnote font-medium tracking-wide text-label-2 uppercase"
              >
                Change key
              </h3>
              <ModulationHints
                keyContext={key}
                level={p.level}
                onAudition={p.onAudition}
                spellingFollowsKey={p.spellingFollowsKey}
              />
            </section>
          )}
        </div>
      )}
      {p.tab === 'scales' && (
        <ScaleHelper
          chord={steady.chord}
          keyContext={key}
          spellingFollowsKey={p.spellingFollowsKey}
        />
      )}
      {p.tab === 'voicings' && (
        <VoicingPanel
          chord={steady.chord}
          keyContext={key}
          level={p.level}
          spellingFollowsKey={p.spellingFollowsKey}
          onPlay={p.onPlayNotes}
        />
      )}
    </Sheet>
  );
}
