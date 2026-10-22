/** Public surface of the audio workstream (WS-B). */
export {
  createMicInput,
  AudioInputError,
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
  createChromaPipeline,
  resolveConfig,
  type ChromaPipeline,
  type PipelineConfig,
  type PipelineConfigInput,
} from './pipeline';
export { INSTRUMENT_PROFILES, type InstrumentProfile } from './profiles';
export type { DspStats } from './messages';
export { createRealFFT, createComplexFFT, type RealFFT, type ComplexFFT } from './fft';
export { hann } from './window';
export { findPeaks, type Peak, type PeakOptions } from './peaks';
export { computeChroma, accumulateChroma, hzToMidi, type ChromaOptions } from './chroma';
export { detectBass, type BassEstimate, type BassOptions } from './bass';
export { createEnergyGate, createOnsetDetector, rmsDb, dbToEnergy } from './gate';
export { createRoomProcessor, type RoomOptions } from './room';
