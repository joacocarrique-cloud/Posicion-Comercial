// ═══════════════════════════════════════════════════
// ─── P&L / PRESUPUESTO Y DESARME DE OPCIONES ───
// Módulo propio (pill nueva). Solo PATA FINANCIERA.
//
// Responde tres preguntas:
//   1. ¿Cuánta plata pongo hoy?              → Presupuesto
//   2. ¿Cuánto vale mañana según precio/fecha? → Matriz precio × fecha
//   3. ¿Cuándo y a qué precio desarmo?         → Disparadores
//
// Motor: reusa asstB76 / asstIV / asstExpiry / asstDays de asistente.js
// La VI de cada pata se DESPEJA de la prima cargada (asstIV), así que
// la estructura vale exactamente lo pagado a día 0. El P&L arranca en cero.
//
// NO modifica coberturas.js, app.js, globals.js ni styles.css.
// ═══════════════════════════════════════════════════

let pnlMode = false;
const PNL_R = 0.05;

// ─── Estado por tab ───
function pnlState(t) {
  if (t.pnlVol == null) t.pnlVol = 10000;      // toneladas
  if (t.pnlShock == null) t.pnlShock = 0;      // shock de VI en pp
  if (t.pnlView == null) t.pnlView = 'pnl';    // valor | pnl | mult
  if (t.pnlStratId == null || !t.strategies.some(s => s.id === t.pnlStratId)) {
    t.pnlStratId = t.strategies.length ? t.strategies[0].id : null;
  }
  if (t.pnlObjMult == null) t.pnlObjMult = 2;  // objetivo de desarme (x prima)
  return t;
}

// ─── Posición / vencimiento ───
function pnlPos(t) {
  return t.pnlPos || marketPosition || (ASST_POS[t.assetVal] || [])[0] || null;
}
function pnlExpiry(t) {
  const p = pnlPos(t);
  return p ? asstExpiry(p) : null;
}

// ─── Motor ───
// Despeja la VI de cada pata desde la prima cargada (a día de hoy).
function pnlBuildLegs(strat, F0, T0) {
  return strat.legs.map(l => {
    const sign = l.dir === 'buy' ? 1 : -1;
    const ratio = l.ratio || 1;
    if (l.type === 'futuro') {
      return { ...l, sign, ratio, vi: null, fut: true, prima: 0 };
    }
    const vi = (T0 > 0) ? asstIV(l.prima, F0, l.strike, T0, PNL_R, l.type) : NaN;
    return { ...l, sign, ratio, vi: isNaN(vi) ? null : vi, fut: false };
  });
}

// Prima neta pagada, u$s/tn. Positivo = débito (sale plata).
function pnlPremium(legs) {
  return legs.reduce((a, l) => a + (l.fut ? 0 : l.sign * l.ratio * l.prima), 0);
}

// Valor de la estructura a un precio F y un T remanente, con shock de VI (pp).
function pnlValue(legs, F, T, shockPP) {
  return legs.reduce((a, l) => {
    if (l.fut) {
      // Mark-to-market del futuro: comprado gana si sube; vendido gana si baja.
      const mtm = (l.dir === 'buy' ? (F - l.strike) : (l.strike - F));
      return a + mtm * l.ratio;
    }
    if (l.vi == null) return a;
    const sig = Math.max(0.001, l.vi + (shockPP || 0) / 100);
    return a + l.sign * l.ratio * asstB76(F, l.strike, Math.max(T, 0), PNL_R, sig, l.type);
  }, 0);
}

// Pérdida máxima empírica (barrido amplio a vencimiento).
function pnlMaxLoss(legs, F0) {
  const prem = pnlPremium(legs);
  let worst = Infinity;
  for (let F = F0 * 0.3; F <= F0 * 2; F += F0 * 0.01) {
    worst = Math.min(worst, pnlValue(legs, F, 0, 0) - prem);
  }
  return worst;
}

// Precio del futuro necesario para alcanzar un valor objetivo, en un T dado.
// Barrido + interpolación. Devuelve null si es inalcanzable en el rango.
function pnlSolveF(legs, targetVal, T, F0, shock) {
  const lo = F0 * 0.5, hi = F0 * 1.6, step = (hi - lo) / 400;
  let prev = null;
  for (let F = lo; F <= hi; F += step) {
    const v = pnlValue(legs, F, T, shock);
    if (prev && ((prev.v < targetVal && v >= targetVal) || (prev.v > targetVal && v <= targetVal))) {
      const k = (targetVal - prev.v) / (v - prev.v);
      return prev.F + k * (F - prev.F);
    }
    prev = { F, v };
  }
  return null;
}

