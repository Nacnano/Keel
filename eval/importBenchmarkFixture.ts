/** Add an owned/licensed recording and independently supplied labels; never infer truth from Keel. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, basename } from 'node:path';
import { format } from 'prettier';
import { readFixture, sha256 } from './benchmarkAudio';
import { EVAL_DIR } from './benchmarkCases';
import { parseChord } from '@/theory';

const [wavPath, metadataPath] = process.argv.slice(2);
if (!wavPath || !metadataPath)
  throw new Error(
    'Usage: tsx --tsconfig eval/tsconfig.json eval/importBenchmarkFixture.ts <mono-pcm16.wav> <metadata.json>',
  );
const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
for (const key of ['id', 'source', 'license', 'attribution', 'annotation']) {
  if (typeof metadata[key] !== 'string' || !metadata[key].trim())
    throw new Error(`Required metadata: ${key}`);
}
if (
  !/^[\w-]+$/.test(metadata.id) ||
  !['piano', 'guitar', 'band', 'recorded-noise', 'recorded-piano'].includes(metadata.group) ||
  !['piano', 'guitar'].includes(metadata.instrument)
)
  throw new Error('Invalid id, group or instrument');
if (!Array.isArray(metadata.spans) || !metadata.spans.length)
  throw new Error('Supply labeled spans, or an explicit unknown span for stability-only audio');
if (metadata.tail !== null && metadata.tail !== 'unknown')
  throw new Error('tail must be null (no music) or unknown');
const manifestPath = join(EVAL_DIR, 'fixtures/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const filename = `${metadata.id}.wav.gz`,
  path = join(EVAL_DIR, 'fixtures', filename);
if (existsSync(path) || manifest.fixtures.some((f: { id: string }) => f.id === metadata.id))
  throw new Error('Fixture already exists; use a new id and review any replacement explicitly');
const source = readFileSync(wavPath),
  packed = gzipSync(source, { level: 9 });
// Decode and validate before writing the manifest. Temporary data stays in the ignored cache.
const { mkdtempSync, rmSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const temp = mkdtempSync(join(tmpdir(), 'keel-import-'));
try {
  const check = join(temp, filename);
  writeFileSync(check, packed);
  const decoded = readFixture(check, sha256(packed));
  let end = 0;
  for (const span of metadata.spans) {
    if (
      !Number.isFinite(span.start) ||
      !Number.isFinite(span.end) ||
      span.start < end ||
      span.end <= span.start ||
      span.end > decoded.samples.length / decoded.sampleRate
    )
      throw new Error('Invalid/overlapping annotation times');
    if (
      span.label !== null &&
      span.label !== 'unknown' &&
      (typeof span.label !== 'string' || !parseChord(span.label))
    )
      throw new Error(`Invalid chord: ${span.label}`);
    end = span.end;
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
manifest.fixtures.push({
  ...metadata,
  file: filename,
  sha256: sha256(packed),
  provenance: 'recorded',
  sourceFile: basename(wavPath),
  sourceSha256: sha256(source),
});
const formatted = await format(JSON.stringify(manifest), { parser: 'json', tabWidth: 2 });
writeFileSync(path, packed);
writeFileSync(manifestPath, formatted);
console.log(
  `Added ${metadata.id}. Review a full-suite baseline candidate; existing CI baselines deliberately reject changed corpora.`,
);
