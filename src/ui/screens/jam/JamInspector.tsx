import { useMemo } from 'react';
import type { Chord, Key, MidiNote, VocabLevel } from '@/core';
import { Segmented, Sheet } from '../../kit';
import { TryNext } from '../../components/TryNext';
import { ScaleHelper } from '../../components/ScaleHelper';
import { VoicingPanel } from '../../components/VoicingPanel';
import { ModulationHints } from '../../components/ModulationHints';
import { suggestNext } from '../../lib/suggest';
import { useRecentChords } from './useRecentChords';

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
   * `side`: a floating panel over the right edge; the listening column does not move.
   * `half`: a bottom sheet sized by the Listen screen (`--keel-ideas-h`, the room under the Finish
   * row; `min(42dvh, 420px)` until measured), so chord, key, timeline and Finish stay above it.
   */
  layout: 'side' | 'half';
}

/**
 * Ideas on demand: what to play next (and where the key could go), which scale fits, how to
 * voice it. Everything follows the chord on screen (and keeps it through gaps).
 */
export function JamInspector(p: JamInspectorProps) {
  const steady = useRecentChords(p.chord);
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
      className={
        p.layout === 'half'
          ? // From 1024 px the sidebar stays uncovered.
            'h-[var(--keel-ideas-h,min(42dvh,420px))] lg:left-52'
          : 'w-[320px]!'
      }
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
              <h3 id="ideas-change-key" className="px-1 text-footnote font-medium text-label-2">
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
