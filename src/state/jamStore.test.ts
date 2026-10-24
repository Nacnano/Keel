import { beforeEach, describe, expect, it } from 'vitest';
import { C_MAJOR_KEY } from '@/core/mocks';
import type { AnalysisEvent, Chord, KeyEstimate } from '@/core';
import { initialJamData, jamStore, snapToChordStart } from './jamStore';

const C: Chord = { root: 0, quality: 'maj' };
const G: Chord = { root: 7, quality: 'maj' };
const GB: Chord = { root: 7, quality: 'maj', bass: 11 };
const A_MINOR: KeyEstimate = { ...C_MAJOR_KEY, tonic: 9, mode: 'minor', confidence: 0.7 };

const chord = (t: number, c: Chord | null, confidence = 0.9): AnalysisEvent => ({
  type: 'chord',
  t,
  chord: c,
  confidence,
  source: 'mic',
});

beforeEach(() => {
  jamStore.setState(initialJamData());
});

describe('jamStore.applyEvent', () => {
  it('appends chords only when the label changes, with session-relative t', () => {
    const s = jamStore.getState();
    s.startSession(100);
    s.applyEvent(chord(101, C));
    s.applyEvent(chord(101.5, C));
    s.applyEvent(chord(102, G));
    s.applyEvent(chord(102.5, GB));
    s.applyEvent(chord(103, C));
    const { timeline, currentChord, source } = jamStore.getState();
    expect(timeline.map((r) => r.t)).toEqual([1, 2, 2.5, 3]);
    expect(timeline.map((r) => r.chord)).toEqual([C, G, GB, C]);
    expect(timeline.every((r) => r.sessionId === jamStore.getState().sessionId)).toBe(true);
    expect(currentChord).toEqual(C);
    expect(source).toBe('mic');
  });

  it('shows null / low-confidence chords live but keeps them out of the timeline', () => {
    const s = jamStore.getState();
    s.startSession(0);
    s.applyEvent(chord(1, C));
    s.applyEvent(chord(2, null, 0));
    expect(jamStore.getState().currentChord).toBeNull();
    s.applyEvent(chord(3, G, 0.1));
    expect(jamStore.getState().currentChord).toEqual(G);
    expect(jamStore.getState().confidence).toBe(0.1);
    s.applyEvent(chord(4, C));
    expect(jamStore.getState().timeline).toHaveLength(1);
  });

  it('pushes key history only when tonic or mode changes', () => {
    const s = jamStore.getState();
    s.startSession(10);
    s.applyEvent({ type: 'key', t: 10, key: C_MAJOR_KEY });
    s.applyEvent({ type: 'key', t: 12, key: { ...C_MAJOR_KEY, confidence: 0.9 } });
    s.applyEvent({ type: 'key', t: 20, key: A_MINOR });
    s.applyEvent({ type: 'key', t: 21, key: A_MINOR });
    const { keyHistory, key } = jamStore.getState();
    expect(keyHistory.map((k) => [k.t, k.key.tonic, k.key.mode])).toEqual([
      [0, 0, 'major'],
      [10, 9, 'minor'],
    ]);
    expect(key).toEqual(A_MINOR);
  });

  it('tracks notes and level', () => {
    const s = jamStore.getState();
    s.applyEvent({ type: 'notes', t: 1, pitchClasses: [0, 4, 7], midiNotes: [60, 64, 67] });
    expect(jamStore.getState().exactKeys).toBe(true);
    s.applyEvent({ type: 'level', t: 1, energy: 0.4 });
    const st = jamStore.getState();
    expect(st.activePitchClasses).toEqual([0, 4, 7]);
    expect(st.activeMidiNotes).toEqual([60, 64, 67]);
    expect(st.level).toBe(0.4);
    s.applyEvent({ type: 'notes', t: 2, pitchClasses: [2] });
    expect(jamStore.getState().activeMidiNotes).toEqual([]);
  });

  it('starts a session lazily on the first event when startSession was not called', () => {
    jamStore.getState().applyEvent(chord(50, C));
    const st = jamStore.getState();
    expect(st.sessionStart).toBe(50);
    expect(st.sessionId).toBeTruthy();
    expect(st.timeline[0].t).toBe(0);
  });
});

