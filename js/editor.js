import { showToast } from './upload.js';
import { inpaint } from './remove.js';

let canvas = null;
let container = null;
let handleEl = null;
let compareActive = false;
let compareX = 0.5;
let bgColor = null;
let transparentCanvas = null;
let originalImage = null;
let onCompareChange = null;

const MAX_UNDO = 20;
let editMaskData = null;
let originalMaskData = null;
let maskWidth = 0;
let maskHeight = 0;
let undoStack = [];
let redoStack = [];
let brushSize = 12;
let brushStrength = 0.85;
let brushMode = 'add';
let isPainting = false;
let maskEditActive = false;
let onEditStateChange = null;
let lastPointerPos = null;

let removerActive = false;
let removerMaskData = null;
let removerMaskWidth = 0;
let removerMaskHeight = 0;
let removerUndoStack = [];
let removerRedoStack = [];
let removerBrushSize = 24;
let removerSnapshotCanvas = null;

let zoom = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartPanX = 0;
let panStartPanY = 0;
let onZoomChange = null;
let spaceHeld = false;
let maskTool = 'brush';
let onMaskToolChange = null;

function initEditor(canvasEl, containerEl, handle, compareCallback) {
  canvas = canvasEl;
  container = containerEl;
  handleEl = handle;
  onCompareChange = compareCallback;

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('resize', () => scheduleRender());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
}

function onKeyDown(e) {
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    spaceHeld = true;
    updatePanCursor();
    scheduleRender();
  }
}

function onKeyUp(e) {
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    spaceHeld = false;
    updatePanCursor();
    scheduleRender();
  }
}

function setTransparentCanvas(c) {
  transparentCanvas = c;
  scheduleRender();
}

function setOriginalImage(img) {
  originalImage = img;
  scheduleRender();
}

function setBgColor(color) {
  bgColor = color || null;
  scheduleRender();
}

function isTransparent() {
  return bgColor === null;
}

function getBgColor() {
  return bgColor;
}

function setCompareActive(active) {
  compareActive = active;
  if (container) container.classList.toggle('compare-mode', active);
  if (!active) {
    handleEl.style.left = '';
  }
  scheduleRender();
}

function isCompareActive() {
  return compareActive;
}

function setCompareX(x) {
  compareX = Math.max(0, Math.min(1, x));
  handleEl.style.left = `${compareX * 100}%`;
  scheduleRender();
}

function getCompareX() {
  return compareX;
}

let renderScheduled = false;

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    render();
  });
}

function render() {
  if (!canvas || !container) return;

  const rect = container.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  if (w === 0 || h === 0) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, w, h);

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  const hasResult = transparentCanvas !== null;
  const hasOriginal = originalImage !== null;

  if (!hasResult && !hasOriginal) { ctx.restore(); return; }

  const imgW = hasResult ? transparentCanvas.width : originalImage.naturalWidth;
  const imgH = hasResult ? transparentCanvas.height : originalImage.naturalHeight;
  const scale = Math.min(w / imgW, h / imgH, 1);
  const dw = Math.round(imgW * scale);
  const dh = Math.round(imgH * scale);
  const dx = Math.round((w - dw) / 2);
  const dy = Math.round((h - dh) / 2);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (hasResult) {
    if (bgColor && !maskEditActive) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(dx, dy, dw, dh);
    }
    ctx.drawImage(transparentCanvas, dx, dy, dw, dh);
  } else if (hasOriginal) {
    ctx.drawImage(originalImage, dx, dy, dw, dh);
  }

  if (!maskEditActive) {
    if (removerActive && removerMaskData && hasOriginal) {
      drawRemoverOverlay(ctx, dx, dy, dw, dh);
    }
    if (removerActive && lastPointerPos) {
      drawRemoverCursor(ctx, dx, dy, dw, dh);
    }
    if (compareActive && hasResult && hasOriginal) {
      drawCompareSlider(ctx, w, h, dx, dy, dw, dh);
    } else {
      handleEl.classList.add('hidden');
    }
    ctx.restore();
    return;
  }

  handleEl.classList.add('hidden');

  if (hasResult && editMaskData) {
    ctx.globalAlpha = 0.3;
    ctx.drawImage(originalImage, dx, dy, dw, dh);
    ctx.globalAlpha = 1;
    drawMaskOverlay(ctx, dx, dy, dw, dh);
  }

  if (lastPointerPos) {
    drawBrushCursor(ctx, dx, dy, dw, dh);
  }

  ctx.restore();
}

