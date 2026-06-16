import { AutoModel, AutoProcessor, RawImage, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

const MODEL_ID = 'studioludens/birefnet-lite-512';
const MODEL_REVISION = '4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7';

let model = null;
let processor = null;
let isLoading = false;
let loaded = false;

env.allowLocalModels = false;
env.allowRemoteModels = true;

if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 4);
}

async function loadModel(onProgress) {
  if (loaded && model && processor) return true;
  if (isLoading) return false;

  isLoading = true;
  try {
    const loadOpts = {
      device: 'auto',
      progress_callback: (progress) => {
        if (!progress) return;
        if (progress.status === 'progress' && progress.total) {
          const ratio = Math.min(1, progress.loaded / progress.total);
          onProgress('download', ratio, progress.loaded, progress.total);
        } else if (progress.status === 'ready') {
          onProgress('ready', 1);
        }
      },
    };

    const processorOpts = {};

    try {
      loadOpts.revision = MODEL_REVISION;
      processorOpts.revision = MODEL_REVISION;
      model = await AutoModel.from_pretrained(MODEL_ID, loadOpts);
    } catch {
      delete loadOpts.revision;
      delete processorOpts.revision;
      model = await AutoModel.from_pretrained(MODEL_ID, loadOpts);
    }

    try {
      processor = await AutoProcessor.from_pretrained(MODEL_ID, processorOpts);
    } catch {
      delete processorOpts.revision;
      processor = await AutoProcessor.from_pretrained(MODEL_ID, processorOpts);
    }

    loaded = true;
    return true;
  } catch (err) {
    console.error('Model loading failed:', err);
    throw new Error('Failed to load AI model. Please check your internet connection and try again.');
  } finally {
    isLoading = false;
  }
}

async function removeBackground(imageUrl, onProgress) {
  if (!model || !processor) {
    throw new Error('Model not loaded. Call loadModel() first.');
  }

  onProgress('preprocess', 0.3);
  const rawImage = await RawImage.read(imageUrl);

  onProgress('preprocess', 0.5);
  const inputs = await processor(rawImage);

  onProgress('inference', 0.7);
  const outputs = await model({ input_image: inputs.pixel_values });
  const logits = outputs.logits || outputs.output || Object.values(outputs)[0];

  if (!logits || !logits.data) {
    throw new Error('Model returned unexpected output format.');
  }

  onProgress('postprocess', 0.9);
  const mask = new Float32Array(logits.data.length);
  for (let i = 0; i < logits.data.length; i++) {
    mask[i] = 1 / (1 + Math.exp(-logits.data[i]));
  }

  const maskSize = Math.round(Math.sqrt(mask.length));
  const maskWidth = logits.width || logits.dims?.[2] || maskSize;
  const maskHeight = logits.height || logits.dims?.[3] || maskSize;

  return { mask, maskWidth, maskHeight };
}

function applyMaskToImage(sourceImage, mask, maskWidth, maskHeight, bgColor = null) {
  const origW = sourceImage.naturalWidth;
  const origH = sourceImage.naturalHeight;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = maskWidth;
  maskCanvas.height = maskHeight;
  const maskCtx = maskCanvas.getContext('2d');
  const maskImageData = maskCtx.createImageData(maskWidth, maskHeight);

  for (let i = 0; i < mask.length; i++) {
    const val = Math.round(mask[i] * 255);
    const idx = i * 4;
    maskImageData.data[idx] = val;
    maskImageData.data[idx + 1] = val;
    maskImageData.data[idx + 2] = val;
    maskImageData.data[idx + 3] = 255;
  }
  maskCtx.putImageData(maskImageData, 0, 0);

  const scaledMaskCanvas = document.createElement('canvas');
  scaledMaskCanvas.width = origW;
  scaledMaskCanvas.height = origH;
  const scaledMaskCtx = scaledMaskCanvas.getContext('2d', { willReadFrequently: true });
  scaledMaskCtx.imageSmoothingEnabled = true;
  scaledMaskCtx.imageSmoothingQuality = 'high';
  scaledMaskCtx.drawImage(maskCanvas, 0, 0, origW, origH);

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = origW;
  sourceCanvas.height = origH;
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  sourceCtx.drawImage(sourceImage, 0, 0);

  const srcData = sourceCtx.getImageData(0, 0, origW, origH);
  const maskData = scaledMaskCtx.getImageData(0, 0, origW, origH).data;
  const pixels = srcData.data;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = origW;
  outputCanvas.height = origH;
  const outputCtx = outputCanvas.getContext('2d');

  if (bgColor) {
    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);

    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = maskData[i] / 255;
      pixels[i] = Math.round(pixels[i] * alpha + r * (1 - alpha));
      pixels[i + 1] = Math.round(pixels[i + 1] * alpha + g * (1 - alpha));
      pixels[i + 2] = Math.round(pixels[i + 2] * alpha + b * (1 - alpha));
      pixels[i + 3] = 255;
    }
  } else {
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i + 3] = maskData[i];
    }
  }

  outputCtx.putImageData(srcData, 0, 0);
  return outputCanvas;
}

function getCanvasBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function isModelLoaded() {
  return loaded;
}

function inpaint(imageData, mask, w, h) {
  const src = new Float32Array(imageData.data.length);
  for (let i = 0; i < src.length; i++) src[i] = imageData.data[i];

  const out = new Float32Array(src);
  const total = w * h;
  const status = new Uint8Array(total);
  const dist = new Float32Array(total).fill(Infinity);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] > 0.5) status[y * w + x] = 2;
    }
  }

  function hasNeighbor(px, py, t) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        if (status[ny * w + nx] === t) return true;
      }
    }
    return false;
  }

  const band = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (status[i] !== 2) continue;
      if (hasNeighbor(x, y, 0)) {
        status[i] = 1;
        dist[i] = 1;
        band.push(i);
      }
    }
  }

  while (band.length > 0) {
    let minI = 0;
    let minD = dist[band[0]];
    for (let i = 1; i < band.length; i++) {
      if (dist[band[i]] < minD) { minD = dist[band[i]]; minI = i; }
    }
    const pi = band.splice(minI, 1)[0];
    const px = pi % w, py = (pi / w) | 0;

    let r = 0, g = 0, b = 0, tw = 0;
    const RADIUS = 5;
    for (let dy = -RADIUS; dy <= RADIUS; dy++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        if (status[ny * w + nx] !== 0) continue;
        const d = Math.sqrt(dx * dx + dy * dy);
        const wt = 1 / (d * d + 0.1);
        const oi = (ny * w + nx) * 4;
        r += out[oi] * wt;
        g += out[oi + 1] * wt;
        b += out[oi + 2] * wt;
        tw += wt;
      }
    }

    if (tw > 0) {
      const oi = pi * 4;
      out[oi] = r / tw;
      out[oi + 1] = g / tw;
      out[oi + 2] = b / tw;
    }

    status[pi] = 0;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const ni = ny * w + nx;
        if (status[ni] !== 2) continue;
        status[ni] = 1;
        dist[ni] = Math.min(dist[ni], dist[pi] + Math.sqrt(dx * dx + dy * dy));
        band.push(ni);
      }
    }
  }

  const result = new ImageData(new Uint8ClampedArray(out), w, h);
  return result;
}

export { loadModel, removeBackground, applyMaskToImage, getCanvasBlob, isModelLoaded, inpaint };
