import type { MarkerKind } from '@/core';

export const MARKER_LABEL: Record<MarkerKind, string> = {
  bookmark: 'Bookmark',
  intro: 'Intro',
  verse: 'Verse',
  pre: 'Pre-chorus',
  chorus: 'Chorus',
  bridge: 'Bridge',
  outro: 'Outro',
  custom: 'Marker',
};

/** Structure markers offered in the jam screen's section menu, in song order. */
export const SECTION_KINDS: MarkerKind[] = ['intro', 'verse', 'pre', 'chorus', 'bridge', 'outro'];

/** One entry of the Mark menu. */
export interface MarkItem {
  kind: MarkerKind;
  label: string;
  /** Only for kinds without a fixed name (`custom`). */
  markerLabel?: string;
  /** "New song": also re-finds the key from what is played next. */
  newSong?: boolean;
}

export const NEW_SONG_LABEL = 'New song';

/** The Mark menu: Bookmark, the song sections in order, then New song. */
export const MARK_ITEMS: readonly MarkItem[] = [
  { kind: 'bookmark', label: MARKER_LABEL.bookmark },
  ...SECTION_KINDS.map((kind) => ({ kind, label: MARKER_LABEL[kind] })),
  { kind: 'custom', label: NEW_SONG_LABEL, markerLabel: NEW_SONG_LABEL, newSong: true },
];
