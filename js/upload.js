const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024;

function initUpload(inputEl, zoneEl, onFile) {
  inputEl.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file, onFile);
  });

  zoneEl.addEventListener('click', (e) => {
    if (e.target !== inputEl) inputEl.click();
  });

  zoneEl.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.add('drag-over');
  });

  zoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.add('drag-over');
  });

  zoneEl.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.remove('drag-over');
  });

  zoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file, onFile);
  });

  zoneEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputEl.click();
    }
  });
}

function handleFile(file, onFile) {
  const error = validateFile(file);
  if (error) {
    showToast(error, 'error');
    return;
  }
  onFile(file);
}

function validateFile(file) {
  if (!file) return 'No file selected';
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Unsupported format. Please use PNG, JPG, or WEBP.';
  }
  if (file.size > MAX_SIZE) {
    return 'File too large. Maximum size is 10MB.';
  }
  return null;
}

function getFileInfo(file) {
  return {
    name: file.name,
    size: formatSize(file.size),
    type: file.type,
  };
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

export { initUpload, handleFile, validateFile, getFileInfo, showToast };