// ─── Render ───
function renderPnLModule() {
  const host = document.getElementById('pnl-content');
  if (!host) return;
  const t = getActiveTab();
  if (!t) return;
  pnlState(t);

  const strat = t.strategies.find(s => s.id === t.pnlStratId);
  if (!strat) {
    host.innerHTML = `<div class="pnl-card"><div class="pnl-cb"><div class="pnl-empty">Cargá una estrategia en el módulo de Coberturas.</div></div></div>`;
    return;
  }

  const exp = pnlExpiry(t);
  const pos = pnlPos(t);
  if (!exp) {
    host.innerHTML = `<div class="pnl-card"><div class="pnl-cb"><div class="pnl-empty">No se pudo determinar el vencimiento de la posición. Elegí una posición de mercado en el módulo de Coberturas.</div></div></div>`;
    return;
  }

  const F0 = t.spot;
  const D = asstDays(new Date(), exp);          // días calendario al vencimiento
  const T0 = D / 365;
  const vol = +t.pnlVol || 0;
  const shock = +t.pnlShock || 0;

  const legs = pnlBuildLegs(strat, F0, T0);
  const prem = pnlPremium(legs);                // u$s/tn, + = débito
  const premTotal = prem * vol;
  const badVI = legs.some(l => !l.fut && l.vi == null);

  const f1 = v => v.toFixed(1);
  const f2 = v => v.toFixed(2);
  const usd = v => {
    const a = Math.abs(v);
    const s = v < 0 ? '-' : '';
    return a >= 1e6 ? `${s}u$s ${(a / 1e6).toFixed(2)}M` : `${s}u$s ${Math.round(a / 1e3)}k`;
  };

  // ─── Selector / contexto ───
  const bar = `
    <div class="pnl-bar">
      <div class="pnl-f"><label>Estrategia</label>
        <select onchange="pnlSet('pnlStratId', +this.value)">
          ${t.strategies.map(s => `<option value="${s.id}" ${s.id === t.pnlStratId ? 'selected' : ''}>${s.name}</option>`).join('')}
        </select></div>
      <div class="pnl-f"><label>Posición</label>
        <select onchange="pnlSet('pnlPos', this.value)">
          ${(ASST_POS[t.assetVal] || [pos]).map(p => `<option value="${p}" ${p === pos ? 'selected' : ''}>${p}</option>`).join('')}
        </select></div>
      <div class="pnl-f"><label>Volumen (tn)</label>
        <input type="number" value="${vol}" oninput="pnlSet('pnlVol', +this.value)"></div>
      <div class="pnl-f pnl-ro"><label>Futuro hoy</label><div class="pnl-rov">${f1(F0)}</div></div>
      <div class="pnl-f pnl-ro"><label>Vencimiento</label><div class="pnl-rov">${exp.getDate().toString().padStart(2, '0')}/${ASST_MNAMES[exp.getMonth() + 1]}/${exp.getFullYear()}</div></div>
      <div class="pnl-f pnl-ro"><label>Días</label><div class="pnl-rov">${D}d</div></div>
    </div>`;

  const warn = badVI
    ? `<div class="pnl-warn">Alguna pata no permite despejar la volatilidad implícita desde su prima (prima incoherente con el strike o el vencimiento). Revisá las primas en Coberturas — esas patas se están ignorando en la valuación.</div>` : '';

  // ─── 1. PRESUPUESTO ───
  const maxLoss = pnlMaxLoss(legs, F0);
  const sold = legs.filter(l => !l.fut && l.sign === -1);
  const viRows = legs.filter(l => !l.fut).map(l => `
    <tr>
      <td>${l.dir === 'buy' ? 'Compra' : 'Venta'} ${l.type.toUpperCase()} ${l.strike}${l.ratio !== 1 ? ` ×${l.ratio}` : ''}</td>
      <td>${f2(l.prima)}</td>
      <td>${l.vi == null ? '<span class="pnl-neg">—</span>' : (l.vi * 100).toFixed(1) + '%'}</td>
      <td>${((l.strike / F0 - 1) * 100).toFixed(1)}%</td>
      <td class="${l.sign * l.ratio * l.prima >= 0 ? 'pnl-neg' : 'pnl-pos'}">${(l.sign * l.ratio * l.prima >= 0 ? '-' : '+')}${usd(Math.abs(l.sign * l.ratio * l.prima) * vol)}</td>
    </tr>`).join('');

  const budget = `
    <div class="pnl-card">
      <div class="pnl-ch"><h3>1 · Presupuesto</h3><span class="pnl-hint">Plata que sale hoy</span></div>
      <div class="pnl-cb">
        <div class="pnl-kpis">
          <div class="pnl-kpi">
            <div class="pnl-kl">Desembolso</div>
            <div class="pnl-kv ${prem >= 0 ? 'pnl-neg' : 'pnl-pos'}">${prem >= 0 ? '-' : '+'}${usd(Math.abs(premTotal))}</div>
            <div class="pnl-ks">${f2(Math.abs(prem))} u$s/tn · ${(Math.abs(prem) / F0 * 100).toFixed(2)}% del valor</div>
          </div>
          <div class="pnl-kpi">
            <div class="pnl-kl">Pérdida máxima</div>
            <div class="pnl-kv pnl-neg">${usd(maxLoss)}</div>
            <div class="pnl-ks">${f2(maxLoss / (vol || 1))} u$s/tn ${sold.length ? '· hay patas vendidas' : '· limitada a la prima'}</div>
          </div>
          <div class="pnl-kpi">
            <div class="pnl-kl">Margen de garantía</div>
            <div class="pnl-kv">${sold.length ? 'Sí' : 'No'}</div>
            <div class="pnl-ks">${sold.length
              ? `${sold.length} pata(s) vendida(s) — inmoviliza capital. Consultar a MATBA.`
              : 'Sin patas vendidas. No inmoviliza capital.'}</div>
          </div>
        </div>
        <table class="pnl-t pnl-t-vi">
          <thead><tr><th class="l">Pata</th><th>Prima</th><th>VI implícita</th><th>Moneyness</th><th>Flujo</th></tr></thead>
          <tbody>${viRows}</tbody>
        </table>
        <div class="pnl-foot">La VI no se carga: se despeja de la prima que pusiste (Black-76 invertido). Por eso la estructura vale exactamente lo pagado a día 0 y el P&L arranca en cero.</div>
      </div>
    </div>`;

  // ─── 2. MATRIZ PRECIO × FECHA ───
  const fracs = [0, 0.25, 0.5, 0.75, 1];
  const cols = fracs.map(fr => {
    const dRem = Math.round(D * (1 - fr));
    const dt = new Date();
    dt.setDate(dt.getDate() + Math.round(D * fr));
    return {
      dRem,
      T: dRem / 365,
      label: fr === 0 ? 'Hoy' : (fr === 1 ? 'Vto.' : `${dt.getDate().toString().padStart(2, '0')}/${ASST_MNAMES[dt.getMonth() + 1]}`),
      sub: `${dRem}d`
    };
  });

  const prices = [];
  for (let i = -5; i <= 5; i++) prices.push(Math.round(F0 * (1 + i * 0.04)));
  prices.reverse();

  const view = t.pnlView;
  const cell = (F, c) => {
    const v = pnlValue(legs, F, c.T, shock);
    const pl = (v - prem) * vol;
    if (view === 'valor') return { txt: f1(v), pl };
    if (view === 'mult') {
      if (prem <= 0.01) return { txt: '—', pl };
      return { txt: (v / prem).toFixed(2) + 'x', pl };
    }
    return { txt: usd(pl), pl };
  };
  const maxAbs = Math.max(...prices.flatMap(F => cols.map(c => Math.abs((pnlValue(legs, F, c.T, shock) - prem) * vol))), 1);
  const bg = pl => {
    const a = Math.min(Math.abs(pl) / maxAbs, 1) * 0.5;
    return pl >= 0 ? `rgba(26,107,60,${a.toFixed(2)})` : `rgba(196,48,48,${a.toFixed(2)})`;
  };

  const matrix = `
    <div class="pnl-card">
      <div class="pnl-ch"><h3>2 · Matriz precio × fecha</h3><span class="pnl-hint">Cuánto vale la posición si desarmás ese día a ese precio</span>
        <div class="pnl-seg">
          ${[['pnl', 'P&L u$s'], ['valor', 'Valor u$s/tn'], ['mult', 'Múltiplo']].map(([k, lb]) =>
            `<button class="${view === k ? 'on' : ''}" onclick="pnlSet('pnlView','${k}')">${lb}</button>`).join('')}
        </div>
      </div>
      <div class="pnl-cb">
        <div class="pnl-shock">
          <label>Shock de volatilidad: <strong class="${shock > 0 ? 'pnl-pos' : shock < 0 ? 'pnl-neg' : ''}">${shock > 0 ? '+' : ''}${shock} pp</strong></label>
          <input type="range" min="-10" max="10" step="1" value="${shock}" oninput="pnlSet('pnlShock', +this.value)">
          <span class="pnl-hint">En granos, cuando el precio se derrumba la VI sube. Movelo para ver la sensibilidad.</span>
        </div>
        <div class="pnl-scroll">
          <table class="pnl-t pnl-mtx">
            <thead><tr><th class="l">Futuro</th>
              ${cols.map(c => `<th>${c.label}<small>${c.sub}</small></th>`).join('')}
            </tr></thead>
            <tbody>
              ${prices.map(F => `
                <tr class="${Math.abs(F - F0) < F0 * 0.02 ? 'pnl-spot' : ''}">
                  <td class="pnl-px">${F}<small>${((F / F0 - 1) * 100).toFixed(0)}%</small></td>
                  ${cols.map(c => { const x = cell(F, c); return `<td style="background:${bg(x.pl)}">${x.txt}</td>`; }).join('')}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="pnl-foot">Fila resaltada = futuro actual. Supuesto: la VI se mantiene salvo el shock que apliques. El paso del tiempo (theta) ya está incorporado en cada columna.</div>
      </div>
    </div>`;

  // ─── 3. DESARME ───
  const objMult = +t.pnlObjMult || 2;
  const canMult = prem > 0.01;
  const objVal = canMult ? prem * objMult : null;
  const beVal = prem; // recuperar la prima = P&L cero

  const trigRow = (label, targetVal, cls) => {
    if (targetVal == null) return '';
    return `<tr class="${cls || ''}">
      <td class="l">${label}</td>
      ${cols.map(c => {
        const F = pnlSolveF(legs, targetVal, c.T, F0, shock);
        if (F == null) return `<td class="pnl-na">n/a</td>`;
        const mv = (F / F0 - 1) * 100;
        return `<td>${Math.round(F)}<small>${mv >= 0 ? '+' : ''}${mv.toFixed(0)}%</small></td>`;
      }).join('')}
    </tr>`;
  };

  const unwind = `
    <div class="pnl-card">
      <div class="pnl-ch"><h3>3 · Disparadores de desarme</h3><span class="pnl-hint">A qué precio tiene que estar el futuro, en cada fecha, para cerrar la posición</span></div>
      <div class="pnl-cb">
        <div class="pnl-bar" style="margin-bottom:14px">
          <div class="pnl-f"><label>Objetivo de ganancia (× prima)</label>
            <input type="number" step="0.25" min="0.25" value="${objMult}" oninput="pnlSet('pnlObjMult', +this.value)"></div>
          <div class="pnl-f pnl-ro"><label>Eso equivale a</label>
            <div class="pnl-rov">${canMult ? `${f2(objVal)} u$s/tn · ${usd((objVal - prem) * vol)} de ganancia` : 'no aplica (la estructura es crédito neto)'}</div></div>
        </div>
        <div class="pnl-scroll">
          <table class="pnl-t pnl-mtx pnl-trig">
            <thead><tr><th class="l">Disparador</th>${cols.map(c => `<th>${c.label}<small>${c.sub}</small></th>`).join('')}</tr></thead>
            <tbody>
              ${canMult ? trigRow(`Objetivo ${objMult}x — tomar ganancia`, objVal, 'pnl-tp') : ''}
              ${canMult ? trigRow('Recupero de la prima (P&L = 0)', beVal, '') : ''}
              ${canMult ? trigRow('Mitad de la prima perdida (0.5x)', prem * 0.5, 'pnl-sl') : ''}
            </tbody>
          </table>
        </div>
        <div class="pnl-foot">
          Cada celda es el precio del futuro que hace que la estructura valga el objetivo <em>en esa fecha</em>. Se lee en horizontal: cuanto más te acercás al vencimiento, más lejos tiene que ir el precio para el mismo objetivo — eso es el valor tiempo evaporándose.
          <strong>n/a</strong> = inalcanzable en un rango de ±50% del futuro actual.
        </div>
      </div>
    </div>`;

  host.innerHTML = bar + warn + budget + matrix + unwind;
}

// ─── Handlers ───
function pnlSet(k, v) {
  const t = getActiveTab();
  t[k] = v;
  clearTimeout(window._pnlT);
  window._pnlT = setTimeout(() => {
    renderPnLModule();
    if (typeof saveState === 'function') saveState();
  }, 200);
}

// ─── Navegación entre módulos ───
function togglePnL() {
  pnlMode = true;
  theoryMode = false; retMode = false; paseMode = false; asstMode = false; spreadMode = false;
  if (typeof desvioMode !== 'undefined') desvioMode = false;
  ['workspace', 'theory-space', 'ret-space', 'pase-space', 'spreads-space', 'desvio-space', 'alertas-space']
    .forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
  const sp = document.getElementById('pnl-space');
  if (sp) sp.style.display = 'block';
  const mkt = document.getElementById('mkt-bar'); if (mkt) mkt.style.display = 'flex';
  const fob = document.getElementById('fob-bar'); if (fob) fob.style.display = 'none';
  const tc = document.getElementById('tabs-container'); if (tc) tc.style.display = 'flex';
  const bp = document.getElementById('btn-update-primas'); if (bp) bp.style.display = 'none';
  renderTabs();
  renderModules();
  renderPnLModule();
}

// ─── Enganches (sin tocar coberturas.js) ───
(function () {
  // Cualquier otro módulo apaga el nuestro.
  ['switchToWorkspace', 'switchTab', 'toggleTheory', 'toggleRetenciones', 'togglePases',
   'toggleSpreads', 'toggleDesvio', 'toggleAlertas'].forEach(fn => {
    const orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function () {
      pnlMode = false;
      const sp = document.getElementById('pnl-space');
      if (sp) sp.style.display = 'none';
      return orig.apply(this, arguments);
    };
  });

  // Pill activa. La pill de P&L es el índice 6 (antes de "Manual").
  const origRM = window.renderModules;
  if (typeof origRM === 'function') {
    window.renderModules = function () {
      origRM.apply(this, arguments);
      if (!pnlMode) return;
      const pills = document.querySelectorAll('.mod-pill');
      pills.forEach(p => p.classList.remove('active'));
      if (pills[6]) pills[6].classList.add('active');
    };
  }

  // Si cambian primas/spot en Coberturas y estamos en P&L, refrescar.
  const origRA = window.renderAll;
  if (typeof origRA === 'function') {
    window.renderAll = function () {
      const r = origRA.apply(this, arguments);
      if (pnlMode) { try { renderPnLModule(); } catch (e) { console.error('[pnl.js]', e); } }
      return r;
    };
  } else {
    console.warn('[pnl.js] renderAll no encontrado — cargá pnl.js DESPUÉS de app.js');
  }
})();

// ─── Estilos ───
(function () {
  const st = document.createElement('style');
  st.textContent = `
  #pnl-space{display:none}
  .pnl-h{display:flex;align-items:center;gap:12px;margin-bottom:18px}
  .pnl-h h2{font-size:18px;font-weight:700;color:var(--text);margin:0}
  .pnl-h .s{font-size:12px;color:var(--text-2)}
  .pnl-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);margin-bottom:16px;overflow:hidden}
  .pnl-ch{padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .pnl-ch h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text);margin:0}
  .pnl-hint{font-size:11px;color:var(--text-3);font-weight:400}
  .pnl-cb{padding:16px}
  .pnl-bar{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px}
  .pnl-f{display:flex;flex-direction:column;gap:4px}
  .pnl-f label{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3);font-weight:600}
  .pnl-f input,.pnl-f select{background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-family:var(--mono);font-size:13px;font-weight:600;color:var(--text);min-width:130px}
  .pnl-f select{font-family:var(--font)}
  .pnl-f input:focus,.pnl-f select:focus{outline:2px solid var(--es-green);outline-offset:-1px}
  .pnl-ro .pnl-rov{padding:8px 10px;font-family:var(--mono);font-size:13px;font-weight:600;color:var(--text-2)}
  .pnl-warn{background:#fdf6e3;border-left:3px solid var(--es-gold);border-radius:0 8px 8px 0;padding:10px 14px;font-size:11.5px;color:var(--text-2);margin-bottom:16px}
  .pnl-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}
  .pnl-kpi{background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:13px}
  .pnl-kl{font-size:10px;text-transform:uppercase;letter-spacing:.6px;font-weight:700;color:var(--es-gold);margin-bottom:6px}
  .pnl-kv{font-family:var(--mono);font-size:21px;font-weight:700;letter-spacing:-.5px;color:var(--text)}
  .pnl-ks{font-size:10.5px;color:var(--text-3);margin-top:4px;line-height:1.4}
  .pnl-scroll{overflow-x:auto}
  .pnl-t{width:100%;border-collapse:collapse}
  .pnl-t th{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3);font-weight:700;text-align:right;padding:7px 9px;border-bottom:1px solid var(--border);white-space:nowrap}
  .pnl-t th.l{text-align:left}
  .pnl-t th small{display:block;font-weight:400;font-size:9px;text-transform:none;letter-spacing:0;color:var(--text-3);margin-top:1px}
  .pnl-t td{padding:7px 9px;border-bottom:1px solid #eef0e9;font-family:var(--mono);font-size:12.5px;text-align:right;white-space:nowrap}
  .pnl-t td.l,.pnl-t td:first-child{text-align:left}
  .pnl-t tbody tr:last-child td{border-bottom:0}
  .pnl-t-vi td:first-child{font-family:var(--font);font-weight:600;font-size:12px}
  .pnl-mtx td{text-align:center;font-weight:600;border:1px solid #fff}
  .pnl-mtx td.pnl-px{text-align:left;background:var(--bg-input);font-weight:700}
  .pnl-mtx td small{display:block;font-size:9px;font-weight:400;color:var(--text-3);margin-top:1px}
  .pnl-mtx tr.pnl-spot td.pnl-px{background:var(--es-green);color:#fff}
  .pnl-mtx tr.pnl-spot td.pnl-px small{color:rgba(255,255,255,.75)}
  .pnl-trig td{background:var(--bg-input) !important}
  .pnl-trig td.l{font-family:var(--font);font-weight:600;font-size:12px}
  .pnl-trig tr.pnl-tp td{background:#e8f5ec !important}
  .pnl-trig tr.pnl-sl td{background:#fdeaea !important}
  .pnl-trig td.pnl-na{color:var(--text-3);font-weight:400}
  .pnl-seg{margin-left:auto;display:flex;gap:2px;background:var(--bg-input);border:1px solid var(--border);border-radius:7px;padding:2px}
  .pnl-seg button{background:transparent;border:0;border-radius:5px;padding:5px 11px;font-family:var(--font);font-size:11px;font-weight:600;color:var(--text-3);cursor:pointer}
  .pnl-seg button.on{background:var(--es-green);color:#fff}
  .pnl-shock{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;padding:10px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px}
  .pnl-shock label{font-size:11.5px;color:var(--text-2);white-space:nowrap}
  .pnl-shock input[type=range]{flex:0 0 200px;accent-color:var(--es-green)}
  .pnl-foot{margin-top:12px;padding-top:11px;border-top:1px solid var(--border);font-size:11px;color:var(--text-3);line-height:1.5}
  .pnl-pos{color:var(--green)}
  .pnl-neg{color:var(--red)}
  .pnl-empty{text-align:center;color:var(--text-3);font-size:12.5px;padding:26px}
  @media(max-width:820px){.pnl-kpis{grid-template-columns:1fr}}
  @media print{#pnl-space{display:none !important}
    body.pnl-only #pnl-space{display:block !important}
    body.pnl-only #workspace,body.pnl-only .tabs-bar,body.pnl-only #fob-bar{display:none !important}
    body.pnl-only .pnl-card{break-inside:avoid;box-shadow:none;border:1px solid #e0e2d8}
  }`;
  document.head.appendChild(st);
})();
