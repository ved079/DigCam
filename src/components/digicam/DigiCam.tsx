'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCameraStore, type CaptureItem } from '@/lib/camera-store';
import { toast } from '@/hooks/use-toast';
import { applyVideoCCDPass, renderDateStamp, renderDemoFrame, renderNeonFrame, renderCityFrame, renderIndoorFrame } from '@/lib/ccd-processor';
import { saveCapture, loadCaptures, deleteCaptureFromDB, clearAllCaptures as clearDB } from '@/lib/db-persistence';
import { BootScreen } from './BootScreen';
import { Viewfinder } from './Viewfinder';
import { ControlPanel } from './ControlPanel';
import { Gallery } from './Gallery';
import { MenuOverlay } from './MenuOverlay';
import { EVDial } from './EVDial';

// Geotag cities for simulation
const GEO_CITIES = [
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  { name: 'New York', lat: 40.7128, lng: -74.0060 },
  { name: 'London', lat: 51.5074, lng: -0.1278 },
  { name: 'Paris', lat: 48.8566, lng: 2.3522 },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093 },
];

function getRandomGeo(): { latitude: number; longitude: number } {
  const city = GEO_CITIES[Math.floor(Math.random() * GEO_CITIES.length)];
  return {
    latitude: city.lat + (Math.random() - 0.5) * 0.1,
    longitude: city.lng + (Math.random() - 0.5) * 0.1,
  };
}

// Real web-browser torch (MediaStreamTrack torch) is an Android Chrome-only
// capability; iOS Safari does not expose camera torch to web pages at all.
function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function getRealGeo(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(getRandomGeo()); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(getRandomGeo()),
      { timeout: 3000, maximumAge: 60000 },
    );
  });
}

function playClickSound() {
  try {
    const AC = window.AudioContext || ((window as unknown as Record<string, typeof AudioContext>).webkitAudioContext);
    const audioCtx = new AC();
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(1800, t);
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + 0.03);
  } catch { /* Audio unavailable */ }
}

