// ═══════════════════════════════════════════════════
// ─── APP: renderAll & Initialization ───
// ═══════════════════════════════════════════════════

function renderAll() {
  renderTabs();
  renderModules();
  if (!theoryMode && !retMode && !paseMode) {
    renderStrats(); renderChart(); renderTable(); renderWinner();
    updateFASInfoBar();
    vgRender();
  }
  saveState();
}

window.onload = () => { 
  syncTopBar(); 
  renderAll(); 
  syncFromSheet().catch(() => {});
  syncFOBFromSheet().catch(() => {});
  asstInit().catch(() => {});
};
