import { initUpload, getFileInfo, showToast } from './upload.js';
import { loadModel, removeBackground, applyMaskToImage, isModelLoaded, inpaint } from './remove.js';
import {
  initEditor, setTransparentCanvas, setOriginalImage, setBgColor, getBgColor,
  setCompareActive, isCompareActive, setCompareX, toggleCompare,
  downloadPNG, downloadJPG, copyToClipboard, render, reset as resetEditor, scheduleRender, isTransparent,
  startMaskEdit, applyMaskEdit, cancelMaskEdit, isMaskEditActive,
  getEditMaskData, getMaskDimensions,
  setBrushSize, getBrushSize, setBrushStrength, getBrushStrength,
  setBrushMode, getBrushMode, undo, redo, canUndo, canRedo,
  setEditStateCallback, setZoomChangeCallback,
  zoomIn, zoomOut, resetZoom, getZoom,
  setMaskTool, getMaskTool, setMaskToolChangeCallback,
  startRemover, cancelRemover, runRemover, isRemoverActive,
  removerUndo, removerRedo, removerCanUndo, removerCanRedo,
  setRemoverBrushSize, getRemoverBrushSize, setRemoverStateCallback,
} from './editor.js';
import {
  KEYS, getTheme, setTheme, setBgColor as saveBgColor,
} from './storage.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  hero: $('#heroSection'),
  editor: $('#editorSection'),
  fileInput: $('#fileInput'),
  uploadZone: $('#uploadZone'),
  processBtn: $('#processBtn'),
  canvas: $('#previewCanvas'),
  canvasContainer: $('#canvasContainer'),
  canvasEmpty: $('#canvasEmpty'),
  compareHandle: $('#compareHandle'),
  compareToggle: $('#compareToggle'),
  overlay: $('#processingOverlay'),
  overlayTitle: $('#overlayTitle'),
  overlayDesc: $('#overlayDesc'),
  overlayProgress: $('#overlayProgress'),
  overlayProgressFill: $('#overlayProgressFill'),
  progressSection: $('#progressSection'),
  progressLabel: $('#progressLabel'),
  progressPercent: $('#progressPercent'),
  progressFill: $('#progressFill'),
  themeToggle: $('#themeToggle'),
  downloadPngBtn: $('#downloadPngBtn'),
  downloadJpgBtn: $('#downloadJpgBtn'),
  copyBtn: $('#copyBtn'),
  resetBtn: $('#resetBtn'),
  uploadNewBtn: $('#uploadNewBtn'),
  infoName: $('#infoName'),
  infoSize: $('#infoSize'),
  infoDims: $('#infoDims'),
  infoFormat: $('#infoFormat'),
  bgColorPicker: $('#bgColorPicker'),
  editorBgColorPicker: $('#editorBgColorPicker'),
  colorPresets: $$('.color-presets'),
  editMaskBtn: $('#editMaskBtn'),
  maskControls: $('#maskControls'),
  brushSizeRange: $('#brushSizeRange'),
  brushStrengthRange: $('#brushStrengthRange'),
  brushSizeVal: $('#brushSizeVal'),
  brushStrengthVal: $('#brushStrengthVal'),
  brushModeAdd: $('#brushModeAdd'),
  brushModeRemove: $('#brushModeRemove'),
  maskUndoBtn: $('#maskUndoBtn'),
  maskRedoBtn: $('#maskRedoBtn'),
  maskApplyBtn: $('#maskApplyBtn'),
  maskCancelBtn: $('#maskCancelBtn'),
  maskBrushBtn: $('#maskBrushBtn'),
  maskGrabBtn: $('#maskGrabBtn'),
  zoomInBtn: $('#zoomInBtn'),
  zoomOutBtn: $('#zoomOutBtn'),
  zoomResetBtn: $('#zoomResetBtn'),
  zoomLevelLabel: $('#zoomLevelLabel'),
  removerBtn: $('#removerBtn'),
  removerControls: $('#removerControls'),
  removerBrushRange: $('#removerBrushRange'),
  removerBrushVal: $('#removerBrushVal'),
  removerUndoBtn: $('#removerUndoBtn'),
  removerRedoBtn: $('#removerRedoBtn'),
  removerApplyBtn: $('#removerApplyBtn'),
  removerCancelBtn: $('#removerCancelBtn'),
};

