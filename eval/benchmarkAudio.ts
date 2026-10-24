import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

export const sha256 = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');

/** Small lossless fixtures; no decoder, ffmpeg, network or sample fallback in CI. */
export function readFixture(path: string, expectedHash: string) {
  const packed = readFileSync(path);
  if (sha256(packed) !== expectedHash) throw new Error(`Fixture checksum mismatch: ${path}`);
  const b = gunzipSync(packed);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error(`Not a WAV: ${path}`);
  let sampleRate = 0,
    channels = 0,
    bits = 0,
    format = 0;
  for (let off = 12; off + 8 <= b.length;) {
    const id = b.toString('ascii', off, off + 4),
      size = b.readUInt32LE(off + 4),
      start = off + 8;
    if (start + size > b.length) throw new Error(`Truncated WAV: ${path}`);
    if (id === 'fmt ') {
      if (size < 16) throw new Error('Invalid WAV format');
      format = b.readUInt16LE(start);
      channels = b.readUInt16LE(start + 2);
      sampleRate = b.readUInt32LE(start + 4);
      bits = b.readUInt16LE(start + 14);
    }
    if (id === 'data') {
      if (
        format !== 1 ||
        channels !== 1 ||
        bits !== 16 ||
        ![16000, 44100, 48000].includes(sampleRate) ||
        size % 2
      )
        throw new Error(`Expected mono PCM16 at a supported rate: ${path}`);
      const samples = new Float32Array(size / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = b.readInt16LE(start + i * 2) / 32768;
      if (!samples.length) throw new Error(`Empty WAV: ${path}`);
      return { samples, sampleRate };
    }
    off = start + size + (size & 1);
  }
  throw new Error(`Missing WAV data: ${path}`);
}

export function packFixture(samples: Float32Array, sampleRate: number) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++)
    b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32768))), 44 + i * 2);
  return gzipSync(b, { level: 9 });
}

/** Upsampling only in the benchmark (16/44.1 -> 44.1/48), with unchanged wall times. */
export function resample(samples: Float32Array, from: number, to: number) {
  if (from === to) return samples.slice();
  if (to < from) throw new Error('Benchmark resampler only supports upsampling');
  const out = new Float32Array(Math.round((samples.length * to) / from));
  for (let i = 0; i < out.length; i++) {
    const p = (i * from) / to,
      j = Math.floor(p),
      mix = p - j;
    out[i] = samples[j] * (1 - mix) + samples[Math.min(j + 1, samples.length - 1)] * mix;
  }
  return out;
}