function drawMaskOverlay(ctx, dx, dy, dw, dh) {
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = maskWidth;
  maskCanvas.height = maskHeight;
  const maskCtx = maskCanvas.getContext('2d');
  const imageData = maskCtx.createImageData(maskWidth, maskHeight);

  for (let i = 0; i < editMaskData.length; i++) {
    const alpha = Math.round(editMaskData[i] * 180);
    const idx = i * 4;
    imageData.data[idx] = 255;
    imageData.data[idx + 1] = 50;
    imageData.data[idx + 2] = 50;
    imageData.data[idx + 3] = alpha;
  }
  maskCtx.putImageData(imageData, 0, 0);

  ctx.drawImage(maskCanvas, dx, dy, dw, dh);
}

function drawBrushCursor(ctx, dx, dy, dw, dh) {
  if (!lastPointerPos || maskShouldPan()) return;
  const rw = dw / maskWidth;
  const px = dx + lastPointerPos.uvx * rw * maskWidth;
  const py = dy + lastPointerPos.uvy * rw * maskWidth;
  const radius = Math.max(2, brushSize * rw);
  const isAdd = brushMode === 'add';

  ctx.beginPath();
  ctx.arc(px, py, radius, 0, Math.PI * 2);
  ctx.fillStyle = isAdd ? 'rgba(0,255,100,0.2)' : 'rgba(255,50,50,0.2)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(px, py, radius, 0, Math.PI * 2);
  ctx.strokeStyle = isAdd ? 'rgba(0,255,100,0.8)' : 'rgba(255,50,50,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawRemoverOverlay(ctx, dx, dy, dw, dh) {
  if (!removerMaskData) return;
  const c = document.createElement('canvas');
  c.width = removerMaskWidth;
  c.height = removerMaskHeight;
  const cx = c.getContext('2d');
  const img = cx.createImageData(removerMaskWidth, removerMaskHeight);
  for (let i = 0; i < removerMaskData.length; i++) {
    const a = Math.round(removerMaskData[i] * 160);
    const idx = i * 4;
    img.data[idx] = 0;
    img.data[idx + 1] = 180;
    img.data[idx + 2] = 255;
    img.data[idx + 3] = a;
  }
  cx.putImageData(img, 0, 0);
  ctx.drawImage(c, dx, dy, dw, dh);
}

