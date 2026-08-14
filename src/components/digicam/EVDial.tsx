'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { useCameraStore } from '@/lib/camera-store';

const EV_STEPS = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
const MIN_EV = -2;
const MAX_EV = 2;

function snapToStep(v: number) {
  return Math.round(v * 2) / 2;
}

interface EVDialProps {
  onPlayClick?: () => void;
}

export function EVDial({ onPlayClick }: EVDialProps) {
  const exposureComp = useCameraStore((s) => s.exposureComp);
  const setExposureComp = useCameraStore((s) => s.setExposureComp);
  const stepExposure = useCameraStore((s) => s.stepExposure);

  const [flash, setFlash] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackRef      = useRef<HTMLDivElement>(null);
  const prevEVRef     = useRef(exposureComp);

  // Flash value readout when EV changes
  useEffect(() => {
    if (prevEVRef.current !== exposureComp) {
      prevEVRef.current = exposureComp;
      setFlash(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlash(false), 350);
    }
  }, [exposureComp]);

  const fireStep = useCallback((dir: 1 | -1) => {
    stepExposure(dir);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8);
    onPlayClick?.();
  }, [stepExposure, onPlayClick]);

  const startHold = useCallback((dir: 1 | -1) => {
    fireStep(dir);
    holdTimerRef.current = setTimeout(() => {
      holdIntRef.current = setInterval(() => fireStep(dir), 140);
    }, 480);
  }, [fireStep]);

  const stopHold = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (holdIntRef.current)   clearInterval(holdIntRef.current);
  }, []);

  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const { left, width } = trackRef.current.getBoundingClientRect();
    const ratio = (e.clientX - left) / width;
    const snapped = Math.max(MIN_EV, Math.min(MAX_EV, snapToStep(MIN_EV + ratio * (MAX_EV - MIN_EV))));
    setExposureComp(snapped);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8);
    onPlayClick?.();
  }, [setExposureComp, onPlayClick]);

  const handleTrackTouch = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const t = e.touches[0];
    const { left, width } = trackRef.current.getBoundingClientRect();
    const ratio = (t.clientX - left) / width;
    const snapped = Math.max(MIN_EV, Math.min(MAX_EV, snapToStep(MIN_EV + ratio * (MAX_EV - MIN_EV))));
    setExposureComp(snapped);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8);
    onPlayClick?.();
  }, [setExposureComp, onPlayClick]);

  const pointerPct = ((exposureComp - MIN_EV) / (MAX_EV - MIN_EV)) * 100;

  const fillLeft  = exposureComp >= 0 ? '50%' : `${pointerPct}%`;
  const fillWidth = `${(Math.abs(exposureComp) / 4) * 50}%`;
  const fillBg    = exposureComp > 0
    ? 'linear-gradient(90deg, rgba(204,85,0,0.0), rgba(204,85,0,0.28))'
    : exposureComp < 0
      ? 'linear-gradient(270deg, rgba(102,170,255,0.0), rgba(102,170,255,0.28))'
      : 'none';

  const displayValue = exposureComp === 0
    ? '±0.0'
    : exposureComp > 0
      ? `+${exposureComp.toFixed(1)}`
      : exposureComp.toFixed(1);

  return (
    <div className="digi-ev-dial" role="group" aria-label="Exposure compensation">
      <button
        className="digi-ev-btn ev-minus"
        aria-label="Decrease exposure by 0.5 EV"
        disabled={exposureComp <= MIN_EV}
        onMouseDown={() => startHold(-1)}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        onTouchStart={(e) => { e.preventDefault(); startHold(-1); }}
        onTouchEnd={stopHold}
      >−</button>

      <div
        ref={trackRef}
        className="digi-ev-track"
        role="slider"
        aria-valuemin={MIN_EV}
        aria-valuemax={MAX_EV}
        aria-valuenow={exposureComp}
        aria-valuetext={`${displayValue} EV`}
        tabIndex={0}
        onClick={handleTrackClick}
        onTouchStart={handleTrackTouch}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   { e.preventDefault(); fireStep(1); }
          if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') { e.preventDefault(); fireStep(-1); }
        }}
      >
        {/* Directional fill from center */}
        <div className="digi-ev-fill" style={{ left: fillLeft, width: fillWidth, background: fillBg }} />

        <div className="digi-ev-ticks">
          {EV_STEPS.map((v) => {
            const isZero  = v === 0;
            const isWhole = Number.isInteger(v) && v !== 0;
            const isActive = Math.abs(exposureComp - v) < 0.15;
            const cls = [
              'digi-ev-tick',
              isZero   ? 'tick-zero'  : '',
              isWhole  ? 'tick-whole' : '',
              isActive ? 'tick-active' : '',
            ].filter(Boolean).join(' ');
            return (
              <div key={v} className={cls} style={{ left: `${((v + 2) / 4) * 100}%` }}>
                <span className="tick-mark" />
                {isZero && <span className="tick-zero-label">0</span>}
              </div>
            );
          })}
        </div>

        {/* Physical indicator — downward triangle */}
        <div className="digi-ev-pointer" style={{ left: `${pointerPct}%` }} aria-hidden="true" />
      </div>

      <button
        className="digi-ev-btn ev-plus"
        aria-label="Increase exposure by 0.5 EV"
        disabled={exposureComp >= MAX_EV}
        onMouseDown={() => startHold(1)}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        onTouchStart={(e) => { e.preventDefault(); startHold(1); }}
        onTouchEnd={stopHold}
      >+</button>

      <div className={`digi-ev-value${flash ? ' ev-value-flash' : ''}`}>
        {displayValue}<span className="digi-ev-unit">EV</span>
      </div>
    </div>
  );
}
