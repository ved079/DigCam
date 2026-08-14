'use client';

import { useRef, useCallback, useState } from 'react';
import type { CameraMode, BurstMode } from '@/lib/camera-store';

interface ShutterDialProps {
  mode: CameraMode;
  isRecording: boolean;
  isBursting: boolean;
  burstMode: BurstMode;
  zoomLevel: number;
  onShutter: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPlayClick: () => void;
}

const OUTER       = 50;  // SVG outer ring radius (viewBox 0 0 100 100, centre = 50,50)
const TICK_OUT    = 47;  // tick mark outer end radius
const TICK_IN_MIN = 42;  // minor tick inner end
const TICK_IN_MAJ = 38;  // major tick inner end
const CENTER_HOLE = 27;  // inner cutout radius (center button lives here)
const ZOOM_STEP_DEG = 22; // degrees of touch drag per zoom step
const WHEEL_STEP_DEG = 45; // visual rotation per mouse-wheel zoom step

// 36 ticks at 10° spacing; every 9th is major (= every 90°, 4 stops)
const TICKS = Array.from({ length: 36 }, (_, i) => {
  const deg = i * 10;
  const isMajor = i % 9 === 0;
  const rad = (deg - 90) * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x1: 50 + TICK_OUT * cos,
    y1: 50 + TICK_OUT * sin,
    x2: 50 + (isMajor ? TICK_IN_MAJ : TICK_IN_MIN) * cos,
    y2: 50 + (isMajor ? TICK_IN_MAJ : TICK_IN_MIN) * sin,
    isMajor,
  };
});

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export function ShutterDial({
  mode, isRecording, isBursting, burstMode,
  zoomLevel, onShutter, onZoomIn, onZoomOut, onPlayClick,
}: ShutterDialProps) {
  const [dialAngle, setDialAngle] = useState(0);

  // Tracks zoom level for lock logic. Updated eagerly in handlers so back-to-back
  // events see the right value before React re-renders. The store's own zoomIn/zoomOut
  // actions read from current state (not a closure), so they always stack correctly.
  const zoomLevelRef = useRef(zoomLevel);

  const lastAngleRef  = useRef<number | null>(null);
  const accumRef      = useRef(0);
  const wrapperRef    = useRef<HTMLDivElement>(null);

  const getAngleFromCenter = useCallback((clientX: number, clientY: number) => {
    if (!wrapperRef.current) return 0;
    const { left, top, width, height } = wrapperRef.current.getBoundingClientRect();
    return Math.atan2(clientY - (top + height / 2), clientX - (left + width / 2)) * (180 / Math.PI);
  }, []);

  const getDistFromCenter = useCallback((clientX: number, clientY: number) => {
    if (!wrapperRef.current) return 0;
    const { left, top, width, height } = wrapperRef.current.getBoundingClientRect();
    return Math.hypot(clientX - (left + width / 2), clientY - (top + height / 2));
  }, []);

  // ── Mouse wheel ──────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      if (zoomLevelRef.current >= MAX_ZOOM) return;
      // Update ref eagerly so back-to-back events see the new value
      // before React re-renders and the useEffect can sync it.
      zoomLevelRef.current = Math.min(MAX_ZOOM, zoomLevelRef.current + 1);
      onZoomIn();
      setDialAngle(a => a + WHEEL_STEP_DEG);
    } else {
      if (zoomLevelRef.current <= MIN_ZOOM) return;
      zoomLevelRef.current = Math.max(MIN_ZOOM, zoomLevelRef.current - 1);
      onZoomOut();
      setDialAngle(a => a - WHEEL_STEP_DEG);
    }
  }, [onZoomIn, onZoomOut]);

  // ── Touch drag ───────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    // Ignore touches that land inside the center-button zone
    const pxRadius = wrapperRef.current ? wrapperRef.current.offsetWidth / 2 : 50;
    const centerPx = pxRadius * (CENTER_HOLE / OUTER);
    if (getDistFromCenter(t.clientX, t.clientY) <= centerPx) return;
    lastAngleRef.current = getAngleFromCenter(t.clientX, t.clientY);
    accumRef.current = 0;
  }, [getAngleFromCenter, getDistFromCenter]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (lastAngleRef.current === null) return;
    e.preventDefault();
    const t = e.touches[0];
    const current = getAngleFromCenter(t.clientX, t.clientY);
    let delta = current - lastAngleRef.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    lastAngleRef.current = current;

    const z = zoomLevelRef.current;
    const atMax = z >= MAX_ZOOM;
    const atMin = z <= MIN_ZOOM;

    // Block rotation (and accumulation) when already at a limit
    if (delta > 0 && atMax) return;
    if (delta < 0 && atMin) return;

    setDialAngle(a => a + delta);
    accumRef.current += delta;

    if (accumRef.current >= ZOOM_STEP_DEG) {
      if (zoomLevelRef.current < MAX_ZOOM) {
        zoomLevelRef.current = Math.min(MAX_ZOOM, zoomLevelRef.current + 1);
        onZoomIn();
      }
      accumRef.current = 0;
    }
    if (accumRef.current <= -ZOOM_STEP_DEG) {
      if (zoomLevelRef.current > MIN_ZOOM) {
        zoomLevelRef.current = Math.max(MIN_ZOOM, zoomLevelRef.current - 1);
        onZoomOut();
      }
      accumRef.current = 0;
    }
  }, [getAngleFromCenter, onZoomIn, onZoomOut]);

  const handleTouchEnd = useCallback(() => {
    lastAngleRef.current = null;
    accumRef.current = 0;
  }, []);

  const centerClass = [
    'shutter-dial-center',
    isRecording              ? 'recording'   : '',
    mode === 'video' && !isRecording ? 'video-ready' : '',
    isBursting               ? 'bursting'    : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={wrapperRef}
      className="shutter-dial-wrapper"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <svg className="shutter-dial-svg" viewBox="0 0 100 100" aria-hidden="true">
        {/* ── Static outer bezel (does not rotate) ── */}
        {/* Outer ring background — dark machined aluminum look */}
        <circle cx="50" cy="50" r={OUTER - 0.75}
          fill="url(#ringGrad)" stroke="#606068" strokeWidth="1.25" />

        {/* Subtle inner shadow groove where ring meets center */}
        <circle cx="50" cy="50" r={CENTER_HOLE + 5}
          fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="2.5" />
        <circle cx="50" cy="50" r={CENTER_HOLE + 3.5}
          fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />

        {/* Fixed reference notch at top — the "index mark" on a real lens ring */}
        <polygon
          points="50,4 47.5,9 52.5,9"
          fill="rgba(255,255,255,0.55)"
        />

        {/* ── Rotating group — tick marks spin with dialAngle ── */}
        <g transform={`rotate(${dialAngle}, 50, 50)`}>
          {TICKS.map((t, i) => (
            <line
              key={i}
              x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
              stroke={t.isMajor ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.14)'}
              strokeWidth={t.isMajor ? 1.75 : 0.75}
              strokeLinecap="round"
            />
          ))}
          {/* Orange accent dot on one major tick so rotation direction is obvious */}
          <circle
            cx={50 + (TICK_IN_MAJ - 1) * Math.cos((-90) * Math.PI / 180)}
            cy={50 + (TICK_IN_MAJ - 1) * Math.sin((-90) * Math.PI / 180)}
            r="2" fill="#cc5500"
          />
        </g>

        {/* Gradient defs */}
        <defs>
          <radialGradient id="ringGrad" cx="40%" cy="35%" r="65%">
            <stop offset="0%"   stopColor="#3a3a3e" />
            <stop offset="55%"  stopColor="#252528" />
            <stop offset="100%" stopColor="#1e1e22" />
          </radialGradient>
        </defs>

        {/* Inner cutout — matches camera body color so center button sits flush */}
        <circle cx="50" cy="50" r={CENTER_HOLE} fill="#1a1a1e" />
      </svg>

      {/* Zoom level readout */}
      <span className="shutter-dial-zoom-label">
        {zoomLevel.toFixed(1)}<span className="shutter-dial-zoom-unit">×</span>
      </span>

      {/* Center shutter / record button */}
      <button
        className={centerClass}
        onClick={() => { onPlayClick(); onShutter(); }}
        title={
          burstMode !== 'off' ? `Burst: ${burstMode.toUpperCase()}`
          : mode === 'video'  ? (isRecording ? 'Stop recording' : 'Start recording')
          : 'Take photo'
        }
      >
        {mode === 'video' && !isRecording
          ? <div className="shutter-center-video-icon" />
          : isRecording
            ? <div className="shutter-center-stop-icon" />
            : <div className="shutter-center-dot" />}
      </button>
    </div>
  );
}
