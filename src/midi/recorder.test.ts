import { describe, expect, it } from 'vitest';
import { midiChordEvents } from '@/core/testing/midi';
import type { MidiEvent } from '@/core/types';
import { createMidiRecorder } from './recorder';

describe('createMidiRecorder', () => {
  it('round-trips events relative to t0', () => {
    const r = createMidiRecorder();
    const performance = midiChordEvents([60, 64, 67], 105.25, 1.5);
    r.start(100);
    expect(r.isRecording()).toBe(true);
    for (const e of performance) r.push(e);
    r.push({ t: 106, type: 'cc', controller: 64, value: 127, channel: 0 });
    const events = r.stop();
    expect(r.isRecording()).toBe(false);

    expect(events).toHaveLength(7);
    expect(events.slice(0, 3).map((e) => e.t)).toEqual([5.25, 5.25, 5.25]);
    expect(events[3]).toEqual({ t: 6, type: 'cc', controller: 64, value: 127, channel: 0 });
    expect(events.slice(4).every((e) => e.type === 'off' && e.t === 6.75)).toBe(true);

    // shifting back by t0 reproduces the original performance
    const restored = events.filter((e) => e.type !== 'cc').map((e) => ({ ...e, t: e.t + 100 }));
    expect(restored).toEqual(performance);

    const track = r.toTrack('session-1');
    expect(track.sessionId).toBe('session-1');
    expect(track.events).toEqual(events);
  });

  it('ignores events outside recording and clamps pre-start stamps to 0', () => {
    const r = createMidiRecorder();
    r.push({ t: 1, type: 'on', note: 60, velocity: 90, channel: 0 });
    expect(r.events()).toEqual([]);
    r.start(10);
    r.push({ t: 9.99, type: 'on', note: 60, velocity: 90, channel: 0 });
    expect(r.events()[0].t).toBe(0);
  });

  it('keeps events sorted even if pushed out of order', () => {
    const r = createMidiRecorder();
    r.start(0);
    r.push({ t: 2, type: 'on', note: 62, velocity: 90, channel: 0 });
    r.push({ t: 1, type: 'on', note: 60, velocity: 90, channel: 0 });
    expect(r.events().map((e) => e.t)).toEqual([1, 2]);
  });

  it('stop/restart starts a fresh take with a new t0', () => {
    const r = createMidiRecorder();
    r.start(0);
    r.push({ t: 1, type: 'on', note: 60, velocity: 90, channel: 0 });
    r.stop();
    r.push({ t: 2, type: 'on', note: 61, velocity: 90, channel: 0 }); // dropped
    expect(r.events()).toHaveLength(1);

    r.start(50);
    expect(r.events()).toEqual([]);
    r.push({ t: 51, type: 'on', note: 62, velocity: 90, channel: 0 });
    expect(r.stop()).toEqual([{ t: 1, type: 'on', note: 62, velocity: 90, channel: 0 }]);
  });

  it('stop(t) closes notes and pedal left down', () => {
    const r = createMidiRecorder();
    r.start(10);
    r.push({ t: 11, type: 'cc', controller: 64, value: 127, channel: 2 });
    r.push({ t: 11, type: 'on', note: 60, velocity: 90, channel: 2 });
    r.push({ t: 11, type: 'on', note: 64, velocity: 90, channel: 2 });
    r.push({ t: 12, type: 'off', note: 64, velocity: 0, channel: 2 });
    const events = r.stop(14);
    const tail: MidiEvent[] = events.filter((e) => e.t === 4);
    expect(tail).toEqual([
      { t: 4, type: 'off', note: 60, velocity: 0, channel: 2 },
      { t: 4, type: 'cc', controller: 64, value: 0, channel: 2 },
    ]);
  });
});
