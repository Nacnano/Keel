import { Button } from '../../components/Button';
import { PlayIcon } from '../../components/icons';
import { Segmented } from '../../components/Segmented';
import { Switch } from '../../components/Switch';
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

const PauseIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden fill="currentColor">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

const SOURCE_LABEL: Record<ClockSource, string> = {
  audio: 'Recording',
  midi: 'MIDI piano',
  timer: 'Silent',
};

/** Play/pause, skip, seek slider, speed and the MIDI piano switch. Fully keyboard operable. */
export function Transport(p: TransportProps) {
  const pianoNote =
    p.piano === 'loading'
      ? 'Loading piano sound…'
      : p.piano === 'error'
        ? 'Piano sound unavailable (offline?)'
        : p.hasAudio
          ? 'Play the recorded MIDI along with the audio'
          : 'Hear the recorded MIDI on a sampled piano';

  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Transport">
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="icon"
          className="size-14 rounded-full"
          aria-label={p.playing ? 'Pause' : 'Play'}
          title={p.playing ? 'Pause (Space)' : 'Play (Space)'}
          onClick={p.onToggle}
        >
          {p.playing ? <PauseIcon /> : <PlayIcon size={22} />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Back ${SKIP_SEC} seconds`}
          title="Back 5 s (←)"
          onClick={() => p.onSeek(p.time - SKIP_SEC)}
        >
          −5
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Forward ${SKIP_SEC} seconds`}
          title="Forward 5 s (→)"
          onClick={() => p.onSeek(p.time + SKIP_SEC)}
        >
          +5
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="w-12 text-right text-sm text-zinc-300 tabular-nums" aria-hidden>
            {clockLabel(p.time)}
          </span>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={Math.max(0.1, p.duration)}
            step={0.1}
            value={Math.min(p.time, p.duration)}
            aria-valuetext={`${clockLabel(p.time)} of ${clockLabel(p.duration)}`}
            onChange={(e) => p.onSeek(Number(e.target.value))}
            className="h-11 min-w-0 flex-1 cursor-pointer accent-violet-400"
          />
          <span className="w-12 text-sm text-zinc-500 tabular-nums" aria-hidden>
            {clockLabel(p.duration)}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Segmented
          aria-label="Playback speed"
          options={RATE_OPTIONS}
          value={p.rate as (typeof RATES)[number]}
          onChange={p.onRate}
        />
        <span className="text-xs text-zinc-500" data-testid="clock-source">
          Clock: {SOURCE_LABEL[p.source]}
        </span>
        {p.hasMidi && (
          <div className="min-w-60 flex-1 sm:max-w-sm">
            <Switch
              label="Piano sound"
              description={pianoNote}
              checked={p.pianoOn}
              onChange={p.onPiano}
            />
          </div>
        )}
      </div>
    </div>
  );
}
