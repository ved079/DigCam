import { create } from 'zustand';

export type CameraMode = 'photo' | 'video' | 'playback';
export type FlashMode = 'auto' | 'on' | 'off' | 'slow';
export type SceneMode = 'AUTO' | 'PORTRAIT' | 'LANDSCAPE' | 'NIGHT' | 'MACRO' | 'SPORT' | 'BEACH' | 'SNOW';
export type ImageSize = '14M' | '10M' | '5M' | '2M' | 'VGA';
export type TimerMode = 'off' | '2s' | '10s';
export type ColorFilter = 'off' | 'bw' | 'sepia' | 'vivid' | 'warm' | 'cool' | 'pop';
export type FacingMode = 'environment' | 'user';
export type AspectMode = '4:3' | '16:9' | '1:1';

export interface WhiteBalance {
  temperature: number; // -2 to +2, default 0
  tint: number; // -2 to +2, default 0
}

export type BurstMode = 'off' | 'low' | 'high'; // low = 3fps for 2s, high = 5fps for 3s
export type DemoScene = 'sunset' | 'neon' | 'city' | 'indoor';
export type PanoramaMode = 'off' | 'assist';
export type TimelapseMode = 'off' | '1s' | '2s' | '5s' | '10s';

export interface CaptureItem {
  id: string;
  type: 'photo' | 'video';
  dataUrl: string;
  timestamp: number;
  sceneMode: SceneMode;
  flashMode: FlashMode;
  dateStamp: string;
  videoBlob?: Blob;
  filter?: ColorFilter;
  exposure?: number;
  whiteBalance?: WhiteBalance;
  aspectMode?: AspectMode;
  rotation?: number;
  latitude?: number;
  longitude?: number;
  editBrightness?: number;
  editContrast?: number;
  editSaturation?: number;
  cropRect?: { x: number; y: number; w: number; h: number };
}

interface CameraStore {
  // Selection (batch delete)
  selectedIds: string[];
  // Camera state
  mode: CameraMode;
  isRecording: boolean;
  isFlashFiring: boolean;
  isFocusing: boolean;
  cameraReady: boolean;
  cameraError: string | null;
  isDemoMode: boolean;
  isFlipping: boolean;

  // Settings
  flashMode: FlashMode;
  sceneMode: SceneMode;
  imageSize: ImageSize;
  timerMode: TimerMode;
  zoomLevel: number;
  showDateStamp: boolean;
  showGrid: boolean;
  colorFilter: ColorFilter;
  exposureComp: number; // -2.0 to +2.0
  facingMode: FacingMode;
  isoValue: number; // 80-3200
  slideshowActive: boolean;
  aspectMode: AspectMode;
  whiteBalance: WhiteBalance;
  burstMode: BurstMode;
  demoScene: DemoScene;
  isBursting: boolean;
  panoramaMode: PanoramaMode;
  comparisonMode: boolean;
  smileShutter: boolean;

  // Timelapse
  timelapseMode: TimelapseMode;
  isTimelapsing: boolean;

  // Motion Detection
  motionDetect: boolean;
  motionSensitivity: number;

  // Collage
  selectedForCollage: [];

  // Slideshow
  slideshowTransition: 'dissolve' | 'slide' | 'zoom' | 'kenburns';

  // Print
  isPrintMode: boolean;

  // WB Presets
  wbPresets: { name: string; temp: number; tint: number }[];

  // Panorama
  panoramaFrames: string[];

  // Gallery
  captures: CaptureItem[];
  galleryIndex: number;
  totalCapacity: number;

  // Menu
  isMenuOpen: boolean;
  menuPage: number;

