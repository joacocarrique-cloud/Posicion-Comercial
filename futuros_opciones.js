// ═══════════════════════════════════════════════════
//  FUTUROS Y OPCIONES — Módulo Suite Comercial
//  Lee posiciones desde Google Sheets publicado CSV
// ═══════════════════════════════════════════════════

let futOpcMode = false;

const FO_CSV_FUTUROS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT3LOgza96wdBgNl_DQZO_TtX6cEawcaxmn_t-VqkH0MqXFmA0ARBBVr_6TIdNIZC4lBA6PukLNrKLf/pub?gid=1438761450&single=true&output=csv';
const FO_CSV_OPCIONES = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT3LOgza96wdBgNl_DQZO_TtX6cEawcaxmn_t-VqkH0MqXFmA0ARBBVr_6TIdNIZC4lBA6PukLNrKLf/pub?gid=1320303829&single=true&output=csv';

let foRawFuturos = [];
let foRawOpciones = [];
let foLoaded = false;

// ─── Toggle ───
function toggleFutOpc() {
  futOpcMode = true;
  theoryMode = false; retMode = false; paseMode = false; asstMode = false; spreadMode = false;
  if (typeof desvioMode !== 'undefined') desvioMode = false;

  document.getElementById('workspace').style.display = 'none';
  document.getElementById('theory-space').style.display = 'none';
  document.getElementById('ret-space').style.display = 'none';
  document.getElementById('pase-space').style.display = 'none';
  document.getElementById('spreads-space').style.display = 'none';
  document.getElementById('desvio-space').style.display = 'none';
  document.getElementById('futopc-space').style.display = 'block';
  document.getElementById('mkt-bar').style.display = 'none';
  document.getElementById('fob-bar').style.display = 'none';
  document.getElementById('tabs-container').style.display = 'none';
  try { document.getElementById('btn-update-primas').style.display = 'none'; } catch(e){}

  renderModules();
  document.getElementById('tabs-container').style.display = 'none';

  if (!foLoaded) foInit();
}

