import { useLayoutEffect, useRef, useState } from 'react';

const duration = 780;
const curveShape = 4;
const reducedMotion = '(prefers-reduced-motion: reduce)';

function logarithmicProgress(timeRatio) {
  const easedTime = timeRatio * (2 - timeRatio);
  return Math.log1p(curveShape * easedTime) / Math.log1p(curveShape);
}

const samples = 40;
const stops = Array.from({ length: samples + 1 }, (_, index) => logarithmicProgress(index / samples));
const keyframes = stops.map((stop) => ({ transform: `scaleX(${stop})` }));
export const gaugeEasing = `linear(${stops.join(', ')})`;

export function useGaugeEntrance() {
  const fill = useRef(null);
  const [entrance, setEntrance] = useState(() => window.matchMedia(reducedMotion).matches ? 1 : 0);

  useLayoutEffect(() => {
    if (window.matchMedia(reducedMotion).matches) return;

    const animation = fill.current.animate(keyframes, { duration, fill: 'backwards' });
    let frame = requestAnimationFrame(advance);

    function advance() {
      const timeRatio = Math.min((animation.currentTime ?? 0) / duration, 1);
      setEntrance(logarithmicProgress(timeRatio));
      if (timeRatio < 1) frame = requestAnimationFrame(advance);
    }

    return () => {
      cancelAnimationFrame(frame);
      animation.cancel();
    };
  }, []);

  return { fill, entrance };
}
