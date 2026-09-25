// ═══════════════════════════════════════════════════
// ─── APP: renderAll & Initialization ───
// ═══════════════════════════════════════════════════

// true cuando el módulo visible es Coberturas (workspace)
function isWorkspaceMode() {
  return !theoryMode && !retMode && !paseMode && !spreadMode && !desvioMode
    && !(typeof lineupMode !== 'undefined' && lineupMode)
    && !(typeof resumenMode !== 'undefined' && resumenMode)
    && !(typeof escMode !== 'undefined' && escMode);
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

// ─── Módulo abierto: se recuerda al navegar y se reabre al recargar la página ───
const UI_MODULOS = {
  workspace: 'switchToWorkspace', ret: 'toggleRetenciones', pase: 'togglePases', spreads: 'toggleSpreads',
  desvio: 'toggleDesvio', theory: 'toggleTheory', lineup: 'toggleLineUp', resumen: 'toggleResumen',
  escenarios: 'toggleEscenarios',
};
Object.entries(UI_MODULOS).forEach(([k, fn]) => {
  const orig = window[fn];
  if (typeof orig !== 'function') return;
  window[fn] = function () { const r = orig.apply(this, arguments); uiSet('modulo', k); return r; };
});

// Cada paso del arranque es independiente: si uno falla, los demás siguen.
window.onload = () => {
  // Valores manuales guardados (tasas, dólar futuro, etc.) antes de cualquier cálculo
  if (typeof paramsRestore === 'function') paramsRestore();
  // Campos que se completan desde A3: si el usuario los edita, se respeta su valor.
  // Se escucha en fase de captura para marcarlo ANTES de que corra el oninput del campo.
  const autoA3 = ['pase-tc-spot', 'fondeo-tc-spot', 'fondeo-precio-usd', 'fondeo-disp'];
  document.addEventListener('input', e => {
    if (e.target && autoA3.includes(e.target.id)) e.target.dataset.manual = '1';
  }, true);
  syncTopBar();
  renderAll();
  Promise.resolve()
    .then(() => syncFromSheet())
    .then(() => { if (typeof _liveLastRefresh !== 'undefined') _liveLastRefresh = new Date(); renderAll(); })
    .catch(e => console.warn('Sync A3:', e));
  Promise.resolve().then(() => syncFOBFromSheet()).catch(e => console.warn('Sync FOB:', e));
  Promise.resolve().then(() => asstInit()).catch(e => console.warn('Asistente:', e));
  if (typeof startLiveAutoRefresh === 'function') startLiveAutoRefresh();
  // Reabrir el módulo en el que se estaba (cada módulo recarga sus datos al llegar A3)
  const mod = uiGet('modulo', 'workspace');
  if (mod !== 'workspace' && typeof window[UI_MODULOS[mod]] === 'function') {
    try { window[UI_MODULOS[mod]](); } catch (e) { console.warn('No se pudo reabrir el módulo', mod, e); }
  }
};
