import { useRef } from 'react';
import {
  clockLabel,
  tickStep,
  timeToX,
  visibleSeconds,
  xToTime,
  type TimeViewport,
} from './timeline';
import { useTimeGestures } from './useTimeGestures';

export interface TimeRulerProps {
  viewport: TimeViewport;
  onViewportChange(v: TimeViewport): void;
  width: number;
  duration: number;
  onSeek(t: number): void;
}

/** Time ruler above the lanes: tap to seek, drag to scroll, wheel or pinch to zoom. */
export function TimeRuler({ viewport, onViewportChange, width, duration, onSeek }: TimeRulerProps) {
  const ref = useRef<HTMLDivElement>(null);
  useTimeGestures(ref, {
    viewport,
    onViewportChange,
    onTap: (x) => onSeek(Math.min(duration, Math.max(0, xToTime(viewport, x)))),
  });
  const step = tickStep(viewport.pxPerSec);
  const t1 = Math.min(duration, viewport.start + visibleSeconds(viewport, width));
  const ticks: number[] = [];
  for (let t = Math.ceil(viewport.start / step) * step; t <= t1 + 1e-6; t += step) ticks.push(t);
  const showTenths = step < 1;

  return (
    <div
      ref={ref}
      aria-hidden
      className="relative h-7 cursor-pointer touch-none overflow-hidden select-none"
    >
      {ticks.map((t) => (
        <div
          key={t}
          className="absolute bottom-0 flex h-full items-end pb-1 pl-1.5 text-[11px] text-label-3 tabular"
          style={{ left: timeToX(viewport, t) }}
        >
          <span className="absolute bottom-0 left-0 h-2.5 w-px bg-separator" />
          {clockLabel(t, showTenths)}
        </div>
      ))}
    </div>
  );
}
