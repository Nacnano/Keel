import { describe, expect, it } from 'vitest';
import { scoreBenchmark } from './benchmarkMetrics';
import {
  realJamFailures,
  validateRealJamManifest,
  type RealJamManifest,
  type RealJamResult,
} from './realJams';
const track = {
  id: 'known-recording',
  title: 'Independent source',
  archiveEntry: 'test/known.stem.mp4',
  sourceSha256: 'a'.repeat(64),
  sourceInstruments: ['piano', 'bass', 'drums'],
  keyboardTimbre: 'publisher-stated piano',
  instrumentMetadataSource: 'https://example.test/independent-metadata',
  activationEvidence: 'independent source timing review',
  attribution: 'Source performers',
  originalSourceStartSec: 0,
  activationConfidenceMinimum: 1,
  startSec: 0,
  durationSec: 6,
};
const manifest: RealJamManifest = {
  version: 1,
  archive: {
    url: 'https://example.test/source.zip',
    filename: 'source.zip',
    sha256: 'b'.repeat(64),
    license: 'Source-specific research terms',
    licenseSource: 'https://example.test/license',
  },
  tracks: [track],
};
const metrics = scoreBenchmark(
  [{ start: 0, end: 2, chord: 'unknown' }],
  [{ wall: 0.1, chord: { root: 0, quality: 'maj' }, notes: [0], midiNotes: [60] }],
  2,
  0,
);
const result: RealJamResult = {
  id: 'real-jam/known/room/48000',
  group: 'band',
  provenance: 'recorded',
  inputHash: 'same-recipe-and-input',
  strictNoise: false,
  metrics,
  recording: track,
  decodedPcmHash: 'same-pcm',
  decoderVersion: 'fixed decoder version',
};
const baseline = {
  inputHash: result.inputHash,
  decodedPcmHash: result.decodedPcmHash,
  decoderVersion: result.decoderVersion,
  metrics,
};

describe('optional real recorded jam suite', () => {
  it('requires independent source/license/keyboard metadata and refuses duplicate recordings', () => {
    expect(() => validateRealJamManifest(manifest)).not.toThrow();
    expect(() =>
      validateRealJamManifest({ ...manifest, tracks: [{ ...track, keyboardTimbre: '' }] }),
    ).toThrow(/provenance/);
    expect(() => validateRealJamManifest({ ...manifest, tracks: [track, track] })).toThrow(
      /provenance/,
    );
    expect(() =>
      validateRealJamManifest({ ...manifest, archive: { ...manifest.archive, licenseSource: '' } }),
    ).toThrow(/provenance/);
  });
  it('treats all unknown musical references as unscored accuracy, while retaining activity guards', () => {
    expect(metrics.accuracy).toBeNull();
    expect(metrics.exactNotes.union.precision).toBeNull();
    expect(metrics.exactNotes.union.recall).toBeNull();
    const silent = scoreBenchmark(
      [{ start: 0, end: 2, chord: 'unknown' }],
      [{ wall: 0, chord: null, notes: [] }],
      2,
      0,
    );
    const failures = realJamFailures({ ...result, metrics: silent }, baseline);
    expect(failures.join()).toContain('coverage');
    expect(failures.join()).toContain('exactNotes.union.activityCoverage');
  });
  it('refuses source/recipe or decoder PCM changes rather than comparing different audio', () => {
    expect(realJamFailures(result, baseline)).toEqual([]);
    expect(
      realJamFailures({ ...result, decodedPcmHash: 'different-decoded-pcm' }, baseline).join(),
    ).toContain('Noncomparable');
    expect(
      realJamFailures({ ...result, inputHash: 'different-source-or-recipe' }, baseline).join(),
    ).toContain('Noncomparable');
  });
});