let maskData = null;
let maskWidth = 0;
let maskHeight = 0;

let state = {
  sourceFile: null,
  sourceUrl: null,
  sourceImage: null,
  fileName: '',
  transparentCanvas: null,
  isProcessing: false,
};

document.documentElement.setAttribute('data-theme', getTheme());
setBgColor(null);
updateColorPresets('');

initEditor(els.canvas, els.canvasContainer, els.compareHandle, (x) => {
  setCompareX(x);
});
initUpload(els.fileInput, els.uploadZone, onFileLoaded);
bindEvents();

function bindEvents() {
  els.processBtn.addEventListener('click', onProcess);
  els.compareToggle.addEventListener('click', onCompareToggle);
  els.themeToggle.addEventListener('click', onThemeToggle);
  els.downloadPngBtn.addEventListener('click', () => {
    downloadPNG(state.fileName);
  });
  els.downloadJpgBtn.addEventListener('click', () => {
    downloadJPG(state.fileName);
  });
  els.copyBtn.addEventListener('click', () => {
    copyToClipboard(state.fileName);
  });
  els.resetBtn.addEventListener('click', onReset);
  els.uploadNewBtn.addEventListener('click', () => {
    els.fileInput.click();
  });

  els.bgColorPicker.addEventListener('input', (e) => {
    onColorChange(e.target.value);
  });
  els.editorBgColorPicker.addEventListener('input', (e) => {
    onColorChange(e.target.value);
  });

  document.addEventListener('keydown', onKeydown);

  els.overlay.addEventListener('click', (e) => {
    if (e.target === els.overlay) hideOverlay();
  });

  els.colorPresets.forEach((group) => {
    group.addEventListener('click', (e) => {
      const swatch = e.target.closest('.color-swatch');
      if (!swatch) return;
      const color = swatch.dataset.color;
      onColorChange(color);
    });
  });

  setEditStateCallback(updateMaskUI);

  els.editMaskBtn.addEventListener('click', onEditMask);
  els.brushSizeRange.addEventListener('input', onBrushSizeChange);
  els.brushStrengthRange.addEventListener('input', onBrushStrengthChange);
  els.brushModeAdd.addEventListener('click', () => onBrushMode('add'));
  els.brushModeRemove.addEventListener('click', () => onBrushMode('remove'));
  els.maskUndoBtn.addEventListener('click', () => { undo(); updateMaskUI(); });
  els.maskRedoBtn.addEventListener('click', () => { redo(); updateMaskUI(); });
  els.maskApplyBtn.addEventListener('click', onMaskApply);
  els.maskCancelBtn.addEventListener('click', onMaskCancel);

  els.maskBrushBtn.addEventListener('click', () => onMaskToolChange('brush'));
  els.maskGrabBtn.addEventListener('click', () => onMaskToolChange('grab'));
  setMaskToolChangeCallback((tool) => {
    els.maskBrushBtn.classList.toggle('active', tool === 'brush');
    els.maskGrabBtn.classList.toggle('active', tool === 'grab');
  });

  els.removerBtn.addEventListener('click', onRemoverToggle);
  els.removerBrushRange.addEventListener('input', onRemoverBrushChange);
  els.removerUndoBtn.addEventListener('click', () => { removerUndo(); updateRemoverUI(); });
  els.removerRedoBtn.addEventListener('click', () => { removerRedo(); updateRemoverUI(); });
  els.removerApplyBtn.addEventListener('click', onRemoverApply);
  els.removerCancelBtn.addEventListener('click', onRemoverCancel);
  setRemoverStateCallback(updateRemoverUI);

  els.zoomInBtn.addEventListener('click', zoomIn);
  els.zoomOutBtn.addEventListener('click', zoomOut);
  els.zoomResetBtn.addEventListener('click', resetZoom);
  setZoomChangeCallback((pct) => {
    els.zoomLevelLabel.textContent = `${pct}%`;
  });
}

