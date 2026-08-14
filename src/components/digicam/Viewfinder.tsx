'use client';

import { useCallback, useRef } from 'react';
import type { FlashMode, SceneMode, ColorFilter, AspectMode, WhiteBalance, BurstMode, PanoramaMode } from '@/lib/camera-store';
import { useCameraStore } from '@/lib/camera-store';
import { TouchDPad } from './TouchDPad';

interface ViewfinderProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isFocusing: boolean;
  zoomLevel: number;
  sceneMode: SceneMode;
  flashMode: FlashMode;
  showGrid: boolean;
  captureCount: number;
  isRecording: boolean;
  recordingTime: number;
  timerCountdown: number | null;
  mode: 'photo' | 'video';
  exposureComp: number;
  colorFilter: ColorFilter;
  isFlipping: boolean;
  isDemoMode: boolean;
  whiteBalance: WhiteBalance;
  burstMode: BurstMode;
  isBursting: boolean;
  aspectMode: AspectMode;
  panoramaMode: PanoramaMode;
  smileShutter: boolean;
  panoramaFrameCount: number;
  isTimelapsing: boolean;
  timelapseMode: string;
  motionDetect: boolean;
}

export function Viewfinder({
  videoRef, isFocusing, zoomLevel, sceneMode, flashMode, showGrid,
  captureCount, isRecording, recordingTime, timerCountdown, mode,
  exposureComp, colorFilter, isFlipping, isDemoMode, whiteBalance, burstMode, isBursting, aspectMode,
  panoramaMode, smileShutter, panoramaFrameCount,
  isTimelapsing, timelapseMode, motionDetect,
}: ViewfinderProps) {
  const { showDateStamp, imageSize, totalCapacity, captures, setZoomLevel } = useCameraStore();
  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const shot = String(captures.filter(c => c.type === 'photo').length + 1).padStart(4, '0');
  const iso = exposureComp > 0 ? Math.round(80 * Math.pow(2, exposureComp)) : 80;
  const evText = exposureComp === 0 ? '±0.0' : exposureComp > 0 ? `+${exposureComp.toFixed(1)}` : exposureComp.toFixed(1);
  const wbActive = whiteBalance.temperature !== 0 || whiteBalance.tint !== 0;

  // Pinch-to-zoom state
  const pinchRef = useRef<{ active: boolean; startDist: number; startZoom: number }>({ active: false, startDist: 0, startZoom: 1 });

  const getPinchDist = useCallback((touches: TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = {
        active: true,
        startDist: getPinchDist(e.touches),
        startZoom: useCameraStore.getState().zoomLevel,
      };
    }
  }, [getPinchDist]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (pinchRef.current.active && e.touches.length === 2) {
      e.preventDefault();
      const dist = getPinchDist(e.touches);
      const scale = dist / pinchRef.current.startDist;
      const newZoom = Math.max(1, Math.min(4, pinchRef.current.startZoom * scale));
      setZoomLevel(Math.round(newZoom * 10) / 10);
    }
  }, [getPinchDist, setZoomLevel]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      pinchRef.current.active = false;
    }
  }, []);

  return (
    <div className="digi-viewfinder">
      <canvas id="ccd-preview-canvas" width={640} height={480} className={`digi-viewfinder-canvas ${isFlipping ? 'flipping' : ''} ${aspectMode === '1:1' ? 'aspect-square' : aspectMode === '16:9' ? 'aspect-wide' : ''}`} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} style={{ touchAction: 'none' }} />

      {showGrid && (
        <div className="digi-viewfinder-grid">
          <div className="grid-line grid-h-1" /><div className="grid-line grid-h-2" />
          <div className="grid-line grid-v-1" /><div className="grid-line grid-v-2" />
        </div>
      )}

      <div className={`digi-focus-brackets ${isFocusing ? 'focusing' : ''} ${!isFocusing ? 'idle' : ''}`}>
        <div className="focus-corner focus-tl" /><div className="focus-corner focus-tr" />
        <div className="focus-corner focus-bl" /><div className="focus-corner focus-br" />
      </div>

      {isFocusing && (
        <div className="digi-focus-indicator">
          <div className="focus-beam focus-beam-h" /><div className="focus-beam focus-beam-v" />
        </div>
      )}

      {timerCountdown !== null && (
        <div className="digi-timer-overlay">
          <span className="digi-timer-number">{timerCountdown}</span>
        </div>
      )}

      {isRecording && (
        <div className="digi-rec-indicator">
          <div className="digi-rec-dot" /><span className="digi-rec-text">REC</span>
          <span className="digi-rec-time">{fmtTime(recordingTime)}</span>
        </div>
      )}

      {/* Burst frame counter */}
      {isBursting && (
        <div className="digi-burst-overlay">
          <span className="digi-burst-count">●</span>
        </div>
      )}

      {/* Filter badge */}
      {colorFilter !== 'off' && (
        <div className="digi-filter-badge">{colorFilter.toUpperCase()}</div>
      )}

      {/* GPS badge */}
      {typeof navigator !== 'undefined' && navigator.geolocation && (
        <div className="digi-gps-badge">
          <span>🛰 GPS</span>
        </div>
      )}

      {/* Smile Shutter badge */}
      {smileShutter && mode === 'photo' && (
        <div className="digi-smile-badge">
          <span>😊 SMILE</span>
        </div>
      )}

      {/* Timelapse badge */}
      {isTimelapsing && (
        <div className="digi-timelapse-badge">TL {timelapseMode}</div>
      )}

      {/* Motion detection badge */}
      {motionDetect && mode === 'photo' && (
        <div className="digi-motion-badge">MOTION</div>
      )}

      {/* Smile Shutter scanning animation */}
      {smileShutter && mode === 'photo' && (
        <div className="digi-smile-scan" />
      )}

      {/* WB indicator */}
      {wbActive && (
        <div className="digi-wb-badge">
          <span>WB {whiteBalance.temperature > 0 ? '+' : ''}{whiteBalance.temperature.toFixed(0)}T{whiteBalance.tint !== 0 ? ` ${whiteBalance.tint > 0 ? '+' : ''}${whiteBalance.tint.toFixed(0)}M` : ''}</span>
        </div>
      )}

      {/* Aspect indicator */}
      {aspectMode !== '4:3' && (
        <div className="digi-aspect-badge">{aspectMode}</div>
      )}

      {/* Exposure EV bar */}
      {exposureComp !== 0 && (
        <div className="digi-ev-indicator">
          <span className="digi-ev-label">{evText}</span>
          <div className="digi-ev-bar">
            <div className="digi-ev-mark" style={{ bottom: `${((exposureComp + 2) / 4) * 100}%` }} />
          </div>
        </div>
      )}

      {isDemoMode && (
        <div style={{ position: 'absolute', bottom: 42, left: 8, fontSize: 8, color: 'rgba(0,102,204,0.5)', fontFamily: 'monospace', letterSpacing: 1, pointerEvents: 'none' }}>DEMO</div>
      )}

      {/* HUD Top */}
      <div className="digi-hud-top">
        <div className="digi-hud-top-left">
          <div className="digi-battery">
            <div className="digi-battery-body"><div className="digi-battery-fill" style={{ width: '78%' }} /></div>
            <div className="digi-battery-tip" />
          </div>
          <span className="digi-hud-icon">SD</span>
          {exposureComp !== 0 && <span className="digi-hud-iso">ISO{iso}</span>}
          {burstMode !== 'off' && <span className="digi-hud-burst">{burstMode.toUpperCase()} BURST</span>}
        </div>
        <div className="digi-hud-top-center">
          {mode === 'video' ? <span className="digi-hud-mode-badge video-badge">MOVIE</span> : <span className="digi-hud-mode-badge photo-badge">STILL</span>}
        </div>
        <div className="digi-hud-top-right">
          <span className="digi-hud-resolution">{imageSize}</span>
          <span className="digi-hud-fine">FINE</span>
        </div>
      </div>

      {/* HUD Bottom */}
      <div className="digi-hud-bottom">
        <div className="digi-hud-bottom-left">
          <span className={`digi-flash-icon ${flashMode === 'off' ? 'flash-off' : ''}`}>{flashMode === 'off' ? '⚡⊘' : flashMode === 'auto' ? '⚡A' : flashMode === 'on' ? '⚡' : '⚡S'}</span>
        </div>
        <div className="digi-hud-bottom-center">
          <span className="digi-hud-scene">{sceneMode}</span>
        </div>
        <div className="digi-hud-bottom-right">
          {showDateStamp && <span className="digi-hud-datestamp-icon">📅</span>}
          <span className="digi-hud-counter">{String(totalCapacity).padStart(4, '0')}-{shot}</span>
        </div>
      </div>

      {/* Zoom */}
      <div className="digi-zoom-indicator">
        <span className="digi-zoom-label">{zoomLevel.toFixed(1)}x</span>
        <div className="digi-zoom-bar">
          <div className="digi-zoom-fill" style={{ width: `${((zoomLevel - 1) / 3) * 100}%` }} />
          {[{p:0,l:'1x'},{p:33.3,l:'2x'},{p:66.6,l:'3x'},{p:100,l:'4x'}].map(({p,l}) => <div key={p} className="digi-zoom-tick" style={{ left: `${p}%` }} data-label={l} />)}
        </div>
        <span className="digi-zoom-focal">W{Math.round(26 * zoomLevel)}mm</span>
      </div>
      <canvas id="digi-histogram" className="digi-histogram-canvas" width={128} height={64} />
      <div className="digi-level-indicator">
        <div className="digi-level-line" />
        <div className="digi-level-center" />
      </div>
      {/* Audio Level Meter (video recording) */}
      {isRecording && (
        <canvas id="digi-audio-meter" width={80} height={32} className="digi-audio-meter-canvas" />
      )}
      <TouchDPad />
      {panoramaMode === 'assist' && (
        <div className="digi-panorama-guide">
          <div className="digi-panorama-stitch-line" />
          <div className="digi-panorama-arrow">PAN RIGHT →</div>
          <div className="digi-panorama-progress">~20% overlap</div>
        </div>
      )}
      {panoramaMode === 'assist' && panoramaFrameCount > 0 && (
        <div className="digi-pano-counter">PANO: {panoramaFrameCount}/∞ frames</div>
      )}
    </div>
  );
}
