'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCameraStore } from '@/lib/camera-store';
import { saveCapture } from '@/lib/db-persistence';

function formatCoord(val: number, pos: string, neg: string): string {
  const abs = Math.abs(val);
  const dir = val >= 0 ? pos : neg;
  return `${abs.toFixed(4)}\u00B0${dir}`;
}

export function Gallery() {
  const {
    captures, galleryIndex, setGalleryIndex, deleteCapture, setMode, setCaptureRotation,
    comparisonMode, toggleComparisonMode, updateCaptureEdit, updateCaptureDataUrl, updateCaptureCrop,
    selectedIds, toggleSelect, selectAll, clearSelection, deleteSelected,
    panoramaFrames, clearPanoramaFrames, addCapture,
    selectedForCollage, toggleCollageSelect, clearCollageSelection,
  } = useCameraStore();
  const [showInfo, setShowInfo] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [slideshowActive, setSlideshowActive] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [collageMode, setCollageMode] = useState(false);
  const [collageType, setCollageType] = useState<'2x2' | '3x3'>('2x2');
  const current = captures[galleryIndex];
  const selectCount = selectedIds.length;
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [isDraggingCompare, setIsDraggingCompare] = useState(false);
  const [comparePos, setComparePos] = useState(50);
  const [compareWidth, setCompareWidth] = useState(300);
  const lastTapRef = useRef(0);
  // Print preview state
  const [printMode] = useState(false);
  const [compareTargetIndex, setCompareTargetIndex] = useState(-1);
  // Compute edit values from current capture
  const editBrightness = current?.editBrightness ?? 0;
  const editContrast = current?.editContrast ?? 0;
  const editSaturation = current?.editSaturation ?? 0;
  const currentId = current?.id;

  // Exit select mode when captures change to 0
  if (captures.length === 0 && selectMode) setSelectMode(false);

  // Draw histogram in info overlay
  useEffect(() => {
    if (!showInfo || !current || current.type === 'video') return;
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
      // Draw RGB channels (faint)
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
      // Draw luminance (white)
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
  }, [showInfo, current]);

  // Reset edit mode when switching images
  const [editMode, setEditMode] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  // Watermark state
  const [watermarkText, setWatermarkText] = useState('');
  const [watermarkPos, setWatermarkPos] = useState<'tl' | 'tr' | 'bl' | 'br'>('br');
  const [watermarkSize, setWatermarkSize] = useState(24);
  const [cropRect, setCropRect] = useState({ x: 25, y: 25, w: 50, h: 50 });
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const cropDraggingRef = useRef(false);
  const lastEditIdRef = useRef(currentId);
  // Reset edit mode when image changes (derived check, not effect)
  if (lastEditIdRef.current !== currentId) {
    lastEditIdRef.current = currentId;
    if (editMode) setEditMode(false);
    if (cropMode) setCropMode(false);
    setWatermarkText('');
  }

  // Enter/exit select mode
  const handleEnterSelect = useCallback(() => { setSelectMode(true); setEditMode(false); setCropMode(false); setShowInfo(false); }, []);
  const handleExitSelect = useCallback(() => { setSelectMode(false); clearSelection(); }, [clearSelection]);
  const handleSelectAll = useCallback(() => { selectAll(); }, [selectAll]);
  const handleDeleteSelected = useCallback(() => {
    deleteSelected();
    if (captures.length - selectCount <= 0) setSelectMode(false);
  }, [deleteSelected, captures.length, selectCount]);

  // Rotate photo
  const handleRotate = useCallback(() => {
    if (!current || current.type === 'video') return;
    const newRot = ((current.rotation || 0) + 90) % 360;
    setCaptureRotation(current.id, newRot);
    saveCapture({ ...current, rotation: newRot } as unknown as Record<string, unknown>).catch(() => {});
  }, [current, setCaptureRotation]);

  // Double-tap to like
  useEffect(() => {
    const el = document.getElementById('gallery-display');
    if (!el) return;
    const handler = () => {
      const now = Date.now();
      if (now - lastTapRef.current < 300 && current) {
        setLikedIds((prev) => {
          const next = new Set(prev);
          if (prev.has(current.id)) next.delete(current.id); else next.add(current.id);
          return next;
        });
      }
      lastTapRef.current = now;
    };
    el.addEventListener('touchend', handler, { passive: true });
    return () => el.removeEventListener('touchend', handler);
  }, [current, likedIds]);

  const goNext = useCallback(() => {
    if (galleryIndex < captures.length - 1) {
      setGalleryIndex(galleryIndex + 1);
      setShowInfo(false);
      setIsVideoPlaying(false);
    }
  }, [galleryIndex, captures.length, setGalleryIndex]);

  const goPrev = useCallback(() => {
    if (galleryIndex > 0) {
      setGalleryIndex(galleryIndex - 1);
      setShowInfo(false);
      setIsVideoPlaying(false);
    }
  }, [galleryIndex, setGalleryIndex]);

  const goBack = useCallback(() => {
    setMode('photo');
    setIsVideoPlaying(false);
  }, [setMode]);

  // Comparison drag handlers
  const handleCompareMove = useCallback((clientX: number, containerEl?: HTMLElement) => {
    const el = containerEl || compareContainerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let pct = ((clientX - rect.left) / rect.width) * 100;
    pct = Math.max(10, Math.min(90, pct));
    setComparePos(pct);
    setCompareWidth(rect.width);
  }, []);

  const compareContainerRef = useRef<HTMLDivElement>(null);

  const handleCompareMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingCompare(true);
    if (compareContainerRef.current) handleCompareMove(e.clientX, compareContainerRef.current);
  }, [handleCompareMove]);

  const handleCompareTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDraggingCompare(true);
    if (compareContainerRef.current) handleCompareMove(e.touches[0].clientX, compareContainerRef.current);
  }, [handleCompareMove]);

  useEffect(() => {
    if (!isDraggingCompare) return;
    const onMouseMove = (e: MouseEvent) => { if (compareContainerRef.current) handleCompareMove(e.clientX, compareContainerRef.current); };
    const onTouchMove = (e: TouchEvent) => { if (compareContainerRef.current) handleCompareMove(e.touches[0].clientX, compareContainerRef.current); };
    const onEnd = () => setIsDraggingCompare(false);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isDraggingCompare, handleCompareMove]);

  // Burn in watermark
  const handleBurnIn = useCallback(() => {
    if (!current || current.type === 'video' || !watermarkText.trim()) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // Draw existing image (with current filter edits if any)
      ctx.filter = `brightness(${1 + editBrightness / 100}) contrast(${1 + editContrast / 100}) saturate(${1 + editSaturation / 100})`;
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none';
      // Calculate text position
      const fontSize = Math.round(watermarkSize * (img.width / 640));
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = fontSize / 3;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      const padding = fontSize;
      let x = 0;
      let y = 0;
      if (watermarkPos === 'tl') { x = padding; y = fontSize + padding / 2; ctx.textAlign = 'left'; }
      else if (watermarkPos === 'tr') { x = img.width - padding; y = fontSize + padding / 2; ctx.textAlign = 'right'; }
      else if (watermarkPos === 'bl') { x = padding; y = img.height - padding / 2; ctx.textAlign = 'left'; }
      else { x = img.width - padding; y = img.height - padding / 2; ctx.textAlign = 'right'; }
      ctx.fillText(watermarkText, x, y);
      const newDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      updateCaptureDataUrl(current.id, newDataUrl);
      saveCapture({ ...current, dataUrl: newDataUrl, editBrightness: 0, editContrast: 0, editSaturation: 0 } as unknown as Record<string, unknown>).catch(() => {});
      setWatermarkText('');
    };
    img.src = current.dataUrl;
  }, [current, watermarkText, watermarkPos, watermarkSize, editBrightness, editContrast, editSaturation, updateCaptureDataUrl]);

  // Stitch panorama
  const handleStitch = useCallback(() => {
    if (panoramaFrames.length < 2) return;
    const loadImages = panoramaFrames.map((src) => {
      return new Promise<HTMLImageElement>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(img);
        img.src = src;
      });
    });
    Promise.all(loadImages).then((images) => {
      const validImages = images.filter((img) => img.width > 0 && img.height > 0);
      if (validImages.length < 2) return;
      const height = Math.max(...validImages.map((img) => img.height));
      const totalWidth = validImages.reduce((sum, img) => sum + img.width, 0);
      const canvas = document.createElement('canvas');
      canvas.width = totalWidth;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, totalWidth, height);
      let offsetX = 0;
      for (const img of validImages) {
        const yOffset = Math.round((height - img.height) / 2);
        ctx.drawImage(img, offsetX, yOffset, img.width, img.height);
        offsetX += img.width;
      }
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const panoramaCapture: { id: string; type: 'photo'; dataUrl: string; timestamp: number; sceneMode: string; flashMode: string; dateStamp: string; filter?: string; exposure?: number; whiteBalance?: { temperature: number; tint: number }; aspectMode?: string } = {
        id: `pano_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'photo',
        dataUrl,
        timestamp: Date.now(),
        sceneMode: 'AUTO',
        flashMode: 'off',
        dateStamp: new Date().toLocaleString(),
        aspectMode: '16:9',
      };
      addCapture(panoramaCapture as unknown as import('@/lib/camera-store').CaptureItem);
      saveCapture(panoramaCapture as unknown as Record<string, unknown>).catch(() => {});
      clearPanoramaFrames();
    });
  }, [panoramaFrames, addCapture, clearPanoramaFrames]);

  // Create collage
  const handleCreateCollage = useCallback(() => {
    const required = collageType === '2x2' ? 4 : 9;
    if (selectedForCollage.length !== required) return;
    const photos = captures.filter((c) => c.type === 'photo' && selectedForCollage.includes(c.id));
    if (photos.length !== required) return;
    const loadImages = photos.map((cap) => {
      return new Promise<HTMLImageElement>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(img);
        img.src = cap.dataUrl;
      });
    });
    Promise.all(loadImages).then((images) => {
      const validImages = images.filter((img) => img.width > 0 && img.height > 0);
      if (validImages.length < required) return;
      const cols = collageType === '2x2' ? 2 : 3;
      const rows = cols;
      const cellW = Math.min(...validImages.map((img) => img.width));
      const cellH = Math.min(...validImages.map((img) => img.height));
      const border = 2;
      const canvas = document.createElement('canvas');
      canvas.width = cols * cellW + (cols - 1) * border;
      canvas.height = rows * cellH + (rows - 1) * border;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < validImages.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * (cellW + border);
        const y = row * (cellH + border);
        ctx.drawImage(validImages[i], 0, 0, cellW, cellH, x, y, cellW, cellH);
      }
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const collageCapture = {
        id: `collage_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'photo' as const,
        dataUrl,
        timestamp: Date.now(),
        sceneMode: 'AUTO' as const,
        flashMode: 'off' as const,
        dateStamp: new Date().toLocaleString(),
        aspectMode: '1:1' as const,
      };
      addCapture(collageCapture as unknown as import('@/lib/camera-store').CaptureItem);
      saveCapture(collageCapture as unknown as Record<string, unknown>).catch(() => {});
      clearCollageSelection();
      setCollageMode(false);
    });
  }, [selectedForCollage, captures, collageType, addCapture, clearCollageSelection]);

  // Apply edits to canvas
  const handleApplyEdit = useCallback(() => {
    if (!current || current.type === 'video') return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.filter = `brightness(${1 + editBrightness / 100}) contrast(${1 + editContrast / 100}) saturate(${1 + editSaturation / 100})`;
      ctx.drawImage(img, 0, 0);
      const newDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      updateCaptureDataUrl(current.id, newDataUrl);
      saveCapture({ ...current, dataUrl: newDataUrl, editBrightness: 0, editContrast: 0, editSaturation: 0 } as unknown as Record<string, unknown>).catch(() => {});
      setEditMode(false);
    };
    img.src = current.dataUrl;
  }, [current, editBrightness, editContrast, editSaturation, updateCaptureDataUrl]);

  const handleResetEdit = useCallback(() => {
    if (current && current.type === 'photo') {
      updateCaptureEdit(current.id, 0, 0, 0);
    }
  }, [current, updateCaptureEdit]);

  // Crop handle drag
  const handleCropDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cropDraggingRef.current = true;
  }, []);

  useEffect(() => {
    if (!cropDraggingRef.current) return;
    const onMove = (clientX: number, clientY: number) => {
      const container = cropContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * 100;
      const py = ((clientY - rect.top) / rect.height) * 100;
      const newW = Math.max(10, Math.min(100 - cropRect.x, px - cropRect.x));
      const newH = Math.max(10, Math.min(100 - cropRect.y, py - cropRect.y));
      setCropRect(prev => ({ ...prev, w: newW, h: newH }));
    };
    const onMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); };
    const onEnd = () => { cropDraggingRef.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [cropRect.x, cropRect.y]);

  // Apply crop
  const handleApplyCrop = useCallback(() => {
    if (!current || current.type === 'video') return;
    const img = new Image();
    img.onload = () => {
      const sx = Math.round(img.width * cropRect.x / 100);
      const sy = Math.round(img.height * cropRect.y / 100);
      const sw = Math.round(img.width * cropRect.w / 100);
      const sh = Math.round(img.height * cropRect.h / 100);
      const canvas = document.createElement('canvas');
      canvas.width = sw; canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const newDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      updateCaptureDataUrl(current.id, newDataUrl);
      updateCaptureCrop(current.id, { x: cropRect.x, y: cropRect.y, w: cropRect.w, h: cropRect.h });
      saveCapture({ ...current, dataUrl: newDataUrl } as unknown as Record<string, unknown>).catch(() => {});
      setCropMode(false);
    };
    img.src = current.dataUrl;
  }, [current, cropRect, updateCaptureDataUrl, updateCaptureCrop]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') goBack();
      else if (e.key === 'i') setShowInfo(s => !s);
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (current) {
          deleteCapture(current.id);
          setShowInfo(false);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, goBack, current, deleteCapture]);

  // Touch swipe
  useEffect(() => {
    let startX = 0;
    const handleTouchStart = (e: TouchEvent) => { startX = e.touches[0].clientX; };
    const handleTouchEnd = (e: TouchEvent) => {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) {
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
  }, [goNext, goPrev]);

  // Slideshow
  useEffect(() => {
    if (!slideshowActive) return;
    const timer = setInterval(() => {
      setGalleryIndex((i) => (i < captures.length - 1 ? i + 1 : 0));
      setIsVideoPlaying(false);
    }, 3000);
    return () => clearInterval(timer);
  }, [slideshowActive, captures.length, setGalleryIndex]);

  // Compute the CSS filter for the edit preview
  const editFilter = `brightness(${1 + editBrightness / 100}) contrast(${1 + editContrast / 100}) saturate(${1 + editSaturation / 100})`;
  const hasEdit = editBrightness !== 0 || editContrast !== 0 || editSaturation !== 0;

  if (captures.length === 0) {
    return (
      <div className="digi-gallery-empty">
        <div className="digi-no-image-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </div>
        <p className="digi-no-image-text">NO IMAGE</p>
        <button className="digi-gallery-back-btn" onClick={goBack}>
          ← BACK TO CAMERA
        </button>
      </div>
    );
  }

  if (!current) return null;

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  return (
    <div className="digi-gallery" id="gallery-swipe-area">
      {/* Top bar */}
      <div className="digi-gallery-top">
        <button className="digi-gallery-nav-btn" onClick={goBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="digi-gallery-counter">
          {String(galleryIndex + 1).padStart(2, '0')}/{String(captures.length).padStart(2, '0')}
        </span>
        <button
          className="digi-gallery-nav-btn"
          onClick={() => setShowInfo(!showInfo)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </button>
      </div>

      {/* Image display */}
      <div className="digi-gallery-display" id="gallery-display">
        {current.type === 'video' ? (
          isVideoPlaying ? (
            <video
              src={current.dataUrl}
              autoPlay
              controls
              className="digi-gallery-video"
              onEnded={() => setIsVideoPlaying(false)}
            />
          ) : (
            <div className="digi-gallery-video-thumb" onClick={() => setIsVideoPlaying(true)}>
              <video src={current.dataUrl} className="digi-gallery-video-preview" />
              <div className="digi-play-overlay">
                <div className="digi-play-triangle" />
              </div>
            </div>
          )
        ) : comparisonMode ? (
          /* Before/After comparison mode */
          <div
            className="digi-compare-container"
            ref={compareContainerRef}
            onMouseMove={isDraggingCompare ? (e) => { e.preventDefault(); handleCompareMove(e.clientX, compareContainerRef.current); } : undefined}
            onMouseDown={handleCompareMouseDown}
            onTouchStart={handleCompareTouchStart}
            style={{ userSelect: 'none' }}
          >
            {/* Right side: ORIGINAL (simulated) */}
            <div className="digi-compare-side digi-compare-original">
              <span className="digi-compare-label">ORIGINAL</span>
              <img
                src={current.dataUrl}
                alt="Original"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  filter: 'contrast(0.6) saturate(0.5) brightness(1.1)',
                }}
              />
            </div>
            {/* Left side: CCD processed (clipped) */}
            <div className="digi-compare-side digi-compare-ccd" style={{ width: `${comparePos}%` }}>
              <span className="digi-compare-label">CCD</span>
              <img
                src={current.dataUrl}
                alt="CCD Processed"
                style={{
                  width: `${compareWidth}px`,
                  maxWidth: 'none',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
            {/* Divider */}
            <div
              className="digi-compare-divider"
              style={{ left: `${comparePos}%` }}
            >
              <div className="digi-compare-divider-handle" />
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src={current.dataUrl}
              alt={`Photo ${galleryIndex + 1}`}
              className="digi-gallery-image"
              style={{ transform: current.rotation ? `rotate(${current.rotation}deg)` : undefined, filter: hasEdit ? editFilter : undefined }}
            />
            {/* Watermark live preview */}
            {editMode && watermarkText && current.type === 'photo' && (
              <div
                className="digi-watermark-preview"
                style={{
                  fontSize: `${watermarkSize}px`,
                  ...(watermarkPos === 'tl' ? { top: '8px', left: '8px' } :
                    watermarkPos === 'tr' ? { top: '8px', right: '8px' } :
                    watermarkPos === 'bl' ? { bottom: '8px', left: '8px' } :
                    { bottom: '8px', right: '8px' }),
                }}
              >
                {watermarkText}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selection counter overlay */}
      {selectMode && selectCount > 0 && (
        <div className="digi-select-count">{selectCount} selected</div>
      )}

      {/* Navigation arrows */}
      <div className="digi-gallery-nav">
        <button
          className={`digi-gallery-arrow ${galleryIndex <= 0 ? 'disabled' : ''}`}
          onClick={goPrev}
          disabled={galleryIndex <= 0}
        >
          ◀
        </button>
        <button
          className={`digi-gallery-arrow ${galleryIndex >= captures.length - 1 ? 'disabled' : ''}`}
          onClick={goNext}
          disabled={galleryIndex >= captures.length - 1}
        >
          ▶
        </button>
      </div>

      {/* Info overlay */}
      {showInfo && (
        <div className="digi-gallery-info">
          <div className="digi-info-row">
            <span className="digi-info-label">FILE</span>
            <span className="digi-info-value">DSC{String(galleryIndex + 1).padStart(4, '0')}.JPG</span>
          </div>
          <div className="digi-info-row">
            <span className="digi-info-label">DATE</span>
            <span className="digi-info-value">{formatDate(current.timestamp)}</span>
          </div>
          <div className="digi-info-row">
            <span className="digi-info-label">SCENE</span>
            <span className="digi-info-value">{current.sceneMode}</span>
          </div>
          <div className="digi-info-row">
            <span className="digi-info-label">FLASH</span>
            <span className="digi-info-value">{current.flashMode.toUpperCase()}</span>
          </div>
          <div className="digi-info-row">
            <span className="digi-info-label">SIZE</span>
            <span className="digi-info-value">14M 4320×3240</span>
          </div>
          {current.filter && current.filter !== 'off' && (
            <div className="digi-info-row">
              <span className="digi-info-label">FILTER</span>
              <span className="digi-info-value">{current.filter.toUpperCase()}</span>
            </div>
          )}
          {current.whiteBalance && (current.whiteBalance.temperature !== 0 || current.whiteBalance.tint !== 0) && (
            <>
              <div className="digi-info-row">
                <span className="digi-info-label">WB TEMP</span>
                <span className="digi-info-value">{current.whiteBalance.temperature > 0 ? '+' : ''}{current.whiteBalance.temperature.toFixed(1)}</span>
              </div>
              <div className="digi-info-row">
                <span className="digi-info-label">WB TINT</span>
                <span className="digi-info-value">{current.whiteBalance.tint > 0 ? '+' : ''}{current.whiteBalance.tint.toFixed(1)}</span>
              </div>
            </>
          )}
          {current.aspectMode && current.aspectMode !== '4:3' && (
            <div className="digi-info-row">
              <span className="digi-info-label">ASPECT</span>
              <span className="digi-info-value">{current.aspectMode}</span>
            </div>
          )}
          {current.latitude !== undefined && current.longitude !== undefined && (
            <div className="digi-info-row">
              <span className="digi-info-label">🧭 GPS</span>
              <span className="digi-info-value">{formatCoord(current.latitude, 'N', 'S')} {formatCoord(current.longitude, 'E', 'W')}</span>
            </div>
          )}
          <canvas id="gallery-histogram" width="200" height="60" style={{ width: '100%', height: '60px', borderRadius: '2px', marginTop: '6px', imageRendering: 'auto' }} />
        </div>
      )}

      {/* Edit panel */}
      {editMode && current.type === 'photo' && (
        <div className="digi-edit-panel">
          <div className="digi-edit-row">
            <span className="digi-edit-label">BRIGHT</span>
            <input
              type="range"
              className="digi-edit-slider"
              min="-100"
              max="100"
              value={editBrightness}
              onChange={(e) => { const v = parseInt(e.target.value); updateCaptureEdit(current.id, v, editContrast, editSaturation); }}
            />
            <span className="digi-edit-val">{editBrightness > 0 ? '+' : ''}{editBrightness}</span>
          </div>
          <div className="digi-edit-row">
            <span className="digi-edit-label">CONTR</span>
            <input
              type="range"
              className="digi-edit-slider"
              min="-100"
              max="100"
              value={editContrast}
              onChange={(e) => { const v = parseInt(e.target.value); updateCaptureEdit(current.id, editBrightness, v, editSaturation); }}
            />
            <span className="digi-edit-val">{editContrast > 0 ? '+' : ''}{editContrast}</span>
          </div>
          <div className="digi-edit-row">
            <span className="digi-edit-label">SATUR</span>
            <input
              type="range"
              className="digi-edit-slider"
              min="-100"
              max="100"
              value={editSaturation}
              onChange={(e) => { const v = parseInt(e.target.value); updateCaptureEdit(current.id, editBrightness, editContrast, v); }}
            />
            <span className="digi-edit-val">{editSaturation > 0 ? '+' : ''}{editSaturation}</span>
          </div>
          {/* Watermark section */}
          <div className="digi-watermark-section">
            <div className="digi-watermark-row">
              <span className="digi-edit-label">TEXT</span>
              <input
                type="text"
                className="digi-watermark-input"
                placeholder="watermark..."
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="digi-watermark-row">
              <span className="digi-edit-label">POS</span>
              <div className="digi-watermark-pos-btns">
                {(['tl', 'tr', 'bl', 'br'] as const).map((pos) => (
                  <button
                    key={pos}
                    className={`digi-watermark-pos-btn ${watermarkPos === pos ? 'pos-active' : ''}`}
                    onClick={() => setWatermarkPos(pos)}
                  >
                    {pos.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="digi-watermark-row">
              <span className="digi-edit-label">SIZE</span>
              <input
                type="range"
                className="digi-edit-slider"
                min="12"
                max="48"
                value={watermarkSize}
                onChange={(e) => setWatermarkSize(parseInt(e.target.value))}
              />
              <span className="digi-edit-val">{watermarkSize}px</span>
            </div>
            <div className="digi-watermark-row">
              <span className="digi-edit-label"> </span>
              <button className="digi-watermark-burn-btn" onClick={handleBurnIn} disabled={!watermarkText.trim()} style={{ opacity: watermarkText.trim() ? 1 : 0.4 }}>BURN IN</button>
            </div>
          </div>
          <div className="digi-edit-btns">
            <button className="digi-edit-btn digi-edit-apply" onClick={handleApplyEdit}>APPLY</button>
            <button className="digi-edit-btn digi-edit-reset" onClick={handleResetEdit}>RESET</button>
            <button className="digi-edit-btn digi-edit-crop-btn" onClick={() => { setCropMode(!cropMode); setCropRect({ x: 25, y: 25, w: 50, h: 50 }); }}>{cropMode ? 'EXIT CROP' : 'CROP'}</button>
          </div>
        </div>
      )}

      {/* Crop overlay */}
      {cropMode && current.type === 'photo' && (
        <div className="digi-crop-overlay" ref={cropContainerRef} style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
          {/* Darkened edges - top */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${cropRect.y}%`, background: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
          {/* Darkened edges - bottom */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${100 - cropRect.y - cropRect.h}%`, background: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
          {/* Darkened edges - left */}
          <div style={{ position: 'absolute', top: `${cropRect.y}%`, left: 0, width: `${cropRect.x}%`, height: `${cropRect.h}%`, background: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
          {/* Darkened edges - right */}
          <div style={{ position: 'absolute', top: `${cropRect.y}%`, right: 0, width: `${100 - cropRect.x - cropRect.w}%`, height: `${cropRect.h}%`, background: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
          {/* Crop rectangle */}
          <div
            className="digi-crop-rect"
            style={{ position: 'absolute', top: `${cropRect.y}%`, left: `${cropRect.x}%`, width: `${cropRect.w}%`, height: `${cropRect.h}%` }}
          >
            {/* Rule of thirds grid */}
            <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.15)' }} />
            <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.15)' }} />
            <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.15)' }} />
            <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.15)' }} />
            {/* Resize handle */}
            <div
              className="digi-crop-handle"
              onMouseDown={handleCropDragStart}
              onTouchStart={handleCropDragStart}
            />
            {/* Dimensions badge */}
            <div className="digi-crop-dims">{Math.round(cropRect.w * 43.2)}×{Math.round(cropRect.h * 32.4)}</div>
          </div>
          {/* Crop action buttons */}
          <div className="digi-crop-actions">
            <button className="digi-edit-btn digi-edit-apply" onClick={handleApplyCrop}>APPLY CROP</button>
            <button className="digi-edit-btn digi-edit-reset" onClick={() => setCropMode(false)}>CANCEL</button>
          </div>
        </div>
      )}

      {/* Thumbnail strip */}
      <div className="digi-gallery-strip">
        {captures.map((cap, idx) => {
          const isSelected = selectMode && selectedIds.includes(cap.id);
          return (
            <button
              key={cap.id}
              className={`digi-thumb ${idx === galleryIndex ? 'thumb-active' : ''}`}
              onClick={() => {
                if (selectMode) { toggleSelect(cap.id); }
                else { setGalleryIndex(idx); setIsVideoPlaying(false); }
              }}
            >
              {cap.type === 'video' ? (
                <div className="digi-thumb-video">
                  <video src={cap.dataUrl} muted />
                  <div className="digi-thumb-play-icon">▶</div>
                </div>
              ) : (
                <img src={cap.dataUrl} alt="" />
              )}
              {isSelected && <div className="digi-select-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg></div>}
            </button>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="digi-gallery-actions">
        {selectMode ? (
          <>
            <button className="digi-gallery-action-btn select-active" onClick={handleSelectAll}>SELECT ALL</button>
            <button className="digi-gallery-action-btn delete" onClick={handleDeleteSelected} disabled={selectCount === 0} style={{ opacity: selectCount === 0 ? 0.4 : 1 }}>DELETE ({selectCount})</button>
            <button className="digi-gallery-action-btn" onClick={handleExitSelect}>CANCEL</button>
          </>
        ) : (
          <>
            <button className="digi-gallery-action-btn slideshow" onClick={() => { setSlideshowActive(!slideshowActive); }}>
              <span>⏩</span><span>{slideshowActive ? 'STOP' : 'SLIDE'}</span>
            </button>
            {current.type === 'photo' && (
              <button className="digi-gallery-action-btn rotate" onClick={handleRotate}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                <span>ROTATE</span>
              </button>
            )}
            <button
              className="digi-gallery-action-btn compare"
              onClick={() => { toggleComparisonMode(); setEditMode(false); }}
              style={{ opacity: current.type === 'photo' ? 1 : 0.4, pointerEvents: current.type === 'photo' ? 'auto' : 'none' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="3" width="10" height="18" rx="1" />
                <rect x="13" y="3" width="10" height="18" rx="1" />
              </svg>
              <span>{comparisonMode ? 'EXIT CMP' : 'COMPARE'}</span>
            </button>
            <button
              className="digi-gallery-action-btn edit"
              onClick={() => { setEditMode(!editMode); if (comparisonMode) toggleComparisonMode(); }}
              style={{ opacity: current.type === 'photo' ? 1 : 0.4, pointerEvents: current.type === 'photo' ? 'auto' : 'none' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span>{editMode ? 'EXIT EDIT' : 'EDIT'}</span>
            </button>
            <button
              className="digi-gallery-action-btn delete"
              onClick={() => { deleteCapture(current.id); setShowInfo(false); }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>DEL</span>
            </button>
            <button
              className="digi-gallery-action-btn download"
              onClick={() => {
                const a = document.createElement('a');
                a.href = current.dataUrl;
                a.download = `DSC${String(galleryIndex + 1).padStart(4, '0')}.${current.type === 'video' ? 'webm' : 'jpg'}`;
                a.click();
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>SAVE</span>
            </button>
            {'share' in navigator && (
              <button
                className="digi-gallery-action-btn share"
                onClick={async () => {
                  try {
                    if (current.type === 'photo') {
                      const res = await fetch(current.dataUrl);
                      const blob = await res.blob();
                      const file = new File([blob], `DSC${String(galleryIndex + 1).padStart(4, '0')}.jpg`, { type: 'image/jpeg' });
                      await navigator.share({ files: [file], title: 'DigiCam Photo' });
                    } else {
                      await navigator.share({ title: 'DigiCam Video' });
                    }
                  } catch { /* Share cancelled */ }
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                <span>SHARE</span>
              </button>
            )}
            <button className="digi-gallery-action-btn select-btn" onClick={handleEnterSelect}>
              <span>SELECT</span>
            </button>
            {captures.filter((c) => c.type === 'photo').length >= 2 && (
              <button className="digi-gallery-action-btn" onClick={() => { setCollageMode(true); clearCollageSelection(); setEditMode(false); setCropMode(false); setShowInfo(false); }}>
                <span>COLLAGE</span>
              </button>
            )}
            {panoramaFrames.length >= 2 && (
              <button className="digi-stitch-btn" onClick={handleStitch}>
                <span>🔗</span><span>STITCH ({panoramaFrames.length})</span>
              </button>
            )}
            <button
              className="digi-gallery-action-btn"
              onClick={() => { setPrintMode(true); setShowInfo(false); }}
              style={{ opacity: current?.type === 'photo' ? 1 : 0.4 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="4" width="12" height="16" rx="1" />
                <rect x="20" y="4" width="4" height="16" />
                <line x1="18" y1="20" x2="18" y2="4" />
              </svg>
              <span>PRINT</span>
            </button>
            <button
              className="digi-gallery-action-btn"
              onClick={() => { setCompareTargetIndex(galleryIndex >= 1 ? galleryIndex - 1 : 0); setShowComparePanel(true); }}
              style={{ opacity: captures.length >= 2 ? 1 : 0.4, position: 'relative' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v18a2 2 0 0 1 2 2H4a2 2 0 0 1-2 2V3h14" />
                <line x1="1" y1="6" x2="23" y2="6" />
              </svg>
              <span>COMPARE</span>
            </button>
          </>
        )}
      </div>

      {/* Collage mode overlay */}
      {collageMode && (
        <div className="digi-collage-overlay">
          <div style={{ fontSize: 10, color: '#aaa', fontFamily: 'monospace', marginBottom: 6 }}>COLLAGE MODE</div>
          <div className={`digi-collage-grid ${collageType === '3x3' ? 'grid-3x3' : 'grid-2x2'}`}>
            {captures.filter((c) => c.type === 'photo').map((cap) => {
              const isSelected = selectedForCollage.includes(cap.id);
              return (
                <img
                  key={cap.id}
                  src={cap.dataUrl}
                  alt=""
                  className={`digi-collage-thumb ${isSelected ? 'collage-selected' : ''}`}
                  onClick={() => {
                    const maxForType = collageType === '2x2' ? 4 : 9;
                    if (isSelected || selectedForCollage.length < maxForType) {
                      toggleCollageSelect(cap.id);
                    }
                  }}
                />
              );
            })}
          </div>
          <div className="digi-collage-controls">
            <button
              className={`digi-collage-btn digi-collage-type-btn ${collageType === '2x2' ? 'type-active' : ''}`}
              onClick={() => { setCollageType('2x2'); clearCollageSelection(); }}
            >2×2</button>
            <button
              className={`digi-collage-btn digi-collage-type-btn ${collageType === '3x3' ? 'type-active' : ''}`}
              onClick={() => { setCollageType('3x3'); clearCollageSelection(); }}
            >3×3</button>
            <span className="digi-collage-counter">{selectedForCollage.length}/{collageType === '2x2' ? 4 : 9}</span>
            <button
              className="digi-collage-btn digi-collage-create-btn"
              disabled={selectedForCollage.length !== (collageType === '2x2' ? 4 : 9)}
              onClick={handleCreateCollage}
            >CREATE</button>
            <button
              className="digi-collage-btn digi-collage-exit-btn"
              onClick={() => { setCollageMode(false); clearCollageSelection(); }}
            >EXIT</button>
          </div>
        </div>
      )}

      {/* Double-tap to like */}
      <div className="digi-like-heart" style={{ opacity: likedIds.has(current.id) ? 1 : 0, pointerEvents: 'none' }}>
        ♥
      </div>
    </div>
  );
}
