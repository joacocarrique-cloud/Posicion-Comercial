// ═══════════════════════════════════════════════════
// ─── APP: renderAll & Initialization ───
// ═══════════════════════════════════════════════════

// true cuando el módulo visible es Coberturas (workspace)
function isWorkspaceMode() {
  return !theoryMode && !retMode && !paseMode && !spreadMode && !desvioMode
    && !(typeof lineupMode !== 'undefined' && lineupMode)
    && !(typeof resumenMode !== 'undefined' && resumenMode);
}

function renderAll() {
  renderTabs();
  renderModules();
  if (isWorkspaceMode()) {
    renderStrats(); renderChart(); renderTable(); renderWinner(); renderCalc();
    if (typeof renderLivePanel === 'function') renderLivePanel();
    updateFASInfoBar();
    vgRender();
  }
  saveState();
}

// Cada paso del arranque es independiente: si uno falla, los demás siguen.
window.onload = () => {
  syncTopBar();
  renderAll();
  Promise.resolve()
    .then(() => syncFromSheet())
    .then(() => { if (typeof _liveLastRefresh !== 'undefined') _liveLastRefresh = new Date(); renderAll(); })
    .catch(e => console.warn('Sync A3:', e));
  Promise.resolve().then(() => syncFOBFromSheet()).catch(e => console.warn('Sync FOB:', e));
  Promise.resolve().then(() => asstInit()).catch(e => console.warn('Asistente:', e));
  if (typeof startLiveAutoRefresh === 'function') startLiveAutoRefresh();
};
