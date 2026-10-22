/** App version shown in Settings → About. Keep in step with `package.json` (a test checks). */
export const APP_VERSION = '0.1.0';

/** Jam screen shortcuts (see `jam/useJamShortcuts.ts`), listed in Settings → About. */
export const JAM_SHORTCUTS: ReadonlyArray<{ keys: readonly string[]; action: string }> = [
  { keys: ['Space'], action: 'Start or stop listening' },
  { keys: ['B'], action: 'Bookmark this moment' },
  { keys: ['R'], action: 'Clear the timeline' },
  { keys: ['1', '2', '3'], action: 'Chord detail: triads, 7ths, jazz' },
  { keys: ['P'], action: 'Show or hide the keyboard' },
  { keys: ['M'], action: 'Switch listening mode' },
  { keys: ['I'], action: 'Open or close ideas' },
  { keys: ['N'], action: 'Ideas: next chords' },
  { keys: ['S'], action: 'Ideas: scales' },
  { keys: ['V'], action: 'Ideas: voicings' },
  { keys: ['K'], action: 'Ideas: modulate' },
];