function updateMaskUI() {
  const active = isMaskEditActive();
  els.maskUndoBtn.disabled = !canUndo();
  els.maskRedoBtn.disabled = !canRedo();
}

async function onFileLoaded(file) {
  try {
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);

    state.sourceFile = file;
    state.fileName = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'image';

    state.sourceUrl = URL.createObjectURL(file);
    state.sourceImage = await loadImage(state.sourceUrl);
    state.transparentCanvas = null;

    setOriginalImage(state.sourceImage);
    setTransparentCanvas(null);
    els.canvasEmpty.classList.add('hidden');

    els.hero.classList.add('hidden');
    els.editor.classList.remove('hidden');

    els.processBtn.disabled = false;
    els.downloadPngBtn.disabled = true;
    els.downloadJpgBtn.disabled = true;
    els.copyBtn.disabled = true;
    setCompareActive(false);

    maskData = null;
    maskWidth = 0;
    maskHeight = 0;
    els.editMaskBtn.disabled = true;
    els.editMaskBtn.textContent = 'Edit Mask';
    els.maskControls.classList.add('hidden');
    els.removerBtn.disabled = false;
    els.removerBtn.textContent = 'Object Remover';
    els.removerControls.classList.add('hidden');

    setFileInfo(file);

    showToast(`Loaded: ${file.name}`, 'success');
  } catch (err) {
    console.error('File load error:', err);
    showToast('Failed to load image', 'error');
  }
}

function setFileInfo(file) {
  const info = getFileInfo(file);
  els.infoName.textContent = info.name;
  els.infoSize.textContent = info.size;

  if (state.sourceImage) {
    els.infoDims.textContent = `${state.sourceImage.naturalWidth} × ${state.sourceImage.naturalHeight}`;
  }

  const fmt = file.type.replace('image/', '').toUpperCase();
  els.infoFormat.textContent = fmt;
}

async function onProcess() {
  if (state.isProcessing) return;
  if (!state.sourceImage) return;

  state.isProcessing = true;
  els.processBtn.disabled = true;

  try {
    if (isModelLoaded()) {
      showOverlay('Processing Image', 'Running AI segmentation...');
      updateOverlayProgress(10, 'Model ready');
    } else {
      showOverlay('Loading AI Model', 'Downloading BiRefNet segmentation model for first-time use...');
    }

    await loadModel((stage, ratio, loaded, total) => {
      if (stage === 'download') {
        const pct = Math.round(ratio * 60);
        updateOverlayProgress(pct, `${Math.round(ratio * 100)}% (${formatBytes(loaded)} / ${formatBytes(total)})`);
      } else if (stage === 'ready') {
        updateOverlayProgress(60, 'Model ready');
      }
    });

    updateOverlayTitle('Processing Image');
    updateOverlayDesc('Running AI segmentation (this may take a moment)...');
    updateOverlayProgress(65, 'Preprocessing...');

    const result = await removeBackground(state.sourceUrl, (stage) => {
      if (stage === 'preprocess') updateOverlayProgress(70, 'Preprocessing image...');
      else if (stage === 'inference') updateOverlayProgress(80, 'Running inference...');
      else if (stage === 'postprocess') updateOverlayProgress(90, 'Post-processing...');
    });

    updateOverlayProgress(95, 'Applying mask...');

    const outputCanvas = applyMaskToImage(
      state.sourceImage,
      result.mask,
      result.maskWidth,
      result.maskHeight,
      null
    );

    maskData = result.mask;
    maskWidth = result.maskWidth;
    maskHeight = result.maskHeight;

    state.transparentCanvas = outputCanvas;
    setTransparentCanvas(outputCanvas);

    updateOverlayProgress(100, 'Done!');
    await sleep(300);

    els.downloadPngBtn.disabled = false;
    els.downloadJpgBtn.disabled = false;
    els.copyBtn.disabled = false;
    els.editMaskBtn.disabled = false;
    els.removerBtn.disabled = false;

    showToast('Background removed successfully!', 'success');
  } catch (err) {
    console.error('Processing error:', err);
    showToast(err.message || 'Processing failed. Please try again.', 'error');
  } finally {
    hideOverlay();
    state.isProcessing = false;
    els.processBtn.disabled = false;
  }
}

