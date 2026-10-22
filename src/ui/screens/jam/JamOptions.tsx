import { useState } from 'react';
import { Link } from 'react-router';
import { SlidersHorizontal } from 'lucide-react';
import type { JamMode, MarkerKind, VocabLevel } from '@/core';
import { Button, Group, Row, Segmented, Sheet, Slider, Switch } from '../../kit';
import { MARKER_LABEL, SECTION_KINDS } from '../../lib/markers';

export interface JamOptionsProps {
  vocabLevel: VocabLevel;
  onVocabLevel(level: VocabLevel): void;
  mode: JamMode;
  onMode(mode: JamMode): void;
  sensitivity: number;
  onSensitivity(value: number): void;
  recordAudio: boolean;
  recordingLocked: boolean;
  onRecordAudio(on: boolean): void;
  pianoVisible: boolean;
  onPianoVisible(on: boolean): void;
  onReset(): void;
  canReset: boolean;
  listening: boolean;
  onSection(kind: MarkerKind): void;
  inputLabel: string;
}

/** Input help and less frequent choices, in a sheet with room for readable controls. */
export function JamOptions(p: JamOptionsProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="plain"
        leading={<SlidersHorizontal className="size-4" aria-hidden />}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        Listening options
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Listening options">
        <div className="flex flex-col gap-6 py-4">
          <div className="px-1">
            <p className="text-headline font-semibold">{p.inputLabel}</p>
            <p className="mt-1 text-subhead text-label-2">
              Place your device near the instrument. Play a full chord and hold it briefly.
            </p>
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex min-h-11 items-center text-subhead font-medium text-accent"
            >
              Choose an input device
            </Link>
          </div>
          <Group title="Listening">
            <Row
              label="Microphone sensitivity"
              detail="Raise it for soft playing; lower it if room noise becomes chords."
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
                  minLabel="Less sensitive"
                  maxLabel="More sensitive"
                />
              }
            />
            <Row
              label="Listen to"
              stacked
              accessory={
                <Segmented
                  fill
                  aria-label="Listening mode"
                  value={p.mode}
                  onChange={p.onMode}
                  options={[
                    { value: 'solo', label: 'Just me' },
                    { value: 'room', label: 'The room' },
                  ]}
                />
              }
              detail="The room follows a band or a song playing nearby."
            />
            <Row
              label="Record audio"
              detail={
                p.recordingLocked
                  ? 'Choose before starting a session.'
                  : 'Keep audio with your chord chart, on this device.'
              }
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
          <Group title="Display">
            <Row
              label="Chord detail"
              stacked
              accessory={
                <Segmented
                  fill
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
          {p.listening && (
            <Group title="Mark a section">
              {SECTION_KINDS.map((kind) => (
                <Row
                  key={kind}
                  label={MARKER_LABEL[kind]}
                  onClick={() => {
                    p.onSection(kind);
                    setOpen(false);
                  }}
                />
              ))}
            </Group>
          )}
          {p.canReset && (
            <Button
              variant="plain"
              destructive
              onClick={() => {
                p.onReset();
                setOpen(false);
              }}
            >
              Clear timeline
            </Button>
          )}
        </div>
      </Sheet>
    </>
  );
}