  // Actions
  setMode: (mode: CameraMode) => void;
  setRecording: (recording: boolean) => void;
  setFlashFiring: (firing: boolean) => void;
  setFocusing: (focusing: boolean) => void;
  setCameraReady: (ready: boolean) => void;
  setCameraError: (error: string | null) => void;
  setDemoMode: (demo: boolean) => void;
  setFlipping: (flipping: boolean) => void;
  setFlashMode: (mode: FlashMode) => void;
  setSceneMode: (mode: SceneMode) => void;
  setImageSize: (size: ImageSize) => void;
  setTimerMode: (mode: TimerMode) => void;
  setZoomLevel: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  toggleDateStamp: () => void;
  toggleGrid: () => void;
  setColorFilter: (filter: ColorFilter) => void;
  cycleFilter: () => void;
  setExposureComp: (ev: number) => void;
  adjustExposure: (delta: number) => void;
  setFacingMode: (mode: FacingMode) => void;
  toggleFacingMode: () => void;
  setSlideshowActive: (active: boolean) => void;
  setAspectMode: (mode: AspectMode) => void;
  setWhiteBalance: (wb: WhiteBalance) => void;
  adjustTemperature: (delta: number) => void;
  adjustTint: (delta: number) => void;
  setBurstMode: (mode: BurstMode) => void;
  cycleBurst: () => void;
  setDemoScene: (scene: DemoScene) => void;
  setBursting: (bursting: boolean) => void;
  cycleDemoScene: () => void;
  setPanoramaMode: (mode: PanoramaMode) => void;
  toggleComparisonMode: () => void;
  toggleSmileShutter: () => void;
  setTimelapseMode: (mode: TimelapseMode) => void;
  setTimelapsing: (val: boolean) => void;
  cycleTimelapse: () => void;
  toggleMotionDetect: () => void;
  setMotionSensitivity: (val: number) => void;
  toggleCollageSelect: (id: string) => void;
  clearCollageSelection: () => void;
  setSlideshowTransition: (t: 'dissolve' | 'slide' | 'zoom' | 'kenburns') => void;
  setPrintMode: (val: boolean) => void;
  saveWbPreset: (idx: number, name: string) => void;
  loadWbPreset: (idx: number) => void;
  clearWbPresets: () => void;
  addPanoramaFrame: (dataUrl: string) => void;
  clearPanoramaFrames: () => void;
  updateCaptureEdit: (id: string, brightness: number, contrast: number, saturation: number) => void;
  updateCaptureDataUrl: (id: string, dataUrl: string) => void;
  updateCaptureCrop: (id: string, crop: { x: number; y: number; w: number; h: number } | undefined) => void;
  addCapture: (capture: CaptureItem) => void;
  setGalleryIndex: (index: number) => void;
  setMenuOpen: (open: boolean) => void;
  setMenuPage: (page: number) => void;
  clearCaptures: () => void;
  deleteCapture: (id: string) => void;
  cycleFlash: () => void;
  cycleScene: () => void;
  cycleTimer: () => void;
  setCaptureRotation: (id: string, rotation: number) => void;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  deleteSelected: () => void;
}

