'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraMode, BurstMode } from '@/lib/camera-store';
import { useCameraStore } from '@/lib/camera-store';

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

// ── Motorized-dial spring ─────────────────────────────────────────────
// A lightly underdamped spring (stepper-motor-ish): quick initial response,
// a hair of overshoot, gentle deceleration into the final position. The SAME
// constants drive the dial angle and the lens zoom, and both are integrated
// inside a single rAF tick, so they always arrive in lockstep.
//
// While the finger is down the spring is much stiffer so the dial tracks the
// hand tightly (the "weight" shows only as slight resistance); on release the
// stiffness relaxes so both dial and lens coast and settle with momentum.
const SPRING_STIFFNESS_ACTIVE = 1800;  // dragging: track the finger closely
const SPRING_DAMPING_ACTIVE   = 75;    // near-critically damped, no float
const SPRING_STIFFNESS        = 220;   // released: "stiffness" k
const SPRING_DAMPING          = 19;    // damping coefficient c (settles ≈ 400ms)
const SETTLE_EPS       = 0.0006; // |position − target| below which we stop
const SETTLE_VEL       = 0.05;   // |velocity| below which we stop
const TICK_DEG         = 10;     // detent grid — matches the SVG tick marks
const DETENT_RANGE     = 3;      // deg either side of a tick where it pulls
const DETENT_FORCE     = 60;     // restoring acceleration toward a detent
const DETENT_MAX_SPEED = 90;     // deg/s — detent engages only when slower