export function DigiCam() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const videoAnimRef = useRef<number>(0);
  const timerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const demoAnimRef = useRef<number>(0);
  const burstIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const camBodyRef = useRef<HTMLDivElement>(null);
  const smileDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const smileDetectedRef = useRef(false);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioMeterAnimRef = useRef<number>(0);
  const timelapseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const motionPrevFrameRef = useRef<ImageData | null>(null);
  const motionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const torchInFlightRef = useRef(false);
  const torchRejectedRef = useRef<'on' | 'off' | null>(null);
  const [booted, setBooted] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [timerCountdown, setTimerCountdown] = useState<number | null>(null);
  const [lastCapturePreview, setLastCapturePreview] = useState<string | null>(null);
  const showGrid = useCameraStore((s) => s.showGrid);
  const colorFilter = useCameraStore((s) => s.colorFilter);
  const exposureComp = useCameraStore((s) => s.exposureComp);
  const facingMode = useCameraStore((s) => s.facingMode);
  const isDemoMode = useCameraStore((s) => s.isDemoMode);
  const isFlipping = useCameraStore((s) => s.isFlipping);
  const whiteBalance = useCameraStore((s) => s.whiteBalance);
  const burstMode = useCameraStore((s) => s.burstMode);
  const demoScene = useCameraStore((s) => s.demoScene);
  const isBursting = useCameraStore((s) => s.isBursting);
  const aspectMode = useCameraStore((s) => s.aspectMode);
  const panoramaMode = useCameraStore((s) => s.panoramaMode);
  const smileShutter = useCameraStore((s) => s.smileShutter);
  const panoramaFrames = useCameraStore((s) => s.panoramaFrames);
  const timelapseMode = useCameraStore((s) => s.timelapseMode);
  const isTimelapsing = useCameraStore((s) => s.isTimelapsing);
  const motionDetect = useCameraStore((s) => s.motionDetect);
  const motionSensitivity = useCameraStore((s) => s.motionSensitivity);
  const displayZoom = useCameraStore((s) => s.displayZoom);
  const torchEnabled = useCameraStore((s) => s.torchEnabled);
  const torchSupported = useCameraStore((s) => s.torchSupported);
  const torchBusy = useCameraStore((s) => s.torchBusy);

  const {
    mode, isRecording, isFlashFiring, isFocusing, cameraReady, cameraError,
    flashMode, sceneMode, showDateStamp, imageSize, zoomLevel, captures, isMenuOpen, timerMode,
    setCameraReady, setCameraError, setRecording, setFlashFiring, setFocusing,
    addCapture, setMode, cycleFlash, cycleScene, cycleTimer, setZoomLevel, zoomIn, zoomOut,
    toggleDateStamp, toggleGrid, setMenuOpen, setDemoMode,
    cycleFilter, adjustExposure, toggleFacingMode, cycleBurst, cycleDemoScene,
    setBursting, setAspectMode, setPanoramaMode, addPanoramaFrame,
    setFlashMode, setSceneMode, setImageSize, setColorFilter, setExposureComp, setWhiteBalance, setBurstMode,
    setTorchEnabled, setTorchSupported, setTorchBusy, setTorchError,
  } = useCameraStore();

  const initCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 4320 }, height: { ideal: 3240 } },
        audio: true,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0] ?? null;
      videoTrackRef.current = track;
      // Feature-detect the torch constraint — this is the ONLY reliable gate.
      // iOS Safari and desktop cameras either omit `torch` entirely or report
      // it as false, so we check key presence, not truthiness alone.
      let supports = false;
      try {
        const caps = track?.getCapabilities ? track.getCapabilities() : undefined;
        supports = !!caps && 'torch' in caps && caps.torch === true;
      } catch { supports = false; }
      setTorchSupported(supports);
      if (!supports) {
        // A camera without torch hardware can never hold torch on.
        setTorchEnabled(false);
        if (useCameraStore.getState().flashMode === 'on') setFlashMode('off');
      }
      torchRejectedRef.current = null;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCameraReady(true); setCameraError(null); setDemoMode(false);
    } catch { setCameraError('Camera access denied or unavailable.'); }
  }, [facingMode, setCameraReady, setCameraError, setDemoMode, setTorchSupported, setTorchEnabled, setFlashMode]);

  const prevFacing = useRef(facingMode);
  useEffect(() => {
    if (prevFacing.current !== facingMode && cameraReady) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      videoTrackRef.current = null;
      // The torch dies with the old camera; force UI state back to off so it
      // can't drift. The reconciling effect re-applies it if the new camera
      // supports it and the user still wants it.
      setTorchEnabled(false);
      setCameraReady(false);
      prevFacing.current = facingMode;
      setTimeout(() => initCamera(), 100);
    }
  }, [facingMode, cameraReady, initCamera, setCameraReady, setTorchEnabled]);

  // ── Real hardware torch ────────────────────────────────────────────
  // Torch is a continuous constraint on the active video track — there is no
  // one-shot "flash at capture" API. So this turns the phone's flash LED on
  // for the whole preview-and-capture session (a flashlight), not a xenon
  // burst. It only exists while the getUserMedia stream is alive, and only on
  // cameras that advertise the `torch` capability (Android Chrome rear
  // camera; never iOS Safari).
  const applyTorch = useCallback(async (on: boolean) => {
    if (torchInFlightRef.current) return;
    const track = videoTrackRef.current;
    if (!track) return;
    torchInFlightRef.current = true;
    setTorchBusy(true);
    try {
      // `torch` is a non-standard constraint that lib.dom doesn't type, but
      // it's the real android chrome path; cast to MediaTrackConstraintSet.
      await track.applyConstraints({
        advanced: [{ torch: on } as unknown as MediaTrackConstraintSet],
      });
      torchRejectedRef.current = null;
      setTorchEnabled(on);
      setTorchError(null);
    } catch {
      // The device/browser lied about supporting it — revert BOTH the
      // hardware state and the UI so they can't drift apart.
      torchRejectedRef.current = on ? 'on' : 'off';
      setTorchEnabled(false);
      setFlashMode('off');
      setTorchError('Could not switch the camera flash on this device.');
      toast({
        title: 'Flash',
        description: 'Could not switch the camera flash on this device.',
        duration: 3000,
      });
    } finally {
      torchInFlightRef.current = false;
      setTorchBusy(false);
    }
  }, [setTorchBusy, setTorchEnabled, setTorchError, setFlashMode]);

  // Keep the track in sync with the requested state whenever the preference,
  // support detection, or actual state changes. `torchRejectedRef` records the
  // last intent a track refused so we don't hammer applyConstraints on a
  // hostile track, but it is cleared on every explicit flashMode change, so a
  // fresh toggle by the user is always attempted again.
  const prevFlashRef = useRef(flashMode);
  useEffect(() => {
    if (prevFlashRef.current !== flashMode) {
      torchRejectedRef.current = null;
      prevFlashRef.current = flashMode;
    }
    if (!torchSupported) return;
    const wantOn = flashMode === 'on';
    if (wantOn === torchEnabled) return;
    if (torchRejectedRef.current === (wantOn ? 'on' : 'off')) return;
    void applyTorch(wantOn);
  }, [flashMode, torchSupported, torchEnabled, applyTorch]);

  useEffect(() => {
    initCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      videoTrackRef.current = null;
      // Never leave the phone's flashlight on after leaving the camera view.
      setTorchEnabled(false);
      setTorchBusy(false);
      if (videoAnimRef.current) cancelAnimationFrame(videoAnimRef.current);
      if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      if (demoAnimRef.current) cancelAnimationFrame(demoAnimRef.current);
      if (timerTimeoutRef.current) clearTimeout(timerTimeoutRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (burstIntervalRef.current) clearInterval(burstIntervalRef.current);
      if (smileDebounceRef.current) clearTimeout(smileDebounceRef.current);
      if (audioMeterAnimRef.current) cancelAnimationFrame(audioMeterAnimRef.current);
      if (timelapseIntervalRef.current) clearInterval(timelapseIntervalRef.current);
      if (motionDebounceRef.current) clearTimeout(motionDebounceRef.current);
      if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); }
    };
  }, [initCamera]);

  // Load captures from IndexedDB on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await loadCaptures();
        if (saved.length > 0) {
          saved.forEach((item) => {
            useCameraStore.getState().addCapture(item as CaptureItem);
          });
        }
      } catch { /* IndexedDB unavailable */ }
    })();
  }, []);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('digicam-settings');
      if (saved) {
        const s = JSON.parse(saved);
        const store = useCameraStore.getState();
        if (s.flashMode) store.setFlashMode(s.flashMode);
        if (s.sceneMode) store.setSceneMode(s.sceneMode);
        if (s.imageSize) store.setImageSize(s.imageSize);
        if (typeof s.showDateStamp === 'boolean') { if (s.showDateStamp !== store.showDateStamp) store.toggleDateStamp(); }
        if (typeof s.showGrid === 'boolean') { if (s.showGrid !== store.showGrid) store.toggleGrid(); }
        if (s.colorFilter) store.setColorFilter(s.colorFilter);
        if (typeof s.exposureComp === 'number') store.setExposureComp(s.exposureComp);
        if (s.aspectMode) store.setAspectMode(s.aspectMode);
        if (s.whiteBalance) store.setWhiteBalance(s.whiteBalance);
        if (s.burstMode) store.setBurstMode(s.burstMode);
        if (s.panoramaMode) store.setPanoramaMode(s.panoramaMode);
      }
    } catch { /* localStorage unavailable */ }
  }, []);

  // Persist settings to localStorage on change
  useEffect(() => {
    if (isDemoMode) return;
    const settings = {
      flashMode, sceneMode, imageSize, showDateStamp, showGrid,
      colorFilter, exposureComp, aspectMode, whiteBalance, burstMode, panoramaMode,
    };
    try {
      localStorage.setItem('digicam-settings', JSON.stringify(settings));
    } catch { /* localStorage unavailable */ }
  }, [flashMode, sceneMode, imageSize, showDateStamp, showGrid, colorFilter, exposureComp, aspectMode, whiteBalance, burstMode, panoramaMode, isDemoMode]);

  // Burst shooting
  const stopBurst = useCallback(() => {
    if (burstIntervalRef.current) { clearInterval(burstIntervalRef.current); burstIntervalRef.current = null; }
    setBursting(false);
  }, [setBursting]);

  // Smile Shutter detection
  useEffect(() => {
    if (!smileShutter || mode !== 'photo' || isMenuOpen || isBursting || isRecording) return;
    const sampleInterval = setInterval(() => {
      const canvas = document.getElementById('ccd-preview-canvas') as HTMLCanvasElement;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const cx = Math.floor(canvas.width / 2);
      const cy = Math.floor(canvas.height / 2);
      const size = 100;
      const x0 = Math.max(0, cx - size / 2);
      const y0 = Math.max(0, cy - size / 2);
      const w = Math.min(size, canvas.width - x0);
      const h = Math.min(size, canvas.height - y0);
      const imgData = ctx.getImageData(x0, y0, w, h);
      const d = imgData.data;
      // Compute brightness standard deviation
      let sum = 0;
      const pixels = d.length / 4;
      for (let i = 0; i < d.length; i += 4) {
        sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      }
      const mean = sum / pixels;
      let variance = 0;
      for (let i = 0; i < d.length; i += 4) {
        const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        variance += (lum - mean) * (lum - mean);
      }
      const stdDev = Math.sqrt(variance / pixels);
      if (stdDev > 30 && !smileDetectedRef.current) {
        smileDetectedRef.current = true;
        // Show detected overlay
        const overlay = document.createElement('div');
        overlay.className = 'digi-smile-detected';
        overlay.textContent = '😊 DETECTED';
        const viewfinder = document.querySelector('.digi-viewfinder');
        if (viewfinder) { viewfinder.appendChild(overlay); }
        // Debounce 500ms then capture
        if (smileDebounceRef.current) clearTimeout(smileDebounceRef.current);
        smileDebounceRef.current = setTimeout(() => {
          const s = useCameraStore.getState();
          if (s.smileShutter && s.mode === 'photo' && !s.isMenuOpen && !s.isBursting && !s.isRecording) {
            document.querySelector('.digi-shutter-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          }
          smileDetectedRef.current = false;
          if (smileDebounceRef.current) clearTimeout(smileDebounceRef.current);
          // Remove overlay after 1s
          setTimeout(() => { overlay.remove(); }, 1000);
        }, 500);
      }
    }, 400);
    return () => { clearInterval(sampleInterval); if (smileDebounceRef.current) clearTimeout(smileDebounceRef.current); };
  }, [smileShutter, mode, isMenuOpen, isBursting, isRecording]);

  // Motion detection
  useEffect(() => {
    if (!motionDetect || mode !== 'photo' || isMenuOpen || isBursting || isRecording) {
      motionPrevFrameRef.current = null;
      return;
    }
    if (!cameraReady && !isDemoMode) return;
    const sampleInterval = setInterval(() => {
      const canvas = document.getElementById('ccd-preview-canvas') as HTMLCanvasElement;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = 160;
      const h = 120;
      const imgData = ctx.getImageData(0, 0, w, h);
      const prev = motionPrevFrameRef.current;
      if (prev) {
        const d = imgData.data;
        const p = prev.data;
        let diff = 0;
        const len = d.length;
        for (let i = 0; i < len; i += 16) { // sample every 4th pixel for speed
          diff += Math.abs(d[i] - p[i]) + Math.abs(d[i + 1] - p[i + 1]) + Math.abs(d[i + 2] - p[i + 2]);
        }
        const avgDiff = diff / (len / 16 * 3);
        if (avgDiff > motionSensitivity) {
          if (!motionDebounceRef.current) {
            motionDebounceRef.current = setTimeout(() => {
              motionDebounceRef.current = null;
              const s = useCameraStore.getState();
              if (s.motionDetect && s.mode === 'photo' && !s.isMenuOpen && !s.isBursting && !s.isRecording) {
                document.querySelector('.digi-shutter-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              }
            }, 2000);
          }
        }
      }
      motionPrevFrameRef.current = imgData;
    }, 500);
    return () => {
      clearInterval(sampleInterval);
      motionPrevFrameRef.current = null;
      if (motionDebounceRef.current) { clearTimeout(motionDebounceRef.current); motionDebounceRef.current = null; }
    };
  }, [motionDetect, motionSensitivity, mode, isMenuOpen, isBursting, isRecording, cameraReady, isDemoMode]);

  // Audio Level Meter (video recording)
  useEffect(() => {
    if (!isRecording || !streamRef.current) {
      audioMeterAnimRef.current = 0;
      return;
    }
    // Create AudioContext and AnalyserNode
    try {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(streamRef.current);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      audioAnalyserRef.current = analyser;
      audioContextRef.current = audioCtx;

      const drawMeter = () => {
        const meterCanvas = document.getElementById('digi-audio-meter') as HTMLCanvasElement;
        if (!meterCanvas || !analyser) return;
        const mCtx = meterCanvas.getContext('2d');
        if (!mCtx) return;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
        const barCount = 8;
        const barWidth = 7;
        const gap = 3;
        const maxBarHeight = 28;
        mCtx.clearRect(0, 0, 80, 32);
        // Background
        mCtx.fillStyle = 'rgba(0,0,0,0.5)';
        mCtx.fillRect(0, 0, 80, 32);
        for (let i = 0; i < barCount; i++) {
          const dataIdx = Math.floor((i / barCount) * bufferLength);
          const value = dataArray[dataIdx] / 255;
          const barHeight = Math.max(2, value * maxBarHeight);
          const x = 4 + i * (barWidth + gap);
          const y = 32 - barHeight;
          // Color: green → yellow → red from bottom to top
          if (value < 0.5) {
            mCtx.fillStyle = '#00cc44';
          } else if (value < 0.75) {
            mCtx.fillStyle = '#ffaa00';
          } else {
            mCtx.fillStyle = '#ff2200';
          }
          mCtx.fillRect(x, y, barWidth, barHeight);
        }
        audioMeterAnimRef.current = requestAnimationFrame(drawMeter);
      };
      drawMeter();
    } catch { /* Audio unavailable */ }
    return () => {
      if (audioMeterAnimRef.current) cancelAnimationFrame(audioMeterAnimRef.current);
      if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
      audioAnalyserRef.current = null;
    };
  }, [isRecording]);

  // Demo mode animation
  useEffect(() => {
    if (!isDemoMode || mode === 'playback') return;
    const renderScene = (target: HTMLCanvasElement, time: number) => {
      if (demoScene === 'neon') renderNeonFrame(target, time, colorFilter);
      else if (demoScene === 'city') renderCityFrame(target, time, colorFilter);
      else if (demoScene === 'indoor') renderIndoorFrame(target, time, colorFilter);
      else renderDemoFrame(target, time, colorFilter);
    };
    let offCanvas: HTMLCanvasElement | null = null;
    const animate = (time: number) => {
      const el = document.getElementById('ccd-preview-canvas') as HTMLCanvasElement;
      if (el) {
        const z = useCameraStore.getState().displayZoom;
        const w = el.width;
        const h = el.height;
        if (z > 1) {
          // Render the scene at a higher resolution, then center-crop like digital zoom
          if (!offCanvas || offCanvas.width !== Math.round(w * z) || offCanvas.height !== Math.round(h * z)) {
            offCanvas = document.createElement('canvas');
            offCanvas.width = Math.round(w * z);
            offCanvas.height = Math.round(h * z);
          }
          renderScene(offCanvas, time);
          const ctx = el.getContext('2d');
          if (ctx) {
            ctx.drawImage(offCanvas, (offCanvas.width - w) / 2, (offCanvas.height - h) / 2, w, h, 0, 0, w, h);
          }
        } else {
          renderScene(el, time);
        }
      }
      demoAnimRef.current = requestAnimationFrame(animate);
    };
    demoAnimRef.current = requestAnimationFrame(animate);
    return () => { if (demoAnimRef.current) cancelAnimationFrame(demoAnimRef.current); };
  }, [isDemoMode, mode, colorFilter, demoScene]);

  // Real-time video CCD processing
  useEffect(() => {
    if (mode !== 'photo' && mode !== 'video') return;
    if (!cameraReady || !videoRef.current) return;
    const vCanvas = document.createElement('canvas');
    const vCtx = vCanvas.getContext('2d')!;
    vCanvas.width = 640; vCanvas.height = 480;
    const processFrame = () => {
      if (!videoRef.current || !cameraReady || mode === 'playback') return;
      const z = useCameraStore.getState().displayZoom;
      const vw = videoRef.current.videoWidth || 640;
      const vh = videoRef.current.videoHeight || 480;
      if (z > 1) {
        // Digital zoom: center-crop the source rect and scale up to fill the preview
        const cw = vw / z;
        const ch = vh / z;
        vCtx.drawImage(videoRef.current, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, 640, 480);
      } else {
        vCtx.drawImage(videoRef.current, 0, 0, 640, 480);
      }
      applyVideoCCDPass(vCanvas, colorFilter, exposureComp, whiteBalance);
      const previewEl = document.getElementById('ccd-preview-canvas') as HTMLCanvasElement;
      if (previewEl) { const pCtx = previewEl.getContext('2d'); if (pCtx) pCtx.drawImage(vCanvas, 0, 0, previewEl.width, previewEl.height); }
      // Render histogram
      const histEl = document.getElementById('digi-histogram') as HTMLCanvasElement;
      if (histEl) {
        const hCtx = histEl.getContext('2d');
        if (hCtx) {
          const imgD = vCtx.getImageData(0, 0, 640, 480);
          const d = imgD.data;
          const bins = new Uint32Array(256);
          for (let i = 0; i < d.length; i += 16) { // sample every 4th pixel for speed
            const lum = Math.round(d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
            bins[lum]++;
          }
          const maxBin = Math.max(...bins) || 1;
          hCtx.clearRect(0, 0, 128, 64);
          hCtx.fillStyle = 'rgba(0,0,0,0.4)';
          hCtx.fillRect(0, 0, 128, 64);
          hCtx.strokeStyle = 'rgba(255,255,255,0.6)';
          hCtx.lineWidth = 1;
          hCtx.beginPath();
          for (let i = 0; i < 256; i++) {
            const x = (i / 255) * 128;
            const y = 64 - (bins[i] / maxBin) * 60;
            if (i === 0) hCtx.moveTo(x, y); else hCtx.lineTo(x, y);
          }
          hCtx.stroke();
          // RGB channels (faint)
          const rBins = new Uint32Array(256);
          const gBins = new Uint32Array(256);
          const bBins = new Uint32Array(256);
          for (let i = 0; i < d.length; i += 16) {
            rBins[d[i]]++;
            gBins[d[i+1]]++;
            bBins[d[i+2]]++;
          }
          const rMax = Math.max(...rBins) || 1;
          const gMax = Math.max(...gBins) || 1;
          const bMax = Math.max(...bBins) || 1;
          [[rBins, rMax, 'rgba(255,80,80,0.3)'], [gBins, gMax, 'rgba(80,255,80,0.3)'], [bBins, bMax, 'rgba(80,80,255,0.3)']].forEach(([bins, max, color]) => {
            hCtx.strokeStyle = color as string;
            hCtx.beginPath();
            for (let i = 0; i < 256; i++) {
              const x = (i / 255) * 128;
              const y = 64 - ((bins as Uint32Array)[i] / (max as number)) * 58;
              if (i === 0) hCtx.moveTo(x, y); else hCtx.lineTo(x, y);
            }
            hCtx.stroke();
          });
        }
      }
      videoAnimRef.current = requestAnimationFrame(processFrame);
    };
    processFrame();
    return () => { if (videoAnimRef.current) cancelAnimationFrame(videoAnimRef.current); };
  }, [mode, cameraReady, colorFilter, exposureComp, whiteBalance]);

  // Capture photo
  const capturePhoto = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    if (isDemoMode) {
      // Demo mode: capture directly from preview canvas (already has filter + exposure applied)
      const preview = document.getElementById('ccd-preview-canvas') as HTMLCanvasElement;
      if (!preview) return;
      canvas.width = preview.width;
      canvas.height = preview.height;
      ctx.drawImage(preview, 0, 0);
    } else {
      // Camera mode: draw raw video at full resolution, then apply same CCD pass as preview
      const video = videoRef.current;
      if (!video) return;
      canvas.width = video.videoWidth || 4320;
      canvas.height = video.videoHeight || 3240;
      const z = useCameraStore.getState().displayZoom;
      if (z > 1) {
        const cw = canvas.width / z;
        const ch = canvas.height / z;
        ctx.drawImage(video, (canvas.width - cw) / 2, (canvas.height - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      // Apply the same video CCD processing as the live preview (WYSIWYG)
      applyVideoCCDPass(canvas, colorFilter, exposureComp, whiteBalance, aspectMode);

      // Handle 1:1 aspect ratio cropping
      if (aspectMode === '1:1') {
        const size = Math.min(canvas.width, canvas.height);
        const offX = Math.floor((canvas.width - size) / 2);
        const offY = Math.floor((canvas.height - size) / 2);
        const cropped = ctx.getImageData(offX, offY, size, size);
        canvas.width = size;
        canvas.height = size;
        ctx.putImageData(cropped, 0, 0);
      }
    }

    if (showDateStamp) renderDateStamp(ctx, canvas.width, canvas.height, Date.now());
    if (flashMode !== 'off') {
      // Simulate flash illumination: brighten the saved frame so flash shots
      // are visibly brighter than non-flash shots (WYSIWYG with the overlay).
      ctx.filter = 'brightness(1.45)';
      ctx.drawImage(canvas, 0, 0);
      ctx.filter = 'none';
    }
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const geo = await getRealGeo();
    const capture: CaptureItem = {
      id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'photo', dataUrl, timestamp: Date.now(), sceneMode, flashMode,
      dateStamp: new Date().toLocaleString(), filter: colorFilter, exposure: exposureComp,
      whiteBalance, aspectMode, latitude: geo.latitude, longitude: geo.longitude,
    };
    addCapture(capture);
    saveCapture(capture as unknown as Record<string, unknown>).catch(() => {});
    // Add to panorama frames if in panorama assist mode
    if (useCameraStore.getState().panoramaMode === 'assist') {
      addPanoramaFrame(dataUrl);
    }
    setLastCapturePreview(dataUrl);
    setTimeout(() => setLastCapturePreview(null), 1200);
    // Only fire the flash overlay when flash is actually active; leave the
    // element mounted for the full double-flash animation (0.35s).
    if (flashMode !== 'off') {
      window.clearTimeout(flashTimeoutRef.current);
      setFlashFiring(true);
      flashTimeoutRef.current = window.setTimeout(() => setFlashFiring(false), 400);
    }
    playShutterSound();
  }, [sceneMode, flashMode, showDateStamp, colorFilter, exposureComp, isDemoMode, whiteBalance, aspectMode, addCapture, setFlashFiring, addPanoramaFrame]);

  // Timelapse mode (must be after capturePhoto declaration)
  useEffect(() => {
    if (timelapseMode === 'off' || mode !== 'photo' || isRecording || isMenuOpen || isBursting) {
      if (timelapseIntervalRef.current) { clearInterval(timelapseIntervalRef.current); timelapseIntervalRef.current = null; }
      useCameraStore.getState().setTimelapsing(false);
      return;
    }
    if (!cameraReady && !isDemoMode) {
      useCameraStore.getState().setTimelapsing(false);
      return;
    }
    const ms = parseInt(timelapseMode) * 1000;
    useCameraStore.getState().setTimelapsing(true);
    timelapseIntervalRef.current = setInterval(() => {
      const s = useCameraStore.getState();
      if (s.timelapseMode === 'off' || s.mode !== 'photo' || s.isRecording || s.isMenuOpen || s.isBursting) return;
      capturePhoto();
    }, ms);
    return () => {
      if (timelapseIntervalRef.current) { clearInterval(timelapseIntervalRef.current); timelapseIntervalRef.current = null; }
      useCameraStore.getState().setTimelapsing(false);
    };
  }, [timelapseMode, mode, isRecording, isMenuOpen, isBursting, cameraReady, isDemoMode, capturePhoto]);

  const doBurst = useCallback(() => {
    capturePhoto();
    setBursting(true);
    const bm = useCameraStore.getState().burstMode;
    const ms = bm === 'high' ? 200 : 333;
    burstIntervalRef.current = setInterval(() => capturePhoto(), ms);
  }, [capturePhoto, setBursting]);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    recordedChunksRef.current = [];
    const mr = new MediaRecorder(streamRef.current, { mimeType: 'video/webm;codecs=vp9' });
    mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const videoCapture = { id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, type: 'video', dataUrl: url, timestamp: Date.now(), sceneMode, flashMode, dateStamp: new Date().toLocaleString(), videoBlob: blob, filter: colorFilter, exposure: exposureComp, whiteBalance, aspectMode };
      addCapture(videoCapture);
      saveCapture(videoCapture as unknown as Record<string, unknown>).catch(() => {});
      setLastCapturePreview(url); setTimeout(() => setLastCapturePreview(null), 1200);
    };
    mediaRecorderRef.current = mr; mr.start(100); setRecording(true); setRecordingTime(0);
    recordingTimerRef.current = setInterval(() => { setRecordingTime((t) => t + 1); }, 1000);
  }, [sceneMode, flashMode, addCapture, setRecording, colorFilter, exposureComp, whiteBalance, aspectMode]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    setRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    playShutterSound();
  }, [setRecording]);

  // Zoom indicator auto-show
  useEffect(() => {
    if (!camBodyRef.current) return;
    if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
    camBodyRef.current.classList.add('zoom-active');
    zoomTimeoutRef.current = setTimeout(() => {
      camBodyRef.current?.classList.remove('zoom-active');
      zoomTimeoutRef.current = null;
    }, 2000);
    return () => { if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current); };
  }, [zoomLevel]);

  const handleShutter = useCallback(() => {
    if (isMenuOpen) { setMenuOpen(false); return; }
    if (mode === 'playback') return;
    if (isDemoMode && mode === 'video') return;
    if (mode === 'video') { if (isRecording) stopRecording(); else startRecording(); return; }
    if (burstMode !== 'off') { doBurst(); return; }
    if (timerMode !== 'off') {
      const seconds = timerMode === '2s' ? 2 : 10;
      setTimerCountdown(seconds);
      // Beep sounds during countdown
      const beepInterval = setInterval(() => {
        playTimerBeep();
      }, 1000);
      timerTimeoutRef.current = setTimeout(() => {
        clearInterval(beepInterval);
        setTimerCountdown(null);
        capturePhoto();
      }, seconds * 1000);
    } else { setFocusing(true); setTimeout(() => { setFocusing(false); capturePhoto(); }, 300); }
  }, [mode, isRecording, isMenuOpen, timerMode, isDemoMode, burstMode, capturePhoto, setFocusing, setMenuOpen, startRecording, stopRecording, doBurst]);

  return (
    <div className="digi-cam-body" ref={camBodyRef}>
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera wrist strap */}
      <div className="digi-cam-strap">
        <span className="digi-cam-strap-text">SONY</span>
      </div>

      <div className="digi-cam-top-bar">
        <div className="digi-cam-branding">
          <span className="digi-cam-logo">SONY</span>
          <span className="digi-cam-model">DSC-W530</span><span className="digi-cam-cybershot">Cyber-shot</span>
        </div>
        <div className="digi-cam-power-indicator">
          <div className={`digi-cam-led ${cameraReady || isDemoMode ? 'led-on' : 'led-off'}`} />
        </div>
      </div>

      <div className="digi-cam-lens-barrel" />

      <div className="digi-cam-lcd-frame">
        <div className="digi-cam-lcd" data-aspect={aspectMode}>
          {!booted && <BootScreen onComplete={() => setBooted(true)} />}
          {booted && mode === 'playback' ? (
            <Gallery />
          ) : booted && cameraError && !isDemoMode ? (
            <div className="digi-cam-error">
              <div className="digi-cam-error-icon">&#x26A0;</div>
              <p>No camera detected. Allow permissions or try demo mode.</p>
              <button onClick={initCamera} className="digi-cam-retry-btn">RETRY</button>
              <button onClick={() => setDemoMode(true)} className="digi-cam-demo-btn">DEMO MODE</button>
            </div>
          ) : booted ? (
            <>
              <Viewfinder
                videoRef={videoRef} isFocusing={isFocusing} zoomLevel={displayZoom}
                sceneMode={sceneMode} flashMode={flashMode} showGrid={showGrid}
                captureCount={captures.filter((c) => c.type === 'photo').length}
                isRecording={isRecording} recordingTime={recordingTime} timerCountdown={timerCountdown}
                mode={mode} exposureComp={exposureComp} colorFilter={colorFilter}
                isFlipping={isFlipping} isDemoMode={isDemoMode}
                whiteBalance={whiteBalance} aspectMode={aspectMode} burstMode={burstMode} isBursting={isBursting}
                panoramaMode={panoramaMode} smileShutter={smileShutter}
                panoramaFrameCount={panoramaFrames.length}
                isTimelapsing={isTimelapsing} timelapseMode={timelapseMode}
                motionDetect={motionDetect}
              />
              {lastCapturePreview && <div className="digi-cam-capture-preview"><img src={lastCapturePreview} alt="" /></div>}
            </>
          ) : null}
          {/* Flash overlay lives outside the camera-state conditionals so it fires
              even in demo/error/boot states — the flash button is always accessible */}
          {isFlashFiring && <div className="digi-cam-flash-overlay" />}
        </div>
      </div>

      {/* EV Exposure Dial */}
      {mode !== 'playback' && <EVDial onPlayClick={playClickSound} />}

      <ControlPanel
        mode={mode} isRecording={isRecording}
        captureCount={captures.filter((c) => c.type === 'photo').length}
        videoCount={captures.filter((c) => c.type === 'video').length}
        onShutter={handleShutter} onModeSwitch={setMode}
        onMenu={() => setMenuOpen(!isMenuOpen)}
        onZoomIn={zoomIn} onZoomOut={zoomOut}
        zoomLevel={zoomLevel} burstMode={burstMode} isBursting={isBursting} aspectMode={aspectMode}
        onPlayClick={playClickSound}
      />

      <SideControls
        facingMode={facingMode}
        flashMode={flashMode}
        torchEnabled={torchEnabled}
        torchSupported={torchSupported}
        torchBusy={torchBusy}
        colorFilter={colorFilter}
        burstMode={burstMode}
        sceneMode={sceneMode}
        timerMode={timerMode}
        demoScene={demoScene}
        onFlip={() => { playClickSound(); toggleFacingMode(); }}
        onFlash={() => {
          playClickSound();
          if (!torchSupported) {
            toast({
              title: 'Flash not supported on this device',
              description: isIOSDevice()
                ? 'iOS Safari does not expose camera flash/torch to web pages.'
                : 'This camera/device has no torch (flashlight) capability.',
              duration: 3000,
            });
            return;
          }
          // Continuous torch, not a one-shot burst: toggling the flash icon
          // turns the LED on/off for the preview-and-capture session.
          setFlashMode(flashMode === 'on' ? 'off' : 'on');
        }}
        onFilter={() => { playClickSound(); cycleFilter(); }}
        onBurst={() => { playClickSound(); cycleBurst(); }}
        onScene={() => { playClickSound(); cycleScene(); }}
        onTimer={() => { playClickSound(); cycleTimer(); }}
        onDemoScene={() => { playClickSound(); cycleDemoScene(); }}
      />

      {isMenuOpen && <MenuOverlay onClose={() => setMenuOpen(false)} />}

      <div className="digi-cam-bottom-branding">
        <span>Carl Zeiss Vario-Tessar</span>
        <span>4x Optical Zoom</span>
      </div>

      {/* Tripod mount socket */}
      <div className="digi-cam-tripod-mount" />
    </div>
  );
}

