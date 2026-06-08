// ═══════════════════════════════════════════════════
//  POSICIÓN COMERCIAL — Tabla por especie
//  Inyectada al inicio del panel Futuros & Opciones
// ═══════════════════════════════════════════════════

const PC_CROPS = [
  'COLZA', 'CEBADA', 'GI OLEICO', 'GIRASOL',
  'MAÍZ TEMP.', 'MAÍZ TARDÍO', 'MAÍZ',
  'SOJA ARR.', 'SOJA', 'TRIGO'
];

const PC_STORAGE_KEY = 'espartina_pc_2627';

const PC_SEEDS = {
  'COLZA'      : { tnTotales:  3805 },
  'CEBADA'     : { tnTotales: 18295 },
  'GI OLEICO'  : { tnTotales: 11548 },
  'GIRASOL'    : { tnTotales:  9569 },
  'MAÍZ TEMP.' : { tnTotales: 23350 },
  'MAÍZ TARDÍO': { tnTotales: 171515 },
  'MAÍZ'       : { tnTotales: 195965 },
  'SOJA ARR.'  : { tnTotales:      0 },
  'SOJA'       : { tnTotales: 86184 },
  'TRIGO'      : { tnTotales: 52152 },
};

function pcDefaultCrop() {
  return {
    tnTotales: 0, tnFijadas: 0, tnAFijar: 0,
    tnFuturos: 0, tnPut: 0, tnCall: 0,
    precioDolor: 0, precioObjetivo: 0, precioPromPos: 0,
    precioPromVenta: 0, precioMercado: 0
  };
}

function pcLoadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(PC_STORAGE_KEY) || 'null');
    const d = {};
    PC_CROPS.forEach(c => {
      d[c] = Object.assign(pcDefaultCrop(), PC_SEEDS[c] || {}, saved && saved[c] ? saved[c] : {});
    });
    return d;
  } catch(e) {
    const d = {};
    PC_CROPS.forEach(c => { d[c] = pcDefaultCrop(); });
    return d;
  }
}

let PC_DATA = pcLoadData();

function pcSaveData() {
  try { localStorage.setItem(PC_STORAGE_KEY, JSON.stringify(PC_DATA)); } catch(e) {}
}

function pcMaizVals() {
  const dT = PC_DATA['MAÍZ TEMP.'], dL = PC_DATA['MAÍZ TARDÍO'];
  const tnT = dT.tnTotales || 0, tnL = dL.tnTotales || 0, tot = tnT + tnL;
  const fijT = dT.tnFijadas || 0, fijL = dL.tnFijadas || 0, totFij = fijT + fijL;
  const wAvg  = f => tot    ? ((dT[f]||0)*tnT  + (dL[f]||0)*tnL)  / tot    : 0;
  const wAvgF = f => totFij ? ((dT[f]||0)*fijT + (dL[f]||0)*fijL) / totFij : 0;
  return {
    tnTotales     : tot,
    tnFijadas     : fijT + fijL,
    tnAFijar      : (dT.tnAFijar ||0) + (dL.tnAFijar ||0),
    tnFuturos     : (dT.tnFuturos||0) + (dL.tnFuturos||0),
    tnPut         : (dT.tnPut    ||0) + (dL.tnPut    ||0),
    tnCall        : (dT.tnCall   ||0) + (dL.tnCall   ||0),
    precioDolor   : wAvg('precioDolor'),
    precioObjetivo: wAvg('precioObjetivo'),
    precioPromPos : wAvg('precioPromPos'),
    precioPromVenta: wAvgF('precioPromVenta'),   // pondera por tn fijadas
    precioMercado : wAvg('precioMercado'),
  };
}

function pcCalc(c) {
  const d = c === 'MAÍZ' ? pcMaizVals() : PC_DATA[c];
  const tot = d.tnTotales || 0;
  const pv = tot ? (d.tnFijadas + d.tnFuturos) / tot : 0;
  const pf = (pv > 0 && d.precioPromVenta > 0)
    ? pv * d.precioPromVenta + (1 - pv) * (d.precioMercado || 0)
    : (d.precioMercado || 0);
  const tnVendidas = d.tnFijadas + d.tnFuturos;
  return {
    tnComp             : tot ? d.tnFijadas / tot : 0,
    totalV             : tot - d.tnFijadas - d.tnAFijar,
    pctVenta           : pv,
    cobBaja            : tot ? (d.tnFijadas + d.tnFuturos + d.tnPut) / tot : 0,
    cobSuba            : (1 - pv) + (tot ? d.tnCall / tot : 0),
    precioFinal        : pf,
    // ── KPIs comerciales ──
    ventasRealizadas   : d.tnFijadas > 0 && d.precioPromVenta > 0 ? d.tnFijadas * d.precioPromVenta : 0,
    ventasProyectadas  : pf * tot,
    resultadoComercial : (d.precioPromVenta - d.precioPromPos) * tnVendidas,
    ppvVsPpp           : d.precioPromVenta - d.precioPromPos,
    pxFinalVsPpp       : pf - d.precioPromPos,
    resultadoProyectado: (pf - d.precioPromPos) * tot
  };
}

