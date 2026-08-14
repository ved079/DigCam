/**
 * Sony CCD Color Science Processor
 * Simulates the W530's 2011-era CCD sensor characteristics:
 * - Neutral-to-cool white balance bias
 * - Punchy, saturated blues (Sony signature)
 * - Aggressive in-camera sharpening (unsharp mask)
 * - Slight CCD noise/grain pattern
 * - Mild lens vignetting
 * - Chromatic aberration at edges
 * - Color filter effects (B&W, Sepia, Vivid, Warm, Cool, Pop)
 */

import type { ColorFilter, WhiteBalance, AspectMode } from './camera-store';

export function applyCCDProcessing(
  imageData: ImageData,
  sceneMode: string,
  flashUsed: boolean,
  filter: ColorFilter = 'off',
  exposure: number = 0,
  whiteBalance: WhiteBalance = { temperature: 0, tint: 0 },
  aspectMode: AspectMode = '4:3'
): ImageData {
  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data);

  // Step 0: Exposure compensation
  if (exposure !== 0) {
    applyExposure(output, width, height, exposure);
  }

  // Step 1: Sony cool white balance shift
  applyWhiteBalance(output, width, height);

  // Step 1.5: Manual white balance adjustment (temperature + tint)
  if (whiteBalance.temperature !== 0 || whiteBalance.tint !== 0) {
    applyWhiteBalanceAdjust(output, width, height, whiteBalance.temperature, whiteBalance.tint);
  }

  // Step 2: Punchy blue enhancement (Sony signature)
  applyBlueEnhancement(output, width, height);

  // Step 3: Scene-specific adjustments
  applySceneAdjustment(output, width, height, sceneMode);

  // Step 4: Color filter
  if (filter !== 'off') {
    applyColorFilter(output, width, height, filter);
  }

  // Step 5: In-camera sharpening (unsharp mask)
  applyUnsharpMask(output, width, height, 0.8);

  // Step 6: CCD noise pattern
  applyCCDNoise(output, width, height, flashUsed ? 0.3 : 1.0);

  // Step 7: Vignette
  applyVignette(output, width, height, 0.25);

  // Step 8: Sony S-curve
  applySonyCurve(output, width, height);

  // Step 9: Chromatic aberration
  applyChromaticAberration(output, width, height);

  // Step 10: Aspect ratio crop
  let finalWidth = width;
  let finalHeight = height;
  let finalData = output;

  if (aspectMode === '1:1') {
    // Crop to center square
    const size = Math.min(width, height);
    const offsetX = Math.floor((width - size) / 2);
    const offsetY = Math.floor((height - size) / 2);
    finalData = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const srcIdx = ((y + offsetY) * width + (x + offsetX)) * 4;
        const dstIdx = (y * size + x) * 4;
        finalData[dstIdx] = output[srcIdx];
        finalData[dstIdx + 1] = output[srcIdx + 1];
        finalData[dstIdx + 2] = output[srcIdx + 2];
        finalData[dstIdx + 3] = output[srcIdx + 3];
      }
    }
    finalWidth = size;
    finalHeight = size;
  }
  // For '16:9', the canvas/display layer handles the wider aspect ratio rendering

  return new ImageData(finalData, finalWidth, finalHeight);
}

function applyExposure(data: Uint8ClampedArray, w: number, h: number, ev: number) {
  const factor = Math.pow(2, ev);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(data[i] * factor);
    data[i + 1] = clamp(data[i + 1] * factor);
    data[i + 2] = clamp(data[i + 2] * factor);
  }
}

function applyWhiteBalance(data: Uint8ClampedArray, w: number, h: number) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    data[i] = clamp(r * 0.97 + 2);
    data[i + 1] = clamp(g * 0.99 + 1);
    data[i + 2] = clamp(b * 1.03 + 1);
  }
}

/**
 * Apply manual white balance adjustment.
 * temperature: shifts red/blue channels. Negative = cooler (blue), positive = warmer (red).
 *   Each 1.0 = 8% multiplicative shift.
 * tint: shifts green/magenta channels. Negative = green, positive = magenta.
 *   Each 1.0 = 6% multiplicative shift.
 */
function applyWhiteBalanceAdjust(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  temperature: number,
  tint: number
) {
  const tempFactor = temperature * 0.08; // 8% per unit
  const tintFactor = tint * 0.06;         // 6% per unit

  for (let i = 0; i < data.length; i += 4) {
    // Temperature: positive warms (boost red, reduce blue), negative cools (boost blue, reduce red)
    const rMult = 1 + tempFactor;
    const bMult = 1 - tempFactor;
    // Tint: positive pushes magenta (boost red+blue, reduce green), negative pushes green
    const gMult = 1 - tintFactor;
    const rmMult = 1 + tintFactor * 0.5;
    const bmMult = 1 + tintFactor * 0.5;

    data[i]     = clamp(data[i]     * rMult * rmMult); // Red
    data[i + 1] = clamp(data[i + 1] * gMult);          // Green
    data[i + 2] = clamp(data[i + 2] * bMult * bmMult); // Blue
  }
}

