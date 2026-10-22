/**
 * Review playback controller (framework-free). One master clock drives the playhead:
 *
 *   audio recording (an <audio> element)  >  MIDI player (when "piano" is on)  >  plain timer
 *
 * With audio as master the MIDI player, if enabled, follows it and is re-seeked on drift. When
 * the MIDI performance ends before the session does (or the piano fails to load), the timer
 * takes over from that point so the playhead keeps moving to the end of the session.
 */
import type { MidiEvent } from '@/core';
import type { PianoPlayer } from '@/midi';

export type ClockSource = 'audio' | 'midi' | 'timer';
export type PianoStatus = 'off' | 'idle' | 'loading' | 'ready' | 'error';

export interface PlaybackState {
  time: number;
  playing: boolean;
  rate: number;
  source: ClockSource;
  pianoOn: boolean;
  piano: PianoStatus;
}

/** The bits of HTMLMediaElement the controller uses (keeps tests simple). */
export interface MediaLike {
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  play(): Promise<void> | void;
  pause(): void;
}

export interface PlaybackDeps {
  duration: number;
  getAudio(): MediaLike | null;
  midiEvents: readonly MidiEvent[] | null;
  /** Lazily builds the piano (called on first use). */
  createPlayer(): PianoPlayer;
  /** Seconds, monotonic. */
  now(): number;
  /** Whether the piano starts enabled. Default: only when there is no audio. */
  pianoOn?: boolean;
  onChange(state: PlaybackState): void;
}

export interface PlaybackController {
  getState(): PlaybackState;
  /** Current position from the master clock. */
  position(): number;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(t: number): void;
  setRate(rate: number): void;
  setPianoOn(on: boolean): void;
  /** Call once per animation frame while playing. Returns the position. */
  tick(): number;
  /** Audio element reached its end. */
  handleAudioEnded(): void;
  dispose(): void;
}

/** Re-seek the following piano when it drifts further than this from the audio. */
export const MAX_DRIFT_SEC = 0.25;

export function createPlaybackController(deps: PlaybackDeps): PlaybackController {
  const { duration } = deps;
  const hasMidi = !!deps.midiEvents?.length;
  const events = (deps.midiEvents ?? []) as MidiEvent[];

  let rate = 1;
  let playing = false;
  let pos = 0; // position while paused / last anchor
  let timerAnchorPos = 0;
  let timerAnchorWall = 0;
  let pianoOn = hasMidi && (deps.pianoOn ?? !deps.getAudio());
  let piano: PianoStatus = pianoOn ? 'idle' : 'off';
  let player: PianoPlayer | null = null;
  let offEnd: (() => void) | null = null;
  /** MIDI master finished (or failed) mid-session: the timer carries on. */
  let midiHandedOff = false;
  let lastSent = '';

  const clamp = (t: number) => Math.min(duration, Math.max(0, t));
  const audio = () => deps.getAudio();

  const source = (): ClockSource => {
    if (audio()) return 'audio';
    if (pianoOn && piano !== 'error') return 'midi';
    return 'timer';
  };

  const timerPos = () =>
    playing ? timerAnchorPos + (deps.now() - timerAnchorWall) * rate : timerAnchorPos;
  const anchorTimer = (at: number) => {
    timerAnchorPos = at;
    timerAnchorWall = deps.now();
  };

  const position = (): number => {
    if (!playing) return pos;
    switch (source()) {
      case 'audio':
        return clamp(audio()!.currentTime);
      case 'midi':
        if (midiHandedOff || !player) return clamp(timerPos());
        return clamp(player.position());
      default:
        return clamp(timerPos());
    }
  };

  const state = (): PlaybackState => ({
    time: position(),
    playing,
    rate,
    source: source(),
    pianoOn,
    piano,
  });
  const emit = () => {
    const s = state();
    const sig = `${s.time}|${s.playing}|${s.rate}|${s.source}|${s.pianoOn}|${s.piano}`;
    if (sig === lastSent) return;
    lastSent = sig;
    deps.onChange(s);
  };
  const setPiano = (p: PianoStatus) => {
    if (piano !== p) {
      piano = p;
      emit();
    }
  };

  const getPlayer = (): PianoPlayer => {
    if (!player) {
      player = deps.createPlayer();
      offEnd = player.onEnd(() => {
        if (source() === 'midi' && playing) {
          midiHandedOff = true;
          anchorTimer(Math.max(player?.duration() ?? 0, pos));
        }
      });
    }
    return player;
  };

  const startPiano = (from: number) => {
    const p = getPlayer();
    if (!p.isLoaded()) {
      setPiano('loading');
      p.load().then(
        () => setPiano('ready'),
        (err: unknown) => {
          console.error('[review] piano failed to load', err);
          const at = position();
          setPiano('error');
          if (playing) anchorTimer(at);
          p.stop();
        },
      );
    } else {
      setPiano('ready');
    }
    midiHandedOff = false;
    p.play(events, { from, rate });
  };

  const api: PlaybackController = {
    getState: state,
    position,

    play() {
      if (playing) return;
      if (pos >= duration - 0.05) pos = 0;
      playing = true;
      anchorTimer(pos);
      const a = audio();
      if (a) {
        a.currentTime = pos;
        a.playbackRate = rate;
        const r = a.play();
        if (r && typeof (r as Promise<void>).catch === 'function') {
          (r as Promise<void>).catch((err: unknown) => {
            console.error('[review] audio playback failed', err);
            api.pause();
          });
        }
      }
      if (pianoOn && piano !== 'error') startPiano(pos);
      emit();
    },

    pause() {
      if (!playing) return;
      pos = position();
      playing = false;
      anchorTimer(pos);
      audio()?.pause();
      player?.pause();
      emit();
    },

    toggle() {
      if (playing) api.pause();
      else api.play();
    },

    seek(t) {
      const target = clamp(t);
      pos = target;
      anchorTimer(target);
      const a = audio();
      if (a) a.currentTime = target;
      if (playing && pianoOn && player && piano !== 'error') {
        if (midiHandedOff || !player.isPlaying()) startPiano(target);
        else player.seek(target);
      }
      emit();
    },

    setRate(next) {
      if (!(next > 0) || next === rate) return;
      const at = position();
      anchorTimer(at);
      rate = next;
      const a = audio();
      if (a) a.playbackRate = next;
      player?.setRate(next);
      emit();
    },

    setPianoOn(on) {
      if (!hasMidi || on === pianoOn) return;
      const wasPlaying = playing;
      const at = position();
      if (wasPlaying) api.pause();
      pianoOn = on;
      piano = on ? (player?.isLoaded() ? 'ready' : 'idle') : 'off';
      pos = at;
      anchorTimer(at);
      if (wasPlaying) api.play();
      else emit();
    },

    tick() {
      if (!playing) return pos;
      const t = position();
      const a = audio();
      // Keep a following piano locked to the audio.
      if (a && pianoOn && player?.isPlaying() && Math.abs(player.position() - t) > MAX_DRIFT_SEC) {
        player.seek(t);
      }
      if (t >= duration) {
        api.pause();
        pos = duration;
        emit();
        return duration;
      }
      emit();
      return t;
    },

    handleAudioEnded() {
      api.pause();
    },

    dispose() {
      playing = false;
      audio()?.pause();
      offEnd?.();
      if (player) {
        player.stop();
        void player
          .getContext()
          ?.close?.()
          .catch(() => {});
      }
      player = null;
    },
  };
  return api;
}
