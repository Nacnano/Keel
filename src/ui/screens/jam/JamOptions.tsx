import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { Instrument, JamMode, VocabLevel } from '@/core';
import { Button, Group, Row, Segmented, Sheet, Slider, Switch } from '../../kit';
import { INSTRUMENT_OPTIONS, MODE_OPTIONS, VOCAB_OPTIONS } from './labels';
import { useMediaQuery } from '../../lib/useMediaQuery';

export interface JamOptionsProps {
  vocabLevel: VocabLevel;
  onVocabLevel(level: VocabLevel): void;
  mode: JamMode;
  onMode(mode: JamMode): void;
  instrument: Instrument;
  onInstrument(instrument: Instrument): void;
  sensitivity: number;
  onSensitivity(value: number): void;
  recordAudio: boolean;
  recordingLocked: boolean;
  onRecordAudio(on: boolean): void;
  pianoVisible: boolean;
  onPianoVisible(on: boolean): void;
  /** The keyboard is unreadable on phones, so the switch is only offered on wider screens. */
  canShowPiano: boolean;
  /** Icon-only trigger (the idle screen keeps its copy short). */
  compact?: boolean;
}

/** How Keel listens and what it shows. Actions live on the screen, not in here. */
export function JamOptions(p: JamOptionsProps) {
  const [open, setOpen] = useState(false);
  const wide = useMediaQuery('(min-width: 640px)');
  return (
    <>
      {p.compact ? (
        <Button
          variant="plain"
          icon
          round
          aria-label="Listening options"
          title="Listening options"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <SlidersHorizontal className="size-5" aria-hidden />
        </Button>
      ) : (
        <Button
          variant="plain"
          leading={<SlidersHorizontal className="size-4" aria-hidden />}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          Listening options
        </Button>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Listening options"
        placement={wide ? 'center' : 'bottom'}
      >
        <div className="flex flex-col gap-6 py-4">
          <Group>
            <Row
              label="Microphone sensitivity"
              stacked
              accessory={
                <Slider
                  aria-label="Microphone sensitivity"
                  min={0}
                  max={1}
                  step={0.05}
                  aria-valuetext={`${Math.round(p.sensitivity * 100)}%`}
                  value={p.sensitivity}
                  onChange={p.onSensitivity}
                  minLabel="Quieter room"
                  maxLabel="Soft playing"
                />
              }
            />
            <Row
              label="Listen to"
              stacked
              accessory={
                <Segmented
                  fill
                  aria-label="Listen to"
                  value={p.mode}
                  onChange={p.onMode}
                  options={MODE_OPTIONS}
                />
              }
              detail={
                p.mode === 'room'
                  ? 'Follows the music around you, using simple chords.'
                  : 'Favors your selected instrument. Other music may still be heard.'
              }
            />
            <Row
              label="Instrument"
              stacked
              accessory={
                <Segmented
                  fill
                  aria-label="Instrument"
                  value={p.instrument}
                  onChange={p.onInstrument}
                  options={INSTRUMENT_OPTIONS}
                />
              }
            />
            <Row
              label="Record audio"
              detail={p.recordingLocked ? 'Choose before you start.' : undefined}
              accessory={
                <Switch
                  checked={p.recordAudio}
                  disabled={p.recordingLocked}
                  onChange={p.onRecordAudio}
                  aria-label="Record audio"
                />
              }
            />
          </Group>
          {(p.mode !== 'room' || p.canShowPiano) && (
            <Group>
              {/* With a band always shows simple chords, so there is no level to pick. */}
              {p.mode !== 'room' && (
                <Row
                  label="Chord detail"
                  stacked
                  accessory={
                    <Segmented
                      fill
                      aria-label="Chord detail"
                      value={p.vocabLevel}
                      onChange={p.onVocabLevel}
                      options={VOCAB_OPTIONS}
                    />
                  }
                />
              )}
              {p.canShowPiano && (
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
              )}
            </Group>
          )}
        </div>
      </Sheet>
    </>
  );
}