function drawRemoverCursor(ctx, dx, dy, dw, dh) {
  if (!lastPointerPos || !removerActive) return;
  const rw = dw / removerMaskWidth;
  const px = dx + lastPointerPos.uvx * rw * removerMaskWidth;
  const py = dy + lastPointerPos.uvy * rw * removerMaskWidth;
  const radius = Math.max(2, removerBrushSize * rw);

  ctx.beginPath();
  ctx.arc(px, py, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,180,255,0.15)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(px, py, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,180,255,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawCompareSlider(ctx, w, h, dx, dy, dw, dh) {
  handleEl.classList.add('hidden');
  const splitX = dx + dw * compareX;

  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, Math.max(0, splitX - dx), dh);
  ctx.clip();
  ctx.drawImage(originalImage, dx, dy, dw, dh);
  ctx.restore();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(splitX, dy);
  ctx.lineTo(splitX, dy + dh);
  ctx.stroke();
  ctx.shadowBlur = 0;

  const handleSize = 32;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(splitX, dy + dh / 2, handleSize / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#1a1a2e';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u27FF', splitX, dy + dh / 2);
}

function getDisplayRect() {
  const rect = container.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const hasResult = transparentCanvas !== null;
  const hasOriginal = originalImage !== null;
  if (!hasResult && !hasOriginal) return null;
  const imgW = hasResult ? transparentCanvas.width : originalImage.naturalWidth;
  const imgH = hasResult ? transparentCanvas.height : originalImage.naturalHeight;
  const scale = Math.min(w / imgW, h / imgH, 1);
  return {
    dx: Math.round((w - imgW * scale) / 2),
    dy: Math.round((h - imgH * scale) / 2),
    dw: Math.round(imgW * scale),
    dh: Math.round(imgH * scale),
    imgW,
    imgH,
    scale,
    cw: w,
    ch: h,
  };
}

function clientXYToMaskUV(clientX, clientY) {
  const dr = getDisplayRect();
  if (!dr) return null;
  const r = container.getBoundingClientRect();
  const cx = (clientX - r.left - panX) / zoom - dr.dx;
  const cy = (clientY - r.top - panY) / zoom - dr.dy;
  const u = cx / dr.dw;
  const v = cy / dr.dh;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { u: u * maskWidth, v: v * maskHeight, uvx: u, uvy: v };
}

function paintAt(uvx, uvy) {
  if (!editMaskData) return;
  const radius = brushSize;
  const strength = brushStrength;
  const isAdd = brushMode === 'add';
  const cx = uvx * maskWidth;
  const cy = uvy * maskHeight;
  const r2 = radius * radius;

  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(maskWidth - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(maskHeight - 1, Math.ceil(cy + radius));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dist2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (dist2 > r2) continue;
      const dist = Math.sqrt(dist2);
      const falloff = 1 - (dist / radius);
      const alpha = falloff * strength;
      const idx = y * maskWidth + x;
      if (isAdd) {
        editMaskData[idx] = Math.min(1, editMaskData[idx] + alpha);
      } else {
        editMaskData[idx] = Math.max(0, editMaskData[idx] - alpha);
      }
    }
  }
}

function maskShouldPan() {
  return maskTool === 'grab' ? !spaceHeld : spaceHeld;
}

function onPointerDown(e) {
  if (maskEditActive && editMaskData) {
    if (maskShouldPan()) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartPanX = panX;
      panStartPanY = panY;
      updatePanCursor();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);
    isPainting = true;
    const uv = clientXYToMaskUV(e.clientX, e.clientY);
    if (uv) {
      lastPointerPos = uv;
      paintAt(uv.uvx, uv.uvy);
      scheduleRender();
    }
    return;
  }
  if (removerActive && removerMaskData) {
    if (spaceHeld) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartPanX = panX;
      panStartPanY = panY;
      updatePanCursor();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);
    isPainting = true;
    const uv = clientXYToMaskUV(e.clientX, e.clientY);
    if (uv) {
      lastPointerPos = uv;
      removerPaintAt(uv.uvx, uv.uvy);
      scheduleRender();
    }
    return;
  }
  if (compareActive && originalImage && transparentCanvas) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const dr = getDisplayRect();
    if (dr) {
      const r = container.getBoundingClientRect();
      const px = (e.clientX - r.left - panX) / zoom;
      const relX = (px - dr.dx) / dr.dw;
      compareX = Math.max(0, Math.min(1, relX));
      handleEl.style.left = `${compareX * 100}%`;
      scheduleRender();
    }
    return;
  }
  if (zoom > 1) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartPanX = panX;
    panStartPanY = panY;
    return;
  }
}

function onPointerMove(e) {
  if (isPanning) {
    panX = panStartPanX + (e.clientX - panStartX);
    panY = panStartPanY + (e.clientY - panStartY);
    scheduleRender();
    return;
  }
  if (removerActive && removerMaskData) {
    const uv = clientXYToMaskUV(e.clientX, e.clientY);
    if (uv) {
      lastPointerPos = uv;
      if (isPainting) {
        removerPaintAt(uv.uvx, uv.uvy);
      }
      scheduleRender();
    }
    return;
  }
  if (maskEditActive && editMaskData) {
    const uv = clientXYToMaskUV(e.clientX, e.clientY);
    if (uv) {
      lastPointerPos = uv;
      if (isPainting) {
        paintAt(uv.uvx, uv.uvy);
      }
      scheduleRender();
    }
    return;
  }
  if (compareActive) {
    if (e.buttons === 0) return;
    const rect = canvas.getBoundingClientRect();
    const dr = getDisplayRect();
    if (!dr) return;
    const px = (e.clientX - rect.left - panX) / zoom;
    const relX = (px - dr.dx) / dr.dw;
    compareX = Math.max(0, Math.min(1, relX));
    handleEl.style.left = `${compareX * 100}%`;
    scheduleRender();
    return;
  }
}

