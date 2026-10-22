import type { JamMode } from '@/core';
import { Segmented } from './Segmented';

const OPTIONS = [
  { value: 'solo' as const, label: 'Solo', title: 'Solo: just you and the instrument (key M)' },
  {
    value: 'room' as const,
    label: 'Room',
    title: 'Room: band or a song in the room, vocals down-weighted (key M)',
  },
];

export interface ModeToggleProps {
  value: JamMode;
  onChange(mode: JamMode): void;
  className?: string;
}

export function ModeToggle({ value, onChange, className }: ModeToggleProps) {
  return (
    <Segmented
      aria-label="Listening mode"
      options={OPTIONS}
      value={value}
      onChange={onChange}
      className={className}
    />
  );
}
