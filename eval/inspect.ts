/**
 * Print the displayed chord / key timeline of one session under one condition, next to the
 * ground truth. For debugging the detector.
 *
 *   tsx --tsconfig eval/tsconfig.json eval/inspect.ts <session-id> [condition] [solo|room] [level]
 *   (or: pnpm eval:inspect pop-C-block-90 laptop)
 */
import { writeFileSync } from 'node:fs';
import { createAnalysisEngine } from '@/analysis';
import { createChromaPipeline } from '@/audio/pipeline';
import { DEFAULT_ANALYSIS_CONFIG, MIN_DISPLAY_CONFIDENCE } from '@/core/constants';
import type { ChromaFrame, JamMode, VocabLevel } from '@/core/types';
import { chordSymbol, keyName } from '@/theory';
import { conditionById } from './conditions';
import { renderSession, SESSIONS } from './render';
import { linToDb, peak, rms } from './util';

const [id = 'pop-C-block-90', condId = 'clean', mode = 'solo', level = '2', ...flags] =
  process.argv.slice(2);
const spec = SESSIONS.find((s) => s.id === id);
if (!spec) throw new Error(`unknown session ${id}; one of ${SESSIONS.map((s) => s.id).join(', ')}`);

const sr = 48000;
const session = await renderSession(spec, sr);
const x = conditionById(condId).apply(session.samples, {
  sampleRate: sr,
  key: session.key,
  seed: spec.seed * 1000,
});
console.log(
  `${id} / ${condId}: ${session.durationSec.toFixed(1)} s, peak ${linToDb(peak(x)).toFixed(1)} dBFS, rms ${linToDb(rms(x)).toFixed(1)} dBFS${session.synth ? ' (synth)' : ''}`,
);
if (flags.includes('--wav')) {
  const path = `eval/.cache/${id}-${condId}.wav`;
  writeFileSync(path, wav(x, sr));
  console.log(`wrote ${path}`);
}

const pipeline = createChromaPipeline({
  sampleRate: sr,
  instrument: 'piano',
  mode: mode as JamMode,
});
const engine = createAnalysisEngine({
  ...DEFAULT_ANALYSIS_CONFIG,
  mode: mode as JamMode,
  vocabLevel: Number(level) as VocabLevel,
});
let wall = 0;
let frame: ChromaFrame | null = null;
const lines: Array<[number, string]> = [];
for (const g of session.chords) lines.push([g.t0, `GT     ${g.symbol}`]);
engine.subscribe((e) => {
  if (e.type === 'chord') {
    const label = e.chord ? chordSymbol(e.chord, session.key) : '—';
    const dash = e.confidence < MIN_DISPLAY_CONFIDENCE ? ' (dash)' : '';
    const f = frame;
    const chroma = f
      ? Array.from(f.chroma)
          .map((v, i) => [v, i] as const)
          .sort((a, b) => b[0] - a[0])
          .slice(0, 5)
          .map(
            ([v, i]) =>
              `${'C C#D D#E F F#G G#A A#B '.slice(i * 2, i * 2 + 2).trim()}${(v * 100).toFixed(0)}`,
          )
          .join(' ')
      : '';
    lines.push([
      wall,
      `  show ${label.padEnd(8)} conf ${e.confidence.toFixed(2)}${dash} (frame t ${e.t.toFixed(2)}) energy ${f?.energy.toFixed(2)} lvl ${pipeline.status().levelDb.toFixed(0)} floor ${pipeline.status().noiseFloorDb.toFixed(0)} gate ${pipeline.status().gateDb.toFixed(0)} bass ${f?.bass ?? '-'} [${chroma}]`,
    ]);
  } else if (e.type === 'key') lines.push([wall, `  key  ${keyName(e.key)}`]);
});
const hop = pipeline.config.hopSize;
for (let i = 0; i + hop <= x.length; i += hop) {
  const f = pipeline.process(x.subarray(i, i + hop), i / sr);
  if (!f) continue;
  frame = f;
  wall = f.t + hop / sr;
  engine.push(f);
}
lines.sort((a, b) => a[0] - b[0]);
for (const [t, l] of lines) console.log(`${t.toFixed(2).padStart(6)}  ${l}`);

function wav(samples: Float32Array, rate: number): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  return buf;
}