// ── Inline SVG icons — thin-stroke, camera-hardware aesthetic ─────────────────
function IconFlip() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
      <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
      <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
      <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
      <path d="M8 12l4-4 4 4"/>
    </svg>
  );
}
function IconFlash({ mode }: { mode: string }) {
  if (mode === 'off') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="2" x2="22" y2="22"/>
      <path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11H12z"/>
    </svg>
  );
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}
function IconFilter() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <circle cx="12" cy="12" r="8"/>
      <line x1="12" y1="4" x2="12" y2="2"/>
      <line x1="12" y1="22" x2="12" y2="20"/>
      <line x1="4" y1="12" x2="2" y2="12"/>
      <line x1="22" y1="12" x2="20" y2="12"/>
    </svg>
  );
}
function IconBurst() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="6" height="12" rx="1"/>
      <rect x="9" y="6" width="6" height="12" rx="1"/>
      <rect x="16" y="6" width="6" height="12" rx="1"/>
    </svg>
  );
}
function IconScene() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="4"/>
      <line x1="12" y1="20" x2="12" y2="22"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="2" y1="12" x2="4" y2="12"/>
      <line x1="20" y1="12" x2="22" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}
function IconTimer() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8"/>
      <polyline points="12 9 12 13 14.5 13"/>
      <line x1="9" y1="3" x2="15" y2="3"/>
    </svg>
  );
}
function IconDemo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="15" rx="2"/>
      <polyline points="17 2 12 7 7 2"/>
    </svg>
  );
}

