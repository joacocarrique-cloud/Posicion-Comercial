// ═══════════════════════════════════════════════════
// ─── PANEL DE MERCADO EN VIVO ───
// Precios de futuros/primas al día, oportunidades deep-OTM
// y P&L de las coberturas activas. Se auto-actualiza desde
// la misma Google Sheet (A3) que ya usa el resto de la app.
// ═══════════════════════════════════════════════════

const LIVE_CROP_LABELS = { soja: 'Soja', maiz: 'Maíz', trigo: 'Trigo', girasol: 'Girasol' };
const LIVE_REFRESH_MS = 5 * 60 * 1000; // 5 minutos
let _liveRefreshStarted = false;
let _liveLastRefresh = null;

function livePosLabel(pos) {
  try { return (typeof positionLabel === 'function') ? positionLabel(pos) : pos; }
  catch (e) { return pos; }
}

function liveFmt(n, dec) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
}

// Futuro "de referencia" para un cultivo: el de la posición seleccionada,
// o el primero con precio > 0.
function liveCurrentFuture(crop, posOverride) {
  if (!sheetData || !sheetData.futuros || !sheetData.futuros[crop]) return null;
  const list = sheetData.futuros[crop];
  const pos = posOverride || ((typeof marketPosition !== 'undefined') ? marketPosition : '');
  return (pos && list.find(f => f.pos === pos && f.precio > 0)) || list.find(f => f.precio > 0) || null;
}

// Opciones del cultivo en la posición seleccionada (o la que tenga más strikes).
function liveOptionsFor(crop) {
  if (!sheetData || !sheetData.opciones || !sheetData.opciones[crop]) return null;
  const byPos = sheetData.opciones[crop];
  const pos = (typeof marketPosition !== 'undefined') ? marketPosition : '';
  if (pos && byPos[pos]) return { pos, data: byPos[pos] };
  // fallback: la posición con más opciones cargadas
  let bestPos = null, bestN = -1;
  Object.keys(byPos).forEach(p => {
    const n = (byPos[p].calls.length + byPos[p].puts.length);
    if (n > bestN) { bestN = n; bestPos = p; }
  });
  return bestPos ? { pos: bestPos, data: byPos[bestPos] } : null;
}

function renderLivePanel() {
  const root = document.getElementById('live-panel-body');
  if (!root) return;

  if (!sheetData || !sheetData.futuros || Object.keys(sheetData.futuros).length === 0) {
    root.innerHTML = `<div class="live-empty">⏳ Sin datos de mercado todavía. Sincronizá con A3 (botón <strong>"Sincronizar A3"</strong>) para poblar el panel.</div>`;
    return;
  }

  const fecha = sheetData.fechaDatos || '—';
  const updTxt = _liveLastRefresh
    ? `actualizado ${_liveLastRefresh.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
    : 'en pantalla';
  const meta = `<div class="live-meta">📅 Datos al <strong>${fecha}</strong> · ${updTxt} · auto-actualiza cada 5 min</div>`;

  root.innerHTML = meta + renderLiveFuturos() + renderLiveOportunidades() + renderLivePnlActivas();
}

// ─── 1) Precios de futuros al día ──────────────────────────────────────────
function renderLiveFuturos() {
  let cards = '';
  Object.keys(LIVE_CROP_LABELS).forEach(crop => {
    // Solo posiciones clave (las de referencia, con volumen)
    const list = (sheetData.futuros[crop] || []).filter(f => f.precio > 0 && esPosClave(crop, f.pos));
    if (list.length === 0) return;
    let rows = list.map(f => `
      <tr>
        <td>${livePosLabel(f.pos)}</td>
        <td class="num">${liveFmt(f.precio, 1)}</td>
        <td class="num dim">${f.ia ? liveFmt(f.ia, 0) : '—'}</td>
      </tr>`).join('');
    cards += `
      <div class="live-fut-card">
        <div class="live-fut-title">${LIVE_CROP_LABELS[crop]}</div>
        <table class="live-mini-table">
          <thead><tr><th>Posición</th><th class="num">u$s/tn</th><th class="num">Int. Ab.</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  });
  return `
    <div class="live-section">
      <h3>Futuros al día</h3>
      <div class="live-fut-grid">${cards || '<div class="live-empty">Sin futuros en USD.</div>'}</div>
    </div>`;
}

