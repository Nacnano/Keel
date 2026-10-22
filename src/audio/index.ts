/** Public surface of the audio workstream (WS-B). */
export {
  createMicInput,
  AudioInputError,
  type InputStatus,
  type MicInput,
  type MicSettings,
  type MicStartOptions,
} from './micInput';
export {
  analyseFile,
  analyseSamples,
  decodeAudio,
  mixToMono,
  type AnalyseFileOptions,
  type AnalyseOptions,
} from './fileInput';
export {
  analyseFileToEvents,
  analyseSamplesToEvents,
  decodeFileToMono,
  dropShortChords,
  DEFAULT_MIN_CHORD_SEC,
  type DecodedAudio,
  type OfflineAnalysisOptions,
  type OfflineAnalysisResult,
  type OfflineFileOptions,
  type OfflineStage,
} from './offline';
export {
  createChromaPipeline,
  resolveConfig,
  type ChromaPipeline,
  type InputStatus as PipelineInputStatus,
  type PipelineConfig,
  type PipelineConfigInput,
} from './pipeline';
export { INSTRUMENT_PROFILES, type InstrumentProfile } from './profiles';
export type { DspStats } from './messages';
export { createRealFFT, createComplexFFT, type RealFFT, type ComplexFFT } from './fft';
export { hann } from './window';
export { findPeaks, type Peak, type PeakOptions } from './peaks';
export {
  accumulateChroma,
  attributeHarmonics,
  computeChroma,
  hzToMidi,
  PARTIAL_PROFILE,
  type ChromaOptions,
} from './chroma';
export { detectBass, type BassEstimate, type BassOptions } from './bass';
export {
  createAdaptiveGate,
  createEnergyGate,
  createOnsetDetector,
  dbToEnergy,
  rmsDb,
  sensitivityMarginDb,
  type AdaptiveGate,
  type AdaptiveGateOptions,
} from './gate';
export { createRoomProcessor, type RoomOptions } from './room';
