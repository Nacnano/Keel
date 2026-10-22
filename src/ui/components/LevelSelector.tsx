import type { VocabLevel } from '@/core';
import { Segmented } from './Segmented';

const OPTIONS = [
  { value: 1 as const, label: 'Triads', title: 'Chord level 1: triads and sus (key 1)' },
  { value: 2 as const, label: '7ths', title: 'Chord level 2: sevenths, 6, add9 (key 2)' },
  { value: 3 as const, label: 'Jazz', title: 'Chord level 3: extensions and alterations (key 3)' },
];

export interface LevelSelectorProps {
  value: VocabLevel;
  onChange(level: VocabLevel): void;
  className?: string;
}

export function LevelSelector({ value, onChange, className }: LevelSelectorProps) {
  return (
    <Segmented
      aria-label="Chord vocabulary level"
      options={OPTIONS}
      value={value}
      onChange={onChange}
      className={className}
    />
  );
}
