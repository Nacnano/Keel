import { describe, expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { packFixture } from './benchmarkAudio';
import { decodeRealJamWav, float32LE } from './realJamAudio';

// Independently written interleaved stereo PCM16 frames: [L,R] = [.5,-.25],[-1,.5].
function stereo() {
  const bytes = Buffer.alloc(52);
  bytes.write('RIFF');
  bytes.writeUInt32LE(44, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(44100, 24);
  bytes.writeUInt32LE(176400, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(8, 40);
  [16384, -8192, -32768, 16384].forEach((v, i) => bytes.writeInt16LE(v, 44 + i * 2));
  return bytes;
}

describe('real-jam deterministic WAV input', () => {
  it('averages channels before resampling and preserves excerpt timing without gain normalization', () => {
    const decoded = decodeRealJamWav(stereo(), 0, 2 / 44100);
    expect(decoded.sampleRate).toBe(44100);
    expect([...decoded.samples]).toEqual([0.125, -0.25]);
    expect([...decodeRealJamWav(stereo(), 1 / 44100, 1 / 44100).samples]).toEqual([-0.25]);
  });
  it('decodes existing mono fixture encoding with unchanged quantized samples', () => {
    const bytes = gunzipSync(packFixture(new Float32Array([0, -0.5, 0.25]), 48000));
    expect([...decodeRealJamWav(bytes, 0, 3 / 48000).samples]).toEqual([0, -0.5, 0.25]);
  });
  it('fails corrupt, compressed, truncated or out-of-bounds sources instead of substituting audio', () => {
    expect(() => decodeRealJamWav(Buffer.alloc(100), 0, 1)).toThrow(/RIFF/);
    expect(() => decodeRealJamWav(stereo().subarray(0, 50), 0, 1 / 44100)).toThrow(/Truncated/);
    expect(() => decodeRealJamWav(stereo(), 0, 3 / 44100)).toThrow(/exceeds/);
    const compressed = stereo();
    compressed.writeUInt16LE(85, 20);
    expect(() => decodeRealJamWav(compressed, 0, 1 / 44100)).toThrow(/supported/);
  });
  it('hashes explicit little-endian float samples for same-input comparisons', () => {
    expect(float32LE(new Float32Array([0.5, -0.25])).toString('hex')).toBe('0000003f000080be');
  });
});