function applyBlueEnhancement(data: Uint8ClampedArray, w: number, h: number) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const blueDominance = (b - r) / 255;
    const blueAmount = (b - g) / 255;
    const isBlue = Math.max(0, blueDominance, blueAmount);

    if (isBlue > 0.05) {
      const boost = 1 + isBlue * 0.15;
      data[i + 2] = clamp(b * boost);
      data[i] = clamp(r * (1 - isBlue * 0.08));
    }
  }
}

function applyColorFilter(data: Uint8ClampedArray, w: number, h: number, filter: ColorFilter) {
  switch (filter) {
    case 'bw':
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        // Slight warm tone like classic B&W film
        const warmth = lum * 1.02;
        data[i] = clamp(warmth);
        data[i + 1] = clamp(lum * 0.98);
        data[i + 2] = clamp(lum * 0.95);
      }
      break;
    case 'sepia':
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        data[i] = clamp(lum * 1.15 + 15);
        data[i + 1] = clamp(lum * 1.02 + 5);
        data[i + 2] = clamp(lum * 0.75);
      }
      break;
    case 'vivid':
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = clamp(avg + (data[i] - avg) * 1.5);
        data[i + 1] = clamp(avg + (data[i + 1] - avg) * 1.5);
        data[i + 2] = clamp(avg + (data[i + 2] - avg) * 1.5);
      }
      break;
    case 'warm':
      for (let i = 0; i < data.length; i += 4) {
        data[i] = clamp(data[i] * 1.12 + 5);
        data[i + 1] = clamp(data[i + 1] * 1.04);
        data[i + 2] = clamp(data[i + 2] * 0.88);
      }
      break;
    case 'cool':
      for (let i = 0; i < data.length; i += 4) {
        data[i] = clamp(data[i] * 0.88);
        data[i + 1] = clamp(data[i + 1] * 0.96);
        data[i + 2] = clamp(data[i + 2] * 1.15 + 5);
      }
      break;
    case 'pop':
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = clamp(avg + (data[i] - avg) * 1.8);
        data[i + 1] = clamp(avg + (data[i + 1] - avg) * 1.3);
        data[i + 2] = clamp(avg + (data[i + 2] - avg) * 1.8);
      }
      break;
  }
}

function applySceneAdjustment(data: Uint8ClampedArray, w: number, h: number, scene: string) {
  switch (scene) {
    case 'PORTRAIT':
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (lum > 80 && lum < 200) {
          data[i] = clamp(data[i] * 1.04 + 2);
          data[i + 2] = clamp(data[i + 2] * 0.96);
        }
      }
      break;
    case 'LANDSCAPE':
      for (let i = 0; i < data.length; i += 4) {
        const g = data[i + 1];
        const b = data[i + 2];
        if (g > b && g > data[i]) {
          data[i + 1] = clamp(g * 1.08);
        }
        if (b > 100 && b > data[i] * 1.2) {
          data[i + 2] = clamp(b * 1.12);
        }
      }
      break;
    case 'NIGHT':
      for (let i = 0; i < data.length; i += 4) {
        data[i] = clamp(data[i] * 1.06 + 3);
        data[i + 1] = clamp(data[i + 1] * 1.02 + 1);
      }
      break;
    case 'BEACH':
    case 'SNOW':
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (lum > 220) {
          data[i] = clamp(data[i] * 0.95);
          data[i + 1] = clamp(data[i + 1] * 0.95);
          data[i + 2] = clamp(data[i + 2] * 0.95);
        }
        data[i + 2] = clamp(data[i + 2] * 1.04);
      }
      break;
  }
}

function applyUnsharpMask(data: Uint8ClampedArray, w: number, h: number, amount: number) {
  const src = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = src[idx + c];
        const neighbors =
          src[((y - 1) * w + x) * 4 + c] +
          src[((y + 1) * w + x) * 4 + c] +
          src[(y * w + x - 1) * 4 + c] +
          src[(y * w + x + 1) * 4 + c];
        const laplacian = center - neighbors * 0.25;
        data[idx + c] = clamp(center + laplacian * amount);
      }
    }
  }
}

function applyCCDNoise(data: Uint8ClampedArray, w: number, h: number, intensity: number) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx]; const g = data[idx + 1]; const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const shadowFactor = Math.max(0, 1 - lum / 120);
      const noise = (shadowFactor * intensity * 4) + intensity * 0.5;
      const hash = (x * 374761393 + y * 668265263) & 0xffffff;
      const rand = ((hash % 1000) / 1000 - 0.5) * 2;
      data[idx] = clamp(r + rand * noise);
      data[idx + 1] = clamp(g + rand * noise * 0.9);
      data[idx + 2] = clamp(b + rand * noise * 1.1);
      if (lum < 40) {
        const chromaNoise = shadowFactor * 3;
        const hash2 = (x * 1103515245 + y * 12345 + 12345) & 0xffffff;
        const rand2 = ((hash2 % 1000) / 1000 - 0.5) * 2;
        data[idx] = clamp(data[idx] + rand2 * chromaNoise);
        data[idx + 2] = clamp(data[idx + 2] - rand2 * chromaNoise);
      }
    }
  }
}

