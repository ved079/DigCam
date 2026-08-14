'use client';

import './touch-dpad.css';
import { useCallback } from 'react';
import { useCameraStore } from '@/lib/camera-store';

const dpadStyles: React.CSSProperties = {
  position: 'absolute',
  bottom: 8,
  right: 8,
  zIndex: 10,
  pointerEvents: 'none',
};

const ringStyles: React.CSSProperties = {
  position: 'relative',
  width: 96,
  height: 96,
  borderRadius: '50%',
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid rgba(255,255,255,0.15)',
  pointerEvents: 'auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const btnBase: React.CSSProperties = {
  position: 'absolute',
  width: 36,
  height: 36,
  borderRadius: 4,
  background: 'rgba(255,255,255,0.12)',
  border: 'none',
  color: 'rgba(255,255,255,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
  WebkitTapHighlightColor: 'transparent',
};

const centerStyles: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  background: 'rgba(0,102,204,0.3)',
  border: '1px solid rgba(0,102,204,0.5)',
  color: 'rgba(255,255,255,0.6)',
  cursor: 'pointer',
  padding: 0,
  WebkitTapHighlightColor: 'transparent',
};

export function TouchDPad() {
  const { mode, toggleGrid, adjustExposure, setGalleryIndex, galleryIndex, captures, setZoomLevel, zoomLevel } = useCameraStore();

  const handleUp = useCallback(() => {
    if (mode === 'playback') return;
    adjustExposure(0.3);
  }, [mode, adjustExposure]);

  const handleDown = useCallback(() => {
    if (mode === 'playback') return;
    adjustExposure(-0.3);
  }, [mode, adjustExposure]);

  const handleLeft = useCallback(() => {
    if (mode === 'playback') {
      if (galleryIndex > 0) setGalleryIndex(galleryIndex - 1);
    } else {
      setZoomLevel(zoomLevel - 1);
    }
  }, [mode, galleryIndex, setGalleryIndex, zoomLevel, setZoomLevel]);

  const handleRight = useCallback(() => {
    if (mode === 'playback') {
      if (galleryIndex < captures.length - 1) setGalleryIndex(galleryIndex + 1);
    } else {
      setZoomLevel(zoomLevel + 1);
    }
  }, [mode, galleryIndex, captures.length, setGalleryIndex, zoomLevel, setZoomLevel]);

  const handleCenter = useCallback(() => {
    toggleGrid();
  }, [toggleGrid]);

  return (
    <div className="digi-touch-dpad" style={dpadStyles}>
      <div className="digi-dpad-ring" style={ringStyles}>
        <button
          className="digi-dpad-btn dpad-up"
          style={{ ...btnBase, top: -2, left: '50%', transform: 'translateX(-50%)' }}
          onTouchStart={(e) => { e.preventDefault(); handleUp(); }}
          onClick={handleUp}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="18 15 12 9 6 15" /></svg>
        </button>
        <button
          className="digi-dpad-btn dpad-down"
          style={{ ...btnBase, bottom: -2, left: '50%', transform: 'translateX(-50%)' }}
          onTouchStart={(e) => { e.preventDefault(); handleDown(); }}
          onClick={handleDown}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
        <button
          className="digi-dpad-btn dpad-left"
          style={{ ...btnBase, left: -2, top: '50%', transform: 'translateY(-50%)' }}
          onTouchStart={(e) => { e.preventDefault(); handleLeft(); }}
          onClick={handleLeft}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <button
          className="digi-dpad-btn dpad-right"
          style={{ ...btnBase, right: -2, top: '50%', transform: 'translateY(-50%)' }}
          onTouchStart={(e) => { e.preventDefault(); handleRight(); }}
          onClick={handleRight}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
        <button
          className="digi-dpad-center"
          style={centerStyles}
          onTouchStart={(e) => { e.preventDefault(); handleCenter(); }}
          onClick={handleCenter}
        />
      </div>
    </div>
  );
}