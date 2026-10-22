import { describe, expect, it } from 'vitest';
import { parseMidiMessage } from './parse';

const clock = { fromPerformanceMs: (ms: number) => ms / 1000 + 10 };
const bytes = (...b: number[]) => new Uint8Array(b);

describe('parseMidiMessage', () => {
  it('parses note on with channel and maps the timestamp through the clock', () => {
    expect(parseMidiMessage(bytes(0x93, 60, 100), 500, clock)).toEqual({
      t: 10.5,
      type: 'on',
      note: 60,
      velocity: 100,
      channel: 3,
    });
  });

  it('parses note off and keeps the release velocity', () => {
    expect(parseMidiMessage(bytes(0x80, 64, 40), 0, clock)).toEqual({
      t: 10,
      type: 'off',
      note: 64,
      velocity: 40,
      channel: 0,
    });
  });

  it('treats note on with velocity 0 as note off', () => {
    expect(parseMidiMessage(bytes(0x90, 67, 0), 1000, clock)).toEqual({
      t: 11,
      type: 'off',
      note: 67,
      velocity: 0,
      channel: 0,
    });
  });

  it('parses CC64 sustain', () => {
    expect(parseMidiMessage(bytes(0xb0, 64, 127), 0, clock)).toEqual({
      t: 10,
      type: 'cc',
      controller: 64,
      value: 127,
      channel: 0,
    });
    expect(parseMidiMessage(bytes(0xbf, 64, 0), 0, clock)).toMatchObject({
      type: 'cc',
      value: 0,
      channel: 15,
    });
  });

  it('ignores other message types and malformed input', () => {
    expect(parseMidiMessage(bytes(0xe0, 0, 64), 0, clock)).toBeNull(); // pitch bend
    expect(parseMidiMessage(bytes(0xa0, 60, 10), 0, clock)).toBeNull(); // poly aftertouch
    expect(parseMidiMessage(bytes(0xc0, 5), 0, clock)).toBeNull(); // program change
    expect(parseMidiMessage(bytes(0xd0, 20), 0, clock)).toBeNull(); // channel pressure
    expect(parseMidiMessage(bytes(0xf8), 0, clock)).toBeNull(); // timing clock
    expect(parseMidiMessage(bytes(0xfe), 0, clock)).toBeNull(); // active sensing
    expect(parseMidiMessage(bytes(0xf0, 0x7e, 0xf7), 0, clock)).toBeNull(); // sysex
    expect(parseMidiMessage(bytes(60, 100, 0), 0, clock)).toBeNull(); // running status
    expect(parseMidiMessage(bytes(0x90, 60), 0, clock)).toBeNull(); // truncated
    expect(parseMidiMessage(null, 0, clock)).toBeNull();
  });

  it('uses the shared clock by default', () => {
    const e = parseMidiMessage(bytes(0x90, 60, 1), 2000);
    expect(e?.t).toBeTypeOf('number');
  });
});