function onPointerUp(e) {
  if (isPanning) {
    isPanning = false;
    return;
  }
  if (!isPainting) return;
  isPainting = false;
  if (maskEditActive) pushUndo();
  scheduleRender();
}

function onPointerLeave(e) {
  if (isPainting) {
    isPainting = false;
    if (maskEditActive) pushUndo();
  }
  if (isPanning) {
    isPanning = false;
  }
  lastPointerPos = null;
  scheduleRender();
}

function setZoomChangeCallback(cb) {
  onZoomChange = cb;
}

function setMaskTool(tool) {
  maskTool = tool;
  updatePanCursor();
  if (onMaskToolChange) onMaskToolChange(tool);
}

function getMaskTool() {
  return maskTool;
}

function setMaskToolChangeCallback(cb) {
  onMaskToolChange = cb;
}

function updatePanCursor() {
  if (!container) return;
  const shouldGrab = zoom > 1 || (maskEditActive && maskShouldPan()) || (removerActive && spaceHeld);
  container.classList.toggle('pan-grab', shouldGrab);
}

function updateZoomUI() {
  if (onZoomChange) onZoomChange(Math.round(zoom * 100));
  updatePanCursor();
}

function onWheel(e) {
  if (maskEditActive && editMaskData && maskTool === 'brush') {
    e.preventDefault();
    return;
  }
  e.preventDefault();
  e.stopPropagation();

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const oldZoom = zoom;
  const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
  zoom = Math.max(0.25, Math.min(10, zoom * factor));

  panX = mx - (mx - panX) * (zoom / oldZoom);
  panY = my - (my - panY) * (zoom / oldZoom);

  scheduleRender();
  updateZoomUI();
}

function zoomIn() {
  const oldZoom = zoom;
  zoom = Math.min(10, zoom * 1.4);
  const cx = container.clientWidth / 2;
  const cy = container.clientHeight / 2;
  panX = cx - (cx - panX) * (zoom / oldZoom);
  panY = cy - (cy - panY) * (zoom / oldZoom);
  scheduleRender();
  updateZoomUI();
}

function zoomOut() {
  const oldZoom = zoom;
  zoom = Math.max(0.25, zoom / 1.4);
  const cx = container.clientWidth / 2;
  const cy = container.clientHeight / 2;
  panX = cx - (cx - panX) * (zoom / oldZoom);
  panY = cy - (cy - panY) * (zoom / oldZoom);
  scheduleRender();
  updateZoomUI();
}

function resetZoom() {
  zoom = 1;
  panX = 0;
  panY = 0;
  scheduleRender();
  updateZoomUI();
}

function getZoom() {
  return zoom;
}

function startSliderDrag(e) {
  if (!compareActive || !originalImage || !transparentCanvas) return;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const dr = getDisplayRect();
  if (!dr) return;

  canvas.setPointerCapture(e.pointerId);

  function onMove(ev) {
    const containerRect = container.getBoundingClientRect();
    const px = ev.clientX - containerRect.left;
    const relX = (px - dr.dx) / dr.dw;
    setCompareX(Math.max(0, Math.min(1, relX)));
    if (onCompareChange) onCompareChange(compareX);
  }

  function onUp() {
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
  }

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
}

function toggleCompare() {
  if (maskEditActive) return;
  setCompareActive(!compareActive);
}

function pushUndo() {
  if (!editMaskData) return;
  const snapshot = new Float32Array(editMaskData);
  undoStack.push(snapshot);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = [];
  notifyStateChange();
}

function undo() {
  if (!maskEditActive || undoStack.length === 0) return;
  const snapshot = undoStack.pop();
  redoStack.push(new Float32Array(editMaskData));
  editMaskData.set(snapshot);
  scheduleRender();
  notifyStateChange();
}

function redo() {
  if (!maskEditActive || redoStack.length === 0) return;
  const snapshot = redoStack.pop();
  undoStack.push(new Float32Array(editMaskData));
  editMaskData.set(snapshot);
  scheduleRender();
  notifyStateChange();
}

function canUndo() {
  return maskEditActive && undoStack.length > 0;
}

function canRedo() {
  return maskEditActive && redoStack.length > 0;
}

