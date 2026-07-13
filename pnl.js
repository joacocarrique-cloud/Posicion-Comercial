// ═══════════════════════════════════════════════════
// ─── P&L ESPERADO — VISTA EJECUTIVA ───
// Módulo autocontenido. NO modifica coberturas.js, app.js ni styles.css.
// Instalación: <script src="pnl.js"></script> al final, DESPUÉS de app.js
//
// Impresión:
//   · Ctrl+P normal → one-pager del BUILDER (tu @media print). Esta sección se oculta.
//   · Botón export  → body.pnl-print → one-pager EJECUTIVO. El builder se oculta.
//   En ambos casos se reusan #print-header y #print-footer del index.
// ═══════════════════════════════════════════════════

// Campo de volumen por estrategia (definido en coberturas.js). Se autodetecta.
const PNL_VOL_KEYS = ['vol', 'tns', 'volumen', 'tn'];
function pnlStratVol(s) {
  if (!s) return null;
  for (const k of PNL_VOL_KEYS) {
    if (typeof s[k] === 'number' && s[k] > 0) return s[k];
  }
  return null;
}

const PNL_DEFAULT_SC = [
  { n: 'Derrumbe', f: 'Cosecha récord + presión FOB',      d: -0.18, q: 10 },
  { n: 'Baja',     f: 'Sin sorpresas, oferta amplia',      d: -0.08, q: 25 },
  { n: 'Lateral',  f: 'El mercado se mantiene',            d:  0.00, q: 30 },
  { n: 'Suba',     f: 'Baja de retenciones',               d:  0.08, q: 25 },
  { n: 'Rally',    f: 'Weather market + cuello logístico', d:  0.20, q: 10 }
];
function pnlScFromSpot(spot) {
  return PNL_DEFAULT_SC.map(s => ({ n: s.n, f: s.f, p: Math.round(spot * (1 + s.d)), q: s.q }));
}

// ─── Estado por tab (lo persiste saveState) ───
function pnlEnsureState(t) {
  if (!t.pnlScenarios) t.pnlScenarios = pnlScFromSpot(t.spot);
  if (t.pnlUmbral == null) t.pnlUmbral = Math.round(t.spot * 0.95);
  if (t.pnlOpen == null) t.pnlOpen = true;
  if (!t.strategies.some(s => s.id === t.pnlStratId)) {
    t.pnlStratId = t.strategies.length ? t.strategies[0].id : null;
  }
  if (t.pnlTn == null) {
    const prop = t.strategies.find(s => s.id === t.pnlStratId);
    t.pnlTn = pnlStratVol(prop) || 10000;
  }
  return t;
}

// ─── Cálculo ───
// calcPayoff() de coberturas.js ya devuelve PRECIO EFECTIVO. Se reusa, no se duplica.
function pnlNetCost(strat) {
  let c = 0;
  strat.legs.forEach(l => {
    const q = l.ratio || 1;
    if (l.type !== 'futuro') c += (l.dir === 'buy' ? l.prima : -l.prima) * q;
  });
  return c;
}
function pnlHasSoldOption(strat) {
  return strat.legs.some(l => l.dir === 'sell' && l.type !== 'futuro');
}
function pnlMetrics(fn, scs, w, umbral, tn) {
  const vals = scs.map(s => fn(s.p));
  const E = vals.reduce((a, v, i) => a + v * w[i], 0);
  const pFail = scs.reduce((a, s, i) => a + (fn(s.p) < umbral ? w[i] : 0), 0) * 100;
  return {
    vals, E,
    worst: Math.min(...vals),
    best: Math.max(...vals),
    range: Math.max(...vals) - Math.min(...vals),
    pFail,
    total: E * tn
  };
}

// ─── Render ───
let pnlChart = null;

