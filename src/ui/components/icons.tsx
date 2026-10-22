import {
  Bookmark,
  ChevronDown,
  Circle,
  Flag,
  Mic,
  Piano,
  Play,
  RotateCcw,
  Square,
  Usb,
  type LucideProps,
} from 'lucide-react';
import { cx } from '../lib/cx';

/**
 * Legacy icon names, drawn with lucide-react so every icon shares one stroke style.
 * Prefer importing from `lucide-react` directly in new code.
 */
export type IconProps = Omit<LucideProps, 'ref'>;

const solid = (className?: string) => cx('fill-current', className);

export const MicIcon = ({ size = 20, ...p }: IconProps) => <Mic size={size} aria-hidden {...p} />;
export const MidiIcon = ({ size = 20, ...p }: IconProps) => <Usb size={size} aria-hidden {...p} />;
export const PlayIcon = ({ size = 20, className, ...p }: IconProps) => (
  <Play size={size} aria-hidden className={solid(className)} {...p} />
);
export const StopIcon = ({ size = 20, className, ...p }: IconProps) => (
  <Square size={size} aria-hidden className={solid(className)} {...p} />
);
export const ResetIcon = ({ size = 20, ...p }: IconProps) => (
  <RotateCcw size={size} aria-hidden {...p} />
);
export const BookmarkIcon = ({ size = 20, ...p }: IconProps) => (
  <Bookmark size={size} aria-hidden {...p} />
);
export const FlagIcon = ({ size = 20, ...p }: IconProps) => <Flag size={size} aria-hidden {...p} />;
export const RecordIcon = ({ size = 20, className, ...p }: IconProps) => (
  <Circle size={size} aria-hidden className={solid(className)} {...p} />
);
export const KeysIcon = ({ size = 20, ...p }: IconProps) => (
  <Piano size={size} aria-hidden {...p} />
);
export const ChevronIcon = ({ size = 20, ...p }: IconProps) => (
  <ChevronDown size={size} aria-hidden {...p} />
);
