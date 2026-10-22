import { useEffect, useMemo, useState } from 'react';
import type { AudioRecording, MidiEvent } from '@/core';
import { createMidiPlayer } from '@/midi';
import { createPlaybackController, type PlaybackController, type PlaybackState } from './playback';

export interface UsePlaybackOptions {
  duration: number;
  recording?: AudioRecording | null;
  midiEvents?: readonly MidiEvent[] | null;
}

export interface Playback extends PlaybackState {
  controller: PlaybackController;
  /** True when a recording blob exists; render an <audio> with `attachAudio`. */
  hasAudio: boolean;
  /** Callback ref for the <audio> element. The hook sets its `src` from the blob. */
  attachAudio(el: HTMLAudioElement | null): void;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

const raf: (cb: () => void) => number =
  typeof requestAnimationFrame === 'function'
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 16) as unknown as number;
const caf: (id: number) => void =
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;

/**
 * Synced review playback: audio and/or MIDI piano, with a timer fallback. The audio element's
 * `src` is an object URL for the stored blob, revoked when the blob changes or on unmount.
 */
export function usePlayback({ duration, recording, midiEvents }: UsePlaybackOptions): Playback {
  const blob = recording?.blob ?? null;
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [snapshot, setSnapshot] = useState<{
    controller: PlaybackController;
    state: PlaybackState;
  } | null>(null);

  // The object URL lives exactly as long as this element + blob pairing.
  useEffect(() => {
    if (!audioEl || !blob || typeof URL.createObjectURL !== 'function') return;
    const url = URL.createObjectURL(blob);
    audioEl.setAttribute('src', url);
    return () => {
      audioEl.pause();
      audioEl.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  }, [audioEl, blob]);

  const audio = blob ? audioEl : null;
  const controller = useMemo(() => {
    const c: PlaybackController = createPlaybackController({
      duration,
      midiEvents: midiEvents ?? null,
      getAudio: () => audio,
      // With a recording the audio already has the piano in it; MIDI sound is opt-in.
      pianoOn: !blob,
      createPlayer: () => createMidiPlayer(),
      now,
      onChange: (state) => setSnapshot({ controller: c, state }),
    });
    return c;
  }, [duration, audio, blob, midiEvents]);

  useEffect(() => () => controller.dispose(), [controller]);

  const state =
    snapshot && snapshot.controller === controller ? snapshot.state : controller.getState();

  // Drive the playhead from the master clock while playing.
  useEffect(() => {
    if (!state.playing) return;
    let id = 0;
    const loop = () => {
      controller.tick();
      id = raf(loop);
    };
    id = raf(loop);
    return () => caf(id);
  }, [controller, state.playing]);

  return { ...state, controller, hasAudio: !!blob, attachAudio: setAudioEl };
}