function renderPnL() {
  const host = document.getElementById('pnl-body');
  if (!host) return;
  const t = getActiveTab();
  if (!t) return;
  pnlEnsureState(t);

  const scs = t.pnlScenarios;
  const tot = scs.reduce((a, s) => a + (+s.q || 0), 0);
  const w = tot > 0 ? scs.map(s => s.q / tot) : scs.map(() => 0);
  const um = +t.pnlUmbral || 0;
  const tn = +t.pnlTn || 0;
  const spot = t.spot;

  const alts = [
    { key: 'sin', name: 'Sin cobertura', hex: '#b0afa8', fn: p => p, base: true },
    { key: 'fut', name: 'Vender futuro 100%', hex: '#C8A44A', fn: () => spot, base: true }
  ];
  t.strategies.forEach(s => {
    alts.push({ key: 's' + s.id, id: s.id, name: s.name, hex: s.color, fn: p => calcPayoff(s, p), strat: s });
  });

  const M = {};
  alts.forEach(a => { M[a.key] = pnlMetrics(a.fn, scs, w, um, tn); });
  const prop = t.strategies.find(s => s.id === t.pnlStratId) || null;
  const propVol = pnlStratVol(prop);

  const f1 = v => v.toFixed(1);
  const dif = (a, b) => { const x = a - b; return `<span class="${x >= 0 ? 'pnl-pos' : 'pnl-neg'}">${x >= 0 ? '+' : ''}${x.toFixed(1)}</span>`; };
  const usd = v => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + ' M' : (v / 1e3).toFixed(0) + ' k';
  const isProp = a => prop && a.id === prop.id;

  // ── Contexto ──
  const volNote = (propVol && propVol !== tn)
    ? `<div class="pnl-warn">La estrategia <strong>${prop.name}</strong> tiene ${propVol.toLocaleString('es-AR')} tn cargadas en el builder, y acá estás usando ${tn.toLocaleString('es-AR')} tn. <button class="pnl-btn-ghost" onclick="pnlSet('pnlTn', ${propVol})">Usar las del builder</button></div>`
    : '';

  const ctxHtml = `
    <div class="pnl-ctx pnl-noprint">
      <div class="pnl-field"><label>Toneladas cubiertas</label>
        <input type="number" value="${tn}" oninput="pnlSet('pnlTn', +this.value)"></div>
      <div class="pnl-field"><label>Umbral arrendamiento (u$s/tn)</label>
        <input type="number" value="${um}" oninput="pnlSet('pnlUmbral', +this.value)"></div>
      <div class="pnl-field"><label>Estrategia a proponer</label>
        <select onchange="pnlSet('pnlStratId', +this.value)">
          ${t.strategies.map(s => `<option value="${s.id}" ${s.id === t.pnlStratId ? 'selected' : ''}>${s.name}</option>`).join('')}
        </select></div>
      <div class="pnl-field" style="margin-left:auto">
        <button class="pnl-btn-ghost" onclick="pnlResetSc()" title="Reconstruye los escenarios a partir del futuro actual">Recalcular desde spot (${spot.toFixed(1)})</button>
      </div>
    </div>${volNote}`;

  const far = scs.some(s => s.p < spot * 0.5 || s.p > spot * 1.6);
  const warnHtml = far
    ? `<div class="pnl-warn">Los escenarios no se corresponden con el futuro actual (${spot.toFixed(1)}). Probablemente cambiaste de cultivo o posición — conviene recalcularlos desde spot.</div>`
    : '';

  // ── Escenarios ──
  const scHtml = `
    <div class="pnl-card">
      <div class="pnl-card-h"><h3>Escenarios</h3><span class="pnl-hint">Precio y probabilidad los definís vos — es lo que se discute en la reunión</span></div>
      <div class="pnl-card-b">
        <table class="pnl-tbl">
          <thead><tr>
            <th class="l">Escenario</th><th class="l">Fundamento</th>
            <th>Precio u$s/tn</th><th>Prob.</th><th class="pnl-barcol"></th><th class="pnl-noprint"></th>
          </tr></thead>
          <tbody>
            ${scs.map((s, i) => `
              <tr>
                <td><input class="pnl-in-name" value="${s.n}" oninput="pnlScSet(${i},'n',this.value)"></td>
                <td><input class="pnl-in-name pnl-in-sub" value="${s.f || ''}" oninput="pnlScSet(${i},'f',this.value)"></td>
                <td><input class="pnl-in-num" type="number" value="${s.p}" oninput="pnlScSet(${i},'p',+this.value)"></td>
                <td><input class="pnl-in-num pnl-in-pct" type="number" value="${s.q}" oninput="pnlScSet(${i},'q',+this.value)"></td>
                <td class="pnl-barcol"><div class="pnl-bar"><span style="width:${tot ? (s.q / tot * 100) : 0}%"></span></div></td>
                <td class="pnl-noprint"><button class="pnl-del" onclick="pnlScDel(${i})" title="Quitar">×</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="pnl-sc-foot">
          <button class="pnl-btn-add pnl-noprint" onclick="pnlScAdd()">+ Agregar escenario</button>
          <div class="pnl-sum ${Math.abs(tot - 100) < 0.5 ? 'ok' : 'bad'}">Σ ${tot.toFixed(0)}%${Math.abs(tot - 100) < 0.5 ? '' : ' — se normaliza igual, pero corregilo antes de presentar'}</div>
        </div>
      </div>
    </div>`;

  // ── Tabla de decisión ──
  const row = (label, sub, cell) => `
    <tr><td class="pnl-metric">${label}${sub ? `<small>${sub}</small>` : ''}</td>
    ${alts.map(a => `<td class="${isProp(a) ? 'pnl-hi' : ''}">${cell(a)}</td>`).join('')}</tr>`;

  const decHtml = `
    <div class="pnl-card">
      <div class="pnl-card-h"><h3>Tabla de decisión</h3><span class="pnl-hint">Precio efectivo de venta, ponderado por tus probabilidades</span></div>
      <div class="pnl-card-b">
        <div class="pnl-scroll">
        <table class="pnl-tbl pnl-dec">
          <thead><tr><th class="l">Métrica</th>
            ${alts.map(a => `<th class="${isProp(a) ? 'pnl-hi-h' : ''}" style="color:${a.hex}">${a.name}${isProp(a) ? ' ★' : ''}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${row('Precio esperado', 'ponderado por probabilidad', a => f1(M[a.key].E))}
            ${row('vs. sin cobertura', '', a => a.key === 'sin' ? '—' : dif(M[a.key].E, M.sin.E))}
            ${row('Peor escenario', 'piso del resultado', a => `<span class="${M[a.key].worst < um ? 'pnl-neg' : ''}">${f1(M[a.key].worst)}</span>`)}
            ${row('Mejor escenario', 'techo del resultado', a => f1(M[a.key].best))}
            ${row('Rango', 'cuánta incertidumbre queda', a => f1(M[a.key].range))}
            ${row('Prob. de no cubrir arrendamiento', `precio efectivo &lt; ${um} u$s/tn`, a => `<span class="${M[a.key].pFail > 0 ? 'pnl-neg' : 'pnl-pos'}">${M[a.key].pFail.toFixed(0)}%</span>`)}
            ${row('Costo de prima', 'u$s/tn, desembolso inicial', a => a.base ? '—' : `<span class="${pnlNetCost(a.strat) > 0 ? 'pnl-neg' : 'pnl-pos'}">${pnlNetCost(a.strat).toFixed(1)}</span>`)}
            ${row('Resultado esperado total', `${tn.toLocaleString('es-AR')} tn`, a => 'u$s ' + usd(M[a.key].total))}
          </tbody>
        </table>
        </div>
      </div>
    </div>`;

  // ── Gráfico ──
  const chHtml = `
    <div class="pnl-card">
      <div class="pnl-card-h"><h3>Precio efectivo por escenario</h3></div>
      <div class="pnl-card-b"><div class="pnl-chart"><canvas id="pnl-canvas"></canvas></div></div>
    </div>`;

  // ── Resumen ejecutivo ──
  let execHtml;
  if (prop) {
    const k = 's' + prop.id;
    const cost = pnlNetCost(prop);
    const costoEsperado = M.sin.E - M[k].E;
    const mejoraPiso = M[k].worst - M.sin.worst;
    const sold = pnlHasSoldOption(prop);
    const peorSc = scs.reduce((a, s) => calcPayoff(prop, s.p) < calcPayoff(prop, a.p) ? s : a, scs[0]);
    execHtml = `
      <div class="pnl-card">
        <div class="pnl-card-h"><h3>Resumen ejecutivo</h3><span class="pnl-hint">${prop.name}</span></div>
        <div class="pnl-exec">
          <div class="pnl-cell">
            <div class="pnl-k">Qué hacemos</div>
            <div class="pnl-big pnl-sm">${prop.name}</div>
            <div class="pnl-txt">${prop.legs.map(l =>
              `${l.dir === 'buy' ? 'Compra' : 'Venta'} ${l.type === 'futuro' ? 'Futuro' : l.type.toUpperCase()} ${l.strike.toFixed(0)}${(l.ratio || 1) !== 1 ? ` ×${l.ratio}` : ''}`
            ).join(' · ')}<br>Sobre ${tn.toLocaleString('es-AR')} tn.</div>
          </div>
          <div class="pnl-cell">
            <div class="pnl-k">Qué cuesta</div>
            <div class="pnl-big ${cost > 0 ? 'pnl-neg' : 'pnl-pos'}">u$s ${usd(Math.abs(cost) * tn)}</div>
            <div class="pnl-txt">${cost >= 0
              ? `${cost.toFixed(1)} u$s/tn de prima neta (${(cost / spot * 100).toFixed(1)}% del valor).`
              : `Crédito neto de ${Math.abs(cost).toFixed(1)} u$s/tn.`}
              En precio esperado ${costoEsperado >= 0
                ? `resignamos <strong>${costoEsperado.toFixed(1)}</strong>`
                : `ganamos <strong>${Math.abs(costoEsperado).toFixed(1)}</strong>`} u$s/tn.</div>
          </div>
          <div class="pnl-cell">
            <div class="pnl-k">Riesgo</div>
            <div class="pnl-big">${f1(M[k].worst)}</div>
            <div class="pnl-txt">Precio efectivo en el peor escenario (${peorSc.n}).
              ${sold
                ? 'Hay opciones vendidas: exige margen de garantía y reabre el riesgo por debajo del strike vendido.'
                : 'Sin opciones vendidas: no hay riesgo de cola ni margen adicional.'}
              Queda riesgo de base (MATBA vs. precio de entrega).</div>
          </div>
          <div class="pnl-cell">
            <div class="pnl-k">Beneficio esperado</div>
            <div class="pnl-big ${mejoraPiso >= 0 ? 'pnl-pos' : 'pnl-neg'}">${mejoraPiso >= 0 ? '+' : ''}${mejoraPiso.toFixed(1)}</div>
            <div class="pnl-txt">u$s/tn de mejora en el peor escenario (u$s ${usd(Math.abs(mejoraPiso) * tn)} sobre el volumen).
              La probabilidad de no cubrir el arrendamiento pasa de <strong>${M.sin.pFail.toFixed(0)}%</strong> a <strong>${M[k].pFail.toFixed(0)}%</strong>.</div>
          </div>
        </div>
        <div class="pnl-note">
          <strong>Cómo leerlo.</strong> La cobertura no maximiza el precio esperado: cuesta prima, y por eso el resultado esperado es menor que sin cubrir. Lo que compra es <strong>protección del piso</strong> — recorta el escenario malo y baja la probabilidad de no cubrir el arrendamiento. El número a discutir no es el modelo: son <strong>las probabilidades de la tabla de escenarios</strong>.
        </div>
      </div>`;
  } else {
    execHtml = `<div class="pnl-card"><div class="pnl-card-b"><div class="pnl-empty">Cargá una estrategia en el builder para ver el resumen ejecutivo.</div></div></div>`;
  }

  host.innerHTML = ctxHtml + warnHtml + scHtml + decHtml + chHtml + execHtml;

  // ── Chart ──
  const cv = document.getElementById('pnl-canvas');
  if (cv && typeof Chart !== 'undefined') {
    if (pnlChart) { pnlChart.destroy(); pnlChart = null; }
    pnlChart = new Chart(cv, {
      type: 'bar',
      data: {
        labels: scs.map(s => `${s.n} (${s.q}%)`),
        datasets: alts.map(a => ({
          label: a.name,
          data: M[a.key].vals.map(v => +v.toFixed(1)),
          backgroundColor: a.hex,
          borderRadius: 3
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'Montserrat', size: 11 }, boxWidth: 10, padding: 12 } },
          tooltip: { callbacks: { label: c => ` ${c.dataset.label}: u$s ${c.parsed.y}/tn` } }
        },
        scales: {
          y: {
            beginAtZero: false,
            suggestedMin: Math.min(um, ...alts.map(a => M[a.key].worst)) - 15,
            grid: { color: '#eef0e9' },
            ticks: { font: { family: 'JetBrains Mono', size: 11 }, callback: v => 'u$s ' + v }
          },
          x: { grid: { display: false }, ticks: { font: { family: 'Montserrat', size: 10 } } }
        }
      }
    });
  }
}

// ─── Handlers ───
function pnlSet(field, val) {
  const t = getActiveTab();
  t[field] = val;
  clearTimeout(window._pnlTimer);
  window._pnlTimer = setTimeout(() => { renderPnL(); if (typeof saveState === 'function') saveState(); }, 250);
}
function pnlScSet(i, field, val) {
  const t = getActiveTab();
  t.pnlScenarios[i][field] = val;
  clearTimeout(window._pnlTimer);
  window._pnlTimer = setTimeout(() => { renderPnL(); if (typeof saveState === 'function') saveState(); }, 250);
}
function pnlScAdd() {
  const t = getActiveTab();
  t.pnlScenarios.push({ n: 'Nuevo escenario', f: '—', p: Math.round(t.spot), q: 0 });
  renderPnL();
}
function pnlScDel(i) {
  const t = getActiveTab();
  if (t.pnlScenarios.length <= 2) return;
  t.pnlScenarios.splice(i, 1);
  renderPnL();
}
function pnlResetSc() {
  const t = getActiveTab();
  t.pnlScenarios = pnlScFromSpot(t.spot);
  t.pnlUmbral = Math.round(t.spot * 0.95);
  renderPnL();
  if (typeof saveState === 'function') saveState();
}
function pnlToggle() {
  const t = getActiveTab();
  t.pnlOpen = !t.pnlOpen;
  document.getElementById('pnl-body').style.display = t.pnlOpen ? '' : 'none';
  document.getElementById('pnl-caret').textContent = t.pnlOpen ? '▾' : '▸';
  if (t.pnlOpen) renderPnL();
  if (typeof saveState === 'function') saveState();
}

// ─── Impresión ejecutiva ───
function pnlPrint() {
  document.body.classList.add('pnl-print');
  window.print();
}
window.addEventListener('afterprint', () => document.body.classList.remove('pnl-print'));
// Corre después del beforeprint del index: solo pisa el título.
window.addEventListener('beforeprint', () => {
  if (!document.body.classList.contains('pnl-print')) return;
  try {
    const t = getActiveTab();
    const el = document.getElementById('print-title');
    if (el) el.textContent = 'P&L Esperado — ' + ((t && t.name) ? t.name : 'Cobertura');
  } catch (e) {}
});

// ─── Montaje ───
function pnlMount() {
  if (document.getElementById('pnl-section')) return;

  const style = document.createElement('style');
  style.textContent = `
  #pnl-section{margin-top:30px;border-top:3px solid var(--es-green);padding-top:24px}
  .pnl-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}
  .pnl-head-l{display:flex;align-items:center;gap:12px;cursor:pointer}
  .pnl-head h2{font-size:18px;font-weight:700;letter-spacing:-.2px;color:var(--text);margin:0}
  .pnl-head .pnl-sub{font-size:11.5px;color:var(--text-3);font-weight:400;margin-top:2px}
  .pnl-print-btn{background:var(--es-green);color:#fff;border:0;border-radius:8px;padding:9px 16px;font-family:var(--font);font-size:12px;font-weight:600;cursor:pointer}
  .pnl-print-btn:hover{background:var(--es-green-dark)}
  .pnl-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);margin-bottom:14px;overflow:hidden}
  .pnl-card-h{padding:11px 16px;border-bottom:1px solid var(--border);display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .pnl-card-h h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text);margin:0}
  .pnl-hint{font-size:11px;color:var(--text-3)}
  .pnl-card-b{padding:16px}
  .pnl-ctx{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px}
  .pnl-field{display:flex;flex-direction:column;gap:4px}
  .pnl-field label{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3);font-weight:600}
  .pnl-field input,.pnl-field select{background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-family:var(--mono);font-size:13px;font-weight:600;color:var(--text);min-width:140px}
  .pnl-field select{font-family:var(--font)}
  .pnl-field input:focus,.pnl-field select:focus{outline:2px solid var(--es-green);outline-offset:-1px}
  .pnl-btn-ghost{background:transparent;border:1px solid var(--border-2);border-radius:6px;padding:8px 12px;font-family:var(--font);font-size:11.5px;font-weight:600;color:var(--text-2);cursor:pointer}
  .pnl-btn-ghost:hover{border-color:var(--es-green);color:var(--es-green)}
  .pnl-warn{background:var(--es-gold-light);border-left:3px solid var(--es-gold);border-radius:0 8px 8px 0;padding:10px 14px;font-size:11.5px;color:var(--text-2);margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .pnl-scroll{overflow-x:auto}
  .pnl-tbl{width:100%;border-collapse:collapse}
  .pnl-tbl th{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3);font-weight:700;text-align:right;padding:8px 10px;border-bottom:1px solid var(--border);white-space:nowrap}
  .pnl-tbl th.l{text-align:left}
  .pnl-tbl td{padding:6px 10px;border-bottom:1px solid #eef0e9;font-family:var(--mono);font-size:12.5px;text-align:right;white-space:nowrap}
  .pnl-tbl td:first-child{text-align:left}
  .pnl-tbl tbody tr:last-child td{border-bottom:0}
  .pnl-in-name{background:transparent;border:1px solid transparent;border-radius:5px;padding:5px 7px;font-family:var(--font);font-size:12.5px;font-weight:600;color:var(--text);width:100%;min-width:120px}
  .pnl-in-name:hover{border-color:var(--border)}
  .pnl-in-name:focus{outline:0;border-color:var(--es-green);background:var(--bg-input)}
  .pnl-in-sub{font-weight:400;color:var(--text-3);font-size:11.5px}
  .pnl-in-num{background:var(--bg-input);border:1px solid var(--border);border-radius:5px;padding:5px 7px;font-family:var(--mono);font-size:12.5px;font-weight:600;text-align:right;width:80px;color:var(--text)}
  .pnl-in-pct{width:64px}
  .pnl-in-num:focus{outline:2px solid var(--es-green);outline-offset:-1px}
  .pnl-barcol{width:110px}
  .pnl-bar{height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden}
  .pnl-bar span{display:block;height:100%;background:var(--es-gold);border-radius:3px}
  .pnl-del{background:transparent;border:0;color:var(--text-3);cursor:pointer;font-size:16px;line-height:1;padding:2px 6px;border-radius:4px}
  .pnl-del:hover{color:var(--red);background:#fdeaea}
  .pnl-sc-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);flex-wrap:wrap}
  .pnl-btn-add{background:var(--es-green-light);color:var(--es-green-dark);border:1px solid #c3e2ce;border-radius:6px;padding:7px 13px;font-family:var(--font);font-size:11.5px;font-weight:600;cursor:pointer}
  .pnl-sum{font-family:var(--mono);font-size:11.5px;font-weight:700;padding:5px 11px;border-radius:6px}
  .pnl-sum.ok{background:var(--es-green-light);color:var(--es-green-dark)}
  .pnl-sum.bad{background:#fdeaea;color:var(--red)}
  .pnl-dec td.pnl-metric{font-family:var(--font);font-size:12.5px;font-weight:600;color:var(--text-2);white-space:normal;min-width:190px}
  .pnl-dec td.pnl-metric small{display:block;font-weight:400;font-size:10.5px;color:var(--text-3);margin-top:1px}
  .pnl-dec td.pnl-hi{background:var(--es-green-light);font-weight:700}
  .pnl-dec th.pnl-hi-h{border-bottom:2px solid var(--es-green)}
  .pnl-pos{color:var(--green)}
  .pnl-neg{color:var(--red)}
  .pnl-chart{height:290px;position:relative}
  .pnl-exec{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--border)}
  .pnl-cell{background:var(--bg-card);padding:16px}
  .pnl-k{font-size:10px;text-transform:uppercase;letter-spacing:.7px;font-weight:700;color:var(--es-gold);margin-bottom:8px}
  .pnl-big{font-family:var(--mono);font-size:22px;font-weight:700;letter-spacing:-.5px;margin-bottom:5px;color:var(--text)}
  .pnl-big.pnl-sm{font-family:var(--font);font-size:14px}
  .pnl-txt{font-size:11.5px;color:var(--text-2);line-height:1.45}
  .pnl-note{background:var(--es-gold-light);border-left:3px solid var(--es-gold);margin:16px;border-radius:0 8px 8px 0;padding:11px 14px;font-size:11.5px;color:var(--text-2);line-height:1.5}
  .pnl-empty{text-align:center;color:var(--text-3);font-size:12.5px;padding:24px}
  @media(max-width:900px){.pnl-exec{grid-template-columns:1fr 1fr}.pnl-barcol{display:none}}
  @media(max-width:560px){.pnl-exec{grid-template-columns:1fr}}

  /* ─── IMPRESIÓN ───
     Ctrl+P normal  → one-pager del builder (styles.css). Esta sección se oculta.
     Botón exportar → body.pnl-print: solo esta sección. */
  @media print {
    #pnl-section{display:none !important}

    body.pnl-print #pnl-section{display:block !important;border-top:0 !important;padding-top:0 !important;margin-top:0 !important}
    body.pnl-print #workspace{display:block !important}
    body.pnl-print #workspace > *:not(#pnl-section){display:none !important}
    body.pnl-print #asst-panel,
    body.pnl-print .pnl-noprint,
    body.pnl-print .pnl-print-btn,
    body.pnl-print .pnl-warn,
    body.pnl-print .pnl-sc-foot{display:none !important}
    body.pnl-print #pnl-section .pnl-head{margin-bottom:8px}
    body.pnl-print #pnl-section .pnl-head h2{font-size:13px}
    body.pnl-print #pnl-caret{display:none}
    body.pnl-print .pnl-card{break-inside:avoid;page-break-inside:avoid;box-shadow:none !important;border:1px solid #e0e2d8 !important;margin-bottom:8px}
    body.pnl-print .pnl-card-b{padding:9px}
    body.pnl-print .pnl-chart{height:150px !important}
    body.pnl-print .pnl-in-name,
    body.pnl-print .pnl-in-num{-webkit-appearance:none !important;appearance:none !important;border:0 !important;background:transparent !important;pointer-events:none;padding:0 2px !important}
    body.pnl-print .pnl-tbl td,
    body.pnl-print .pnl-tbl th{padding:4px 7px;font-size:9.5px}
    body.pnl-print .pnl-cell{padding:9px}
    body.pnl-print .pnl-big{font-size:15px}
    body.pnl-print .pnl-txt,
    body.pnl-print .pnl-note{font-size:9px;line-height:1.35}
    body.pnl-print .pnl-note{margin:9px}
  }`;
  document.head.appendChild(style);

  const sec = document.createElement('section');
  sec.id = 'pnl-section';
  sec.innerHTML = `
    <div class="pnl-head">
      <div class="pnl-head-l" onclick="pnlToggle()">
        <span id="pnl-caret" style="font-size:14px;color:var(--text-3)">▾</span>
        <div>
          <h2>P&L Esperado — Vista Ejecutiva</h2>
          <div class="pnl-sub">Resultado de la estrategia bajo escenarios propios de precio</div>
        </div>
      </div>
      <button class="pnl-print-btn" onclick="pnlPrint()">Exportar one-pager ejecutivo</button>
    </div>
    <div id="pnl-body"></div>`;

  // Va inmediatamente después de la Calculadora de Resultado
  const anchor = document.getElementById('calc-section');
  if (anchor && anchor.parentElement) anchor.parentElement.insertBefore(sec, anchor.nextSibling);
  else (document.getElementById('workspace') || document.body).appendChild(sec);
}

// ─── Hook sobre renderAll (sin tocar app.js) ───
(function () {
  const orig = window.renderAll;
  if (typeof orig !== 'function') {
    console.warn('[pnl.js] renderAll no encontrado — cargá pnl.js DESPUÉS de app.js');
    return;
  }
  window.renderAll = function () {
    orig.apply(this, arguments);
    try {
      pnlMount();
      const sec = document.getElementById('pnl-section');
      if (!sec) return;
      const off = (typeof theoryMode !== 'undefined' && theoryMode)
        || (typeof retMode !== 'undefined' && retMode)
        || (typeof paseMode !== 'undefined' && paseMode);
      sec.style.display = off ? 'none' : '';
      if (off) return;
      const t = getActiveTab();
      const body = document.getElementById('pnl-body');
      if (t && t.pnlOpen === false) {
        body.style.display = 'none';
        document.getElementById('pnl-caret').textContent = '▸';
        return;
      }
      body.style.display = '';
      document.getElementById('pnl-caret').textContent = '▾';
      renderPnL();
    } catch (e) {
      console.error('[pnl.js]', e);
    }
  };
})();
