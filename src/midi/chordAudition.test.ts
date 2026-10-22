import { afterEach, describe, expect, it, vi } from 'vitest';
import { chordToMidiNotes, playChord } from './chordAudition';

afterEach(() => {
  vi.useRealTimers();
});

describe('chordToMidiNotes', () => {
  it('voices triads and sevenths close-position from the root octave', () => {
    expect(chordToMidiNotes({ root: 0, quality: 'maj' })).toEqual([60, 64, 67]);
    expect(chordToMidiNotes({ root: 9, quality: 'min7' })).toEqual([69, 72, 76, 79]);
    expect(chordToMidiNotes({ root: 7, quality: '7' }, 3)).toEqual([55, 59, 62, 65]);
  });

  it('puts extensions in the next octave and drops the third of an 11 chord', () => {
    expect(chordToMidiNotes({ root: 0, quality: 'add9' })).toEqual([60, 64, 67, 74]);
    expect(chordToMidiNotes({ root: 0, quality: '13' })).toEqual([60, 64, 67, 70, 74, 81]);
    expect(chordToMidiNotes({ root: 0, quality: '6/9' })).toEqual([60, 64, 67, 69, 74]);
    expect(chordToMidiNotes({ root: 0, quality: '11' })).toEqual([60, 67, 70, 74, 77]);
  });

  it('adds the slash bass an octave below', () => {
    expect(chordToMidiNotes({ root: 0, quality: 'maj', bass: 4 })).toEqual([52, 60, 64, 67]);
    expect(chordToMidiNotes({ root: 2, quality: 'min', bass: 0 })).toEqual([48, 62, 65, 69]);
  });
});

describe('playChord', () => {
  it('plays all notes and releases them after durationMs', () => {
    vi.useFakeTimers();
    const player = { noteOn: vi.fn(), noteOff: vi.fn() };
    playChord(player, { root: 0, quality: 'maj' }, { durationMs: 500, velocity: 70 });
    expect(player.noteOn.mock.calls).toEqual([
      [60, 70],
      [64, 70],
      [67, 70],
    ]);
    vi.advanceTimersByTime(499);
    expect(player.noteOff).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(player.noteOff.mock.calls.map((c) => c[0])).toEqual([60, 64, 67]);
  });

  it('can be released early, exactly once', () => {
    vi.useFakeTimers();
    const player = { noteOn: vi.fn(), noteOff: vi.fn() };
    const release = playChord(player, { root: 5, quality: 'sus4' });
    expect(player.noteOn.mock.calls[0]).toEqual([65, 80]);
    release();
    release();
    vi.advanceTimersByTime(2000);
    expect(player.noteOff).toHaveBeenCalledTimes(3);
  });
});