// LED indicator — lights up with mode-specific color
function Led({ color }: { color: string }) {
  return <span className="side-key-led" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />;
}

type SideControlsProps = {
  facingMode: string;
  flashMode: string;
  torchEnabled: boolean;
  torchSupported: boolean;
  torchBusy: boolean;
  colorFilter: string;
  burstMode: string;
  sceneMode: string;
  timerMode: string;
  demoScene: string;
  onFlip: () => void;
  onFlash: () => void;
  onFilter: () => void;
  onBurst: () => void;
  onScene: () => void;
  onTimer: () => void;
  onDemoScene: () => void;
};

function SideControls({ facingMode, torchEnabled, torchSupported, torchBusy, colorFilter, burstMode, sceneMode, timerMode, demoScene, onFlip, onFlash, onFilter, onBurst, onScene, onTimer, onDemoScene }: SideControlsProps) {
  const filterLabel = colorFilter === 'off' ? 'OFF' : colorFilter.toUpperCase().slice(0, 4);
  const burstLabel  = burstMode   === 'off' ? 'OFF' : burstMode.toUpperCase();
  const timerLabel  = timerMode   === 'off' ? 'OFF' : timerMode;

  // Real torch button trips three states: on / off / unsupported.
  const torchOn = torchSupported && torchEnabled; // physical LED actually lit
  const torchUnsupported = !torchSupported;

  return (
    <div className="digi-cam-side-controls">
      {/* ── Group 1: camera ── */}
      <button className="side-key" onClick={onFlip} title={facingMode === 'environment' ? 'Front camera' : 'Rear camera'}>
        <IconFlip />
        <span className="side-key-label">FLIP</span>
      </button>

      <button
        className={`side-key ${torchOn ? 'side-key--on' : ''} ${torchUnsupported ? 'side-key--unsupported' : ''}`}
        onClick={onFlash}
        title={torchUnsupported ? 'Flash not supported on this device' : torchOn ? 'Flash: on (tap to turn off)' : 'Flash: off (tap to turn on)'}
        aria-disabled={torchUnsupported}
      >
        {torchOn && <Led color="#ffffff" />}
        {torchBusy && torchSupported && <Led color="#666666" />}
        <IconFlash mode={torchOn ? 'on' : 'off'} />
        <span className="side-key-label">{torchOn ? 'ON' : torchUnsupported ? 'N/A' : 'OFF'}</span>
      </button>

      <div className="side-key-divider" />

      {/* ── Group 2: image ── */}
      <button className={`side-key ${colorFilter !== 'off' ? 'side-key--on' : ''}`} onClick={onFilter} title="Color filter">
        {colorFilter !== 'off' && <Led color="#aa44ff" />}
        <IconFilter />
        <span className="side-key-label">{filterLabel}</span>
      </button>

      <button className={`side-key ${burstMode !== 'off' ? 'side-key--on' : ''}`} onClick={onBurst} title="Burst mode">
        {burstMode !== 'off' && <Led color="#ff6600" />}
        <IconBurst />
        <span className="side-key-label">{burstLabel}</span>
      </button>

      <div className="side-key-divider" />

      {/* ── Group 3: scene / timer ── */}
      <button className="side-key" onClick={onScene} title="Scene mode">
        <IconScene />
        <span className="side-key-label">{sceneMode.slice(0, 4).toUpperCase()}</span>
      </button>

      <button className={`side-key ${timerMode !== 'off' ? 'side-key--on' : ''}`} onClick={onTimer} title="Self-timer">
        {timerMode !== 'off' && <Led color="#ffaa00" />}
        <IconTimer />
        <span className="side-key-label">{timerLabel}</span>
      </button>

      <div className="side-key-divider" />

      {/* ── Group 4: demo ── */}
      <button className="side-key" onClick={onDemoScene} title="Demo scene">
        <IconDemo />
        <span className="side-key-label">{demoScene.slice(0, 4).toUpperCase()}</span>
      </button>
    </div>
  );
}

