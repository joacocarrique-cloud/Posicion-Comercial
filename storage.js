// ═══════════════════════════════════════════════════
// ─── STORAGE: LocalStorage Save/Load ───
// ═══════════════════════════════════════════════════

function saveState() {
  try {
    const state = { tabs, activeTabIdx, tabCounter };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    showSaveIndicator();
  } catch(e) { /* silently fail */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) { return null; }
}

function showSaveIndicator() {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  el.textContent = '✓ Guardado';
  el.classList.add('saving');
  clearTimeout(_saveIndicatorTimer);
  _saveIndicatorTimer = setTimeout(() => {
    el.classList.remove('saving');
    el.textContent = '';
  }, 1500);
}

// ─── Initialize tabs from storage ───
(function initTabs() {
  const saved = loadState();
  tabs = saved ? saved.tabs : JSON.parse(JSON.stringify(DEFAULT_TABS));
  activeTabIdx = saved ? saved.activeTabIdx : 0;
  tabCounter = saved ? saved.tabCounter : 2;
})();