function pcFmtTn(v)  { return v ? Math.round(v).toLocaleString('es-AR') : '—'; }
function pcFmtPct(v) { return Math.round(v * 100) + '%'; }
function pcFmtPx(v)  { return v ? '$ ' + v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'; }
function pcFmtTotal(v) {
  if (!v) return '—';
  const abs = Math.abs(v), sign = v < 0 ? '-' : '';
  if (abs >= 1000000) return sign + '$ ' + (abs / 1000000).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M';
  if (abs >= 1000)    return sign + '$ ' + Math.round(abs / 1000).toLocaleString('es-AR') + 'k';
  return sign + '$ ' + Math.round(abs).toLocaleString('es-AR');
}
function pcFmtDiff(v) {
  if (!v && v !== 0) return '—';
  if (Math.abs(v) < 0.05) return '—';
  const sign = v > 0 ? '+' : '';
  return sign + '$ ' + v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function pcParseInput(type, s) {
  if (!s) return 0;
  s = String(s).replace(/[\s$]/g, '');
  if (type === 'tn') return parseInt(s.replace(/\D/g,'')) || 0;
  // precios: europeo "1.234,5" → punto=miles, coma=decimal
  if (s.includes(',') && s.includes('.')) return parseFloat(s.replace(/\./g,'').replace(',','.')) || 0;
  if (s.includes(',')) return parseFloat(s.replace(',','.')) || 0;
  if (/\.\d{3}$/.test(s)) return parseFloat(s.replace('.','')) || 0; // punto como miles
  return parseFloat(s) || 0;
}
function pcFmtInput(type, v) {
  if (!v) return '';
  return type === 'tn'
    ? Math.round(v).toLocaleString('es-AR')
    : '$ ' + v.toLocaleString('es-AR', { minimumFractionDigits:1, maximumFractionDigits:1 });
}
function pcFocusInput(el) {
  const v = PC_DATA[PC_CROPS[+el.dataset.idx]][el.dataset.field];
  el.value = v || ''; el.select();
}
function pcBlurInput(el) {
  const idx = +el.dataset.idx, field = el.dataset.field, type = el.dataset.type;
  const v = pcParseInput(type, el.value);
  PC_DATA[PC_CROPS[idx]][field] = v;
  pcSaveData();
  el.value = pcFmtInput(type, v);
  pcRefreshCalcs();
}
function pcInputChange(el) {
  const idx = +el.dataset.idx, field = el.dataset.field, type = el.dataset.type;
  PC_DATA[PC_CROPS[idx]][field] = pcParseInput(type, el.value);
  pcRefreshCalcs();
}

function pcUpdate(idx, field, value) {
  const crop = PC_CROPS[idx];
  if (!crop) return;
  PC_DATA[crop][field] = parseFloat(String(value).replace(',', '.')) || 0;
  pcSaveData();
  pcRefreshCalcs();
}

function pcRefreshCalcs() {
  const CALCS = [
    { id: 'tncomp',      fmt: c => pcFmtPct(pcCalc(c).tnComp) },
    { id: 'totalv',      fmt: c => pcFmtTn(pcCalc(c).totalV) },
    { id: 'pctventa',    fmt: c => pcFmtPct(pcCalc(c).pctVenta) },
    { id: 'cobbaja',     fmt: c => pcFmtPct(pcCalc(c).cobBaja) },
    { id: 'cobsuba',     fmt: c => pcFmtPct(pcCalc(c).cobSuba) },
    { id: 'pxfinal',     fmt: c => pcFmtPx(pcCalc(c).precioFinal) },
    { id: 'vrealizadas', fmt: c => pcFmtTotal(pcCalc(c).ventasRealizadas) },
    { id: 'vproyectadas',fmt: c => pcFmtTotal(pcCalc(c).ventasProyectadas) },
    { id: 'rescomercial',fmt: c => pcFmtTotal(pcCalc(c).resultadoComercial), val: c => pcCalc(c).resultadoComercial },
    { id: 'ppvppp',      fmt: c => pcFmtDiff(pcCalc(c).ppvVsPpp),            val: c => pcCalc(c).ppvVsPpp },
    { id: 'pxfinalppp',  fmt: c => pcFmtDiff(pcCalc(c).pxFinalVsPpp),        val: c => pcCalc(c).pxFinalVsPpp },
    { id: 'resproye',    fmt: c => pcFmtTotal(pcCalc(c).resultadoProyectado), val: c => pcCalc(c).resultadoProyectado },
  ];
  CALCS.forEach(({ id, fmt, val }) => {
    PC_CROPS.forEach((c, i) => {
      const el = document.getElementById(`pcc_${id}_${i}`);
      if (!el) return;
      el.textContent = fmt(c);
      if (val) {
        const v = val(c);
        el.style.color = v > 0 ? '#1A6B3C' : v < 0 ? '#c43030' : 'var(--text-3,#666)';
      }
    });
  });
  // Actualizar celdas derivadas de MAÍZ (ponderadas desde TEMP + TARDÍO)
  const mv = pcMaizVals();
  ['tnTotales','tnFijadas','tnAFijar','tnFuturos','tnPut','tnCall',
   'precioDolor','precioObjetivo','precioPromPos','precioPromVenta','precioMercado'].forEach(field => {
    const el = document.getElementById('pcc_maiz_' + field);
    if (!el) return;
    const isTn = field.startsWith('tn');
    el.textContent = isTn
      ? (mv[field] ? Math.round(mv[field]).toLocaleString('es-AR') : '—')
      : pcFmtPx(mv[field]);
  });
}

function pcInjectHTML() {
  if (document.getElementById('pc-posicion-block')) return; // ya inyectado

  const PC_ROWS = [
    { kind: 'S', label: 'TONELADAS' },
    { kind: 'E', label: 'TN Totales',           field: 'tnTotales',      type: 'tn', bg: 'grn', bold: true },
    { kind: 'E', label: 'TN Fijadas',            field: 'tnFijadas',      type: 'tn' },
    { kind: 'E', label: 'TN A Fijar',            field: 'tnAFijar',       type: 'tn' },
    { kind: 'C', label: 'TN Comprometidas',      calcId: 'tncomp',   fn: c => pcFmtPct(pcCalc(c).tnComp),     bg: 'gry' },
    { kind: 'C', label: 'Total a Vender',        calcId: 'totalv',   fn: c => pcFmtTn(pcCalc(c).totalV),      bg: 'org', bold: true },
    { kind: 'S', label: 'INSTRUMENTOS DE COBERTURA' },
    { kind: 'E', label: 'TN Futuros',            field: 'tnFuturos',      type: 'tn' },
    { kind: 'E', label: 'TN Put',                field: 'tnPut',          type: 'tn' },
    { kind: 'E', label: 'TN Call',               field: 'tnCall',         type: 'tn' },
    { kind: 'S', label: 'INDICADORES DE COBERTURA' },
    { kind: 'C', label: '% de Venta',            calcId: 'pctventa', fn: c => pcFmtPct(pcCalc(c).pctVenta),   bg: 'gry' },
    { kind: 'C', label: 'Cobertura a la Baja',   calcId: 'cobbaja',  fn: c => pcFmtPct(pcCalc(c).cobBaja),    bg: 'gry' },
    { kind: 'C', label: 'Cobertura a la Suba',   calcId: 'cobsuba',  fn: c => pcFmtPct(pcCalc(c).cobSuba),    bg: 'gry' },
    { kind: 'S', label: 'PRECIOS' },
    { kind: 'E', label: 'Precio Dolor',          field: 'precioDolor',    type: 'px' },
    { kind: 'E', label: 'Precio Objetivo',       field: 'precioObjetivo', type: 'px' },
    { kind: 'E', label: 'Precio Prom. Posición', field: 'precioPromPos',  type: 'px' },
    { kind: 'E', label: 'Precio Prom. de Venta', field: 'precioPromVenta',type: 'px' },
    { kind: 'E', label: 'Precio Mercado',        field: 'precioMercado',  type: 'px' },
    { kind: 'C', label: 'Precio Final',          calcId: 'pxfinal',  fn: c => pcFmtPx(pcCalc(c).precioFinal), bg: 'yel', bold: true },
    { kind: 'S', label: 'RESULTADOS COMERCIALES' },
    { kind: 'C', label: 'Ventas Realizadas',         calcId: 'vrealizadas',  fn: c => pcFmtTotal(pcCalc(c).ventasRealizadas),    bg: 'gry' },
    { kind: 'C', label: 'Ventas Proyectadas',         calcId: 'vproyectadas', fn: c => pcFmtTotal(pcCalc(c).ventasProyectadas),   bg: 'gry' },
    { kind: 'C', label: 'Resultado Comercial',        calcId: 'rescomercial', fn: c => pcFmtTotal(pcCalc(c).resultadoComercial),  bg: 'gry' },
    { kind: 'C', label: 'PPV vs PPP ($/tn)',          calcId: 'ppvppp',       fn: c => pcFmtDiff(pcCalc(c).ppvVsPpp),             bg: 'gry' },
    { kind: 'C', label: 'Precio Final vs PPP ($/tn)', calcId: 'pxfinalppp',   fn: c => pcFmtDiff(pcCalc(c).pxFinalVsPpp),         bg: 'gry' },
    { kind: 'C', label: 'Res. Comercial Proyectado',  calcId: 'resproye',     fn: c => pcFmtTotal(pcCalc(c).resultadoProyectado), bg: 'grn', bold: true },
  ];

  const BG = { grn: '#e8f5ee', org: '#fde8d8', gry: '#f4f4f4', yel: '#fff9cc' };

  let h = `<style>
    .pc-wrap{overflow-x:auto;border-radius:8px;border:1px solid var(--border-1,#d0d0d0);margin-bottom:28px}
    .pc-tbl{border-collapse:collapse;min-width:1120px;width:100%}
    .pc-tbl th{background:#1A6B3C;color:#fff;padding:7px 10px;font-size:11px;font-weight:600;white-space:nowrap;border-right:1px solid rgba(255,255,255,.18);text-align:center}
    .pc-tbl th.pc-th0{position:sticky;left:0;z-index:3;text-align:left;min-width:180px;border-right:2px solid rgba(255,255,255,.35)}
    .pc-tbl td.pc-lbl{position:sticky;left:0;z-index:1;padding:3px 10px;font-size:12px;white-space:nowrap;border-right:2px solid #ccc;border-bottom:1px solid #e8e8e8;background:#fff}
    .pc-tbl td.pc-dc{padding:0;border-right:1px solid #e4e4e4;border-bottom:1px solid #eee;min-width:95px}
    .pc-tbl td.pc-cc{padding:3px 9px;text-align:right;border-right:1px solid #e4e4e4;border-bottom:1px solid #eee;font-size:12px;min-width:95px}
    .pc-tbl td.pc-cm{padding:3px 9px;text-align:right;border-right:1px solid #e4e4e4;border-bottom:1px solid #eee;font-size:12px;min-width:95px;color:#888;font-style:italic}
    .pc-tbl tr.pc-sec td{background:#2d4a3e!important;color:#C8A44A;padding:4px 12px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;position:static!important;white-space:nowrap}
    .pc-inp{width:100%;border:none;outline:none;background:transparent;text-align:right;font-size:12px;padding:4px 8px;box-sizing:border-box;font-family:inherit;color:var(--text-1,#111)}
    .pc-inp:focus{background:#fffde7;border:1px solid #C8A44A}
    .pc-inp::placeholder{color:#bbb}
  </style>`;

  h += `<div style="font-size:14px;font-weight:700;color:#1A6B3C;margin:0 0 12px 0">Posición Comercial 26-27</div>`;
  h += `<div class="pc-wrap"><table class="pc-tbl"><thead><tr>`;
  h += `<th class="pc-th0">Especie</th>`;
  PC_CROPS.forEach(c => { h += `<th>${c}</th>`; });
  h += `</tr></thead><tbody>`;

  const mv = pcMaizVals();

  PC_ROWS.forEach(row => {
    if (row.kind === 'S') {
      h += `<tr class="pc-sec"><td colspan="${PC_CROPS.length + 1}">${row.label}</td></tr>`;
      return;
    }
    const bgColor  = row.bg ? BG[row.bg] : '';
    const bgStyle  = bgColor ? `background:${bgColor};` : '';
    const bldStyle = row.bold ? 'font-weight:700;' : '';

    h += `<tr>`;
    h += `<td class="pc-lbl" style="${bgStyle}${bldStyle}">${row.label}</td>`;

    PC_CROPS.forEach((c, i) => {
      if (row.kind === 'C') {
        // ── celda calculada normal ──
        const txtColor = row.bg === 'yel' ? '#6b5a00' : 'var(--text-3,#666)';
        h += `<td class="pc-cc" id="pcc_${row.calcId}_${i}"
              style="${bgStyle}${bldStyle}color:${txtColor}">${row.fn(c)}</td>`;
      } else if (c === 'MAÍZ') {
        // ── MAÍZ: valor derivado de TEMP + TARDÍO, no editable ──
        const rawVal  = mv[row.field] || 0;
        const isTn    = row.type === 'tn';
        const fmtVal  = isTn
          ? (rawVal ? Math.round(rawVal).toLocaleString('es-AR') : '—')
          : pcFmtPx(rawVal);
        h += `<td class="pc-cm" id="pcc_maiz_${row.field}"
              style="${bgStyle}${bldStyle}">${fmtVal}</td>`;
      } else {
        // ── celda editable con formato ──
        const rawVal = PC_DATA[c][row.field] || 0;
        const fmtVal = pcFmtInput(row.type, rawVal);
        h += `<td class="pc-dc" style="${bgStyle}">
          <input class="pc-inp" type="text" placeholder="—" value="${fmtVal}"
            style="${bldStyle}"
            data-idx="${i}" data-field="${row.field}" data-type="${row.type}"
            onfocus="pcFocusInput(this)"
            onblur="pcBlurInput(this)"
            oninput="pcInputChange(this)">
        </td>`;
      }
    });

    h += `</tr>`;
  });

  h += `</tbody></table></div>`;

  const block = document.createElement('div');
  block.id = 'pc-posicion-block';
  block.innerHTML = h;

  const space = document.getElementById('futopc-space');
  if (space) space.insertBefore(block, space.firstChild);
  pcRefreshCalcs(); // aplica colores de signo en el primer render
}

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
  pcInjectHTML();
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

// ═══════════════════════════════════════════════════
//  CRUCE CON marketData (precios de ajuste A3) → P&L mark-to-market
// ═══════════════════════════════════════════════════
// marketData usa: crop minúscula (soja), pos tipo "JUL26", opciones.puts/calls[].prima
// futuros_opciones usa: esp MAYÚSCULA (SOJA), contrato tipo "jul-26", tipo CALL/PUT
// Estas funciones normalizan ambos formatos a una clave común para poder matchear.

const FO_MES_NUM = {ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,sept:9,oct:10,nov:11,dic:12};

// "jul-26" / "JUL26" → "JUL26" (formato pos de marketData)
function foNormPos(contrato) {
  if (!contrato) return '';
  const c = contrato.toString().toLowerCase().trim();
  const m = c.match(/([a-z]{3,4})[-\s]?(\d{2,4})/);
  if (!m) return contrato.toUpperCase().replace(/[-\s]/g, '');
  const mesNum = FO_MES_NUM[m[1]];
  if (!mesNum) return contrato.toUpperCase().replace(/[-\s]/g, '');
  const mesAbbr = ['','ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'][mesNum];
  const yr = m[2].slice(-2);
  return mesAbbr + yr;
}

// "SOJA" → "soja"  (formato crop de marketData)
function foNormCrop(esp) {
  return (esp || '').toString().toLowerCase().trim();
}

// ¿Hay datos de mercado sincronizados? Usamos sheetData porque contiene TODAS
// las especies (marketData sólo trae el crop activo del builder).
function foHasMarket() {
  return typeof sheetData !== 'undefined' && sheetData && sheetData.futuros
    && Object.keys(sheetData.futuros).length > 0;
}

// Devuelve el ajuste del futuro para esa especie+contrato, o null si no está
function foMatchFuturoAjuste(esp, contrato) {
  if (!foHasMarket()) return null;
  const crop = foNormCrop(esp);
  const pos = foNormPos(contrato);
  const list = sheetData.futuros[crop];
  if (!list) return null;
  const f = list.find(x => x.pos === pos);
  return (f && f.precio > 0) ? f.precio : null;
}

// Devuelve la prima de ajuste (mark-to-market) de una opción, o null si no está
function foMatchOpcionPrima(esp, contrato, strike, tipo) {
  if (!foHasMarket() || !sheetData.opciones) return null;
  const crop = foNormCrop(esp);
  const pos = foNormPos(contrato);
  const cropOpts = sheetData.opciones[crop];
  if (!cropOpts || !cropOpts[pos]) return null;
  const isCall = (tipo || '').toUpperCase().includes('CALL');
  const list = isCall ? cropOpts[pos].calls : cropOpts[pos].puts;
  if (!list) return null;
  // Match por strike (tolerancia 0.5 por redondeos)
  const o = list.find(x => Math.abs(x.strike - strike) < 0.5);
  return (o && o.prima > 0) ? o.prima : null;
}

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
    const prima = primaC || primaV;
    const precioFinal = (r[15] || '').trim();
    const isClosed = !!precioFinal;

    // ── Cada serie es única por strike ──────────────────────────────────────
    // No se agrupan distintos strikes: un CALL jul-25 @210k y un CALL jul-25
    // @220k son instrumentos distintos con perfiles de pago diferentes.
    // Lo que sí se promedia dentro de la misma serie (mismo strike) es la prima
    // promedio ponderada, que refleja el costo promedio de entrada a ese instrumento.
    const key = `${esp}|${tipo}|${oper}|${contrato}|${strike}`;
    if (!positions[key]) positions[key] = {
      esp, tipo, oper, contrato, strike,
      tons: 0, prima_val: 0, // prima_val = suma(prima_i * tons_i) para el promedio ponderado
      count: 0, closed: 0
    };
    const p = positions[key];
    p.tons      += tons;
    p.prima_val += prima * tons;  // acumulación ponderada
    p.count++;
    if (isClosed) p.closed++;
  }

  const open = [], closed = [];
  // Ordenar por esp → tipo → contrato → strike
  const sortedKeys = Object.keys(positions).sort((a, b) => {
    const [ea, ta, oa, ca, sa] = a.split('|');
    const [eb, tb, ob, cb, sb] = b.split('|');
    return ea.localeCompare(eb)
      || ta.localeCompare(tb)
      || foContractSort(ca) - foContractSort(cb)
      || parseFloat(sa) - parseFloat(sb);
  });

  for (const key of sortedKeys) {
    const p = positions[key];
    // Prima promedio ponderada: costo promedio de entrada a esta serie
    const avgPrima     = p.tons > 0 ? p.prima_val / p.tons : 0;
    // Prima total: suma directa, equivalente a avgPrima * tons (pero calculada
    // desde la acumulación directa para evitar errores de redondeo)
    const totalPrimaUSD = p.prima_val;  // = Σ(prima_i × tons_i)
    const row = { ...p, avgPrima, totalPrimaUSD };
    if (p.closed < p.count) open.push(row);
    if (p.closed > 0)       closed.push(row);
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
  const totalPnL   = futData.closed.reduce((s, r) => s + r.total_pnl, 0);

  // Precio promedio ponderado de futuros vendidos abiertos
  const futVendidos = futData.open.filter(r => r.neto < 0);
  const futPxNum = futVendidos.reduce((s, r) => s + r.avg_v * Math.abs(r.neto), 0);
  const futPxDen = futVendidos.reduce((s, r) => s + Math.abs(r.neto), 0);
  const avgPxFut = futPxDen > 0 ? futPxNum / futPxDen : 0;

  const totalOptTons   = optData.open.reduce((s, r) => s + r.tons, 0);
  const primaPagada    = optData.open.filter(r => r.oper === 'Compra').reduce((s, r) => s + r.totalPrimaUSD, 0);
  const primaCobrada   = optData.open.filter(r => r.oper === 'Venta').reduce((s, r) => s + r.totalPrimaUSD, 0);
  const primaNeta      = primaCobrada - primaPagada;

  // ── P&L mark-to-market total (futuros + opciones abiertas) ──
  let mtmFut = 0, mtmOpt = 0, mtmAvailable = false;
  if (foHasMarket()) {
    for (const r of futData.open) {
      const isShort = r.neto < 0;
      const openPrice = isShort ? r.avg_v : r.avg_c;
      const ajuste = foMatchFuturoAjuste(r.esp, r.contrato);
      if (ajuste !== null && openPrice > 0) {
        const tons = Math.abs(r.neto);
        mtmFut += isShort ? (openPrice - ajuste) * tons : (ajuste - openPrice) * tons;
        mtmAvailable = true;
      }
    }
    for (const r of optData.open) {
      const primaHoy = foMatchOpcionPrima(r.esp, r.contrato, r.strike, r.tipo);
      if (primaHoy !== null) {
        mtmOpt += r.oper === 'Compra'
          ? (primaHoy - r.avgPrima) * r.tons
          : (r.avgPrima - primaHoy) * r.tons;
        mtmAvailable = true;
      }
    }
  }
  const mtmTotal = mtmFut + mtmOpt;

  const mtmCard = !foHasMarket()
    ? `<div class="fo-kpi">
        <div class="fo-kpi-lbl">P&L mark-to-market</div>
        <div class="fo-kpi-val" style="font-size:14px;color:var(--text-3);">Sincronizá A3</div>
        <div class="fo-kpi-sub">Pulsá "Sincronizar A3" para valuar</div>
      </div>`
    : mtmAvailable
      ? `<div class="fo-kpi">
          <div class="fo-kpi-lbl">P&L mark-to-market</div>
          <div class="fo-kpi-val ${mtmTotal >= 0 ? 'fo-pnl-pos' : 'fo-pnl-neg'}">${foFmtUSD(mtmTotal)}</div>
          <div class="fo-kpi-sub">Fut ${foFmtUSD(mtmFut)} · Opc ${foFmtUSD(mtmOpt)}</div>
        </div>`
      : `<div class="fo-kpi">
          <div class="fo-kpi-lbl">P&L mark-to-market</div>
          <div class="fo-kpi-val" style="font-size:14px;color:var(--text-3);">Sin match</div>
          <div class="fo-kpi-sub">Los contratos no coinciden con A3</div>
        </div>`;

  document.getElementById('fo-kpi-grid').innerHTML = `
    <div class="fo-kpi">
      <div class="fo-kpi-lbl">Futuros vendidos neto</div>
      <div class="fo-kpi-val">${foFmtInt(totalOpenV)} tn</div>
      <div class="fo-kpi-sub">${avgPxFut > 0 ? 'Px prom. $ ' + foFmt(avgPxFut) : 'Sin posición'}</div>
    </div>
    <div class="fo-kpi">
      <div class="fo-kpi-lbl">Opciones abiertas</div>
      <div class="fo-kpi-val">${foFmtInt(totalOptTons)} tn</div>
      <div class="fo-kpi-sub">${optData.open.length} series</div>
    </div>
    <div class="fo-kpi">
      <div class="fo-kpi-lbl">Prima neta opciones</div>
      <div class="fo-kpi-val ${primaNeta >= 0 ? 'fo-pnl-pos' : 'fo-pnl-neg'}">${foFmtUSD(primaNeta)}</div>
      <div class="fo-kpi-sub">▲ cobrada ${foFmtUSD(primaCobrada)} · ▼ pagada ${foFmtUSD(primaPagada)}</div>
    </div>
    ${mtmCard}
    <div class="fo-kpi">
      <div class="fo-kpi-lbl">PnL futuros cerrados</div>
      <div class="fo-kpi-val ${totalPnL >= 0 ? 'fo-pnl-pos' : 'fo-pnl-neg'}">${foFmtUSD(totalPnL)}</div>
      <div class="fo-kpi-sub">Cancelaciones + neteo (realizado)</div>
    </div>`;

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
  const showMtM = foHasMarket();
  let h = `<div class="fo-table-wrap"><table class="fo-table"><thead><tr>
    <th>Especie</th><th>Contrato</th><th>Dirección</th>
    <th class="r">Tons netas</th><th class="r">Precio prom. ponderado</th><th class="r">Valor nocional</th>`
    + (showMtM ? `<th class="r">Ajuste hoy</th><th class="r">P&L MtM</th>` : '')
    + `<th class="r">Ops</th>
  </tr></thead><tbody>`;
  let totalMtM = 0, anyMtM = false;
  for (const r of data) {
    const isShort = r.neto < 0;
    const dir = isShort ? '<span class="fo-badge fo-badge-v">VENDIDO</span>' : '<span class="fo-badge fo-badge-c">COMPRADO</span>';
    const openPrice = isShort ? r.avg_v : r.avg_c;
    const tons = Math.abs(r.neto);
    const nocional = openPrice * tons;

    let mtmCells = '';
    if (showMtM) {
      const ajuste = foMatchFuturoAjuste(r.esp, r.contrato);
      if (ajuste !== null && openPrice > 0) {
        // Vendido: gano si el mercado baja (precio venta − ajuste).
        // Comprado: gano si el mercado sube (ajuste − precio compra).
        const pnl = isShort ? (openPrice - ajuste) * tons : (ajuste - openPrice) * tons;
        totalMtM += pnl; anyMtM = true;
        mtmCells = `<td class="r m">$ ${foFmt(ajuste)}</td>
          <td class="r m ${foPnlClass(pnl)}">${foFmtUSD(pnl)}</td>`;
      } else {
        mtmCells = `<td class="r m">—</td><td class="r m">—</td>`;
      }
    }

    h += `<tr><td>${foEspecieTag(r.esp)}</td><td class="m">${r.contrato}</td><td>${dir}</td>
      <td class="r m">${foFmtInt(tons)}</td>
      <td class="r m">${openPrice > 0 ? '$ ' + foFmt(openPrice) : '—'}</td>
      <td class="r m">${nocional > 0 ? '$ ' + foFmt(nocional) : '—'}</td>
      ${mtmCells}
      <td class="r m">${r.trades}</td></tr>`;
  }
  if (showMtM && anyMtM) {
    h += `<tr class="fo-summary"><td colspan="6" style="text-align:right;">Total P&L mark-to-market</td>
      <td></td><td class="r m ${foPnlClass(totalMtM)}">${foFmtUSD(totalMtM)}</td><td></td></tr>`;
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
  const showMtM = foHasMarket();
  let h = `<div class="fo-table-wrap"><table class="fo-table"><thead><tr>
    <th>Especie</th><th>Tipo</th><th>Operación</th><th>Contrato</th>
    <th class="r">Strike</th><th class="r">Toneladas</th>
    <th class="r">Prima prom/tn</th><th class="r">Prima total</th>`
    + (showMtM ? `<th class="r">Prima hoy/tn</th><th class="r">P&L MtM</th>` : '')
    + `<th class="r">Ops</th>
  </tr></thead><tbody>`;
  let totalPrima = 0, totalMtM = 0, anyMtM = false;
  for (const r of data) {
    const tb = r.tipo.toUpperCase().includes('CALL') ? 'fo-badge-call' : 'fo-badge-put';
    const ob = r.oper === 'Compra' ? 'fo-badge-c' : 'fo-badge-v';
    // Convención de signo de prima: cobrada (Venta) positiva, pagada (Compra) negativa
    const sign = r.oper === 'Compra' ? -1 : 1;
    totalPrima += r.totalPrimaUSD * sign;

    let mtmCells = '';
    if (showMtM) {
      const primaHoy = foMatchOpcionPrima(r.esp, r.contrato, r.strike, r.tipo);
      if (primaHoy !== null) {
        // Comprador: gana si la prima sube (prima_hoy − prima_pagada).
        // Vendedor: gana si la prima baja (prima_cobrada − prima_hoy).
        const pnl = r.oper === 'Compra'
          ? (primaHoy - r.avgPrima) * r.tons
          : (r.avgPrima - primaHoy) * r.tons;
        totalMtM += pnl; anyMtM = true;
        mtmCells = `<td class="r m">$ ${foFmt(primaHoy)}</td>
          <td class="r m ${foPnlClass(pnl)}">${foFmtUSD(pnl)}</td>`;
      } else {
        mtmCells = `<td class="r m">—</td><td class="r m">—</td>`;
      }
    }

    h += `<tr><td>${foEspecieTag(r.esp)}</td>
      <td><span class="fo-badge ${tb}">${r.tipo.toUpperCase()}</span></td>
      <td><span class="fo-badge ${ob}">${r.oper}</span></td>
      <td class="m">${r.contrato}</td>
      <td class="r m">$ ${foFmt(r.strike)}</td>
      <td class="r m">${foFmtInt(r.tons)}</td>
      <td class="r m">$ ${foFmt(r.avgPrima)}</td>
      <td class="r m ${foPnlClass(r.totalPrimaUSD * sign)}">${foFmtUSD(r.totalPrimaUSD * sign)}</td>
      ${mtmCells}
      <td class="r m">${r.count}</td></tr>`;
  }
  const colspanPrima = showMtM ? 7 : 7;
  h += `<tr class="fo-summary"><td colspan="${colspanPrima}" style="text-align:right;">Prima neta</td>
    <td class="r m ${foPnlClass(totalPrima)}">${foFmtUSD(totalPrima)}</td>`
    + (showMtM ? (anyMtM
        ? `<td></td><td class="r m ${foPnlClass(totalMtM)}">${foFmtUSD(totalMtM)}</td>`
        : `<td></td><td></td>`)
      : '')
    + `<td></td></tr>`;
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
