'use client';

import { useCameraStore, type ImageSize, ColorFilter, type PanoramaMode, type FlashMode, type SceneMode, type TimerMode, type AspectMode, type BurstMode, type WhiteBalance, type TimelapseMode } from '@/lib/camera-store';

interface MenuOverlayProps { onClose: () => void; }

const MENU_PAGES = [
  {
    title: 'SHOOTING',
    items: [
      { key: 'imageSize', label: 'Image Size', type: 'select' as const, options: ['14M', '10M', '5M', '2M', 'VGA'] as ImageSize[] },
      { key: 'showDateStamp', label: 'Date Stamp', type: 'toggle' as const },
      { key: 'showGrid', label: 'Grid Lines', type: 'toggle' as const },
      { key: 'colorFilter', label: 'Color Filter', type: 'select' as const, options: ['off', 'bw', 'sepia', 'vivid', 'warm', 'cool', 'pop'] as ColorFilter[] },
      { key: 'aspectMode', label: 'Aspect Ratio', type: 'select' as const, options: ['4:3', '16:9', '1:1'] as const },
      { key: 'burstMode', label: 'Burst Mode', type: 'select' as const, options: ['off', 'low', 'high'] as const },
      { key: 'panoramaMode', label: 'Panorama Guide', type: 'select' as const, options: ['off', 'assist'] as PanoramaMode[] },
      { key: 'smileShutter', label: 'Smile Shutter', type: 'toggle' as const },
      { key: 'timelapseMode', label: 'Timelapse', type: 'select' as const, options: ['off', '1s', '2s', '5s', '10s'] as TimelapseMode[] },
      { key: 'motionDetect', label: 'Motion Detect', type: 'toggle' as const },
    ],
  },
  {
    title: 'ADJUST',
    items: [
      { key: 'exposureComp', label: 'Exposure', type: 'ev' as const },
      { key: 'temperature', label: 'WB Temp', type: 'ev' as const },
      { key: 'tint', label: 'WB Tint', type: 'ev' as const },
    ],
  },
  {
    title: 'CAMERA',
    items: [
      { key: 'sceneMode', label: 'Scene Mode', type: 'select' as const, options: ['AUTO', 'PORTRAIT', 'LANDSCAPE', 'NIGHT', 'MACRO', 'SPORT', 'BEACH', 'SNOW'] as const },
      { key: 'flashMode', label: 'Flash Mode', type: 'select' as const, options: ['auto', 'on', 'off', 'slow'] as const },
    ],
  },
  {
    title: 'MEMORY',
    items: [
      { key: 'exportSettings', label: 'Export Settings', type: 'action' as const },
      { key: 'importSettings', label: 'Import Settings', type: 'action' as const },
      { key: 'clearGallery', label: 'Clear All Photos', type: 'action' as const },
    ],
  },
];

