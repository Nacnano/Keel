/**
 * Real piano samples for the evaluation harness: the same Splendid Grand Piano recordings the
 * app plays through smplr (`src/midi/player.ts`), fetched straight from
 * https://danigb.github.io/samples/splendid-grand-piano, decoded in node (Ogg Opus, WASM
 * decoder) and cached under `eval/.cache/` (git-ignored).
 *
 * If a sample cannot be fetched (offline), `loadPiano` returns null and `render.ts` falls back
 * to a richer additive synth (inharmonic partials, two-stage decay); the report says so.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYERS } from 'smplr';
import { OggOpusDecoder } from 'ogg-opus-decoder';

const BASE_URL = 'https://danigb.github.io/samples/splendid-grand-piano';
export const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '.cache');
/** All Splendid samples are 48 kHz Opus. */
export const SAMPLE_RATE = 48000;

/** Velocity layers used (PPP is the same recordings low-passed by smplr, skipped). */
const USED_LAYERS = ['PP', 'MP', 'MF', 'FF'] as const;
type LayerName = (typeof USED_LAYERS)[number];

interface Layer {
  name: LayerName;
  velRange: [number, number];
  samples: Array<[midi: number, file: string]>;
}

const layers: Layer[] = USED_LAYERS.map((name) => {
  const l = LAYERS.find((x) => x.name === name);
  if (!l) throw new Error(`smplr layer ${name} missing`);
  return {
    name,
    velRange: l.vel_range as [number, number],
    samples: l.samples as Array<[number, string]>,
  };
});

export interface PianoSample {
  /** MIDI note the recording was made at. */
  midi: number;
  /** Mono, 48 kHz. */
  data: Float32Array;
}

export interface Piano {
  /** Nearest recorded sample for `midi` in the velocity layer for `velocity` (1..127). */
  sampleFor(midi: number, velocity: number): PianoSample;
  /** Velocity at the centre of the layer `velocity` falls in (for within-layer gain). */
  layerCentre(velocity: number): number;
}

function layerFor(velocity: number): Layer {
  const v = Math.max(1, Math.min(127, Math.round(velocity)));
  return layers.find((l) => v >= l.velRange[0] && v <= l.velRange[1]) ?? layers[0];
}

function nearest(layer: Layer, midi: number): [number, string] {
  let best = layer.samples[0];
  for (const s of layer.samples) if (Math.abs(s[0] - midi) < Math.abs(best[0] - midi)) best = s;
  return best;
}

async function fetchCached(file: string): Promise<Uint8Array> {
  const path = join(CACHE_DIR, 'samples', `${file}.ogg`);
  if (existsSync(path)) return new Uint8Array(await readFile(path));
  const res = await fetch(`${BASE_URL}/${encodeURIComponent(file)}.ogg`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}.ogg`);
  const buf = new Uint8Array(await res.arrayBuffer());
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buf);
  return buf;
}

/**
 * Load the samples needed for `notes` × `velocities`. Returns null (and logs why) when any
 * sample cannot be fetched or decoded.
 */
export async function loadPiano(
  notes: Iterable<number>,
  velocities: Iterable<number>,
): Promise<Piano | null> {
  const wanted = new Map<string, { layer: Layer; midi: number; file: string }>();
  const vels = [...velocities];
  for (const n of notes) {
    for (const v of vels) {
      const layer = layerFor(v);
      const [midi, file] = nearest(layer, n);
      wanted.set(`${layer.name}:${midi}`, { layer, midi, file });
    }
  }
  const decoder = new OggOpusDecoder();
  const loaded = new Map<string, PianoSample>();
  try {
    await decoder.ready;
    for (const [key, w] of wanted) {
      const bytes = await fetchCached(w.file);
      const out = await decoder.decodeFile(bytes);
      await decoder.reset();
      const ch = out.channelData;
      const data = new Float32Array(out.samplesDecoded);
      for (const c of ch) for (let i = 0; i < data.length; i++) data[i] += c[i] / ch.length;
      if (out.sampleRate !== SAMPLE_RATE) throw new Error(`unexpected rate ${out.sampleRate}`);
      loaded.set(key, { midi: w.midi, data });
    }
  } catch (err) {
    console.warn(`[eval] piano samples unavailable (${(err as Error).message}); using synth`);
    return null;
  } finally {
    decoder.free();
  }
  return {
    sampleFor(midi, velocity) {
      const layer = layerFor(velocity);
      const [m] = nearest(layer, midi);
      const s = loaded.get(`${layer.name}:${m}`);
      if (!s) throw new Error(`sample ${layer.name}:${m} not loaded`);
      return s;
    },
    layerCentre(velocity) {
      const l = layerFor(velocity);
      return (l.velRange[0] + l.velRange[1]) / 2;
    },
  };
}