function onCompareToggle() {
  if (!state.transparentCanvas) {
    showToast('Process an image first', 'error');
    return;
  }
  toggleCompare();
  els.compareToggle.classList.toggle('active', isCompareActive());
}

function onColorChange(color) {
  const val = color || null;
  setBgColor(val);
  saveBgColor(val);
  els.bgColorPicker.value = val || '#7c3aed';
  els.editorBgColorPicker.value = val || '#7c3aed';
  updateColorPresets(color);
}

function updateColorPresets(color) {
  const activeVal = color || '';
  els.colorPresets.forEach((group) => {
    group.querySelectorAll('.color-swatch').forEach((swatch) => {
      swatch.classList.toggle('active', swatch.dataset.color === activeVal);
    });
  });
}

function onThemeToggle() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  setTheme(next);
  scheduleRender();
}

function onReset() {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.sourceFile = null;
  state.sourceUrl = null;
  state.sourceImage = null;
  state.transparentCanvas = null;
  state.fileName = '';

  maskData = null;
  maskWidth = 0;
  maskHeight = 0;

  resetEditor();
  els.canvasEmpty.classList.remove('hidden');

  els.hero.classList.remove('hidden');
  els.editor.classList.add('hidden');

  els.processBtn.disabled = true;
  els.downloadPngBtn.disabled = true;
  els.downloadJpgBtn.disabled = true;
  els.copyBtn.disabled = true;
  els.compareToggle.classList.remove('active');
  els.editMaskBtn.disabled = true;
  els.maskControls.classList.add('hidden');
  els.removerBtn.disabled = true;
  els.removerBtn.textContent = 'Object Remover';
  els.removerControls.classList.add('hidden');
  els.fileInput.value = '';

  els.infoName.textContent = '-';
  els.infoSize.textContent = '-';
  els.infoDims.textContent = '-';
  els.infoFormat.textContent = '-';
}

function onKeydown(e) {
  if (e.ctrlKey || e.metaKey) {
    if (e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (isMaskEditActive()) { redo(); updateMaskUI(); }
      return;
    }
    switch (e.key.toLowerCase()) {
      case 'o':
        e.preventDefault();
        els.fileInput.click();
        break;
      case 's':
        e.preventDefault();
        if (state.transparentCanvas) downloadPNG(state.fileName);
        break;
      case 't':
        e.preventDefault();
        onThemeToggle();
        break;
      case 'z':
        e.preventDefault();
        if (isMaskEditActive()) { undo(); updateMaskUI(); }
        break;
    }
    return;
  }

  switch (e.key) {
    case 'Delete':
    case 'Backspace':
      if (!isInputFocused(e)) {
        e.preventDefault();
        onReset();
      }
      break;
    case 'c':
    case 'C':
      if (!isInputFocused(e)) {
        e.preventDefault();
        onCompareToggle();
      }
      break;
  }
}

function isInputFocused(e) {
  const tag = e.target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
}

function showOverlay(title, desc) {
  els.overlayTitle.textContent = title;
  els.overlayDesc.textContent = desc;
  els.overlayProgress.textContent = '0%';
  els.overlayProgressFill.style.width = '0%';
  els.overlay.classList.remove('hidden');
  els.overlay.style.animation = 'fadeIn 0.3s ease';
}