export const useCameraStore = create<CameraStore>((set, get) => ({
  mode: 'photo',
  isRecording: false,
  isFlashFiring: false,
  isFocusing: false,
  cameraReady: false,
  cameraError: null,
  isDemoMode: false,
  isFlipping: false,

  flashMode: 'auto',
  sceneMode: 'AUTO',
  imageSize: '14M',
  timerMode: 'off',
  zoomLevel: 1,
  showDateStamp: true,
  showGrid: false,
  colorFilter: 'off',
  exposureComp: 0,
  facingMode: 'environment',
  isoValue: 80,
  slideshowActive: false,
  aspectMode: '4:3',
  whiteBalance: { temperature: 0, tint: 0 },
  burstMode: 'off',
  demoScene: 'city',
  isBursting: false,
  panoramaMode: 'off' as PanoramaMode,
  comparisonMode: false,
  smileShutter: false,
  timelapseMode: 'off' as TimelapseMode,
  isTimelapsing: false,
  motionDetect: false,
  motionSensitivity: 25,
  selectedForCollage: [],
  panoramaFrames: [],
  slideshowTransition: 'dissolve' as const,
  isPrintMode: false,
  wbPresets: [
    { name: 'Custom 1', temp: 0, tint: 0 },
    { name: 'Custom 2', temp: 0, tint: 0 },
    { name: 'Custom 3', temp: 0, tint: 0 },
  ],

  captures: [],
  galleryIndex: 0,
  totalCapacity: 500,
  selectedIds: [],

  isMenuOpen: false,
  menuPage: 0,

  setMode: (mode) => set({ mode, isMenuOpen: false, slideshowActive: false }),
  setRecording: (recording) => set({ isRecording: recording }),
  setFlashFiring: (firing) => set({ isFlashFiring: firing }),
  setFocusing: (focusing) => set({ isFocusing: focusing }),
  setCameraReady: (ready) => set({ cameraReady: ready }),
  setCameraError: (error) => set({ cameraError: error }),
  setDemoMode: (demo) => set({ isDemoMode: demo }),
  setFlipping: (flipping) => set({ isFlipping: flipping }),
  setFlashMode: (mode) => set({ flashMode: mode }),
  setSceneMode: (mode) => set({ sceneMode: mode }),
  setImageSize: (size) => set({ imageSize: size }),
  setTimerMode: (mode) => set({ timerMode: mode }),
  setZoomLevel: (level) => set({ zoomLevel: Math.max(1, Math.min(4, level)) }),
  zoomIn:  () => set((s) => ({ zoomLevel: Math.min(4, s.zoomLevel + 1) })),
  zoomOut: () => set((s) => ({ zoomLevel: Math.max(1, s.zoomLevel - 1) })),
  toggleDateStamp: () => set((s) => ({ showDateStamp: !s.showDateStamp })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  setColorFilter: (filter) => set({ colorFilter: filter }),
  cycleFilter: () => {
    const modes: ColorFilter[] = ['off', 'bw', 'sepia', 'vivid', 'warm', 'cool', 'pop'];
    const current = get().colorFilter;
    const idx = modes.indexOf(current);
    set({ colorFilter: modes[(idx + 1) % modes.length] });
  },
  setExposureComp: (ev) => set({ exposureComp: Math.max(-2, Math.min(2, ev)) }),
  adjustExposure: (delta) => set((s) => ({ exposureComp: Math.max(-2, Math.min(2, s.exposureComp + delta)) })),
  setFacingMode: (mode) => set({ facingMode: mode }),
  toggleFacingMode: () => {
    const current = get().facingMode;
    set({ isFlipping: true });
    setTimeout(() => {
      set({ facingMode: current === 'environment' ? 'user' : 'environment', isFlipping: false });
    }, 400);
  },
  setSlideshowActive: (active) => set({ slideshowActive: active }),
  setAspectMode: (mode) => set({ aspectMode: mode }),
  setWhiteBalance: (wb) => set({
    whiteBalance: {
      temperature: Math.max(-2, Math.min(2, wb.temperature)),
      tint: Math.max(-2, Math.min(2, wb.tint)),
    },
  }),
  adjustTemperature: (delta) => set((s) => ({
    whiteBalance: {
      ...s.whiteBalance,
      temperature: Math.max(-2, Math.min(2, s.whiteBalance.temperature + delta)),
    },
  })),
  adjustTint: (delta) => set((s) => ({
    whiteBalance: {
      ...s.whiteBalance,
      tint: Math.max(-2, Math.min(2, s.whiteBalance.tint + delta)),
    },
  })),
  setBurstMode: (mode) => set({ burstMode: mode }),
  cycleBurst: () => {
    const modes: BurstMode[] = ['off', 'low', 'high'];
    const current = get().burstMode;
    const idx = modes.indexOf(current);
    set({ burstMode: modes[(idx + 1) % modes.length] });
  },
  setDemoScene: (scene) => set({ demoScene: scene }),
  setBursting: (bursting) => set({ isBursting: bursting }),
  cycleDemoScene: () => {
    const modes: DemoScene[] = ['sunset', 'neon', 'city', 'indoor'];
    const current = get().demoScene;
    const idx = modes.indexOf(current);
    set({ demoScene: modes[(idx + 1) % modes.length] });
  },
  setPanoramaMode: (mode) => set({ panoramaMode: mode }),
  toggleComparisonMode: () => set((s) => ({ comparisonMode: !s.comparisonMode })),
  toggleSmileShutter: () => set((s) => ({ smileShutter: !s.smileShutter })),
  setTimelapseMode: (mode) => set({ timelapseMode: mode }),
  setTimelapsing: (val) => set({ isTimelapsing: val }),
  cycleTimelapse: () => {
    const modes: TimelapseMode[] = ['off', '1s', '2s', '5s', '10s'];
    const current = get().timelapseMode;
    const idx = modes.indexOf(current);
    set({ timelapseMode: modes[(idx + 1) % modes.length] });
  },
  toggleMotionDetect: () => set((s) => ({ motionDetect: !s.motionDetect })),
  setMotionSensitivity: (val) => set({ motionSensitivity: Math.max(10, Math.min(50, val)) }),
  toggleCollageSelect: (id) => set((s) => {
    const maxForType = 4; // 2x2 default
    if (s.selectedForCollage.includes(id)) {
      return { selectedForCollage: s.selectedForCollage.filter((x) => x !== id) };
    }
    if (s.selectedForCollage.length >= 9) return s;
    return { selectedForCollage: [...s.selectedForCollage, id] };
  }),
  clearCollageSelection: () => set({ selectedForCollage: [] }),
  setSlideshowTransition: (t) => set({ slideshowTransition: t }),
  setPrintMode: (val) => set({ isPrintMode: val }),
  saveWbPreset: (idx, name) => set((s) => {
    const presets = [...s.wbPresets];
    if (idx >= 0 && idx < 3) {
      presets[idx] = { name: name || `Custom ${idx + 1}`, temp: s.whiteBalance.temperature, tint: s.whiteBalance.tint };
    }
    return { wbPresets: presets };
  }),
  loadWbPreset: (idx) => set((s) => {
    if (idx >= 0 && idx < s.wbPresets.length) {
      return { whiteBalance: { temperature: s.wbPresets[idx].temp, tint: s.wbPresets[idx].tint } };
    }
  }),
  clearWbPresets: () => set({ wbPresets: [] }),
  addPanoramaFrame: (dataUrl) => set((s) => ({ panoramaFrames: [...s.panoramaFrames, dataUrl] })),
  clearPanoramaFrames: () => set({ panoramaFrames: [] }),
  updateCaptureEdit: (id, brightness, contrast, saturation) => set((s) => ({
    captures: s.captures.map((c) => c.id === id ? { ...c, editBrightness: brightness, editContrast: contrast, editSaturation: saturation } : c),
  })),
  updateCaptureDataUrl: (id, dataUrl) => set((s) => ({
    captures: s.captures.map((c) => c.id === id ? { ...c, dataUrl, editBrightness: 0, editContrast: 0, editSaturation: 0 } : c),
  })),
  updateCaptureCrop: (id, crop) => set((s) => ({
    captures: s.captures.map((c) => c.id === id ? { ...c, cropRect: crop } : c),
  })),
  addCapture: (capture) => set((s) => ({ captures: [...s.captures, capture] })),
  setGalleryIndex: (index) => set({ galleryIndex: index }),
  setMenuOpen: (open) => set({ isMenuOpen: open }),
  setMenuPage: (page) => set({ menuPage: page }),
  clearCaptures: () => set({ captures: [] }),
  deleteCapture: (id) => set((s) => ({ captures: s.captures.filter((c) => c.id !== id) })),
  cycleFlash: () => {
    const modes: FlashMode[] = ['auto', 'on', 'off', 'slow'];
    const current = get().flashMode;
    const idx = modes.indexOf(current);
    set({ flashMode: modes[(idx + 1) % modes.length] });
  },
  cycleScene: () => {
    const modes: SceneMode[] = ['AUTO', 'PORTRAIT', 'LANDSCAPE', 'NIGHT', 'MACRO', 'SPORT', 'BEACH', 'SNOW'];
    const current = get().sceneMode;
    const idx = modes.indexOf(current);
    set({ sceneMode: modes[(idx + 1) % modes.length] });
  },
  cycleTimer: () => {
    const modes: TimerMode[] = ['off', '2s', '10s'];
    const current = get().timerMode;
    const idx = modes.indexOf(current);
    set({ timerMode: modes[(idx + 1) % modes.length] });
  },
  setCaptureRotation: (id, rotation) => set((s) => ({
    captures: s.captures.map((c) => c.id === id ? { ...c, rotation } : c),
  })),
  toggleSelect: (id) => set((s) => ({
    selectedIds: s.selectedIds.includes(id)
      ? s.selectedIds.filter((x) => x !== id)
      : [...s.selectedIds, id],
  })),
  selectAll: () => set((s) => ({ selectedIds: s.captures.map((c) => c.id) })),
  clearSelection: () => set({ selectedIds: [] }),
  deleteSelected: () => set((s) => ({
    captures: s.captures.filter((c) => !s.selectedIds.includes(c.id)),
    selectedIds: [],
  })),
}));
