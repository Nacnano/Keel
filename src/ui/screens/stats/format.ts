import type { ChordQuality, Key } from '@/core';
import { CHORD_TEMPLATES, prettyAccidentals, tonicName } from '@/theory';

/** "45s", "12m", "3h 05m". */
export function durationLabel(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** Spoken form for accessible labels: "3 hours 5 minutes". */
export function durationSpoken(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.round(s / 60);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const mins = `${rest} minute${rest === 1 ? '' : 's'}`;
  if (!h) return mins;
  const hours = `${h} hour${h === 1 ? '' : 's'}`;
  return rest ? `${hours} ${mins}` : hours;
}

/** `YYYY-MM-DD` (local) -> "Mar 10". */
export function dayLabel(day: string, opts: Intl.DateTimeFormatOptions = {}): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...opts,
  });
}

const QUALITY_NAMES: Partial<Record<ChordQuality, string>> = {
  '5': 'Power',
  maj: 'Major',
  min: 'Minor',
  dim: 'Diminished',
  aug: 'Augmented',
  sus2: 'Sus2',
  sus4: 'Sus4',
  maj7: 'Major 7',
  min7: 'Minor 7',
  '7': 'Dominant 7',
  dim7: 'Diminished 7',
  m7b5: 'Half-diminished',
  mMaj7: 'Minor-major 7',
  '6': 'Major 6',
  m6: 'Minor 6',
  add9: 'Add 9',
  madd9: 'Minor add 9',
};

/** Readable quality name ("Dominant 7"); extended chords fall back to their symbol ("7#9"). */
export function qualityName(q: ChordQuality): string {
  return QUALITY_NAMES[q] ?? prettyAccidentals(CHORD_TEMPLATES[q].symbol);
}

/** Jam-screen link for a key nudge: `/?key=Bbminor` (`<tonic><mode>`). The jam screen ignores it for now. */
export function jamInKeyHref(key: Key): string {
  return `/?${new URLSearchParams({ key: `${tonicName(key)}${key.mode}` }).toString()}`;
}