export function ShutterDial({
  mode, isRecording, isBursting, burstMode,
  zoomLevel, onShutter, onZoomIn, onZoomOut, onPlayClick,
}: ShutterDialProps) {
  // displayZoom is the animated value written by the spring loop below; the
  // lens (DigiCam CCD pass) reads the very same value, so label + dial + lens
  // can never visually desync.
  const displayZoom = useCameraStore((s) => s.displayZoom);
  const setDisplayZoom = useCameraStore((s) => s.setDisplayZoom);

  const [dialAngle, setDialAngle] = useState(0);

  // Targets update instantly from input; display values spring toward them.
  const targetAngleRef     = useRef(0);
  const dispAngleRef       = useRef(0);
  const velAngleRef        = useRef(0);
  const dispZoomRef        = useRef(zoomLevel);
  const velZoomRef         = useRef(0);
  const lastStoredZoomRef  = useRef(zoomLevel);
  // Set true immediately before a dial-driven zoom change so the zoomLevel
  // effect knows to animate (rather than snap) toward the new target.
  const dialDrivenRef      = useRef(false);
  const draggingRef        = useRef(false);
  const rafRef             = useRef<number | null>(null);
  const lastTimeRef        = useRef(0);

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

  // ── Spring integration loop ────────────────────────────────────────
  // Stored in a ref so the loop can re-schedule itself without a
  // self-referencing callback (react-hooks/immutability rule).
  const loopRef = useRef<(now: number) => void>(() => {});

  useEffect(() => {
    loopRef.current = (now: number) => {
      rafRef.current = null;
      const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      const k = draggingRef.current ? SPRING_STIFFNESS_ACTIVE : SPRING_STIFFNESS;
      const c = draggingRef.current ? SPRING_DAMPING_ACTIVE   : SPRING_DAMPING;

      // Lens zoom: target is the store zoomLevel, which input sets instantly.
      const zTarget = useCameraStore.getState().zoomLevel;
      const zDiff = zTarget - dispZoomRef.current;
      velZoomRef.current += (k * zDiff - c * velZoomRef.current) * dt;
      dispZoomRef.current += velZoomRef.current * dt;
      if (dispZoomRef.current < MIN_ZOOM) dispZoomRef.current = MIN_ZOOM;
      if (dispZoomRef.current > MAX_ZOOM) dispZoomRef.current = MAX_ZOOM;

      // Dial angle, plus a subtle click-stop detent that only engages while the
      // dial is moving slowly (feels like a ratchet; disappears on a quick flick).
      const aTarget = targetAngleRef.current;
      const aDiff = aTarget - dispAngleRef.current;
      let aAccel = k * aDiff - c * velAngleRef.current;
      const speed = Math.abs(velAngleRef.current);
      if (speed < DETENT_MAX_SPEED) {
        let toCenter = ((dispAngleRef.current % TICK_DEG) + TICK_DEG) % TICK_DEG;
        if (toCenter > TICK_DEG / 2) toCenter -= TICK_DEG;
        if (Math.abs(toCenter) < DETENT_RANGE) {
          aAccel += -toCenter * DETENT_FORCE * (1 - speed / DETENT_MAX_SPEED);
        }
      }
      velAngleRef.current += aAccel * dt;
      dispAngleRef.current += velAngleRef.current * dt;

      setDialAngle(dispAngleRef.current);

      // Push the animated zoom out so the lens/HUD follows in lockstep.
      if (Math.abs(dispZoomRef.current - lastStoredZoomRef.current) > 1e-5) {
        lastStoredZoomRef.current = dispZoomRef.current;
        setDisplayZoom(dispZoomRef.current);
      }

      const settled =
        Math.abs(aDiff) < SETTLE_EPS && Math.abs(velAngleRef.current) < SETTLE_VEL &&
        Math.abs(zDiff) < 2e-4 && Math.abs(velZoomRef.current) < 2e-4;
      if (!settled) rafRef.current = requestAnimationFrame(loopRef.current);
    };
  }, [setDisplayZoom]);

  const startTween = useCallback(() => {
    if (rafRef.current !== null) return;
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loopRef.current);
  }, []);

  // Boot sync: snap the animated value to the stored zoom so the camera does
  // not "wind the lens in" on startup.
  useEffect(() => {
    const t = useCameraStore.getState().zoomLevel;
    dispZoomRef.current = t;
    velZoomRef.current = 0;
    lastStoredZoomRef.current = t;
    setDisplayZoom(t);
  }, [setDisplayZoom]);

  // External target changes (pinch, D-pad, menu, restored settings) snap the
  // display to the target. Dial-driven changes flag themselves so the spring
  // animates them with mechanical weight instead.
  useEffect(() => {
    if (dialDrivenRef.current) { dialDrivenRef.current = false; return; }
    dispZoomRef.current = zoomLevel;
    velZoomRef.current = 0;
    lastStoredZoomRef.current = zoomLevel;
    setDisplayZoom(zoomLevel);
  }, [zoomLevel, setDisplayZoom]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Mouse wheel ───────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const target = useCameraStore.getState().zoomLevel;
    if (e.deltaY < 0) {
      if (target >= MAX_ZOOM) return;
      dialDrivenRef.current = true;
      onZoomIn();
      targetAngleRef.current += WHEEL_STEP_DEG;
    } else {
      if (target <= MIN_ZOOM) return;
      dialDrivenRef.current = true;
      onZoomOut();
      targetAngleRef.current -= WHEEL_STEP_DEG;
    }
    startTween();
  }, [onZoomIn, onZoomOut, startTween]);

  // ── Touch drag ────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    // Ignore touches that land inside the center-button zone
    const pxRadius = wrapperRef.current ? wrapperRef.current.offsetWidth / 2 : 50;
    const centerPx = pxRadius * (CENTER_HOLE / OUTER);
    if (getDistFromCenter(t.clientX, t.clientY) <= centerPx) return;
    draggingRef.current = true;
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

    const target = useCameraStore.getState().zoomLevel;
    // Block rotation (and accumulation) when already at a limit
    if (delta > 0 && target >= MAX_ZOOM) return;
    if (delta < 0 && target <= MIN_ZOOM) return;

    targetAngleRef.current += delta;
    accumRef.current += delta;

    if (accumRef.current >= ZOOM_STEP_DEG) {
      if (target < MAX_ZOOM) { dialDrivenRef.current = true; onZoomIn(); }
      accumRef.current = 0;
    }
    if (accumRef.current <= -ZOOM_STEP_DEG) {
      if (target > MIN_ZOOM) { dialDrivenRef.current = true; onZoomOut(); }
      accumRef.current = 0;
    }
    startTween();
  }, [getAngleFromCenter, onZoomIn, onZoomOut, startTween]);

  const handleTouchEnd = useCallback(() => {
    draggingRef.current = false;
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
      onTouchCancel={handleTouchEnd}
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

        {/* ── Rotating group — tick marks spin with the animated dialAngle ── */}
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

      {/* Zoom level readout — counts in sync with the animated lens zoom */}
      <span className="shutter-dial-zoom-label">
        {displayZoom.toFixed(1)}<span className="shutter-dial-zoom-unit">×</span>
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
