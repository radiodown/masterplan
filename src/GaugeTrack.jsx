import { useEffect, useId, useRef, useState } from 'react';
import { Money, number } from './ui.jsx';
import { gaugeEasing } from './useGaugeEntrance.js';

export function GaugeTrack({ fill, segments, label, progress, className = '', wholeWon = false }) {
  const frame = useRef(null);
  const tooltipId = useId();
  const [anchor, setAnchor] = useState(null);
  const active = anchor && segments.find(({ id, share }) => id === anchor.id && share > 0);
  const open = Boolean(active);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event) {
      if (!frame.current?.contains(event.target)) setAnchor(null);
    }
    function dismissOnEscape(event) {
      if (event.key === 'Escape') setAnchor(null);
    }
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [open]);

  function reveal(id, segment, clientX) {
    const trackLeft = frame.current.getBoundingClientRect().left;
    if (clientX === undefined) {
      const bounds = segment.getBoundingClientRect();
      clientX = bounds.left + bounds.width / 2;
    }
    setAnchor({ id, x: clientX - trackLeft });
  }

  return <div className="gauge-frame" ref={frame} onPointerLeave={(event) => {
    if (event.pointerType !== 'touch' && !frame.current.contains(document.activeElement)) setAnchor(null);
  }}>
    {progress !== undefined && <div className="gauge-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} />}
    <div className={`gauge-track ${className}`} role="group" aria-label={progress === undefined ? label : '입주 자금 구간'} style={{ '--gauge-easing': gaugeEasing }}>
      <div className="gauge-fill" ref={fill}>
        {segments.map(({ id, label, share, tone }) => {
          function hover(event) {
            if (event.pointerType !== 'touch') reveal(id, event.currentTarget, event.clientX);
          }
          return <button key={id} className={`gauge-segment gauge-${tone}`} type="button"
            disabled={share <= 0} style={{ width: `${share}%` }} aria-label={label}
            aria-describedby={active?.id === id ? tooltipId : undefined}
            onPointerEnter={hover} onPointerMove={hover}
            onFocus={(event) => reveal(id, event.currentTarget)} onBlur={() => setAnchor(null)}
            onClick={(event) => reveal(id, event.currentTarget, event.detail > 0 ? event.clientX : undefined)} />;
        })}
      </div>
    </div>
    {active && <div className="gauge-tooltip" id={tooltipId} role="tooltip" style={{ '--tooltip-x': `${anchor.x}px` }}>
      <div className="gauge-tooltip-content">
        <span aria-hidden="true">{active.label}</span>
        <strong>{wholeWon ? `${number(active.amount)}원` : <Money value={active.amount} />}</strong>
      </div>
    </div>}
  </div>;
}
