/** Local data layer (WS-F): IndexedDB storage, session recorder, export/import. */
export { db, openDb, DB_NAME, JamKeyDB, type SettingRow } from './db';
export {
  startSession,
  FLUSH_INTERVAL_MS,
  MIDI_CHECKPOINT_MS,
  type SessionHandle,
  type SessionMeta,
} from './sessionRecorder';
export { computeSummary, keySeconds, topProgressions, chordSequence } from './summary';
export {
  createAudioRecorder,
  isAudioRecordingSupported,
  pickMimeType,
  PREFERRED_MIME_TYPES,
  DEFAULT_MAX_DURATION_SEC,
  DEFAULT_WARN_AT_SEC,
  type AudioRecorder,
  type AudioRecorderOptions,
  type AudioRecorderState,
  type AudioTake,
  type AudioLimitReason,
} from './audioRecorder';
export {
  listSessions,
  listTags,
  getSession,
  getSessionFull,
  renameSession,
  setTags,
  normalizeTags,
  softDeleteSession,
  restoreSession,
  purgeSession,
  purgeDeleted,
  updateChord,
  addMarker,
  updateMarker,
  deleteMarker,
  storageEstimate,
  getSetting,
  setSetting,
  getSettings,
  type ListSessionsOptions,
  type SessionFull,
  type SessionSort,
  type StorageInfo,
} from './repo';
export {
  toText,
  toJSON,
  fromJSON,
  formatTime,
  ImportError,
  EXPORT_VERSION,
  type JamKeyExportV1,
} from './export';
export { chordSymbol, keyName } from './chordSymbol';
