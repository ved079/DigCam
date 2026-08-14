'use client';

import type { CameraMode, BurstMode, AspectMode } from '@/lib/camera-store';
import { ShutterDial } from './ShutterDial';

interface ControlPanelProps {
  mode: CameraMode;
  isRecording: boolean;
  captureCount: number;
  videoCount: number;
  onShutter: () => void;
  onModeSwitch: (mode: CameraMode) => void;
  onMenu: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoomLevel: number;
  burstMode: BurstMode;
  isBursting: boolean;
  aspectMode: AspectMode;
  onPlayClick: () => void;
  onDelete: () => void;
}

export function ControlPanel({
  mode, isRecording, captureCount, videoCount,
  onShutter, onModeSwitch, onMenu, onZoomIn, onZoomOut,
  zoomLevel, burstMode, isBursting, aspectMode, onPlayClick, onDelete,
}: ControlPanelProps) {
  return (
    <div className="digi-controls">
      <div className="digi-mode-dial-area">
        <button
          className={`digi-mode-btn ${mode === 'playback' ? 'mode-active' : ''}`}
          onClick={() => { onPlayClick(); onModeSwitch(mode === 'playback' ? 'photo' : 'playback'); }}
          title="Playback"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
          </svg>
          <span className="digi-mode-label">▶</span>
        </button>
        <button
          className={`digi-mode-btn ${mode === 'photo' ? 'mode-active' : ''}`}
          onClick={() => { onPlayClick(); onModeSwitch('photo'); }}
          title="Photo"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <span className="digi-mode-label">PHOTO</span>
        </button>
        <button
          className={`digi-mode-btn ${mode === 'video' ? 'mode-active' : ''}`}
          onClick={() => { onPlayClick(); onModeSwitch('video'); }}
          title="Video"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="15" height="16" rx="2" />
            <path d="M17 8l5-3v14l-5-3" />
          </svg>
          <span className="digi-mode-label">MOVIE</span>
        </button>
      </div>

      <div className="digi-shutter-area">
        <ShutterDial
          mode={mode}
          isRecording={isRecording}
          isBursting={isBursting}
          burstMode={burstMode}
          zoomLevel={zoomLevel}
          onShutter={onShutter}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onPlayClick={onPlayClick}
        />
      </div>

      <div className="digi-bottom-row">
        <button className="digi-func-btn" onClick={() => { onPlayClick(); onMenu(); }} title="Menu"><span>MENU</span></button>
        <button className="digi-func-btn" onClick={() => { onPlayClick(); onDelete(); }} title="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          <span>DEL</span>
        </button>
        <div className="digi-shot-counter-display">
          <span className="counter-label">PHOTOS</span>
          <span className="counter-value">{String(captureCount).padStart(3, '0')}</span>
          {videoCount > 0 && <span className="counter-video">VID:{videoCount}</span>}
        </div>
      </div>

      <div className="digi-sub-indicators">
        {aspectMode !== '4:3' && <div className="digi-sub-ind"><span>{aspectMode}</span></div>}
        {burstMode !== 'off' && <div className="digi-sub-ind burst-ind"><span>{burstMode.toUpperCase()} BURST</span></div>}
      </div>
    </div>
  );
}
