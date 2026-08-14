'use client';

import { useCallback, useEffect } from 'react';
import { useCameraStore } from '@/lib/camera-store';
import { saveCapture, deleteCaptureFromDB } from '@/lib/db-persistence';

const COLS = 3;

// Physical playback controls for the camera body: a D-pad (primary
// navigation, matching a real 2000s point-and-shoot) plus a function-key
// strip. All state is shared with the gallery through the camera store.
export function PlaybackControls() {
  const captures = useCameraStore((s) => s.captures);
  const galleryIndex = useCameraStore((s) => s.galleryIndex);
  const playbackView = useCameraStore((s) => s.playbackView);
  const playbackInfo = useCameraStore((s) => s.playbackInfo);
  const playbackDelete = useCameraStore((s) => s.playbackDelete);
  const playbackDeleteChoice = useCameraStore((s) => s.playbackDeleteChoice);
  const playbackPan = useCameraStore((s) => s.playbackPan);
  const playbackCursor = useCameraStore((s) => s.playbackCursor);
  const zoomLevel = useCameraStore((s) => s.zoomLevel);

  const setGalleryIndex = useCameraStore((s) => s.setGalleryIndex);
  const setPlaybackView = useCameraStore((s) => s.setPlaybackView);
  const setPlaybackInfo = useCameraStore((s) => s.setPlaybackInfo);
  const setPlaybackDelete = useCameraStore((s) => s.setPlaybackDelete);
  const setPlaybackDeleteChoice = useCameraStore((s) => s.setPlaybackDeleteChoice);
  const setPlaybackPan = useCameraStore((s) => s.setPlaybackPan);
  const setPlaybackCursor = useCameraStore((s) => s.setPlaybackCursor);
  const setPlaybackVideoPlaying = useCameraStore((s) => s.setPlaybackVideoPlaying);
  const toggleProtectCapture = useCameraStore((s) => s.toggleProtectCapture);
  const deleteCapture = useCameraStore((s) => s.deleteCapture);

  const n = captures.length;
  const idx = galleryIndex;
  const cur = captures[idx];
  const rows = Math.ceil(n / COLS);

  const resetPan = useCallback(() => setPlaybackPan({ x: 50, y: 50 }), [setPlaybackPan]);

  const pan = useCallback(
    (dx: number, dy: number) => {
      const x = Math.max(0, Math.min(100, playbackPan.x + dx));
      const y = Math.max(0, Math.min(100, playbackPan.y + dy));
      setPlaybackPan({ x, y });
    },
    [playbackPan.x, playbackPan.y, setPlaybackPan],
  );

  const moveCursor = useCallback(
    (dr: number, dc: number) => {
      const r = Math.floor(playbackCursor / COLS);
      const c = playbackCursor % COLS;
      const nr = Math.max(0, Math.min(rows - 1, r + dr));
      const nc = (c + dc + COLS) % COLS;
      const target = Math.min(nr * COLS + nc, n - 1);
      if (target >= 0) setPlaybackCursor(target);
    },
    [playbackCursor, rows, n, setPlaybackCursor],
  );

  const dpadLeft = useCallback(() => {
    if (playbackDelete) return setPlaybackDeleteChoice('no');
    if (playbackView === 'index') return moveCursor(0, -1);
    if (zoomLevel > 1.01) return pan(-20, 0);
    if (idx > 0) { setGalleryIndex(idx - 1); resetPan(); }
  }, [playbackDelete, playbackView, zoomLevel, idx, moveCursor, pan, resetPan, setGalleryIndex, setPlaybackDeleteChoice]);

  const dpadRight = useCallback(() => {
    if (playbackDelete) return setPlaybackDeleteChoice('yes');
    if (playbackView === 'index') return moveCursor(0, 1);
    if (zoomLevel > 1.01) return pan(20, 0);
    if (idx < n - 1) { setGalleryIndex(idx + 1); resetPan(); }
  }, [playbackDelete, playbackView, zoomLevel, idx, n, moveCursor, pan, resetPan, setGalleryIndex, setPlaybackDeleteChoice]);

  const dpadUp = useCallback(() => {
    if (playbackView === 'index') return moveCursor(-1, 0);
    if (zoomLevel > 1.01) return pan(0, -20);
  }, [playbackView, zoomLevel, moveCursor, pan]);

  const dpadDown = useCallback(() => {
    if (playbackView === 'index') return moveCursor(1, 0);
    if (zoomLevel > 1.01) return pan(0, 20);
  }, [playbackView, zoomLevel, moveCursor, pan]);

  const dpadCenter = useCallback(() => {
    if (playbackDelete) {
      if (playbackDeleteChoice === 'yes' && cur) {
        deleteCapture(cur.id);
        deleteCaptureFromDB(cur.id).catch(() => {});
        setPlaybackDelete(false);
        setPlaybackVideoPlaying(false);
        if (n > 1) {
          const next = Math.min(idx, n - 2);
          setGalleryIndex(next);
          setPlaybackCursor(next);
        }
      } else {
        setPlaybackDelete(false);
      }
      return;
    }
    if (playbackView === 'index') {
      setGalleryIndex(playbackCursor);
      setPlaybackCursor(playbackCursor);
      setPlaybackView('single');
      resetPan();
      return;
    }
    if (cur && cur.type === 'video') {
      setPlaybackVideoPlaying(!useCameraStore.getState().playbackVideoPlaying);
    }
  }, [playbackDelete, playbackDeleteChoice, cur, n, idx, playbackView, playbackCursor, deleteCapture, setPlaybackDelete, setPlaybackVideoPlaying, setGalleryIndex, setPlaybackCursor, setPlaybackView, resetPan]);

  const openIndex = useCallback(() => {
    setPlaybackView('index');
    setPlaybackCursor(idx);
    setPlaybackDelete(false);
  }, [setPlaybackView, setPlaybackCursor, setPlaybackDelete, idx]);

  const closeIndex = useCallback(() => {
    setPlaybackView('single');
    setPlaybackCursor(idx);
    resetPan();
  }, [setPlaybackView, setPlaybackCursor, resetPan, idx]);

  const requestDelete = useCallback(() => {
    if (!cur || cur.protected) return; // protected images are undeletable, like the real camera
    if (playbackDelete) {
      setPlaybackDelete(false); // pressing DEL again dismisses the confirm
      return;
    }
    setPlaybackDeleteChoice('no');
    setPlaybackDelete(true);
  }, [cur, playbackDelete, setPlaybackDeleteChoice, setPlaybackDelete]);

  const setMode = useCameraStore((s) => s.setMode);

  // Keyboard mirrors the physical controls for desktop users.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); dpadLeft(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); dpadRight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); dpadUp(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); dpadDown(); }
      else if (e.key === 'Enter') { e.preventDefault(); dpadCenter(); }
      else if (e.key === 'Escape') {
        if (playbackDelete) setPlaybackDelete(false);
        else if (playbackView === 'index') closeIndex();
        else if (playbackInfo) setPlaybackInfo(false);
        else setMode('photo');
      }
      else if (e.key === 'd' || e.key === 'D' || e.key === 'i' || e.key === 'I') setPlaybackInfo(!playbackInfo);
      else if (e.key === 'Delete' || e.key === 'Backspace') requestDelete();
      else if (e.key === 'j' || e.key === 'J') (playbackView === 'index' ? closeIndex : openIndex)();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dpadLeft, dpadRight, dpadUp, dpadDown, dpadCenter, playbackDelete, playbackView, playbackInfo, setPlaybackDelete, setPlaybackInfo, closeIndex, openIndex, requestDelete, setMode]);

  return (
    <div className="digi-playback-controls">
      <div className="digi-dpad">
        <button className="digi-dpad-btn digi-dpad-up" onClick={dpadUp} aria-label="Up" title="Up">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
        <button className="digi-dpad-btn digi-dpad-down" onClick={dpadDown} aria-label="Down" title="Down">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <button className="digi-dpad-btn digi-dpad-left" onClick={dpadLeft} aria-label="Left" title="Left">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button className="digi-dpad-btn digi-dpad-right" onClick={dpadRight} aria-label="Right" title="Right">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button className="digi-dpad-center" onClick={dpadCenter} aria-label="OK" title="OK">
          <span>OK</span>
        </button>
      </div>

      <div className="digi-playback-strip">
        <button
          className={`digi-func-btn ${playbackInfo ? 'func-active' : ''}`}
          onClick={() => setPlaybackInfo(!playbackInfo)}
          title="Display info"
        >
          DISP
        </button>
        <button
          className={`digi-func-btn ${playbackView === 'index' ? 'func-active' : ''}`}
          onClick={playbackView === 'index' ? closeIndex : openIndex}
          title="Index view"
        >
          INDEX
        </button>
        <button className="digi-func-btn" onClick={requestDelete} title="Delete image">
          DEL
        </button>
        <button
          className={`digi-func-btn ${cur && cur.protected ? 'func-active' : ''}`}
          onClick={() => {
            if (!cur) return;
            toggleProtectCapture(cur.id);
            saveCapture({ ...cur, protected: !cur.protected } as unknown as Record<string, unknown>).catch(() => {});
          }}
          title="Protect image"
        >
          PROTECT
        </button>
      </div>
    </div>
  );
}