function startMaskEdit(mask, mw, mh) {
  editMaskData = new Float32Array(mask);
  originalMaskData = new Float32Array(mask);
  maskWidth = mw;
  maskHeight = mh;
  undoStack = [];
  redoStack = [];
  isPainting = false;
  lastPointerPos = null;
  pushUndo();
  maskEditActive = true;
  compareActive = false;
  handleEl.classList.add('hidden');
  if (container) {
    container.classList.add('mask-edit-mode');
    updatePanCursor();
  }
  scheduleRender();
  notifyStateChange();
}

function applyMaskEdit() {
  if (!maskEditActive) return null;
  maskEditActive = false;
  if (container) container.classList.remove('mask-edit-mode');
  isPainting = false;
  lastPointerPos = null;
  const result = new Float32Array(editMaskData);
  undoStack = [];
  redoStack = [];
  scheduleRender();
  notifyStateChange();
  updatePanCursor();
  return result;
}

function cancelMaskEdit() {
  if (!maskEditActive) return;
  const changed = hasMaskChanged();
  if (changed) {
    showToast('Changes discarded', 'info');
  }
  editMaskData = new Float32Array(originalMaskData);
  maskEditActive = false;
  isPainting = false;
  lastPointerPos = null;
  if (container) container.classList.remove('mask-edit-mode');
  undoStack = [];
  redoStack = [];
  scheduleRender();
  notifyStateChange();
  updatePanCursor();
}

function hasMaskChanged() {
  if (!editMaskData || !originalMaskData) return false;
  for (let i = 0; i < editMaskData.length; i++) {
    if (editMaskData[i] !== originalMaskData[i]) return true;
  }
  return false;
}

function isMaskEditActive() {
  return maskEditActive;
}

function isRemoverActive() {
  return removerActive;
}

function getRemoverMaskData() {
  return removerMaskData ? new Float32Array(removerMaskData) : null;
}

function getRemoverDimensions() {
  return { width: removerMaskWidth, height: removerMaskHeight };
}

function startRemover(mw, mh) {
  if (maskEditActive) return;
  removerMaskData = new Float32Array(mw * mh);
  removerMaskWidth = mw;
  removerMaskHeight = mh;
  removerUndoStack = [];
  removerRedoStack = [];
  removerActive = true;
  removerBrushSize = 24;
  scheduleRender();
}

function cancelRemover() {
  if (!removerActive) return;
  removerActive = false;
  removerMaskData = null;
  removerUndoStack = [];
  removerRedoStack = [];
  removerSnapshotCanvas = null;
  scheduleRender();
}

function removerPushUndo() {
  if (!removerMaskData) return;
  removerUndoStack.push(new Float32Array(removerMaskData));
  if (removerUndoStack.length > 20) removerUndoStack.shift();
  removerRedoStack = [];
}

function removerCanUndo() {
  return removerActive && removerUndoStack.length > 0;
}

function removerCanRedo() {
  return removerActive && removerRedoStack.length > 0;
}

function removerUndo() {
  if (!removerCanUndo()) return;
  const s = removerUndoStack.pop();
  removerRedoStack.push(new Float32Array(removerMaskData));
  removerMaskData.set(s);
  scheduleRender();
}

function removerRedo() {
  if (!removerCanRedo()) return;
  const s = removerRedoStack.pop();
  removerUndoStack.push(new Float32Array(removerMaskData));
  removerMaskData.set(s);
  scheduleRender();
}

function removerPaintAt(uvx, uvy) {
  if (!removerMaskData) return;
  const cx = uvx * removerMaskWidth;
  const cy = uvy * removerMaskHeight;
  const radius = removerBrushSize;
  const r2 = radius * radius;

  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(removerMaskWidth - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(removerMaskHeight - 1, Math.ceil(cy + radius));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      removerMaskData[y * removerMaskWidth + x] = 1;
    }
  }
}

function setRemoverBrushSize(size) {
  removerBrushSize = Math.max(2, Math.min(200, size));
}

function getRemoverBrushSize() {
  return removerBrushSize;
}

let onRemoverStateChange = null;

function setRemoverStateCallback(cb) {
  onRemoverStateChange = cb;
}

