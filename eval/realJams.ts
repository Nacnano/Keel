/** Optional download-on-demand real ensemble stress suite. Audio stays in ignored local cache.
 * Unknown harmony/notes measure activity and stability only, never transcription accuracy.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256, resample } from './benchmarkAudio';
import { runBenchmarkCase } from './benchmark';
import { regressionFailures } from './benchmarkGates';
import { decodeRealJamWav, float32LE } from './realJamAudio';
import type { BenchmarkMetrics, BenchmarkResult } from './benchmarkTypes';

export interface RealJamTrack {
  id: string;
  title: string;
  archiveEntry: string;
  sourceSha256: string;
  sourceInstruments: string[];
  keyboardTimbre: string;
  instrumentMetadataSource: string;
  activationEvidence: string;
  attribution: string;
  originalSourceStartSec: number;
  activationConfidenceMinimum: number;
  startSec: number;
  durationSec: number;
}
export interface RealJamManifest {
  version: 1;
  archive: {
    url: string;
    filename: string;
    sha256: string;
    license: string;
    licenseSource: string;
  };
  tracks: RealJamTrack[];
}
export interface RealJamResult extends BenchmarkResult {
  recording: RealJamTrack;
  decodedPcmHash: string;
  decoderVersion: string;
}
export interface RealJamBaseline {
  version: 1;
  protocolHash: string;
  detectorCommit: string;
  cases: Record<
    string,
    { inputHash: string; decodedPcmHash: string; decoderVersion: string; metrics: BenchmarkMetrics }
  >;
}
const DIR = dirname(fileURLToPath(import.meta.url));

export function validateRealJamManifest(m: RealJamManifest) {
  if (
    m.version !== 1 ||
    !m.tracks?.length ||
    !/^[a-f0-9]{64}$/.test(m.archive?.sha256) ||
    !m.archive.license ||
    !m.archive.licenseSource ||
    !/^https:\/\//.test(m.archive.url) ||
    !/^[\w.-]+\.zip$/.test(m.archive.filename)
  )
    throw new Error('Invalid real-jam archive provenance');
  const ids = new Set<string>();
  for (const t of m.tracks) {
    if (
      !/^[\w-]+$/.test(t.id) ||
      ids.has(t.id) ||
      !t.title ||
      !t.archiveEntry ||
      t.archiveEntry.startsWith('/') ||
      t.archiveEntry.split('/').includes('..') ||
      !/^[a-f0-9]{64}$/.test(t.sourceSha256) ||
      !t.sourceInstruments?.length ||
      !t.keyboardTimbre ||
      !t.instrumentMetadataSource ||
      !t.activationEvidence ||
      !t.attribution ||
      !Number.isFinite(t.originalSourceStartSec) ||
      t.originalSourceStartSec < 0 ||
      !Number.isFinite(t.activationConfidenceMinimum) ||
      t.activationConfidenceMinimum < 0 ||
      t.activationConfidenceMinimum > 1 ||
      !Number.isFinite(t.startSec) ||
      t.startSec < 0 ||
      !Number.isFinite(t.durationSec) ||
      t.durationSec <= 0
    )
      throw new Error(`Invalid real-jam track provenance: ${t.id}`);
    ids.add(t.id);
  }
}

export function realJamFailures(
  result: RealJamResult,
  baseline: RealJamBaseline['cases'][string],
): string[] {
  if (
    !baseline ||
    result.inputHash !== baseline.inputHash ||
    result.decodedPcmHash !== baseline.decodedPcmHash
  )
    return [
      'Noncomparable real-jam audio/recipe: source or decoded PCM hash differs. Reuse the exact cached PCM/decoder, or remeasure unchanged source revision with this decoder and review a new separate baseline.',
    ];
  return regressionFailures(result, baseline.metrics);
}

async function prepareArchive(m: RealJamManifest, cache: string, offline: boolean) {
  const file = join(cache, m.archive.filename);
  if (!existsSync(file)) {
    if (offline)
      throw new Error(
        `Offline real-jam archive missing: ${file}. Run pnpm eval:real-jams once with network access.`,
      );
    console.log(`Downloading optional research audio: ${m.archive.url}`);
    const response = await fetch(m.archive.url);
    if (!response.ok) throw new Error(`Real-jam download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== m.archive.sha256) throw new Error('Real-jam archive checksum mismatch');
    writeFileSync(file + '.part', bytes);
    renameSync(file + '.part', file);
  }
  if (sha256(readFileSync(file)) !== m.archive.sha256)
    throw new Error(`Real-jam archive checksum mismatch; remove corrupt local cache: ${file}`);
  return file;
}

function prepareTrack(track: RealJamTrack, archive: string, cache: string) {
  const original = execFileSync('unzip', ['-p', archive, track.archiveEntry], {
    maxBuffer: 128 * 1024 * 1024,
  });
  if (sha256(original) !== track.sourceSha256)
    throw new Error(`Real-jam source checksum mismatch: ${track.id}`);
  const source = join(cache, `${track.id}-${track.sourceSha256.slice(0, 12)}.stem.mp4`);
  if (!existsSync(source)) writeFileSync(source, original);
  if (sha256(readFileSync(source)) !== track.sourceSha256)
    throw new Error(`Real-jam extracted source cache changed: ${source}`);
  const decoded = source + '.wav',
    metadataFile = decoded + '.json';
  let decoderVersion: string;
  if (!existsSync(decoded) || !existsSync(metadataFile)) {
    try {
      decoderVersion = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0];
    } catch {
      throw new Error(
        'ffmpeg is required to decode the optional real-jam AAC previews on first use. Install ffmpeg, then rerun pnpm eval:real-jams. The original offline benchmark does not need it.',
      );
    }
    // MUSDB STEMS stream 0 is the original mix, not the isolated "other" accompaniment.
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      source,
      '-map',
      '0:a:0',
      '-vn',
      '-ac',
      '1',
      '-ar',
      '44100',
      '-c:a',
      'pcm_s16le',
      '-dither_method',
      'none',
      '-map_metadata',
      '-1',
      decoded,
    ]);
    writeFileSync(
      metadataFile,
      JSON.stringify({ decoderVersion, decodedWavHash: sha256(readFileSync(decoded)) }) + '\n',
    );
  } else {
    const meta = JSON.parse(readFileSync(metadataFile, 'utf8'));
    decoderVersion = meta.decoderVersion;
    if (typeof decoderVersion !== 'string' || sha256(readFileSync(decoded)) !== meta.decodedWavHash)
      throw new Error(`Real-jam decoded cache changed: ${decoded}`);
  }
  const excerpt = decodeRealJamWav(readFileSync(decoded), track.startSec, track.durationSec);
  const samples = resample(excerpt.samples, excerpt.sampleRate, 48000);
  return { samples, decoderVersion, decodedPcmHash: sha256(float32LE(samples)) };
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.some(
      (a) =>
        a !== '--candidate' &&
        a !== '--offline' &&
        !a.startsWith('--output=') &&
        !a.startsWith('--baseline=') &&
        !a.startsWith('--manifest=') &&
        !a.startsWith('--cache=') &&
        !a.startsWith('--detector-commit='),
    )
  )
    throw new Error('Unknown real-jam argument');
  const option = (key: string, fallback: string) =>
    args.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
  const candidate = args.includes('--candidate');
  if (candidate && process.env.CI) throw new Error('Real-jam baseline measurement forbidden in CI');
  const manifestFile = resolve(option('manifest', join(DIR, 'real-jams-sources.json')));
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as RealJamManifest;
  validateRealJamManifest(manifest);
  const protocolHash = sha256(
    Buffer.concat([
      readFileSync(manifestFile),
      ...[
        'realJams.ts',
        'realJamAudio.ts',
        'benchmark.ts',
        'benchmarkMetrics.ts',
        'benchmarkGates.ts',
        'benchmarkTypes.ts',
        'exactNoteMetrics.ts',
        'benchmarkAudio.ts',
        'util.ts',
      ].map((p) => readFileSync(join(DIR, p))),
    ]),
  );
  const baselineFile = resolve(option('baseline', join(DIR, 'real-jams-baseline.json')));
  const baseline: RealJamBaseline | undefined = candidate
    ? undefined
    : JSON.parse(readFileSync(baselineFile, 'utf8'));
  if (baseline && (baseline.version !== 1 || baseline.protocolHash !== protocolHash))
    throw new Error(
      'Real-jam recipes/scorer changed: compare with a reviewed unchanged-detector baseline, never reset candidate behavior',
    );
  const out = resolve(option('output', join(DIR, '.cache/real-jams/report'))),
    cache = resolve(option('cache', join(DIR, '.cache/real-jams')));
  mkdirSync(out, { recursive: true });
  mkdirSync(cache, { recursive: true });
  const archive = await prepareArchive(manifest, cache, args.includes('--offline'));
  const detectorCommit = option(
    'detector-commit',
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  );
  const results: RealJamResult[] = [],
    failures: Record<string, string[]> = {};
  for (const track of manifest.tracks) {
    const audio = prepareTrack(track, archive, cache);
    for (const mode of ['solo', 'room'] as const) {
      const duration = (Math.floor(audio.samples.length / 2048) * 2048) / 48000;
      const c = {
        id: `real-jam/${track.id}/${mode}/48000`,
        group: 'band' as const,
        provenance: 'recorded' as const,
        instrument: 'piano' as const,
        mode,
        sensitivity: 0.5,
        sampleRate: 48000,
        samples: audio.samples,
        truth: [{ start: 0, end: duration, chord: 'unknown' as const }],
      };
      const r = {
        ...runBenchmarkCase(c, protocolHash + audio.decodedPcmHash),
        recording: track,
        decodedPcmHash: audio.decodedPcmHash,
        decoderVersion: audio.decoderVersion,
      };
      results.push(r);
      const errors = baseline ? realJamFailures(r, baseline.cases[r.id]) : [];
      if (errors.length) failures[r.id] = errors;
      console.log(
        `${errors.length ? 'FAIL' : candidate ? 'MEASURE' : 'PASS'} ${r.id}: confirmed activity=${r.metrics.exactNotes.confirmed.activityCoverage.toFixed(3)}, union=${r.metrics.exactNotes.union.activityCoverage.toFixed(3)}, chord flickers=${r.metrics.chordFlickers}`,
      );
    }
  }
  if (
    baseline &&
    Object.keys(baseline.cases).sort().join('\n') !==
      results
        .map((r) => r.id)
        .sort()
        .join('\n')
  )
    throw new Error('Real-jam case inventory changed; review the separate baseline');
  const report = {
    version: 1,
    detectorCommit,
    protocolHash,
    license: manifest.archive,
    caveat:
      'Recorded human ensemble excerpts; unknown chord/notes. Activity and stability proxies only; no exact-note/chord/key accuracy claim. Source audio remains in ignored local cache.',
    results,
    failures,
  };
  writeFileSync(join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  if (candidate)
    writeFileSync(
      join(out, 'baseline-candidate.json'),
      JSON.stringify(
        {
          version: 1,
          detectorCommit,
          protocolHash,
          cases: Object.fromEntries(
            results.map((r) => [
              r.id,
              {
                inputHash: r.inputHash,
                decodedPcmHash: r.decodedPcmHash,
                decoderVersion: r.decoderVersion,
                metrics: r.metrics,
              },
            ]),
          ),
        },
        null,
        2,
      ) + '\n',
    );
  console.log(
    `${results.length} optional real-jam cases, ${Object.keys(failures).length} regressions; ${out}`,
  );
  if (Object.keys(failures).length) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