function applyVignette(data: Uint8ClampedArray, w: number, h: number, strength: number) {
  const cx = w / 2; const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const dx = (x - cx) / cx; const dy = (y - cy) / cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const vignette = 1 - strength * Math.pow(dist / 1.414, 2);
      const v = Math.max(0.6, vignette);
      data[idx] = clamp(data[idx] * v);
      data[idx + 1] = clamp(data[idx + 1] * v);
      data[idx + 2] = clamp(data[idx + 2] * v);
    }
  }
}

function applySonyCurve(data: Uint8ClampedArray, w: number, h: number) {
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let val = data[i + c] / 255;
      val = val < 0.5
        ? 0.5 * Math.pow(2 * val, 0.92)
        : 1 - 0.5 * Math.pow(2 * (1 - val), 1.1);
      data[i + c] = clamp(val * 255);
    }
  }
}

function applyChromaticAberration(data: Uint8ClampedArray, w: number, h: number) {
  const src = new Uint8ClampedArray(data);
  const cx = w / 2; const cy = h / 2;
  const shift = Math.max(1, Math.floor(w * 0.003));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const aberration = dist * dist * shift;

      if (aberration > 0.5) {
        const ax = Math.round(aberration * dx);
        const ay = Math.round(aberration * dy);
        const srcIdx = (Math.min(h - 1, Math.max(0, y + ay)) * w + Math.min(w - 1, Math.max(0, x + ax))) * 4;
        data[idx] = src[srcIdx]; // Red channel shifted outward
      }
    }
  }
}

function clamp(val: number): number {
  return Math.max(0, Math.min(255, Math.round(val)));
}