// ─── CSV Parser ───
function foParseCSV(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    current += (current ? '\n' : '') + line;
    inQuotes = ((current.match(/"/g) || []).length % 2 !== 0);
    if (!inQuotes) {
      const row = [];
      let cell = '', q = false;
      for (let i = 0; i < current.length; i++) {
        const ch = current[i];
        if (ch === '"') q = !q;
        else if (ch === ',' && !q) { row.push(cell.trim()); cell = ''; }
        else if (ch !== '\r') cell += ch;
      }
      row.push(cell.trim());
      rows.push(row);
      current = '';
    }
  }
  return rows;
}

function foParsePrice(s) {
  if (!s) return 0;
  s = s.replace(/\$/g, '').replace(/\s/g, '');
  const parts = s.split(',');
  if (parts.length === 2) s = parts[0].replace(/\./g, '') + '.' + parts[1];
  else s = s.replace(/\./g, '').replace(',', '.');
  s = s.replace(/-/g, '0');
  const v = parseFloat(s);
  return isNaN(v) ? 0 : v;
}

function foContractSort(c) {
  const m = {ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sept:9,sep:9,oct:10,nov:11,dic:12};
  const p = c.split('-');
  return p.length === 2 ? (parseInt(p[1]) + 2000) * 100 + (m[p[0]] || 0) : 0;
}

function foFmt(n) { return n.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function foFmtInt(n) { return n.toLocaleString('es-AR'); }
function foFmtUSD(n) { return (n < 0 ? '-' : '') + 'U$S ' + foFmt(Math.abs(n)); }

// ─── Data Processing ───
function foProcessFuturos(camp, species) {
  const data = foRawFuturos.slice(2);
  const positions = {};
  const detail = [];

  for (const r of data) {
    if (r.length < 13) continue;
    if (camp && r[2] !== camp) continue;
    if (species !== 'ALL' && r[7] !== species) continue;

    const tpo = (r[6] || '').trim();
    const esp = r[7], contrato = r[9];
    const tons = parseInt(r[11]) || 0;
    const price = foParsePrice(r[12]);
    const cancelOp = (r[13] || '').trim();
    const cancelTons = parseInt(r[15]) || 0;
    const cancelPrice = foParsePrice(r[16]);

    const key = `${esp}|${contrato}`;
    if (!positions[key]) positions[key] = { esp, contrato, v_tons:0, c_tons:0, v_val:0, c_val:0, cancel_pnl:0, trades:0 };
    const p = positions[key];
    p.trades++;

    if (cancelOp) {
      p.cancel_pnl += tpo === 'Venta' ? tons * (price - cancelPrice) : tons * (cancelPrice - price);
    } else {
      if (tpo === 'Venta') { p.v_tons += tons; p.v_val += tons * price; }
      else { p.c_tons += tons; p.c_val += tons * price; }
    }
    detail.push({ camp: r[2], fecha: r[3], esp, contrato, tpo, tons, price, cancelOp, cancelTons, cancelPrice });
  }

  const open = [], closed = [];
  const keys = Object.keys(positions).sort((a, b) => {
    const [ea, ca] = a.split('|'), [eb, cb] = b.split('|');
    return ea.localeCompare(eb) || foContractSort(ca) - foContractSort(cb);
  });

  for (const key of keys) {
    const p = positions[key];
    const matched = Math.min(p.v_tons, p.c_tons);
    const neto = p.c_tons - p.v_tons;
    const avg_v = p.v_tons > 0 ? p.v_val / p.v_tons : 0;
    const avg_c = p.c_tons > 0 ? p.c_val / p.c_tons : 0;
    const neteo_pnl = matched > 0 ? matched * (avg_v - avg_c) : 0;
    const total_pnl = p.cancel_pnl + neteo_pnl;
    const row = { ...p, neto, avg_v, avg_c, matched, neteo_pnl, total_pnl };
    if (neto !== 0) open.push(row);
    if (matched > 0 || p.cancel_pnl !== 0) closed.push(row);
  }
  return { open, closed, detail };
}

function foProcessOpciones(camp, species) {
  const data = foRawOpciones.slice(2);
  const positions = {};

  for (const r of data) {
    if (r.length < 15) continue;
    if (camp && r[2] !== camp) continue;
    if (species !== 'ALL' && r[7] !== species) continue;

    const oper = (r[5] || '').trim();
    const tipo = (r[6] || '').trim();
    const esp = r[7], contrato = r[9];
    const tons = parseInt(r[11]) || 0;
    const strike = foParsePrice(r[12]);
    const primaC = foParsePrice(r[13]);
    const primaV = foParsePrice(r[14]);
    const precioFinal = (r[15] || '').trim();
    const isClosed = !!precioFinal;

    const key = `${esp}|${tipo}|${oper}|${contrato}`;
    if (!positions[key]) positions[key] = { esp, tipo, oper, contrato, tons:0, strikes:[], primas:[], count:0, closed:0 };
    const p = positions[key];
    p.tons += tons;
    p.strikes.push({ strike, tons });
    p.primas.push({ prima: primaC || primaV, tons });
    p.count++;
    if (isClosed) p.closed++;
  }

  const open = [], closed = [];
  for (const key of Object.keys(positions).sort()) {
    const p = positions[key];
    const tT = p.strikes.reduce((s, x) => s + x.tons, 0);
    const avgStrike = tT > 0 ? p.strikes.reduce((s, x) => s + x.strike * x.tons, 0) / tT : 0;
    const avgPrima = tT > 0 ? p.primas.reduce((s, x) => s + x.prima * x.tons, 0) / tT : 0;
    const row = { ...p, avgStrike, avgPrima, totalPrimaUSD: avgPrima * tT };
    if (p.closed < p.count) open.push(row);
    if (p.closed > 0) closed.push(row);
  }
  return { open, closed };
}

// ─── Rendering ───
function foEspecieTag(esp) {
  const cls = esp === 'SOJA' ? 'fo-dot-soja' : esp === 'MAIZ' ? 'fo-dot-maiz' : 'fo-dot-trigo';
  return `<span class="fo-especie-tag"><span class="fo-especie-dot ${cls}"></span>${esp}</span>`;
}

function foPnlClass(v) { return v >= 0 ? 'fo-pnl-pos' : 'fo-pnl-neg'; }

function foRender() {
  const camp = document.getElementById('fo-camp-filter').value;
  const species = document.getElementById('fo-species-filter').value;

  const futData = foProcessFuturos(camp, species);
  const optData = foProcessOpciones(camp, species);

  document.getElementById('fo-fut-count').textContent = futData.detail.length + ' ops';
  document.getElementById('fo-opt-count').textContent = optData.open.length + optData.closed.length + ' pos';

  // KPIs
  const totalOpenV = futData.open.reduce((s, r) => s + (r.neto < 0 ? Math.abs(r.neto) : 0), 0);
  const totalPnL = futData.closed.reduce((s, r) => s + r.total_pnl, 0);
  const totalOptTons = optData.open.reduce((s, r) => s + r.tons, 0);
  const primaPagada = optData.open.filter(r => r.oper === 'Compra').reduce((s, r) => s + r.totalPrimaUSD, 0);
  const primaCobrada = optData.open.filter(r => r.oper === 'Venta').reduce((s, r) => s + r.totalPrimaUSD, 0);
  const primaNeta = primaCobrada - primaPagada;

  document.getElementById('fo-kpi-grid').innerHTML = `
    <div class="fo-kpi"><div class="fo-kpi-lbl">Futuros vendidos neto</div>
      <div class="fo-kpi-val">${foFmtInt(totalOpenV)} tn</div>
      <div class="fo-kpi-sub">Posiciones abiertas</div></div>
    <div class="fo-kpi"><div class="fo-kpi-lbl">Opciones abiertas</div>
      <div class="fo-kpi-val">${foFmtInt(totalOptTons)} tn</div>
      <div class="fo-kpi-sub">${optData.open.length} posiciones</div></div>
    <div class="fo-kpi"><div class="fo-kpi-lbl">PnL futuros cerrados</div>
      <div class="fo-kpi-val ${totalPnL >= 0 ? 'fo-pnl-pos' : 'fo-pnl-neg'}">${foFmtUSD(totalPnL)}</div>
      <div class="fo-kpi-sub">Cancelaciones + neteo</div></div>
    <div class="fo-kpi"><div class="fo-kpi-lbl">Prima neta opciones</div>
      <div class="fo-kpi-val ${primaNeta >= 0 ? 'fo-pnl-pos' : 'fo-pnl-neg'}">${foFmtUSD(primaNeta)}</div>
      <div class="fo-kpi-sub">Cobrada − Pagada</div></div>`;

  // Tables
  foRenderFutOpen(futData.open);
  foRenderFutClosed(futData.closed);
  foRenderFutDetail(futData.detail);
  foRenderOptOpen(optData.open);
  foRenderOptClosed(optData.closed);
}

function foRenderFutOpen(data) {
  const el = document.getElementById('fo-fut-open');
  if (!data.length) { el.innerHTML = '<div class="fo-empty">Sin posiciones abiertas en esta campaña</div>'; return; }
  let h = `<div class="fo-table-wrap"><table class="fo-table"><thead><tr>
    <th>Especie</th><th>Contrato</th><th>Dirección</th>
    <th class="r">Tons netas</th><th class="r">Precio promedio</th><th class="r">Ops</th>
  </tr></thead><tbody>`;
  for (const r of data) {
    const isShort = r.neto < 0;
    const dir = isShort ? '<span class="fo-badge fo-badge-v">VENDIDO</span>' : '<span class="fo-badge fo-badge-c">COMPRADO</span>';
    // Show price of the open side only: sells if net short, buys if net long
    const openPrice = isShort ? r.avg_v : r.avg_c;
    h += `<tr><td>${foEspecieTag(r.esp)}</td><td class="m">${r.contrato}</td><td>${dir}</td>
      <td class="r m">${foFmtInt(Math.abs(r.neto))}</td>
      <td class="r m">${openPrice > 0 ? '$ ' + foFmt(openPrice) : '—'}</td>
      <td class="r m">${r.trades}</td></tr>`;
  }
  h += '</tbody></table></div>';
  el.innerHTML = h;
}

function foRenderFutClosed(data) {
  const el = document.getElementById('fo-fut-closed');
  if (!data.length) { el.innerHTML = '<div class="fo-empty">Sin posiciones cerradas en esta campaña</div>'; return; }
  let h = `<div class="fo-table-wrap"><table class="fo-table"><thead><tr>
    <th>Especie</th><th>Contrato</th><th>Tipo cierre</th>
    <th class="r">Tons cerradas</th><th class="r">Px venta</th><th class="r">Px compra</th><th class="r">PnL (U$S)</th>
  </tr></thead><tbody>`;
  let total = 0;
  for (const r of data) {
    total += r.total_pnl;
    h += `<tr><td>${foEspecieTag(r.esp)}</td><td class="m">${r.contrato}</td>
      <td>${r.cancel_pnl !== 0 ? 'Cancelación' : 'Neteo'}</td>
      <td class="r m">${foFmtInt(r.matched)}</td>
      <td class="r m">${r.avg_v > 0 ? '$ ' + foFmt(r.avg_v) : '—'}</td>
      <td class="r m">${r.avg_c > 0 ? '$ ' + foFmt(r.avg_c) : '—'}</td>
      <td class="r m ${foPnlClass(r.total_pnl)}">${foFmtUSD(r.total_pnl)}</td></tr>`;
  }
  h += `<tr class="fo-summary"><td colspan="6" style="text-align:right;">Total PnL</td>
    <td class="r m ${foPnlClass(total)}">${foFmtUSD(total)}</td></tr>`;
  h += '</tbody></table></div>';
  el.innerHTML = h;
}

function foRenderFutDetail(detail) {
  const el = document.getElementById('fo-fut-detail');
  if (!detail.length) { el.innerHTML = '<div class="fo-empty">Sin operaciones en esta campaña</div>'; return; }
  const months = {ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sept:8,sep:8,oct:9,nov:10,dic:11};
  detail.sort((a, b) => {
    const pa = a.fecha.split('/'), pb = b.fecha.split('/');
    const da = new Date(parseInt(pa[2]), months[pa[1].toLowerCase()] || 0, parseInt(pa[0]));
    const db = new Date(parseInt(pb[2]), months[pb[1].toLowerCase()] || 0, parseInt(pb[0]));
    return db - da;
  });
  let h = `<div class="fo-table-wrap"><table class="fo-table"><thead><tr>
    <th>Fecha</th><th>Especie</th><th>Contrato</th><th>Tipo</th>
    <th class="r">Toneladas</th><th class="r">Precio</th>
    <th>Cancel.</th><th class="r">Tons</th><th class="r">Precio</th>
  </tr></thead><tbody>`;
  const max = 150;
  for (const r of detail.slice(0, max)) {
    const bc = r.tpo === 'Venta' ? 'fo-badge-v' : 'fo-badge-c';
    h += `<tr><td class="m">${r.fecha}</td><td>${foEspecieTag(r.esp)}</td><td class="m">${r.contrato}</td>
      <td><span class="fo-badge ${bc}">${r.tpo}</span></td>
      <td class="r m">${foFmtInt(r.tons)}</td><td class="r m">$ ${foFmt(r.price)}</td>
      <td>${r.cancelOp || '—'}</td>
      <td class="r m">${r.cancelTons || '—'}</td>
      <td class="r m">${r.cancelPrice ? '$ ' + foFmt(r.cancelPrice) : '—'}</td></tr>`;
  }
  if (detail.length > max) h += `<tr><td colspan="9" class="fo-empty">Mostrando ${max} de ${detail.length}</td></tr>`;
  h += '</tbody></table></div>';
  el.innerHTML = h;
}

function foRenderOptOpen(data) {
  const el = document.getElementById('fo-opt-open');
  if (!data.length) { el.innerHTML = '<div class="fo-empty">Sin opciones abiertas en esta campaña</div>'; return; }
  let h = `<div class="fo-table-wrap"><table class="fo-table"><thead><tr>
    <th>Especie</th><th>Tipo</th><th>Operación</th><th>Contrato</th>
    <th class="r">Toneladas</th><th class="r">Strike prom</th><th class="r">Prima prom</th>
    <th class="r">Prima total</th><th class="r">Ops</th>
  </tr></thead><tbody>`;
  let totalPrima = 0;
  for (const r of data) {
    const tb = r.tipo.toUpperCase().includes('CALL') ? 'fo-badge-call' : 'fo-badge-put';
    const ob = r.oper === 'Compra' ? 'fo-badge-c' : 'fo-badge-v';
    const sign = r.oper === 'Compra' ? -1 : 1;
    totalPrima += r.totalPrimaUSD * sign;
    h += `<tr><td>${foEspecieTag(r.esp)}</td>
      <td><span class="fo-badge ${tb}">${r.tipo.toUpperCase()}</span></td>
      <td><span class="fo-badge ${ob}">${r.oper}</span></td>
      <td class="m">${r.contrato}</td>
      <td class="r m">${foFmtInt(r.tons)}</td>
      <td class="r m">$ ${foFmt(r.avgStrike)}</td>
      <td class="r m">$ ${foFmt(r.avgPrima)}</td>
      <td class="r m ${foPnlClass(r.totalPrimaUSD * sign)}">${foFmtUSD(r.totalPrimaUSD * sign)}</td>
      <td class="r m">${r.count}</td></tr>`;
  }
  h += `<tr class="fo-summary"><td colspan="7" style="text-align:right;">Prima neta</td>
    <td class="r m ${foPnlClass(totalPrima)}">${foFmtUSD(totalPrima)}</td><td></td></tr>`;
  h += '</tbody></table></div>';
  el.innerHTML = h;
}

function foRenderOptClosed(data) {
  const el = document.getElementById('fo-opt-closed');
  if (!data.length) { el.innerHTML = '<div class="fo-empty">Sin opciones cerradas en esta campaña</div>'; return; }
  el.innerHTML = '<div class="fo-empty">Próximamente: detalle de opciones ejercidas / vencidas</div>';
}

// ─── Sub-tab switching ───
function foSwitchFut(tab) {
  ['open','closed','detail'].forEach(t => {
    document.getElementById('fo-fut-' + t).style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#fo-fut-tabs .fo-sub-tab').forEach((b, i) => {
    b.classList.toggle('active', (tab === 'open' && i === 0) || (tab === 'closed' && i === 1) || (tab === 'detail' && i === 2));
  });
}

function foSwitchOpt(tab) {
  ['open','closed'].forEach(t => {
    document.getElementById('fo-opt-' + t).style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#fo-opt-tabs .fo-sub-tab').forEach((b, i) => {
    b.classList.toggle('active', (tab === 'open' && i === 0) || (tab === 'closed' && i === 1));
  });
}

// ─── Init ───
async function foInit() {
  const pill = document.getElementById('fo-status');
  pill.textContent = '⏳ Cargando...';
  pill.className = 'fo-status loading';

  try {
    const [resFut, resOpt] = await Promise.all([fetch(FO_CSV_FUTUROS), fetch(FO_CSV_OPCIONES)]);
    if (!resFut.ok || !resOpt.ok) throw new Error('Error descargando CSVs');
    const [tF, tO] = await Promise.all([resFut.text(), resOpt.text()]);

    foRawFuturos = foParseCSV(tF);
    foRawOpciones = foParseCSV(tO);
    foLoaded = true;

    // Populate filters
    const campSet = new Set();
    foRawFuturos.slice(2).forEach(r => { if (r[2]) campSet.add(r[2]); });
    foRawOpciones.slice(2).forEach(r => { if (r[2]) campSet.add(r[2]); });
    const camps = [...campSet].sort((a, b) => parseInt(a) - parseInt(b));

    const sel = document.getElementById('fo-camp-filter');
    sel.innerHTML = '<option value="">Todas</option>' + camps.map(c =>
      `<option value="${c}" ${c === '25/26' ? 'selected' : ''}>${c}</option>`
    ).join('');

    const specSet = new Set();
    foRawFuturos.slice(2).forEach(r => { if (r[7]) specSet.add(r[7]); });
    const specSel = document.getElementById('fo-species-filter');
    specSel.innerHTML = '<option value="ALL">Todas</option>' + [...specSet].sort().map(s =>
      `<option value="${s}">${s}</option>`
    ).join('');

    sel.addEventListener('change', foRender);
    specSel.addEventListener('change', foRender);

    pill.textContent = `${foRawFuturos.length - 2} fut · ${foRawOpciones.length - 2} opt`;
    pill.className = 'fo-status';

    foRender();
  } catch (err) {
    pill.textContent = '✕ ' + err.message;
    pill.className = 'fo-status error';
  }
}
