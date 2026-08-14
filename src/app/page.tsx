'use client';

import './digicam.css';
import { useEffect, useCallback } from 'react';
import { DigiCam } from '@/components/digicam/DigiCam';
import { useCameraStore } from '@/lib/camera-store';

export default function Home() {
  const store = useCameraStore();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        document.querySelector('.digi-shutter-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        break;
      case 'm': case 'M': store.setMenuOpen(!store.isMenuOpen); break;
      case 'g': case 'G': if (!store.isMenuOpen && store.mode !== 'playback') store.toggleGrid(); break;
      case 'd': case 'D': if (!store.isMenuOpen && store.mode !== 'playback') store.toggleDateStamp(); break;
      case 'f': case 'F': if (!store.isMenuOpen && store.mode !== 'playback') store.cycleFlash(); break;
      case 's': case 'S': if (!store.isMenuOpen && store.mode !== 'playback') store.cycleScene(); break;
      case 'c': case 'C': if (!store.isMenuOpen && store.mode !== 'playback') store.toggleFacingMode(); break;
      case 'r': case 'R': if (!store.isMenuOpen && store.mode !== 'playback') store.cycleFilter(); break;
      case 'p': case 'P': if (!store.isMenuOpen && store.mode !== 'playback') store.setPanoramaMode(store.panoramaMode === 'assist' ? 'off' : 'assist'); break;
      case 'l': case 'L': if (!store.isMenuOpen && store.mode !== 'playback') store.toggleSmileShutter(); break;
      case 't': case 'T': if (!store.isMenuOpen && store.mode !== 'playback') store.cycleTimelapse(); break;
      case 'o': case 'O': if (!store.isMenuOpen && store.mode !== 'playback') store.toggleMotionDetect(); break;
      case '=': case '+': if (!store.isMenuOpen && store.mode !== 'playback') store.adjustExposure(0.3); break;
      case '-': case '_': if (!store.isMenuOpen && store.mode !== 'playback') store.adjustExposure(-0.3); break;
      // In playback the D-pad keys are owned by PlaybackControls (delete choices,
      // index cursor, zoom pan, prev/next) — this page-level handler must not
      // fight it by mutating galleryIndex or zoom directly.
      case 'ArrowUp': if (store.mode !== 'playback') store.setZoomLevel(store.zoomLevel + 1); break;
      case 'ArrowDown': if (store.mode !== 'playback') store.setZoomLevel(store.zoomLevel - 1); break;
      case '1': if (store.mode !== 'playback') store.setZoomLevel(1); break;
      case '2': if (store.mode !== 'playback') store.setZoomLevel(2); break;
      case '3': if (store.mode !== 'playback') store.setZoomLevel(3); break;
      case '4': if (store.mode !== 'playback') store.setZoomLevel(4); break;
      case 'Escape':
        if (store.isMenuOpen) store.setMenuOpen(false); // in playback Escape is tiered by PlaybackControls
        break;
    }
  }, [store]);

  useEffect(() => { window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }, [handleKeyDown]);

  return (
    <main className="digi-main">
      <DigiCam />
    </main>
  );
}