export function applyVideoCCDPass(
  canvas: HTMLCanvasElement,
  filter: ColorFilter = 'off',
  exposure: number = 0,
  whiteBalance: WhiteBalance = { temperature: 0, tint: 0 },
  _aspectMode: AspectMode = '4:3'
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width; const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Exposure
  if (exposure !== 0) {
    const f = Math.pow(2, exposure);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = clamp(data[i] * f);
      data[i + 1] = clamp(data[i + 1] * f);
      data[i + 2] = clamp(data[i + 2] * f);
    }
  }

  // Cool white balance
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(data[i] * 0.98 + 1);
    data[i + 1] = clamp(data[i + 1] * 0.99);
    data[i + 2] = clamp(data[i + 2] * 1.02 + 1);
  }

  // Lighter manual white balance adjustment for video (50% strength)
  if (whiteBalance.temperature !== 0 || whiteBalance.tint !== 0) {
    const tempFactor = whiteBalance.temperature * 0.04; // 4% per unit (lighter for video)
    const tintFactor = whiteBalance.tint * 0.03;          // 3% per unit (lighter for video)

    for (let i = 0; i < data.length; i += 4) {
      const rMult = 1 + tempFactor;
      const bMult = 1 - tempFactor;
      const gMult = 1 - tintFactor;
      const rmMult = 1 + tintFactor * 0.5;
      const bmMult = 1 + tintFactor * 0.5;

      data[i]     = clamp(data[i]     * rMult * rmMult);
      data[i + 1] = clamp(data[i + 1] * gMult);
      data[i + 2] = clamp(data[i + 2] * bMult * bmMult);
    }
  }

  // Color filter (lightweight for video)
  if (filter === 'bw') {
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = clamp(lum); data[i + 1] = clamp(lum); data[i + 2] = clamp(lum);
    }
  } else if (filter === 'sepia') {
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = clamp(lum * 1.15 + 15); data[i + 1] = clamp(lum * 1.02 + 5); data[i + 2] = clamp(lum * 0.75);
    }
  } else if (filter === 'vivid' || filter === 'pop') {
    const strength = filter === 'pop' ? 1.6 : 1.4;
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      data[i] = clamp(avg + (data[i] - avg) * strength);
      data[i + 1] = clamp(avg + (data[i + 1] - avg) * strength);
      data[i + 2] = clamp(avg + (data[i + 2] - avg) * strength);
    }
  } else if (filter === 'warm') {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = clamp(data[i] * 1.1); data[i + 2] = clamp(data[i + 2] * 0.9);
    }
  } else if (filter === 'cool') {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = clamp(data[i] * 0.9); data[i + 2] = clamp(data[i + 2] * 1.1);
    }
  }

  // Mild contrast
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = data[i + c] / 255;
      v = 0.5 * Math.pow(2 * Math.min(v, 0.5), 0.95);
      if (v > 0.5) v = 1 - 0.5 * Math.pow(2 * (1 - v), 1.05);
      data[i + c] = clamp(v * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export function renderDateStamp(ctx: CanvasRenderingContext2D, w: number, h: number, timestamp: number) {
  const date = new Date(timestamp);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const text = `${yyyy}/${mm}/${dd}  ${hh}:${min}`;

  ctx.save();
  ctx.font = `bold ${Math.max(14, Math.floor(w * 0.03))}px monospace`;
  ctx.fillStyle = '#FFD700';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 2; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(text, w - 12, h - 10);
  ctx.restore();
}

/** Demo mode - render animated sunset scene to canvas when no camera */
export function renderDemoFrame(canvas: HTMLCanvasElement, time: number, filter: ColorFilter = 'off') {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width; const h = canvas.height;
  const t = time * 0.001;

  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  skyGrad.addColorStop(0, '#1a1a3e');
  skyGrad.addColorStop(0.5, '#2d1b4e');
  skyGrad.addColorStop(1, '#e8734a');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h * 0.6);

  // Sun
  const sunX = w * 0.7 + Math.sin(t * 0.3) * 20;
  const sunY = h * 0.35 + Math.cos(t * 0.2) * 10;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 60);
  sunGrad.addColorStop(0, '#ffffcc');
  sunGrad.addColorStop(0.3, '#ffcc44');
  sunGrad.addColorStop(0.7, 'rgba(255,100,50,0.3)');
  sunGrad.addColorStop(1, 'rgba(255,50,0,0)');
  ctx.fillStyle = sunGrad;
  ctx.beginPath(); ctx.arc(sunX, sunY, 60, 0, Math.PI * 2); ctx.fill();

  // Clouds
  ctx.fillStyle = 'rgba(255,200,150,0.15)';
  for (let i = 0; i < 5; i++) {
    const cx = ((t * 15 + i * 130) % (w + 100)) - 50;
    const cy = 40 + i * 25 + Math.sin(t + i) * 5;
    ctx.beginPath(); ctx.ellipse(cx, cy, 60 + i * 10, 15, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Mountains
  ctx.fillStyle = '#1a0a2e';
  ctx.beginPath(); ctx.moveTo(0, h * 0.55);
  for (let x = 0; x <= w; x += 4) {
    const y = h * 0.55 - Math.sin(x * 0.008 + 1) * 40 - Math.sin(x * 0.02) * 15;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h * 0.6); ctx.lineTo(0, h * 0.6); ctx.closePath(); ctx.fill();

  // Water
  const waterGrad = ctx.createLinearGradient(0, h * 0.6, 0, h);
  waterGrad.addColorStop(0, '#1a2a4a');
  waterGrad.addColorStop(0.5, '#0a1a3a');
  waterGrad.addColorStop(1, '#050a1a');
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);

  // Water reflections
  for (let i = 0; i < 12; i++) {
    const rx = (i * w / 12 + Math.sin(t * 2 + i) * 8) % w;
    const ry = h * 0.65 + i * 8 + Math.sin(t * 1.5 + i * 0.7) * 3;
    const rw = 30 + Math.sin(t + i) * 10;
    ctx.fillStyle = `rgba(255,${150 + i * 8},${50 + i * 10},${0.08 + Math.sin(t + i) * 0.04})`;
    ctx.fillRect(rx, ry, rw, 1.5);
  }

  // Foreground silhouette (palm tree)
  ctx.fillStyle = '#050208';
  ctx.fillRect(w * 0.12, h * 0.3, 4, h * 0.4);
  for (let a = 0; a < 6; a++) {
    const angle = (a / 6) * Math.PI * 1.5 - Math.PI * 0.75 + Math.sin(t * 0.8 + a) * 0.08;
    const len = 55 + a * 5;
    ctx.beginPath();
    ctx.moveTo(w * 0.12 + 2, h * 0.3);
    const ex = w * 0.12 + 2 + Math.cos(angle) * len;
    const ey = h * 0.3 + Math.sin(angle) * len * 0.5 - 10;
    const cpx = w * 0.12 + 2 + Math.cos(angle) * len * 0.6;
    const cpy = h * 0.3 + Math.sin(angle) * len * 0.25 - 30;
    ctx.quadraticCurveTo(cpx, cpy, ex, ey);
    ctx.quadraticCurveTo(cpx + 5, cpy + 5, w * 0.12 + 2, h * 0.3);
    ctx.fill();
  }

  // Stars
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 30; i++) {
    const sx = (i * 137.5 + 50) % w;
    const sy = (i * 97.3 + 20) % (h * 0.4);
    const brightness = 0.3 + Math.sin(t * 2 + i * 1.7) * 0.3;
    ctx.globalAlpha = brightness;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;

  // Apply CCD processing for real-time filter preview
  if (filter !== 'off') {
    applyVideoCCDPass(canvas, filter);
 }
}

/**
 * Demo mode - render animated neon cityscape scene to canvas.
 * A dark night city with neon signs, wet road reflections, car headlights, and stars.
 */