// ─── 2) Oportunidades deep-OTM (apuestas asimétricas) ──────────────────────
function renderLiveOportunidades() {
  const t = (typeof getActiveTab === 'function') ? getActiveTab() : null;
  const crop = t ? t.assetVal : 'soja';
  const fut = liveCurrentFuture(crop);
  const opt = liveOptionsFor(crop);

  if (!fut || !opt || !opt.data.calls.length) {
    return `
      <div class="live-section">
        <h3>Oportunidades deep-OTM · ${LIVE_CROP_LABELS[crop] || crop}</h3>
        <div class="live-empty">Sin calls cargados para esta posición. Elegí cultivo/posición arriba y sincronizá.</div>
      </div>`;
  }

  const price = fut.precio;
  // Calls OTM (strike por encima del futuro) con prima > 0.
  const otm = opt.data.calls
    .filter(c => c.strike > price && c.prima > 0)
    .sort((a, b) => a.strike - b.strike);

  const rows = otm.map(c => {
    const be = c.strike + c.prima;            // break-even
    const pctOtm = (c.strike / price - 1) * 100;
    // Retorno sobre la prima si el futuro sube +15% / +30%
    const p15 = price * 1.15, p30 = price * 1.30;
    const roi = (target) => {
      const payoff = Math.max(target - c.strike, 0) - c.prima;
      return c.prima > 0 ? payoff / c.prima * 100 : 0;
    };
    const roi15 = roi(p15), roi30 = roi(p30);
    const cheap = c.prima <= 1.0;             // "billete de lotería"
    return `
      <tr class="${cheap ? 'live-cheap' : ''}">
        <td class="num">${liveFmt(c.strike, 0)}${cheap ? ' 🎟️' : ''}</td>
        <td class="num dim">+${pctOtm.toFixed(0)}%</td>
        <td class="num">${liveFmt(c.prima, 2)}</td>
        <td class="num">${liveFmt(be, 1)}</td>
        <td class="num ${roi15 >= 0 ? 'pos' : 'neg'}">${roi15 >= 0 ? '+' : ''}${roi15.toFixed(0)}%</td>
        <td class="num ${roi30 >= 0 ? 'pos' : 'neg'}">${roi30 >= 0 ? '+' : ''}${roi30.toFixed(0)}%</td>
      </tr>`;
  }).join('');

  return `
    <div class="live-section">
      <h3>Oportunidades deep-OTM · ${LIVE_CROP_LABELS[crop] || crop} ${livePosLabel(opt.pos)}
        <span class="live-ref">futuro ref. u$s ${liveFmt(price, 1)}</span></h3>
      <p class="live-hint">Compra de calls fuera del dinero: apuestas asimétricas a subas poco probables. Retorno = ganancia sobre la prima pagada si el futuro sube. 🎟️ = prima ≤ 1 (bajo costo, alto apalancamiento).</p>
      <table class="live-opp-table">
        <thead><tr>
          <th class="num">Strike</th><th class="num">OTM</th><th class="num">Prima</th>
          <th class="num">Break-even</th><th class="num">Ret. si +15%</th><th class="num">Ret. si +30%</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="live-empty">No hay calls OTM por encima del futuro.</td></tr>'}</tbody>
      </table>
    </div>`;
}

// ─── 3) P&L de las coberturas activas ──────────────────────────────────────
function renderLivePnlActivas() {
  if (typeof tabs === 'undefined' || !Array.isArray(tabs)) return '';

  let rows = '';
  let anyMissing = false;

  tabs.forEach(tab => {
    (tab.strategies || []).forEach(s => {
      if (!s.legs || s.legs.length === 0) return;
      const crop = tab.assetVal;
      // Cada solapa se valúa contra SU posición (tab.pos); si no tiene, la seleccionada.
      const fut = liveCurrentFuture(crop, tab.pos);
      const vol = (typeof getStratVol === 'function') ? getStratVol(s) : (s.vol || 100);

      let priceCell, pnlCell, estado;
      if (!fut) {
        anyMissing = true;
        priceCell = '—'; pnlCell = '—';
        estado = '<span class="live-badge dim">sin precio</span>';
      } else {
        const price = fut.precio;
        const pnlTon = (typeof calcDerivativePnl === 'function')
          ? calcDerivativePnl(s, price)
          : (calcPayoff(s, price) - price);
        const total = pnlTon * vol;
        priceCell = liveFmt(price, 1);
        pnlCell = `<span class="${total >= 0 ? 'pos' : 'neg'}">${total >= 0 ? '+' : '−'}u$s ${liveFmt(Math.abs(total), 0)}</span>`;
        if (total > 1) estado = '<span class="live-badge green">🟢 en ganancia</span>';
        else if (total < -1) estado = '<span class="live-badge red">🔴 en pérdida</span>';
        else estado = '<span class="live-badge">⚪ neutro</span>';
      }

      rows += `
        <tr>
          <td>${escHtml(tab.name || 'Solapa')}</td>
          <td style="color:${s.color || 'inherit'};font-weight:600">${escHtml(s.name)}</td>
          <td>${LIVE_CROP_LABELS[crop] || crop}${fut ? ' ' + livePosLabel(fut.pos) : ''}</td>
          <td class="num">${liveFmt(vol, 0)}</td>
          <td class="num">${priceCell}</td>
          <td class="num">${pnlCell}</td>
          <td>${estado}</td>
        </tr>`;
    });
  });

  if (!rows) {
    return `
      <div class="live-section">
        <h3>P&amp;L de coberturas activas</h3>
        <div class="live-empty">No hay estrategias con patas cargadas.</div>
      </div>`;
  }

  const note = anyMissing
    ? '<p class="live-hint">Algunas estrategias no tienen precio de futuro para su cultivo/posición en los datos actuales.</p>'
    : '<p class="live-hint">Resultado neto del derivado a vencimiento si el futuro cerrara al precio actual (prima ya descontada), por el volumen de cada estrategia.</p>';

  return `
    <div class="live-section">
      <h3>P&amp;L de coberturas activas <span class="live-ref">a precio de mercado actual</span></h3>
      ${note}
      <table class="live-pnl-table">
        <thead><tr>
          <th>Solapa</th><th>Estrategia</th><th>Cultivo · Posición</th><th class="num">Vol (tns)</th>
          <th class="num">Fut. actual</th><th class="num">P&amp;L neto</th><th>Estado</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ─── Auto-refresh: re-sincroniza la Sheet cada 5 min ───────────────────────
function liveRefreshNow() {
  if (typeof syncFromSheet !== 'function') return;
  syncFromSheet()
    .then(() => { _liveLastRefresh = new Date(); if (typeof renderAll === 'function') renderAll(); })
    .catch(() => {});
}

function startLiveAutoRefresh() {
  if (_liveRefreshStarted) return;
  _liveRefreshStarted = true;
  setInterval(liveRefreshNow, LIVE_REFRESH_MS);
}