function updateOverlayProgress(percent, label) {
  const pct = Math.max(0, Math.min(100, percent));
  els.overlayProgressFill.style.width = `${pct}%`;
  if (label) els.overlayProgress.textContent = label;
  else els.overlayProgress.textContent = `${pct}%`;
}

function updateOverlayTitle(title) {
  els.overlayTitle.textContent = title;
}

function updateOverlayDesc(desc) {
  els.overlayDesc.textContent = desc;
}

function hideOverlay() {
  els.overlay.classList.add('hidden');
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onEditMask() {
  if (!maskData || isMaskEditActive()) return;
  if (isCompareActive()) setCompareActive(false);
  els.compareToggle.classList.remove('active');
  startMaskEdit(maskData, maskWidth, maskHeight);
  els.editMaskBtn.textContent = 'Editing...';
  els.maskControls.classList.remove('hidden');
  els.maskUndoBtn.disabled = true;
  els.maskRedoBtn.disabled = true;
  updateMaskUI();
}

function onBrushSizeChange() {
  const val = parseInt(els.brushSizeRange.value);
  setBrushSize(val);
  els.brushSizeVal.textContent = val;
}

function onBrushStrengthChange() {
  const val = parseInt(els.brushStrengthRange.value);
  setBrushStrength(val / 100);
  els.brushStrengthVal.textContent = `${val}%`;
}

function onBrushMode(mode) {
  setBrushMode(mode);
  els.brushModeAdd.classList.toggle('active', mode === 'add');
  els.brushModeRemove.classList.toggle('active', mode === 'remove');
}

function onMaskToolChange(tool) {
  setMaskTool(tool);
  els.maskBrushBtn.classList.toggle('active', tool === 'brush');
  els.maskGrabBtn.classList.toggle('active', tool === 'grab');
}

function onMaskApply() {
  if (!isMaskEditActive()) return;
  const editedMask = applyMaskEdit();
  if (!editedMask) {
    showToast('No changes made', 'info');
    return;
  }
  maskData = editedMask;
  const newCanvas = applyMaskToImage(state.sourceImage, maskData, maskWidth, maskHeight, null);
  state.transparentCanvas = newCanvas;
  setTransparentCanvas(newCanvas);
  els.editMaskBtn.textContent = 'Edit Mask';
  els.maskControls.classList.add('hidden');
  showToast('Mask applied', 'success');
}

function onMaskCancel() {
  if (!isMaskEditActive()) return;
  cancelMaskEdit();
  els.editMaskBtn.textContent = 'Edit Mask';
  els.maskControls.classList.add('hidden');
}

function onRemoverToggle() {
  if (isRemoverActive()) return;
  if (isMaskEditActive()) {
    cancelMaskEdit();
    els.editMaskBtn.textContent = 'Edit Mask';
    els.maskControls.classList.add('hidden');
  }
  if (isCompareActive()) setCompareActive(false);
  const rw = maskWidth || Math.min(1024, state.sourceImage?.naturalWidth || 512);
  const rh = maskHeight || Math.min(1024, state.sourceImage?.naturalHeight || 512);
  startRemover(rw, rh);
  els.removerBtn.textContent = 'Removing...';
  els.removerControls.classList.remove('hidden');
  updateRemoverUI();
}

function onRemoverBrushChange() {
  const val = parseInt(els.removerBrushRange.value);
  setRemoverBrushSize(val);
  els.removerBrushVal.textContent = val;
}

function onRemoverApply() {
  if (!isRemoverActive()) return;
  const result = runRemover();
  if (!result) return;
  setTransparentCanvas(result);
  state.transparentCanvas = result;
  showToast('Object removed', 'success');
  updateRemoverUI();
}

function onRemoverCancel() {
  if (!isRemoverActive()) return;
  cancelRemover();
  els.removerBtn.textContent = 'Object Remover';
  els.removerControls.classList.add('hidden');
  render();
}

function updateRemoverUI() {
  if (!isRemoverActive()) return;
  els.removerUndoBtn.disabled = !removerCanUndo();
  els.removerRedoBtn.disabled = !removerCanRedo();
}