function runRemover() {
  if (!removerActive || !removerMaskData) return null;
  removerPushUndo();

  const srcCanvas = transparentCanvas || (() => {
    const c = document.createElement('canvas');
    c.width = originalImage.naturalWidth;
    c.height = originalImage.naturalHeight;
    c.getContext('2d').drawImage(originalImage, 0, 0);
    return c;
  })();
  const srcW = srcCanvas.width;
  const srcH = srcCanvas.height;
  const MAX_SIZE = 1024;
  const scale = Math.min(1, MAX_SIZE / Math.max(srcW, srcH));
  const mw = Math.round(srcW * scale);
  const mh = Math.round(srcH * scale);

  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH);

  const downCanvas = document.createElement('canvas');
  downCanvas.width = mw;
  downCanvas.height = mh;
  const downCtx = downCanvas.getContext('2d');
  downCtx.imageSmoothingEnabled = true;
  downCtx.drawImage(srcCanvas, 0, 0, mw, mh);
  const downData = downCtx.getImageData(0, 0, mw, mh);

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = removerMaskWidth;
  maskCanvas.height = removerMaskHeight;
  const maskCtx = maskCanvas.getContext('2d');
  const maskImg = maskCtx.createImageData(removerMaskWidth, removerMaskHeight);
  for (let i = 0; i < removerMaskData.length; i++) {
    const v = Math.round(removerMaskData[i] * 255);
    const idx = i * 4;
    maskImg.data[idx] = v;
    maskImg.data[idx + 1] = v;
    maskImg.data[idx + 2] = v;
    maskImg.data[idx + 3] = 255;
  }
  maskCtx.putImageData(maskImg, 0, 0);

  const scaledMask = document.createElement('canvas');
  scaledMask.width = mw;
  scaledMask.height = mh;
  const sc = scaledMask.getContext('2d');
  sc.imageSmoothingEnabled = false;
  sc.drawImage(maskCanvas, 0, 0, mw, mh);
  const maskPixels = sc.getImageData(0, 0, mw, mh).data;

  const inpaintMask = new Float32Array(mw * mh);
  for (let i = 0; i < mw * mh; i++) {
    inpaintMask[i] = maskPixels[i * 4] / 255;
  }

  const result = inpaint(downData, inpaintMask, mw, mh);

  const upCanvas = document.createElement('canvas');
  upCanvas.width = srcW;
  upCanvas.height = srcH;
  const upCtx = upCanvas.getContext('2d');
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = mw;
  tempCanvas.height = mh;
  tempCanvas.getContext('2d').putImageData(result, 0, 0);
  upCtx.imageSmoothingEnabled = true;
  upCtx.drawImage(tempCanvas, 0, 0, srcW, srcH);

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = srcW;
  finalCanvas.height = srcH;
  const finalCtx = finalCanvas.getContext('2d');
  finalCtx.drawImage(srcCanvas, 0, 0);
  const finalData = finalCtx.getImageData(0, 0, srcW, srcH);
  const upData = upCtx.getImageData(0, 0, srcW, srcH);

  const fullMaskCanvas = document.createElement('canvas');
  fullMaskCanvas.width = removerMaskWidth;
  fullMaskCanvas.height = removerMaskHeight;
  const fmCtx = fullMaskCanvas.getContext('2d');
  fmCtx.putImageData(maskImg, 0, 0);

  const scaledFullMask = document.createElement('canvas');
  scaledFullMask.width = srcW;
  scaledFullMask.height = srcH;
  const sfmCtx = scaledFullMask.getContext('2d');
  sfmCtx.imageSmoothingEnabled = false;
  sfmCtx.drawImage(fullMaskCanvas, 0, 0, srcW, srcH);
  const fullMask = sfmCtx.getImageData(0, 0, srcW, srcH).data;

  for (let i = 0; i < srcW * srcH; i++) {
    if (fullMask[i * 4] > 128) {
      const idx = i * 4;
      finalData.data[idx] = upData.data[idx];
      finalData.data[idx + 1] = upData.data[idx + 1];
      finalData.data[idx + 2] = upData.data[idx + 2];
      finalData.data[idx + 3] = 255;
    }
  }
  finalCtx.putImageData(finalData, 0, 0);

  transparentCanvas = finalCanvas;
  for (let i = 0; i < removerMaskData.length; i++) removerMaskData[i] = 0;
  scheduleRender();
  return finalCanvas;
}

