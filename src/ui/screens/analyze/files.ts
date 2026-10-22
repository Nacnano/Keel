/** File checks for the Analyze screen. */

/** Above this the screen asks before decoding (decoded PCM is ~10× a compressed file). */
export const LARGE_FILE_BYTES = 50 * 1024 * 1024;

export const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.webm';

const AUDIO_EXT = /\.(mp3|m4a|mp4|aac|wav|wave|ogg|oga|opus|flac|webm|aif|aiff)$/i;

const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  wave: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  webm: 'audio/webm',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
};

/**
 * Audio by MIME type, or by extension when the browser gives no type (or labels an .m4a
 * as `video/mp4`). Whether it actually decodes is up to the browser.
 */
export function isSupportedAudio(file: { name: string; type: string }): boolean {
  if (file.type.startsWith('audio/')) return true;
  if (!file.type || file.type === 'video/mp4' || file.type === 'application/octet-stream') {
    return AUDIO_EXT.test(file.name);
  }
  return false;
}

/** The file's MIME type, else a guess from its extension. */
export function audioMimeType(file: { name: string; type: string }): string {
  if (file.type.startsWith('audio/')) return file.type;
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? (file.type || 'audio/mpeg');
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