export function renderNeonFrame(canvas: HTMLCanvasElement, time: number, filter: ColorFilter = 'off') {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const t = time * 0.001;

  // ---- Night sky gradient ----
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  skyGrad.addColorStop(0, '#0a0a1a');
  skyGrad.addColorStop(1, '#0f0f2a');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h * 0.55);

  // ---- Stars (cooler, more sparse) ----
  ctx.fillStyle = '#ccddff';
  for (let i = 0; i < 18; i++) {
    const sx = (i * 173.7 + 30) % w;
    const sy = (i * 89.3 + 10) % (h * 0.35);
    const brightness = 0.2 + Math.sin(t * 1.5 + i * 2.1) * 0.25;
    ctx.globalAlpha = brightness;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;

  // ---- City skyline silhouette ----
  const buildingColors = ['#080812', '#0a0a16', '#060610'];
  const skylineY = h * 0.4; // top of buildings area

  // Draw background buildings
  ctx.fillStyle = '#0c0c1e';
  const buildings = [
    { x: 0, w: 50, h: 80 },
    { x: 55, w: 35, h: 120 },
    { x: 95, w: 60, h: 95 },
    { x: 160, w: 40, h: 140 },
    { x: 205, w: 55, h: 75 },
    { x: 265, w: 45, h: 110 },
    { x: 315, w: 65, h: 130 },
    { x: 385, w: 50, h: 85 },
    { x: 440, w: 40, h: 105 },
    { x: 485, w: 55, h: 90 },
    { x: 545, w: 45, h: 135 },
    { x: 595, w: 60, h: 70 },
  ];

  const roadY = h * 0.75;

  for (const b of buildings) {
    // Scale building widths proportionally to canvas
    const bx = (b.x / 640) * w;
    const bw = (b.w / 640) * w;
    const bh = (b.h / 480) * h;
    const by = roadY - bh;
    ctx.fillStyle = buildingColors[Math.floor(b.x / 50) % 3];
    ctx.fillRect(bx, by, bw, bh + (roadY - by));

    // Lit windows
    const windowSize = Math.max(2, bw * 0.08);
    const windowGap = Math.max(4, bw * 0.14);
    for (let wy = by + 8; wy < roadY - 10; wy += windowGap + windowSize) {
      for (let wx = bx + 4; wx < bx + bw - 4; wx += windowGap + windowSize) {
        // Deterministic pseudo-random lit/unlit
        const hash = ((wx * 31 + wy * 17) & 0xff);
        if (hash > 120) {
          // Flicker some windows subtly
          const flicker = hash > 200 ? 0.6 + Math.sin(t * 3 + hash) * 0.3 : 0.7;
          ctx.fillStyle = `rgba(255,220,150,${flicker})`;
          ctx.fillRect(wx, wy, windowSize, windowSize);
        }
      }
    }
  }

  // ---- Neon signs on buildings ----
  const neonSigns = [
    { bx: 58, by: roadY - 118, nw: 28, nh: 14, color: '#ff1493', glow: 'rgba(255,20,147,0.4)' },   // pink
    { bx: 318, by: roadY - 125, nw: 35, nh: 16, color: '#00ffff', glow: 'rgba(0,255,255,0.4)' },   // cyan
    { bx: 490, by: roadY - 95,  nw: 30, nh: 14, color: '#4169e1', glow: 'rgba(65,105,225,0.4)' },   // blue
    { bx: 162, by: roadY - 135, nw: 25, nh: 12, color: '#ffd700', glow: 'rgba(255,215,0,0.35)' },    // yellow
  ];

  for (const ns of neonSigns) {
    const nx = (ns.bx / 640) * w;
    const ny = (ns.by / 480) * h;
    const nw = (ns.nw / 640) * w;
    const nh = (ns.nh / 480) * h;

    // Glow pulse
    const glowPulse = 0.7 + Math.sin(t * 4 + ns.bx) * 0.3;

    ctx.save();
    ctx.shadowColor = ns.glow;
    ctx.shadowBlur = 15 * glowPulse;
    ctx.fillStyle = ns.color;
    ctx.globalAlpha = glowPulse;
    ctx.fillRect(nx, ny, nw, nh);
    ctx.restore();

    // Second glow layer for more realism
    ctx.save();
    ctx.shadowColor = ns.glow;
    ctx.shadowBlur = 30 * glowPulse;
    ctx.fillStyle = ns.color;
    ctx.globalAlpha = glowPulse * 0.3;
    ctx.fillRect(nx, ny, nw, nh);
    ctx.restore();
  }

  // ---- Road ----
  const roadGrad = ctx.createLinearGradient(0, roadY, 0, h);
  roadGrad.addColorStop(0, '#1a1a22');
  roadGrad.addColorStop(1, '#0a0a10');
  ctx.fillStyle = roadGrad;
  ctx.fillRect(0, roadY, w, h - roadY);

  // Wet road sheen
  ctx.fillStyle = 'rgba(100,100,140,0.04)';
  ctx.fillRect(0, roadY, w, h - roadY);

  // ---- Lane markings ----
  const laneY = roadY + (h - roadY) * 0.45;
  ctx.setLineDash([20, 15]);
  ctx.strokeStyle = 'rgba(255,255,200,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, laneY);
  ctx.lineTo(w, laneY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Center line
  const centerY = roadY + (h - roadY) * 0.25;
  ctx.setLineDash([25, 20]);
  ctx.strokeStyle = 'rgba(255,255,100,0.2)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(w, centerY);
  ctx.stroke();
  ctx.setLineDash([]);

  // ---- Neon reflections on wet road ----
  for (const ns of neonSigns) {
    const nx = (ns.bx / 640) * w;
    const reflY = roadY + 5;
    const reflH = (h - roadY) * 0.5;
    const reflW = (ns.nw / 640) * w * 3;
    const glowPulse = 0.5 + Math.sin(t * 3 + ns.bx) * 0.2;

    const reflGrad = ctx.createLinearGradient(0, reflY, 0, reflY + reflH);
    // Parse color to create fading reflection
    reflGrad.addColorStop(0, ns.color);
    reflGrad.addColorStop(1, 'transparent');

    ctx.save();
    ctx.globalAlpha = 0.08 * glowPulse;
    ctx.fillStyle = reflGrad;
    ctx.fillRect(nx - reflW * 0.3, reflY, reflW, reflH);
    ctx.restore();
  }

  // ---- Car headlight sweep ----
  // A bright rectangle that occasionally sweeps across
  const carCycle = 12; // seconds per sweep cycle
  const carPhase = (t % carCycle) / carCycle;
  if (carPhase < 0.4) {
    const carX = -30 + (carPhase / 0.4) * (w + 60);
    const carY = roadY + (h - roadY) * 0.7;
    const carW = 20;
    const carH = 8;

    // Headlight glow
    const hlGrad = ctx.createRadialGradient(carX + carW, carY, 2, carX + carW + 40, carY, 60);
    hlGrad.addColorStop(0, 'rgba(255,250,220,0.4)');
    hlGrad.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = hlGrad;
    ctx.fillRect(carX - 40, carY - 60, carW + 140, 120);

    // Car body
    ctx.fillStyle = '#111118';
    ctx.fillRect(carX, carY - 3, carW, carH);

    // Headlights
    ctx.fillStyle = 'rgba(255,255,230,0.9)';
    ctx.fillRect(carX + carW - 2, carY, 2, 3);
  }

  // Second car going opposite direction (offset timing)
  const car2Phase = ((t + 6) % carCycle) / carCycle;
  if (car2Phase < 0.35) {
    const carX = w + 30 - (car2Phase / 0.35) * (w + 60);
    const carY = roadY + (h - roadY) * 0.15;
    const carW = 18;
    const carH = 7;

    // Headlight glow
    const hlGrad = ctx.createRadialGradient(carX, carY, 2, carX - 40, carY, 50);
    hlGrad.addColorStop(0, 'rgba(255,250,220,0.3)');
    hlGrad.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = hlGrad;
    ctx.fillRect(carX - 120, carY - 50, carW + 140, 100);

    // Car body
    ctx.fillStyle = '#0e0e16';
    ctx.fillRect(carX, carY - 3, carW, carH);

    // Headlights
    ctx.fillStyle = 'rgba(255,255,230,0.85)';
    ctx.fillRect(carX, carY, 2, 3);
  }

  // ---- Apply CCD processing filter if active ----
  if (filter !== 'off') {
    applyVideoCCDPass(canvas, filter);
  }
}

export function renderCityFrame(canvas: HTMLCanvasElement, time: number, filter: ColorFilter = 'off') {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;

  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  skyGrad.addColorStop(0, '#0a0a2e');
  skyGrad.addColorStop(0.5, '#1a1a4e');
  skyGrad.addColorStop(1, '#2a1a3e');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h * 0.6);

  // Stars
  const starSeed = 42;
  for (let i = 0; i < 80; i++) {
    const sx = ((starSeed * (i + 1) * 7919) % w);
    const sy = ((starSeed * (i + 1) * 104729) % (h * 0.5));
    const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(time * 0.001 + i * 1.7));
    ctx.fillStyle = `rgba(255,255,255,${0.2 + twinkle * 0.5})`;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }

  // Moon
  ctx.beginPath();
  ctx.arc(w * 0.8, h * 0.15, 18, 0, Math.PI * 2);
  ctx.fillStyle = '#eee8d0';
  ctx.fill();
  ctx.shadowColor = 'rgba(230,220,200,0.3)';
  ctx.shadowBlur = 30;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Buildings
  const buildingCount = 18;
  const buildingWidth = w / buildingCount;
  const horizon = h * 0.55;
  for (let i = 0; i < buildingCount; i++) {
    const bh = 40 + ((i * 37 + 13) % 120);
    const bx = i * buildingWidth;
    const by = horizon - bh;
    ctx.fillStyle = `rgb(${15 + (i % 3) * 5}, ${12 + (i % 4) * 3}, ${20 + (i % 5) * 4})`;
    ctx.fillRect(bx, by, buildingWidth - 2, bh + h * 0.05);

    // Windows
    for (let wy = by + 8; wy < horizon - 5; wy += 12) {
      for (let wx = bx + 4; wx < bx + buildingWidth - 6; wx += 8) {
        const lit = ((i * 31 + Math.floor(wy) * 17 + Math.floor(wx) * 13) % 5) > 1;
        if (lit) {
          const warmth = Math.sin(time * 0.0005 + wx * 0.1) > -0.8 ? 1 : 0.3;
          ctx.fillStyle = `rgba(255, ${200 + warmth * 40}, ${100 + warmth * 50}, ${0.5 + warmth * 0.4})`;
          ctx.fillRect(wx, wy, 4, 5);
        }
      }
    }
  }

  // Water
  const waterGrad = ctx.createLinearGradient(0, h * 0.6, 0, h);
  waterGrad.addColorStop(0, '#0a0a1e');
  waterGrad.addColorStop(1, '#050510');
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);

  // Water reflections
  for (let i = 0; i < buildingCount; i++) {
    const bh = 40 + ((i * 37 + 13) % 120);
    const bx = i * buildingWidth;
    const refH = bh * 0.3;
    ctx.fillStyle = `rgba(20, 18, 30, 0.6)`;
    ctx.fillRect(bx, h * 0.6, buildingWidth - 2, refH);
    // Scattered light reflections
    for (let rx = bx + 2; rx < bx + buildingWidth - 4; rx += 6) {
      const ry = h * 0.62 + Math.sin(time * 0.002 + rx * 0.05) * 3;
      ctx.fillStyle = `rgba(255, 220, 150, ${0.05 + Math.sin(time * 0.003 + rx) * 0.03})`;
      ctx.fillRect(rx, ry, 3, 1);
    }
  }

  // Water ripple lines
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 0.5;
  for (let ry = h * 0.65; ry < h; ry += 8) {
    ctx.beginPath();
    for (let rx = 0; rx < w; rx += 4) {
      const y = ry + Math.sin(time * 0.002 + rx * 0.02 + ry * 0.1) * 1.5;
      if (rx === 0) ctx.moveTo(rx, y); else ctx.lineTo(rx, y);
    }
    ctx.stroke();
  }

  // Apply filter
  if (filter !== 'off') {
    const imgData = ctx.getImageData(0, 0, w, h);
    applyColorFilter(imgData.data, w, h, filter);
    ctx.putImageData(imgData, 0, 0);
  }
}