function getEditMaskData() {
  return editMaskData ? new Float32Array(editMaskData) : null;
}

function getMaskDimensions() {
  return { maskWidth, maskHeight };
}

function setBrushSize(size) {
  brushSize = Math.max(2, Math.min(200, size));
}

function getBrushSize() {
  return brushSize;
}

function setBrushStrength(s) {
  brushStrength = Math.max(0.05, Math.min(1, s));
}

function getBrushStrength() {
  return brushStrength;
}

function setBrushMode(mode) {
  brushMode = mode === 'remove' ? 'remove' : 'add';
}

function getBrushMode() {
  return brushMode;
}

function setEditStateCallback(cb) {
  onEditStateChange = cb;
}

function notifyStateChange() {
  if (onEditStateChange) onEditStateChange({
    canUndo: canUndo(),
    canRedo: canRedo(),
    isActive: maskEditActive,
    hasChanged: hasMaskChanged(),
    brushSize,
    brushStrength,
    brushMode,
  });
}

async function downloadPNG(fileName = 'image') {
  if (!transparentCanvas) {
    showToast('No processed image available', 'error');
    return;
  }

  try {
    const blob = await getCanvasBlob(transparentCanvas, 'image/png');
    downloadBlob(blob, `${fileName}-transparent.png`);
    showToast('PNG downloaded successfully', 'success');
  } catch {
    showToast('Failed to download PNG', 'error');
  }
}

async function downloadJPG(fileName = 'image') {
  if (!transparentCanvas) {
    showToast('No processed image available', 'error');
    return;
  }

  try {
    const w = transparentCanvas.width;
    const h = transparentCanvas.height;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const ctx = tempCanvas.getContext('2d');

    ctx.fillStyle = bgColor || '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(transparentCanvas, 0, 0);

    const blob = await getCanvasBlob(tempCanvas, 'image/jpeg', 0.95);
    downloadBlob(blob, `${fileName}-background.jpg`);
    showToast('JPG downloaded successfully', 'success');
  } catch {
    showToast('Failed to download JPG', 'error');
  }
}

async function copyToClipboard() {
  if (!transparentCanvas) {
    showToast('No processed image available', 'error');
    return;
  }

  try {
    const blob = await getCanvasBlob(transparentCanvas, 'image/png');
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
    showToast('Copied to clipboard', 'success');
  } catch {
    showToast('Failed to copy to clipboard', 'error');
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getCanvasBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function reset() {
  transparentCanvas = null;
  originalImage = null;
  compareActive = false;
  compareX = 0.5;
  bgColor = null;
  editMaskData = null;
  originalMaskData = null;
  maskWidth = 0;
  maskHeight = 0;
  undoStack = [];
  redoStack = [];
  isPainting = false;
  maskEditActive = false;
  lastPointerPos = null;
  zoom = 1;
  panX = 0;
  panY = 0;
  isPanning = false;
  spaceHeld = false;
  removerActive = false;
  removerMaskData = null;
  removerUndoStack = [];
  removerRedoStack = [];
  removerSnapshotCanvas = null;
  if (container) {
    container.classList.remove('mask-edit-mode');
    container.classList.remove('pan-grab');
  }
  scheduleRender();
}

export {
  initEditor, setTransparentCanvas, setOriginalImage, setBgColor, getBgColor,
  setCompareActive, isCompareActive, setCompareX, getCompareX,
  toggleCompare, downloadPNG, downloadJPG, copyToClipboard, render, reset,
  scheduleRender, isTransparent,
  startMaskEdit, applyMaskEdit, cancelMaskEdit, isMaskEditActive,
  getEditMaskData, getMaskDimensions,
  setBrushSize, getBrushSize, setBrushStrength, getBrushStrength,
  setBrushMode, getBrushMode, undo, redo, canUndo, canRedo,
  setEditStateCallback, setZoomChangeCallback,
  zoomIn, zoomOut, resetZoom, getZoom,
  setMaskTool, getMaskTool, setMaskToolChangeCallback,
  startRemover, cancelRemover, runRemover, isRemoverActive,
  getRemoverMaskData, getRemoverDimensions,
  removerUndo, removerRedo, removerCanUndo, removerCanRedo,
  setRemoverBrushSize, getRemoverBrushSize, setRemoverStateCallback,
};
