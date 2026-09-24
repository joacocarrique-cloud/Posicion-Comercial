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
  // Estrategias guardadas con colores que ahora son de las líneas Objetivo/Dolor
  tabs.forEach(t => (t.strategies || []).forEach(s => {
    const c = String(s.color || '').toLowerCase();
    if (COLOR_MIGRATION[c]) s.color = COLOR_MIGRATION[c];
  }));
  if (!tabs[activeTabIdx]) activeTabIdx = 0;
})();

// ═══════════════════════════════════════════════════
// ─── PARÁMETROS MANUALES ───
// Valores que no vienen de ninguna fuente automática (tasas, dólar futuro, almacenaje,
// costos de crushing, datos de fondeo). Se guardan en el navegador con la fecha de
// carga, así no vuelven al valor de fábrica al recargar. `dias` = vigencia: pasado ese
// plazo el Resumen avisa que el dato puede estar viejo.
// (El TC spot, el precio del futuro de Fondeo y el disponible salen de A3 automáticamente.)
// ═══════════════════════════════════════════════════
const PARAMS_KEY = 'espartina_params_v1';
const PARAMS_MANUALES = [
  { id: 'pase-tasa-credito-usd',  modulo: 'Pases & Tasas',     nombre: 'Crédito u$s (TNA %)',          dias: 15 },
  { id: 'pase-tasa-credito-ars',  modulo: 'Pases & Tasas',     nombre: 'Crédito $ (TNA %)',            dias: 7 },
  { id: 'pase-tasa-caucion-usd',  modulo: 'Pases & Tasas',     nombre: 'Caución u$s (TNA %)',          dias: 7 },
  { id: 'pase-tasa-caucion-ars',  modulo: 'Pases & Tasas',     nombre: 'Caución $ (TNA %)',            dias: 7 },
  { id: 'pase-tasa-lecap',        modulo: 'Pases & Tasas',     nombre: 'LECAP / PF (TNA %)',           dias: 7 },
  { id: 'pase-tasa-cheques',      modulo: 'Pases & Tasas',     nombre: 'Descuento cheques (TNA %)',    dias: 7 },
  { id: 'pase-tc-fut2',           modulo: 'Pases & Tasas',     nombre: 'Dólar futuro ROFEX pos. 2',    dias: 3 },
  { id: 'pase-tc-fut3',           modulo: 'Pases & Tasas',     nombre: 'Dólar futuro ROFEX pos. 3',    dias: 3 },
  { id: 'pase-almacenaje',        modulo: 'Pases & Tasas',     nombre: 'Almacenaje (u$s/tn/mes)',      dias: 90 },
  { id: 'fondeo-monto',           modulo: 'Fondeo',            nombre: 'Monto a fondear',              dias: 30 },
  { id: 'fondeo-fecha',           modulo: 'Fondeo',            nombre: 'Fecha de repago',              dias: 30 },
  { id: 'fondeo-tc-fut',          modulo: 'Fondeo',            nombre: 'Dólar futuro ROFEX',           dias: 3 },
  { id: 'fondeo-r-usd',           modulo: 'Fondeo',            nombre: 'Crédito u$s todo-costo (TNA %)', dias: 15 },
  { id: 'fondeo-r-ars',           modulo: 'Fondeo',            nombre: 'Crédito $ todo-costo (TNA %)', dias: 7 },
  { id: 'fondeo-r-cheq',          modulo: 'Fondeo',            nombre: 'Descuento cheques (TNA %)',    dias: 7 },
  { id: 'ret-crush-ret-subprod',  modulo: 'FAS & Retenciones', nombre: 'Retención subproductos (%)',   dias: 180 },
  { id: 'ret-crush-fobbing-val',  modulo: 'FAS & Retenciones', nombre: 'Fobbing subproductos',         dias: 90 },
  { id: 'ret-crush-industria-val',modulo: 'FAS & Retenciones', nombre: 'Gasto de industrialización',   dias: 90 },
];

let _params = (function () {
  try { return JSON.parse(localStorage.getItem(PARAMS_KEY)) || {}; } catch (e) { return {}; }
})();

function paramsSave(id, v) {
  _params[id] = { v, ts: Date.now() };
  try { localStorage.setItem(PARAMS_KEY, JSON.stringify(_params)); } catch (e) { /* sin espacio */ }
  showSaveIndicator();
}

// Restaura los valores guardados y empieza a registrar cada cambio (con fecha).
function paramsRestore() {
  PARAMS_MANUALES.forEach(p => {
    const el = document.getElementById(p.id);
    if (!el || el.dataset.paramBound) return;
    el.dataset.fabrica = el.value;
    const s = _params[p.id];
    if (s && s.v != null && s.v !== '') el.value = s.v;
    const guardar = () => paramsSave(p.id, el.value);
    el.addEventListener('input', guardar);
    el.addEventListener('change', guardar);
    el.dataset.paramBound = '1';
  });
}

// Estado de cada parámetro: 'fabrica' (nunca se cargó), 'viejo' (pasó su vigencia) u 'ok'.
function paramsEstado() {
  const ahora = Date.now();
  return PARAMS_MANUALES.map(p => {
    const el = document.getElementById(p.id);
    const s = _params[p.id];
    const dias = s ? Math.floor((ahora - s.ts) / 86400000) : null;
    const estado = !s ? 'fabrica' : (dias > p.dias ? 'viejo' : 'ok');
    // dias = antigüedad del dato · vigencia = días que se considera válido
    return { ...p, vigencia: p.dias, valor: el ? el.value : (s ? s.v : ''), dias, fecha: s ? new Date(s.ts) : null, estado };
  });
}
