/** Deterministic local decoding for downloaded PCM WAV research excerpts. No ffmpeg/network. */
export function decodeRealJamWav(bytes: Buffer, startSec: number, durationSec: number) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('Real-jam source must be a RIFF WAV');
  if (
    !Number.isFinite(startSec) ||
    startSec < 0 ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0
  )
    throw new Error('Invalid real-jam excerpt interval');
  let format = 0,
    channels = 0,
    sampleRate = 0,
    bits = 0,
    dataStart = 0,
    dataSize = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4),
      start = offset + 8;
    if (start + size > bytes.length) throw new Error('Truncated real-jam WAV');
    const id = bytes.toString('ascii', offset, offset + 4);
    if (id === 'fmt ') {
      if (size < 16) throw new Error('Invalid real-jam WAV format');
      format = bytes.readUInt16LE(start);
      channels = bytes.readUInt16LE(start + 2);
      sampleRate = bytes.readUInt32LE(start + 4);
      bits = bytes.readUInt16LE(start + 14);
      if (format === 65534) {
        if (size < 40) throw new Error('Invalid extensible WAV format');
        format = bytes.readUInt32LE(start + 24);
      }
    }
    if (id === 'data') {
      dataStart = start;
      dataSize = size;
    }
    offset = start + size + (size & 1);
  }
  if (
    !dataStart ||
    channels < 1 ||
    channels > 32 ||
    ![16000, 22050, 44100, 48000].includes(sampleRate) ||
    !((format === 1 && [8, 16, 24, 32].includes(bits)) || (format === 3 && bits === 32))
  )
    throw new Error('Expected supported PCM or float32 real-jam WAV');
  const frameBytes = (channels * bits) / 8;
  if (dataSize % frameBytes) throw new Error('Partial real-jam PCM frame');
  const first = Math.floor(startSec * sampleRate),
    length = Math.floor(durationSec * sampleRate);
  if (first + length > dataSize / frameBytes)
    throw new Error('Real-jam excerpt exceeds source duration');
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const offset = dataStart + (first + i) * frameBytes + (c * bits) / 8;
      const value =
        format === 3
          ? bytes.readFloatLE(offset)
          : bits === 8
            ? (bytes[offset] - 128) / 128
            : bytes.readIntLE(offset, bits / 8) / 2 ** (bits - 1);
      if (!Number.isFinite(value)) throw new Error('Non-finite real-jam source sample');
      sum += value;
    }
    samples[i] = sum / channels;
  }
  return { samples, sampleRate };
}

/** Explicit byte order keeps comparison fingerprints independent of host float representation. */
export function float32LE(samples: Float32Array): Buffer {
  const bytes = Buffer.alloc(samples.length * 4);
  for (let i = 0; i < samples.length; i++) bytes.writeFloatLE(samples[i], i * 4);
  return bytes;
}
