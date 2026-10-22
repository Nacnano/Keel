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