export function renderIndoorFrame(canvas: HTMLCanvasElement, time: number, filter: ColorFilter = 'off') {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;

  // Warm indoor wall
  const wallGrad = ctx.createLinearGradient(0, 0, 0, h * 0.65);
  wallGrad.addColorStop(0, '#d4c8b8');
  wallGrad.addColorStop(0.7, '#c8b8a4');
  wallGrad.addColorStop(1, '#b8a890');
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, 0, w, h * 0.65);

  // Wallpaper pattern (subtle vertical stripes)
  ctx.strokeStyle = 'rgba(0,0,0,0.02)';
  ctx.lineWidth = 8;
  for (let x = 0; x < w; x += 24) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h * 0.65); ctx.stroke();
  }

  // Baseboard
  ctx.fillStyle = '#6a5a48';
  ctx.fillRect(0, h * 0.6, w, h * 0.05);
  ctx.fillStyle = '#7a6a58';
  ctx.fillRect(0, h * 0.6, w, 2);

  // Wooden floor
  const floorGrad = ctx.createLinearGradient(0, h * 0.65, 0, h);
  floorGrad.addColorStop(0, '#8a7058');
  floorGrad.addColorStop(1, '#6a5a48');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, h * 0.65, w, h * 0.35);
  // Floor plank lines
   ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  for (let y = h * 0.68; y < h; y += 16) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
   for (let x = 0; x < w; x += 80) {
    const offset = ((x / 80) % 2) * 40;
    ctx.beginPath(); ctx.moveTo(x + offset, h * 0.65); ctx.lineTo(x + offset, h); ctx.stroke();
  }

  // Window (left side)
  const wx = w * 0.12, wy = h * 0.08, ww = w * 0.28, wh = h * 0.45;
  ctx.fillStyle = '#5a5048';
  ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8); // frame
  ctx.fillStyle = '#4a4038';
  ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
  // Sky through window
  const skyGrad = ctx.createLinearGradient(0, wy, 0, wy + wh * 0.6);
  skyGrad.addColorStop(0, '#6a9ac4');
  skyGrad.addColorStop(1, '#a0c4e0');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(wx, wy, ww, wh);
  // Window cross bars
  ctx.fillStyle = '#5a5048';
  ctx.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
  ctx.fillRect(wx, wy + wh / 2 - 1.5, ww, 3);
  // Curtain (right side of window)
  const curtainGrad = ctx.createLinearGradient(wx + ww, 0, wx + ww + 30, 0);
  curtainGrad.addColorStop(0, 'rgba(180,140,120,0.8)');
  curtainGrad.addColorStop(1, 'rgba(180,140,120,0)');
  ctx.fillStyle = curtainGrad;
  ctx.fillRect(wx + ww - 5, wy - 5, 35, wh + 10);

  // Warm light from window
  const lightGrad = ctx.createRadialGradient(wx + ww / 2, wy + wh / 2, 10, wx + ww / 2, wy + wh / 2, ww);
  lightGrad.addColorStop(0, 'rgba(255,240,200,0.08)');
  lightGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = lightGrad;
  ctx.fillRect(0, 0, w, h);

  // Table
  ctx.fillStyle = '#6a4a38';
  ctx.fillRect(w * 0.3, h * 0.48, w * 0.55, h * 0.04);
  ctx.fillStyle = '#5a3a28';
  ctx.fillRect(w * 0.3, h * 0.52, w * 0.55, h * 0.02);
  // Table legs
   ctx.fillStyle = '#5a3a28';
  ctx.fillRect(w * 0.33, h * 0.54, 4, h * 0.12);
  ctx.fillRect(w * 0.82, h * 0.54, 4, h * 0.12);

  // Lamp on table
  const lx = w * 0.62, ly = h * 0.3;
  // Lamp shade
  ctx.beginPath();
  ctx.moveTo(lx - 20, ly + 25); ctx.lineTo(lx - 30, ly - 10);
  ctx.lineTo(lx + 30, ly - 10); ctx.lineTo(lx + 20, ly + 25);
  ctx.closePath();
  ctx.fillStyle = '#e8d8c0';
  ctx.fill();
  ctx.strokeStyle = '#c0a888'; ctx.lineWidth = 1; ctx.stroke();
  // Lamp pole
  ctx.fillStyle = '#888';
  ctx.fillRect(lx - 2, ly + 25, 4, h * 0.48 - ly - 15);
  // Lamp base
  ctx.fillStyle = '#666';
  ctx.beginPath();
  ctx.ellipse(lx, h * 0.48, 15, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Lamp glow
  const flicker = 0.9 + 0.1 * Math.sin(time * 0.008) * Math.sin(time * 0.013);
 const lampGlow = ctx.createRadialGradient(lx, ly + 5, 5, lx, ly + 5, 120);
  lampGlow.addColorStop(0, `rgba(255,220,150,${0.15 * flicker})`);
  lampGlow.addColorStop(0.5, `rgba(255,200,120,${0.06 * flicker})`);
  lampGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = lampGlow;
  ctx.fillRect(0, 0, w, h);

  // Picture frame on wall (right side)
  const px = w * 0.7, py = h * 0.12, pw = w * 0.15, ph = h * 0.22;
  ctx.fillStyle = '#5a4a38';
  ctx.fillRect(px - 3, py - 3, pw + 6, ph + 6);
  ctx.fillStyle = '#4a8a6a';
  ctx.fillRect(px, py, pw, ph);
  // Simple landscape in frame
  ctx.fillStyle = '#6aaa8a';
  ctx.fillRect(px, py + ph * 0.6, pw, ph * 0.4);
  ctx.fillStyle = '#88ccaa';
  ctx.beginPath(); ctx.arc(px + pw * 0.7, py + ph * 0.3, 12, 0, Math.PI * 2); ctx.fill();

  // Bookshelf on right wall
  const bx = w * 0.88, by = h * 0.1, bw = w * 0.08, bh = h * 0.5;
  ctx.fillStyle = '#5a4030';
  ctx.fillRect(bx, by, bw, bh);
  // Shelves
  for (let sy = by + 10; sy < by + bh; sy += 25) {
    ctx.fillStyle = '#6a5040';
    ctx.fillRect(bx, sy, bw, 3);
    // Books on shelf
    const bookColors = ['#8a3030', '#305080', '#307030', '#806030', '#503060'];
    let bookX = bx + 2;
    for (let b = 0; b < 5 && bookX < bx + bw - 4; b++) {
      const bookW = 3 + ((b * 7 + 3) % 4);
      ctx.fillStyle = bookColors[b];
      ctx.fillRect(bookX, sy - 18 - ((b * 3) % 5), bookW, 18 + ((b * 3) % 5));
      bookX += bookW + 1;
    }
  }

  // Vase on table
  ctx.fillStyle = '#c06040';
  ctx.beginPath();
  ctx.ellipse(w * 0.45, h * 0.46, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(w * 0.45 - 4, h * 0.42, 8, 8);
  ctx.beginPath();
  ctx.ellipse(w * 0.45, h * 0.42, 5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Flower
  ctx.fillStyle = '#e06080';
  ctx.beginPath(); ctx.arc(w * 0.45, h * 0.38, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#40a040';
  ctx.fillRect(w * 0.449, h * 0.4, 2, 5);

  // Apply filter
  if (filter !== 'off') {
    const imgData = ctx.getImageData(0, 0, w, h);
    applyColorFilter(imgData.data, w, h, filter);
    ctx.putImageData(imgData, 0, 0);
  }
}