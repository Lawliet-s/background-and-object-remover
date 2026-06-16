const KEYS = {
  THEME: 'br-theme',
  BG_COLOR: 'br-bg-color',
  PREFERENCES: 'br-preferences',
};

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Storage save failed:', e.message);
  }
}

function load(key) {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn('Storage remove failed:', e.message);
  }
}

function getTheme() {
  return load(KEYS.THEME) || 'dark';
}

function setTheme(theme) {
  save(KEYS.THEME, theme);
}

function getBgColor() {
  return load(KEYS.BG_COLOR) || '#7c3aed';
}

function setBgColor(color) {
  save(KEYS.BG_COLOR, color);
}

export {
  KEYS,
  save,
  load,
  remove,
  getTheme,
  setTheme,
  getBgColor,
  setBgColor,
};
