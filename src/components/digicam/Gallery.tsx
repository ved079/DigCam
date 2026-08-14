'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useCameraStore } from '@/lib/camera-store';
import { deleteCaptureFromDB } from '@/lib/db-persistence';
import { formatCompactDateTime } from '@/lib/utils';

function formatDMS(val: number, pos: string, neg: string): string {
  const abs = Math.abs(val);
  const dir = val >= 0 ? pos : neg;
  const deg = Math.floor(abs);
  const minF = (abs - deg) * 60;
  const min = Math.floor(minF);
  const sec = ((minF - min) * 60).toFixed(1);
  return `${deg}\u00B0${String(min).padStart(2, '0')}'${sec}"${dir}`;
}

function PlaybackBattery() {
  return (
    <span className="digi-gallery-batt" aria-label="Battery">
      <span className="digi-gallery-batt-fill" style={{ width: '70%' }} />
    </span>
  );
}

export function Gallery() {
  const captures = useCameraStore((s) => s.captures);
  const galleryIndex = useCameraStore((s) => s.galleryIndex);
  const setGalleryIndex = useCameraStore((s) => s.setGalleryIndex);
  const setMode = useCameraStore((s) => s.setMode);
  const playbackView = useCameraStore((s) => s.playbackView);
  const setPlaybackView = useCameraStore((s) => s.setPlaybackView);
  const playbackInfo = useCameraStore((s) => s.playbackInfo);
  const setPlaybackInfo = useCameraStore((s) => s.setPlaybackInfo);
  const playbackDelete = useCameraStore((s) => s.playbackDelete);
  const setPlaybackDelete = useCameraStore((s) => s.setPlaybackDelete);
  const playbackDeleteChoice = useCameraStore((s) => s.playbackDeleteChoice);
  const setPlaybackDeleteChoice = useCameraStore((s) => s.setPlaybackDeleteChoice);
  const playbackPan = useCameraStore((s) => s.playbackPan);
  const playbackCursor = useCameraStore((s) => s.playbackCursor);
  const setPlaybackCursor = useCameraStore((s) => s.setPlaybackCursor);
  const playbackVideoPlaying = useCameraStore((s) => s.playbackVideoPlaying);
  const setPlaybackVideoPlaying = useCameraStore((s) => s.setPlaybackVideoPlaying);
  const zoomLevel = useCameraStore((s) => s.zoomLevel);
  const deleteCapture = useCameraStore((s) => s.deleteCapture);

  const current = captures[galleryIndex];
  const videoRef = useRef<HTMLVideoElement>(null);
  const shownId = current?.id;

  // Clamp indices whenever captures shrink (e.g. after a delete).
  useEffect(() => {
    if (captures.length === 0) return;
    if (galleryIndex >= captures.length) setGalleryIndex(captures.length - 1);
    if (playbackCursor >= captures.length) setPlaybackCursor(captures.length - 1);
  }, [captures.length, galleryIndex, playbackCursor, setGalleryIndex, setPlaybackCursor]);

  // Stop video playback whenever the shown capture changes.
  useEffect(() => {
    setPlaybackVideoPlaying(false);
  }, [shownId, setPlaybackVideoPlaying]);

  // Play/pause the current video when the D-pad center toggles it.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playbackVideoPlaying) v.play().catch(() => {});
    else v.pause();
  }, [playbackVideoPlaying, shownId]);

  // Draw histogram in the DISP info overlay.
  useEffect(() => {
    if (!playbackInfo || !current || current.type === 'video') return;
    const canvas = document.getElementById('gallery-histogram') as HTMLCanvasElement;
    if (!canvas) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const offscreen = document.createElement('canvas');
      offscreen.width = 256;
      offscreen.height = Math.round((img.height / img.width) * 256);
      const octx = offscreen.getContext('2d');
      if (!octx) return;
      octx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
      const imgData = octx.getImageData(0, 0, offscreen.width, offscreen.height);
      const d = imgData.data;
      const lumBins = new Uint32Array(256);
      const rBins = new Uint32Array(256);
      const gBins = new Uint32Array(256);
      const bBins = new Uint32Array(256);
      for (let i = 0; i < d.length; i += 4) {
        rBins[d[i]]++;
        gBins[d[i + 1]]++;
        bBins[d[i + 2]]++;
        const lum = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
        lumBins[lum]++;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      const drawChannel = (bins: Uint32Array, color: string) => {
        const max = Math.max(...bins) || 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let i = 0; i < 256; i++) {
          const x = (i / 255) * W;
          const y = H - (bins[i] / max) * (H - 4);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      drawChannel(rBins, 'rgba(255,80,80,0.3)');
      drawChannel(gBins, 'rgba(80,255,80,0.3)');
      drawChannel(bBins, 'rgba(80,80,255,0.3)');
      const lumMax = Math.max(...lumBins) || 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * W;
        const y = H - (lumBins[i] / lumMax) * (H - 4);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    img.src = current.dataUrl;
  }, [playbackInfo, current]);

  const goNext = useCallback(() => {
    if (galleryIndex < captures.length - 1) {
      setGalleryIndex(galleryIndex + 1);
      setPlaybackInfo(false);
    }
  }, [galleryIndex, captures.length, setGalleryIndex, setPlaybackInfo]);

  const goPrev = useCallback(() => {
    if (galleryIndex > 0) {
      setGalleryIndex(galleryIndex - 1);
      setPlaybackInfo(false);
    }
  }, [galleryIndex, setGalleryIndex, setPlaybackInfo]);

  // Touch swipe — a convenience gesture; the D-pad is the primary control.
  useEffect(() => {
    let startX = 0;
    const handleTouchStart = (e: TouchEvent) => { startX = e.touches[0].clientX; };
    const handleTouchEnd = (e: TouchEvent) => {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) {
        if (playbackView !== 'single' || zoomLevel > 1.01) return;
        if (diff > 0) goNext();
        else goPrev();
      }
    };
    const el = document.getElementById('gallery-swipe-area');
    el?.addEventListener('touchstart', handleTouchStart, { passive: true });
    el?.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      el?.removeEventListener('touchstart', handleTouchStart);
      el?.removeEventListener('touchend', handleTouchEnd);
    };
  }, [goNext, goPrev, playbackView, zoomLevel]);

  const performDelete = useCallback(() => {
    if (!current) return;
    deleteCapture(current.id);
    deleteCaptureFromDB(current.id).catch(() => {});
    setPlaybackDelete(false);
    setPlaybackVideoPlaying(false);
    setPlaybackInfo(false);
  }, [current, deleteCapture, setPlaybackDelete, setPlaybackVideoPlaying, setPlaybackInfo]);

  const openCapture = useCallback((i: number) => {
    setGalleryIndex(i);
    setPlaybackView('single');
  }, [setGalleryIndex, setPlaybackView]);

  if (captures.length === 0) {
    return (
      <div className="digi-gallery digi-gallery-empty">
        <p className="digi-no-image-text">NO IMAGES</p>
        <button className="digi-gallery-back-btn" onClick={() => setMode('photo')}>
          EXIT
        </button>
      </div>
    );
  }

  if (!current) return null;

  const counter = `${String(galleryIndex + 1).padStart(2, '0')}/${String(captures.length).padStart(2, '0')}`;
  const zoomStyle = {
    transformOrigin: `${playbackPan.x}% ${playbackPan.y}%`,
    transform: `scale(${zoomLevel}) rotate(${current.rotation || 0}deg)`,
  };

  return (
    <div className="digi-gallery" id="gallery-swipe-area">
      {playbackView === 'index' ? (
        <div className="digi-index-grid" role="grid" aria-label="Thumbnail index">
          {captures.map((cap, i) => (
            <button
              key={cap.id}
              role="gridcell"
              className={`digi-index-cell ${i === playbackCursor ? 'cell-cur' : ''}`}
              onClick={() => openCapture(i)}
            >
              {cap.type === 'video' ? (
                <video src={cap.dataUrl} muted playsInline className="digi-index-media" />
              ) : (
                <img src={cap.dataUrl} alt={`Photo ${i + 1}`} className="digi-index-media" />
              )}
              {cap.type === 'video' && <span className="digi-index-play">▶</span>}
              {cap.protected && <span className="digi-protect-badge" title="Protected">P</span>}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="digi-gallery-display" id="gallery-display">
            <div className="digi-gallery-transition" key={shownId}>
              {current.type === 'video' ? (
                <video
                  ref={videoRef}
                  src={current.dataUrl}
                  muted
                  playsInline
                  className="digi-gallery-video"
                  style={zoomStyle}
                  onClick={() => setPlaybackVideoPlaying(!playbackVideoPlaying)}
                />
              ) : (
                <img
                  src={current.dataUrl}
                  alt={`Photo ${galleryIndex + 1}`}
                  className="digi-gallery-image"
                  style={zoomStyle}
                />
              )}
            </div>
            {current.type === 'video' && !playbackVideoPlaying && (
              <div className="digi-play-overlay" onClick={() => setPlaybackVideoPlaying(true)}>
                <div className="digi-play-triangle" />
              </div>
            )}
          </div>

          {/* Minimal readout bar — counter, battery, protect — like a camera LCD */}
          <div className="digi-gallery-hud">
            <div className="digi-gallery-hud-left">
              <PlaybackBattery />
              {current.protected && (
                <span className="digi-protect-badge" title="Protected">P</span>
              )}
            </div>
            <span className="digi-gallery-counter">{counter}</span>
          </div>

          {/* DISP info readout */}
          {playbackInfo && (
            <div className="digi-gallery-info">
              <div className="digi-info-head">
                <span className="digi-info-led" />
                <span className="digi-info-title">IMAGE INFO</span>
                <button className="digi-info-close" onClick={() => setPlaybackInfo(false)} aria-label="Close info">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <dl className="digi-info-rows">
                <div className="digi-info-row">
                  <dt className="digi-info-label">FILE</dt>
                  <dd className="digi-info-value">DSC{String(galleryIndex + 1).padStart(4, '0')}.JPG</dd>
                </div>
                <div className="digi-info-row">
                  <dt className="digi-info-label">DATE</dt>
                  <dd className="digi-info-value">{formatCompactDateTime(current.timestamp)}</dd>
                </div>
                <div className="digi-info-row">
                  <dt className="digi-info-label">SCENE</dt>
                  <dd className="digi-info-value">{current.sceneMode}</dd>
                </div>
                <div className="digi-info-row">
                  <dt className="digi-info-label">FLASH</dt>
                  <dd className="digi-info-value">{current.flashMode.toUpperCase()}</dd>
                </div>
                <div className="digi-info-row">
                  <dt className="digi-info-label">SIZE</dt>
                  <dd className="digi-info-value">14.0MP 4320×3240</dd>
                </div>
                {current.filter && current.filter !== 'off' && (
                  <div className="digi-info-row">
                    <dt className="digi-info-label">FILTER</dt>
                    <dd className="digi-info-value">{current.filter.toUpperCase()}</dd>
                  </div>
                )}
                {current.whiteBalance && (current.whiteBalance.temperature !== 0 || current.whiteBalance.tint !== 0) && (
                  <>
                    <div className="digi-info-row">
                      <dt className="digi-info-label">WB TEMP</dt>
                      <dd className="digi-info-value">{current.whiteBalance.temperature > 0 ? '+' : ''}{current.whiteBalance.temperature.toFixed(1)}</dd>
                    </div>
                    <div className="digi-info-row">
                      <dt className="digi-info-label">WB TINT</dt>
                      <dd className="digi-info-value">{current.whiteBalance.tint > 0 ? '+' : ''}{current.whiteBalance.tint.toFixed(1)}</dd>
                    </div>
                  </>
                )}
                {current.aspectMode && current.aspectMode !== '4:3' && (
                  <div className="digi-info-row">
                    <dt className="digi-info-label">ASPECT</dt>
                    <dd className="digi-info-value">{current.aspectMode}</dd>
                  </div>
                )}
                {current.latitude !== undefined && current.longitude !== undefined && (
                  <div className="digi-info-row">
                    <dt className="digi-info-label">GPS</dt>
                    <dd className="digi-info-value">{formatDMS(current.latitude, 'N', 'S')} {formatDMS(current.longitude, 'E', 'W')}</dd>
                  </div>
                )}
                {current.protected && (
                  <div className="digi-info-row">
                    <dt className="digi-info-label">PROTECT</dt>
                    <dd className="digi-info-value">ON</dd>
                  </div>
                )}
              </dl>
              <div className="digi-info-hist-wrap">
                <span className="digi-info-hist-label">TONAL RANGE</span>
                <canvas id="gallery-histogram" width="200" height="48" className="digi-info-hist" />
              </div>
            </div>
          )}

          {/* Delete confirmation overlay */}
          {playbackDelete && (
            <div className="digi-delete-confirm">
              <div className="digi-delete-title">DELETE THIS IMAGE?</div>
              <div className="digi-delete-options">
                <button
                  className={`digi-delete-opt ${playbackDeleteChoice === 'yes' ? 'opt-sel' : ''}`}
                  onClick={() => setPlaybackDeleteChoice('yes')}
                >
                  YES
                </button>
                <button
                  className={`digi-delete-opt ${playbackDeleteChoice === 'no' ? 'opt-sel' : ''}`}
                  onClick={() => setPlaybackDeleteChoice('no')}
                >
                  NO
                </button>
              </div>
              {playbackDeleteChoice === 'yes' && (
                <button className="digi-delete-go" onClick={performDelete}>CONFIRM</button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}