describe('jamStore markers and lifecycle', () => {
  it('adds markers at an explicit or derived time', () => {
    const s = jamStore.getState();
    expect(s.addMarker('bookmark')).toBeNull(); // no session yet
    s.startSession(0);
    const m = jamStore.getState().addMarker('chorus', 'big one', 12.5);
    expect(m).toMatchObject({ kind: 'chorus', label: 'big one', t: 12.5 });
    jamStore.getState().addMarker('bookmark');
    const { markers, sessionId } = jamStore.getState();
    expect(markers).toHaveLength(2);
    expect(markers[1].kind).toBe('bookmark');
    expect(markers[1].label).toBeUndefined();
    expect(markers.every((x) => x.sessionId === sessionId)).toBe(true);
  });

  it('reset clears the timeline but keeps the current key as the first history entry', () => {
    const s = jamStore.getState();
    s.startSession(0);
    s.applyEvent({ type: 'key', t: 0, key: C_MAJOR_KEY });
    s.applyEvent(chord(1, C));
    s.applyEvent(chord(2, G));
    s.addMarker('bookmark', undefined, 1);
    s.reset();
    const st = jamStore.getState();
    expect(st.timeline).toEqual([]);
    expect(st.markers).toEqual([]);
    expect(st.currentChord).toBeNull();
    expect(st.keyHistory).toEqual([{ t: 0, key: C_MAJOR_KEY }]);
    expect(st.status).toBe('listening');
  });

  it('stopSession keeps the timeline for review and clears live notes', () => {
    const s = jamStore.getState();
    s.startSession(0);
    s.applyEvent(chord(1, C));
    s.applyEvent({ type: 'notes', t: 1, pitchClasses: [0, 4, 7] });
    s.stopSession();
    const st = jamStore.getState();
    expect(st.status).toBe('idle');
    expect(st.timeline).toHaveLength(1);
    expect(st.activePitchClasses).toEqual([]);
  });

  it('status, source and record toggle', () => {
    const s = jamStore.getState();
    s.setStatus('error', 'Microphone blocked');
    expect(jamStore.getState()).toMatchObject({ status: 'error', error: 'Microphone blocked' });
    s.setStatus('starting', 'ignored');
    expect(jamStore.getState().error).toBeUndefined();
    s.setSource('midi');
    s.toggleRecordAudio();
    expect(jamStore.getState()).toMatchObject({ source: 'midi', recordAudio: true });
  });
});

describe('jamStore key reveal', () => {
  const E_MAJOR: KeyEstimate = { ...C_MAJOR_KEY, tonic: 4, confidence: 0.8 };
  const B_MAJOR: KeyEstimate = { ...C_MAJOR_KEY, tonic: 11, confidence: 0.6 };
  const keys = () => jamStore.getState().keyHistory.map((k) => [k.t, k.key.tonic]);
  const level = (t: number): AnalysisEvent => ({ type: 'level', t, energy: 0.3 });

  it('labels the song from its start with the first key', () => {
    const s = jamStore.getState();
    s.startSession(0);
    s.applyEvent(chord(0.5, C));
    s.applyEvent(level(4));
    s.applyEvent({ type: 'key', t: 1.5, key: C_MAJOR_KEY });
    expect(keys()).toEqual([[0, 0]]);
  });

  it('replaces a key that changes within 10 s instead of adding a chip', () => {
    const s = jamStore.getState();
    s.startSession(0);
    s.applyEvent(level(2));
    s.applyEvent({ type: 'key', t: 1.6, key: B_MAJOR });
    s.applyEvent(level(8.2));
    s.applyEvent({ type: 'key', t: 6, key: E_MAJOR });
    expect(keys()).toEqual([[0, 4]]);
    expect(jamStore.getState().key).toEqual(E_MAJOR);
    // a change after the key has held 10 s is a real one
    s.applyEvent(level(30));
    s.applyEvent({ type: 'key', t: 27, key: C_MAJOR_KEY });
    expect(keys()).toEqual([
      [0, 4],
      [27, 0],
    ]);
    // ...and a detour back within 10 s folds into the key before it
    s.applyEvent(level(33));
    s.applyEvent({ type: 'key', t: 31, key: E_MAJOR });
    expect(keys()).toEqual([[0, 4]]);
  });

  it('takes the engine word for a superseded key when the event says so', () => {
    const s = jamStore.getState();
    s.startSession(0);
    s.applyEvent(level(5));
    s.applyEvent({ type: 'key', t: 1, key: B_MAJOR });
    s.applyEvent(level(40));
    s.applyEvent({ type: 'key', t: 38, key: E_MAJOR, supersedes: 1 });
    expect(keys()).toEqual([[0, 4]]);
  });

  it('labels a new song from where New song was marked', () => {
    const s = jamStore.getState();
    s.startSession(0);
    s.applyEvent(level(5));
    s.applyEvent({ type: 'key', t: 1, key: C_MAJOR_KEY });
    s.applyEvent(level(30));
    s.clearKey(29.5);
    expect(jamStore.getState().key).toBeNull();
    s.applyEvent(level(32));
    s.applyEvent({ type: 'key', t: 31, key: E_MAJOR });
    expect(keys()).toEqual([
      [0, 0],
      [29.5, 4],
    ]);
  });
});

describe('snapToChordStart', () => {
  const rec = (t: number) => ({
    id: String(t),
    sessionId: 's',
    t,
    chord: C,
    confidence: 1,
    source: 'mic' as const,
    manual: false,
  });

  it('snaps to a chord that began within 2 s, else keeps the tap time', () => {
    const timeline = [rec(1), rec(4)];
    expect(snapToChordStart(timeline, 5.5)).toBe(4);
    expect(snapToChordStart(timeline, 6.5)).toBe(6.5);
    expect(snapToChordStart(timeline, 0.5)).toBe(0.5);
    expect(snapToChordStart([], 3)).toBe(3);
  });
});