function playShutterSound() {
  try {
    const AC = window.AudioContext || ((window as unknown as Record<string, typeof AudioContext>).webkitAudioContext);
    const audioCtx = new AC(); const t = audioCtx.currentTime;
    const o1 = audioCtx.createOscillator(); const g1 = audioCtx.createGain();
    o1.type = 'square'; o1.frequency.setValueAtTime(1200, t); o1.frequency.exponentialRampToValueAtTime(200, t + 0.04);
    g1.gain.setValueAtTime(0.15, t); g1.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o1.connect(g1); g1.connect(audioCtx.destination); o1.start(t); o1.stop(t + 0.06);
    const o2 = audioCtx.createOscillator(); const g2 = audioCtx.createGain();
    o2.type = 'sawtooth'; o2.frequency.setValueAtTime(800, t + 0.02); o2.frequency.exponentialRampToValueAtTime(100, t + 0.07);
    g2.gain.setValueAtTime(0.1, t + 0.02); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o2.connect(g2); g2.connect(audioCtx.destination); o2.start(t + 0.02); o2.stop(t + 0.08);
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.05, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.15));
    const ns = audioCtx.createBufferSource(); const ng = audioCtx.createGain();
    ns.buffer = buf; ng.gain.setValueAtTime(0.08, t);
    ns.connect(ng); ng.connect(audioCtx.destination); ns.start(t); ns.stop(t + 0.05);
  } catch { /* Audio unavailable */ }
}

function playTimerBeep() {
  try {
    const AC = window.AudioContext || ((window as unknown as Record<string, typeof AudioContext>).webkitAudioContext);
    const audioCtx = new AC(); const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(2000, t);
    g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.1);
  } catch { /* Audio unavailable */ }
}