export function MenuOverlay({ onClose }: MenuOverlayProps) {
  const store = useCameraStore();
  const { menuPage, setMenuPage, clearCaptures, captures, exposureComp, adjustExposure, whiteBalance, adjustTemperature, adjustTint, panoramaFrames, panoramaMode } = store;
  const currentPage = MENU_PAGES[menuPage];

  const handleClick = (key: string, item: typeof currentPage.items[0]) => {
    if (key === 'exposureComp') { adjustExposure(exposureComp >= 1.5 ? -2 : 0.3); return; }
    if (key === 'temperature') { adjustTemperature(whiteBalance.temperature >= 1.5 ? -2 : 0.5); return; }
    if (key === 'tint') { adjustTint(whiteBalance.tint >= 1.5 ? -2 : 0.5); return; }
    if (item.type === 'toggle') {
      if (key === 'showDateStamp') store.toggleDateStamp();
      else if (key === 'showGrid') store.toggleGrid();
      else if (key === 'smileShutter') store.toggleSmileShutter();
      else if (key === 'motionDetect') store.toggleMotionDetect();
    } else if (item.type === 'select' && item.options) {
      const current = String((store as unknown as Record<string, unknown>)[key]);
      const idx = item.options.indexOf(current as typeof item.options[number]);
      const next = item.options[(idx + 1) % item.options.length];
      if (key === 'imageSize') store.setImageSize(next);
      else if (key === 'sceneMode') store.setSceneMode(next);
      else if (key === 'flashMode') store.setFlashMode(next);
      else if (key === 'colorFilter') store.setColorFilter(next);
      else if (key === 'aspectMode') store.setAspectMode(next);
      else if (key === 'burstMode') store.setBurstMode(next);
      else if (key === 'panoramaMode') store.setPanoramaMode(next);
      else if (key === 'timelapseMode') store.setTimelapseMode(next);
    } else if (item.type === 'action' && key === 'exportSettings') {
      const state = useCameraStore.getState();
      const settings = {
        flashMode: state.flashMode, sceneMode: state.sceneMode, imageSize: state.imageSize,
        timerMode: state.timerMode, showDateStamp: state.showDateStamp, showGrid: state.showGrid,
        colorFilter: state.colorFilter, exposureComp: state.exposureComp, aspectMode: state.aspectMode,
        whiteBalance: state.whiteBalance, burstMode: state.burstMode, panoramaMode: state.panoramaMode,
      };
      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'digicam-settings.json'; a.click();
      URL.revokeObjectURL(url);
    } else if (item.type === 'action' && key === 'importSettings') {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.json'; input.className = 'digi-hidden-input';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target?.result as string);
            const s = useCameraStore.getState();
            if (data.flashMode) s.setFlashMode(data.flashMode as FlashMode);
            if (data.sceneMode) s.setSceneMode(data.sceneMode as SceneMode);
            if (data.imageSize) s.setImageSize(data.imageSize as ImageSize);
            if (data.timerMode) s.setTimerMode(data.timerMode as TimerMode);
            if (typeof data.showDateStamp === 'boolean') { if (data.showDateStamp !== s.showDateStamp) s.toggleDateStamp(); }
            if (typeof data.showGrid === 'boolean') { if (data.showGrid !== s.showGrid) s.toggleGrid(); }
            if (data.colorFilter) s.setColorFilter(data.colorFilter as ColorFilter);
            if (typeof data.exposureComp === 'number') s.setExposureComp(data.exposureComp);
            if (data.aspectMode) s.setAspectMode(data.aspectMode as AspectMode);
            if (data.whiteBalance) s.setWhiteBalance(data.whiteBalance as WhiteBalance);
            if (data.burstMode) s.setBurstMode(data.burstMode as BurstMode);
            if (data.panoramaMode) s.setPanoramaMode(data.panoramaMode as PanoramaMode);
          } catch { /* invalid JSON */ }
        };
        reader.readAsText(file);
      };
      input.click();
    } else if (item.type === 'action' && key === 'clearGallery') {
      if (confirm('Delete all photos and videos?')) clearCaptures();
    }
  };

  const getDisplayValue = (key: string, item: typeof currentPage.items[0]) => {
    if (key === 'exposureComp') {
      const val = exposureComp;
      const v = Math.round(val * 10) / 10;
      return v === 0 ? '±0.0' : v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
    }
    if (key === 'temperature') {
      const val = whiteBalance.temperature;
      const v = Math.round(val * 10) / 10;
      return v === 0 ? '±0.0' : v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
    }
    if (key === 'tint') {
      const val = whiteBalance.tint;
      const v = Math.round(val * 10) / 10;
      return v === 0 ? '±0.0' : v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
    }
    if (item.type === 'toggle') return (store as unknown as Record<string, unknown>)[key] ? 'ON' : 'OFF';
    if (item.type === 'select') return String((store as unknown as Record<string, unknown>)[key]);
    if (item.type === 'action' && key === 'exportSettings') return 'JSON';
    if (item.type === 'action' && key === 'importSettings') return 'JSON';
    if (item.type === 'action' && key === 'clearGallery') return `${captures.length} items`;
    return '';
  };

  return (
    <div className="digi-menu-overlay" onClick={onClose}>
      <div className="digi-menu" onClick={e => e.stopPropagation()}>
        <div className="digi-menu-header">
          <div className="digi-menu-tabs">
            {MENU_PAGES.map((p, i) => (
              <button key={p.title} className={`digi-menu-tab ${i === menuPage ? 'tab-active' : ''}`} onClick={() => setMenuPage(i)}>{p.title}</button>
            ))}
          </div>
          <button className="digi-menu-close" onClick={onClose}>✕</button>
        </div>
        <div className="digi-menu-items">
          {currentPage.items.map((item) => (
            <button key={item.key} className="digi-menu-item" onClick={() => handleClick(item.key, item)}>
              <span className="digi-menu-item-label">{item.label}</span>
              <span className="digi-menu-item-value">
                {getDisplayValue(item.key, item)}
                {item.type !== 'action' && <span className="digi-menu-arrow">▶</span>}
                {item.key === 'panoramaMode' && panoramaMode === 'assist' && panoramaFrames.length > 0 && (
                  <span className="digi-menu-pano-frames">{panoramaFrames.length} frames</span>
                )}
              </span>
            </button>
          ))}
        </div>
        <div className="digi-menu-footer">
          <span>Select to change</span>
          <span>14M | FINE | {store.colorFilter === 'off' ? 'STD' : store.colorFilter.toUpperCase()} | {store.aspectMode}</span>
        </div>
      </div>
    </div>
  );
}