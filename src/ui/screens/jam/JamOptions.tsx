import { SlidersHorizontal } from 'lucide-react';
import type { JamMode, VocabLevel } from '@/core';
import { Button, Group, Popover, Row, Segmented, Switch } from '../../kit';

export interface JamOptionsProps {
  vocabLevel: VocabLevel;
  onVocabLevel(level: VocabLevel): void;
  mode: JamMode;
  onMode(mode: JamMode): void;
  recordAudio: boolean;
  onRecordAudio(on: boolean): void;
  pianoVisible: boolean;
  onPianoVisible(on: boolean): void;
  onReset(): void;
  canReset: boolean;
}

/** The few per-session choices, tucked behind one toolbar button. */
export function JamOptions(p: JamOptionsProps) {
  return (
    <Popover
      align="end"
      width={320}
      aria-label="Jam options"
      trigger={(t) => (
        <Button icon variant="plain" aria-label="Options" {...t}>
          <SlidersHorizontal className="size-5" aria-hidden />
        </Button>
      )}
    >
      <div className="flex flex-col gap-3 py-1">
        <Group title="Chords">
          <Row
            label="Detail"
            detail="How many chord types to recognise"
            stacked
            accessory={
              <Segmented
                fill
                size="sm"
                aria-label="Chord detail"
                value={p.vocabLevel}
                onChange={p.onVocabLevel}
                options={[
                  { value: 1, label: 'Triads' },
                  { value: 2, label: '7ths' },
                  { value: 3, label: 'Jazz' },
                ]}
              />
            }
          />
        </Group>
        <Group title="Listening" footer="Room follows a band or a song playing nearby.">
          <Row
            label="Source"
            stacked
            accessory={
              <Segmented
                fill
                size="sm"
                aria-label="Listening mode"
                value={p.mode}
                onChange={p.onMode}
                options={[
                  { value: 'solo', label: 'Just me' },
                  { value: 'room', label: 'Room' },
                ]}
              />
            }
          />
          <Row
            label="Record audio"
            detail="Saved with the session, on this device"
            accessory={
              <Switch
                checked={p.recordAudio}
                onChange={p.onRecordAudio}
                aria-label="Record audio"
              />
            }
          />
          <Row
            label="Show keyboard"
            accessory={
              <Switch
                checked={p.pianoVisible}
                onChange={p.onPianoVisible}
                aria-label="Show keyboard"
              />
            }
          />
        </Group>
        <Button variant="plain" destructive disabled={!p.canReset} onClick={p.onReset}>
          Clear timeline
        </Button>
      </div>
    </Popover>
  );
}
