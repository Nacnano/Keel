import { useId } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button, Segmented, Slider, Switch } from '../../kit';
import type { ClockSource, PianoStatus } from './playback';
import { clockLabel } from './timeline';

export interface TransportProps {
  time: number;
  duration: number;
  playing: boolean;
  rate: number;
  source: ClockSource;
  hasMidi: boolean;
  hasAudio: boolean;
  pianoOn: boolean;
  piano: PianoStatus;
  onToggle(): void;
  onSeek(t: number): void;
  onRate(rate: number): void;
  onPiano(on: boolean): void;
}

const RATES = [0.5, 0.75, 1] as const;
const RATE_OPTIONS = RATES.map((r) => ({ value: r, label: `${r}×`, title: `Speed ${r}×` }));
const SKIP_SEC = 5;

const SOURCE_LABEL: Record<ClockSource, string> = {
  audio: 'Recorded audio',
  midi: 'Piano playback',
  timer: 'Chord chart only · no audio recording',
};

/**
 * One row: play/pause, skip, time, seek slider, speed and (with MIDI) the piano-sound switch.
 * A caption underneath says what is driving the clock. Fully keyboard operable.
 */
export function Transport(p: TransportProps) {
  const pianoLabel = useId();
  const pianoNote =
    p.piano === 'loading'
      ? 'Loading piano sound…'
      : p.piano === 'error'
        ? 'Piano sound unavailable (offline?)'
        : p.hasAudio
          ? 'Plays the recorded MIDI along with the audio'
          : 'Hear the recorded MIDI on a sampled piano';

  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label="Transport">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
        <Button
          variant="filled"
          size="lg"
          icon
          round
          aria-label={p.playing ? 'Pause' : 'Play'}
          title={p.playing ? 'Pause (Space)' : 'Play (Space)'}
          onClick={p.onToggle}
        >
          {p.playing ? (
            <Pause className="size-5 fill-current" aria-hidden />
          ) : (
            <Play className="size-5 translate-x-px fill-current" aria-hidden />
          )}
        </Button>
        <Button
          variant="plain"
          icon
          aria-label={`Back ${SKIP_SEC} seconds`}
          title="Back 5 s (←)"
          className="font-semibold tabular"
          onClick={() => p.onSeek(p.time - SKIP_SEC)}
        >
          −5
        </Button>
        <Button
          variant="plain"
          icon
          aria-label={`Forward ${SKIP_SEC} seconds`}
          title="Forward 5 s (→)"
          className="font-semibold tabular"
          onClick={() => p.onSeek(p.time + SKIP_SEC)}
        >
          +5
        </Button>

        <div className="flex min-w-48 flex-1 items-center gap-3 px-1">
          <span className="text-subhead text-label tabular" aria-hidden>
            {clockLabel(p.time)}
          </span>
          <Slider
            aria-label="Seek"
            min={0}
            max={Math.max(0.1, p.duration)}
            step={0.1}
            value={Math.min(p.time, p.duration)}
            aria-valuetext={`${clockLabel(p.time)} of ${clockLabel(p.duration)}`}
            onChange={p.onSeek}
            className="min-w-0 flex-1"
          />
          <span className="text-subhead text-label-2 tabular" aria-hidden>
            {clockLabel(p.duration)}
          </span>
        </div>

        <Segmented
          size="sm"
          aria-label="Playback speed"
          options={RATE_OPTIONS}
          value={p.rate as (typeof RATES)[number]}
          onChange={p.onRate}
        />
        {p.hasMidi && (
          <span className="flex items-center gap-2 pl-2">
            <span id={pianoLabel} className="text-subhead text-label">
              Piano sound
            </span>
            <Switch checked={p.pianoOn} onChange={p.onPiano} aria-labelledby={pianoLabel} />
          </span>
        )}
      </div>
      <p className="text-caption text-label-3">
        <span data-testid="clock-source">{SOURCE_LABEL[p.source]}</span>
        {p.hasMidi && <span> · {pianoNote}</span>}
      </p>
    </div>
  );
}
