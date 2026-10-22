import { useCallback, useEffect, useState } from 'react';

function seekElement(el: HTMLMediaElement, t: number) {
  el.currentTime = t;
}

/**
 * Playhead of an <audio> element: `currentTime` every animation frame while playing (the
 * `timeupdate` event alone is only ~4 Hz), and on seek / pause.
 */
export function useAudioTime(el: HTMLAudioElement | null) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!el) return;
    let frame = 0;
    const hasRaf = typeof requestAnimationFrame === 'function';
    const stop = () => {
      if (hasRaf) cancelAnimationFrame(frame);
    };
    const tick = () => {
      setTime(el.currentTime);
      if (hasRaf) frame = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      stop();
      tick();
    };
    const onPause = () => {
      setPlaying(false);
      stop();
      setTime(el.currentTime);
    };
    const onSeek = () => setTime(el.currentTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onPause);
    el.addEventListener('seeked', onSeek);
    el.addEventListener('timeupdate', onSeek);
    return () => {
      stop();
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onPause);
      el.removeEventListener('seeked', onSeek);
      el.removeEventListener('timeupdate', onSeek);
    };
  }, [el]);

  const seek = useCallback(
    (t: number) => {
      const safe = Math.max(0, t);
      if (el) seekElement(el, safe);
      setTime(safe);
    },
    [el],
  );

  return { time, playing, seek };
}
