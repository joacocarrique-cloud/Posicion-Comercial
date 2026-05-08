// ═══════════════════════════════════════════════════
// ─── APP: renderAll & Initialization ───
// ═══════════════════════════════════════════════════

function renderAll() {
  renderTabs();
  renderModules();
  if (!theoryMode && !retMode && !paseMode) {
    renderStrats(); renderChart(); renderTable(); renderWinner();
    updateFASInfoBar();
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
