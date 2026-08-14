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
      case 'g': case 'G': if (!store.isMenuOpen) store.toggleGrid(); break;
      case 'd': case 'D': if (!store.isMenuOpen) store.toggleDateStamp(); break;
      case 'f': case 'F': if (!store.isMenuOpen) store.cycleFlash(); break;
      case 's': case 'S': if (!store.isMenuOpen) store.cycleScene(); break;
      case 'c': case 'C': if (!store.isMenuOpen) store.toggleFacingMode(); break;
      case 'r': case 'R': if (!store.isMenuOpen) store.cycleFilter(); break;
      case 'p': case 'P': if (!store.isMenuOpen && store.mode !== 'playback') store.setPanoramaMode(store.panoramaMode === 'assist' ? 'off' : 'assist'); break;
      case 'l': case 'L': if (!store.isMenuOpen) store.toggleSmileShutter(); break;
      case 't': case 'T': if (!store.isMenuOpen) store.cycleTimelapse(); break;
      case 'o': case 'O': if (!store.isMenuOpen) store.toggleMotionDetect(); break;
      case '=': case '+': if (!store.isMenuOpen) store.adjustExposure(0.3); break;
      case '-': case '_': if (!store.isMenuOpen) store.adjustExposure(-0.3); break;
      case 'ArrowUp': store.setZoomLevel(store.zoomLevel + 1); break;
      case 'ArrowDown': store.setZoomLevel(store.zoomLevel - 1); break;
      case 'ArrowLeft': if (store.mode === 'playback') store.setGalleryIndex(Math.max(0, store.galleryIndex - 1)); break;
      case 'ArrowRight': if (store.mode === 'playback') store.setGalleryIndex(Math.min(store.captures.length - 1, store.galleryIndex + 1)); break;
      case '1': store.setZoomLevel(1); break;
      case '2': store.setZoomLevel(2); break;
      case '3': store.setZoomLevel(3); break;
      case '4': store.setZoomLevel(4); break;
      case 'Escape':
        if (store.isMenuOpen) store.setMenuOpen(false);
        else if (store.mode === 'playback') store.setMode('photo');
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
