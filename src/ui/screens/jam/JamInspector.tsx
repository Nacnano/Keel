import type { Chord, Key, MidiNote, VocabLevel } from '@/core';
import { Segmented, Sheet } from '../../kit';
import { TryNext, type TryNextSuggestion } from '../../components/TryNext';
import { ScaleHelper } from '../../components/ScaleHelper';
import { VoicingPanel } from '../../components/VoicingPanel';
import { ModulationHints } from '../../components/ModulationHints';

export type InspectorTab = 'next' | 'scales' | 'voicings' | 'keys';

export const INSPECTOR_TABS: ReadonlyArray<{ value: InspectorTab; label: string }> = [
  { value: 'next', label: 'Next' },
  { value: 'scales', label: 'Scales' },
  { value: 'voicings', label: 'Voicings' },
  { value: 'keys', label: 'Modulate' },
];

export interface JamInspectorProps {
  open: boolean;
  onClose(): void;
  tab: InspectorTab;
  onTab(tab: InspectorTab): void;
  chord: Chord | null;
  confidence: number;
  keyContext: Key | null;
  level: VocabLevel;
  suggestions: readonly TryNextSuggestion[];
  spellingFollowsKey: boolean;
  onAudition(chord: Chord): void;
  onPlayNotes(notes: MidiNote[]): void;
}

/** Ideas on demand: what to play next, which scale fits, how to voice it, where to modulate. */
export function JamInspector(p: JamInspectorProps) {
  return (
    <Sheet open={p.open} onClose={p.onClose} modeless title="Ideas" aria-label="Ideas">
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
        <TryNext
          detailed
          suggestions={p.suggestions}
          keyContext={p.keyContext}
          onAudition={p.onAudition}
          spellingFollowsKey={p.spellingFollowsKey}
        />
      )}
      {p.tab === 'scales' && (
        <ScaleHelper
          chord={p.chord}
          confidence={p.confidence}
          keyContext={p.keyContext}
          spellingFollowsKey={p.spellingFollowsKey}
        />
      )}
      {p.tab === 'voicings' && (
        <VoicingPanel
          chord={p.chord}
          keyContext={p.keyContext}
          spellingFollowsKey={p.spellingFollowsKey}
          onPlay={p.onPlayNotes}
          max={2}
        />
      )}
      {p.tab === 'keys' && (
        <ModulationHints
          keyContext={p.keyContext}
          level={p.level}
          onAudition={p.onAudition}
          spellingFollowsKey={p.spellingFollowsKey}
        />
      )}
    </Sheet>
  );
}
