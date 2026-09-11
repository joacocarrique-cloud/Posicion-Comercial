// ═══════════════════════════════════════════════════
// ─── LINE-UP & NECESIDAD DE COMPRA ───
// Line-up de buques (ISA) + compras y DJVE de la exportación (SAGyP).
// Los datos los trae un Google Apps Script (ver LEEME_LineUp.txt) cada vez
// que se abre el módulo. Si una fuente falla, se muestra el último dato bueno.
// ═══════════════════════════════════════════════════

// URL de la aplicación web de Apps Script (termina en /exec). Pegarla acá.
const LU_API = 'https://script.google.com/macros/s/AKfycbxI0nrK6OaeStQDHtvHBVosB73CibGJA7l_YuPNBuo-u6cf3Mw7aEp0zXCstKUJ8eeX/exec';

const LU_CACHE_KEY = 'esp_lineup_cache_v1';
const LU_REFRESCO_MIN = 30;      // al abrir, si el dato tiene más de 30 min, se vuelve a pedir
const LU_SOJA_COEF = 0.78;       // harina + cascarilla por t de poroto

let lineupMode = false, luData = null, luProd = 'maiz', luCamp = null, luCargando = false, luError = null;

const LU_PRODS = {
  maiz:    { nombre: 'Maíz',    unidad: 't',            peso: { maiz: 1 }, incluir: ['maiz'], compras: ['maiz'], djve: { 'MAIZ': 1 } },
  soja:    { nombre: 'Soja',    unidad: 't poroto eq.', peso: { soja_poroto: 1, soja_harina: 1 / LU_SOJA_COEF }, incluir: ['soja_poroto', 'soja_harina', 'soja_aceite'], compras: ['soja'], industria: true, djve: { 'SOJA': 1, 'SUBP. DE SOJA': 1 / LU_SOJA_COEF } },
  trigo:   { nombre: 'Trigo',   unidad: 't',            peso: { trigo: 1 }, incluir: ['trigo'], compras: ['trigo'], djve: { 'TRIGO PAN': 1 } },
  girasol: { nombre: 'Girasol', unidad: 't producto',   peso: { gira_grano: 1, gira_aceite: 1, gira_harina: 1 }, incluir: ['gira_grano', 'gira_aceite', 'gira_harina'], compras: ['girasol'], industria: true, djve: { 'GIRASOL': 1, 'ACEITE DE GIRASOL': 1, 'SUBP. DE GIRASOL': 1 } },
  cebada:  { nombre: 'Cebada',  unidad: 't',            peso: { cebada: 1 }, incluir: ['cebada'], compras: ['cebada_forr', 'cebada_cerv'], djve: { 'CEBADA FORRAJERA': 1, 'CEBADA CERVECERA': 1 } },
  sorgo:   { nombre: 'Sorgo',   unidad: 't',            peso: { sorgo: 1 }, incluir: ['sorgo'], compras: ['sorgo'], djve: { 'SORGO': 1 } }
};
const LU_GRUPO_LBL = { soja_poroto: 'poroto', soja_harina: 'harina', soja_aceite: 'aceite', gira_grano: 'grano', gira_aceite: 'aceite', gira_harina: 'harina' };

const LU_ZONAS = [
  [/SAN LORENZO/, 'San Lorenzo / Timbúes'],
  [/ROSARIO/, 'Rosario / Gral. Lagos / A. Seco'],
  [/VILLA CONSTITUCION|SAN NICOLAS|RAMALLO/, 'V. Constitución / S. Nicolás'],
  [/SAN PEDRO/, 'San Pedro'],
  [/ZARATE|CAMPANA|LIMA|GUAZU/, 'Zárate / Campana / Guazú'],
  [/BUENOS AIRES|DOCK SUD|LA PLATA/, 'Buenos Aires / La Plata'],
  [/NECOCHEA|QUEQUEN/, 'Necochea (Quequén)'],
  [/BAHIA BLANCA|ROSALES/, 'Bahía Blanca'],
];
function luZona(p) {
  const P = String(p || '').toUpperCase();
  for (const [re, n] of LU_ZONAS) if (re.test(P)) return n;
  return P.charAt(0) + P.slice(1).toLowerCase();
}

// ─── Estilos del módulo ───
(function luEstilos() {
  const css = `
#lineup-space{display:none}
.lu-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:14px}
.lu-title{font-size:18px;font-weight:700}
.lu-sub{font-size:12px;color:var(--text-2);max-width:70ch}
.lu-src{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.lu-chip-src{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;border:1px solid var(--border);background:var(--bg-card);border-radius:999px;padding:4px 10px;color:var(--text-2)}
.lu-chip-src i{width:7px;height:7px;border-radius:50%;background:var(--es-green)}
.lu-chip-src.warn{background:var(--es-gold-light);border-color:var(--es-gold);color:#96700e}
.lu-chip-src.warn i{background:var(--es-gold)}
.lu-chip-src.bad{background:#fdecec;border-color:var(--red);color:#8c2020}
.lu-chip-src.bad i{background:var(--red)}
.lu-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.lu-pill{font:600 12px var(--font);border:1px solid var(--border);background:var(--bg-card);color:var(--text);padding:6px 13px;border-radius:999px;cursor:pointer}
.lu-pill.on{background:var(--es-green);border-color:var(--es-green);color:#fff}
.lu-pill.camp{font-family:var(--mono);font-size:11px}
.lu-sep{width:1px;height:22px;background:var(--border);margin:0 6px}
.lu-grid{display:grid;gap:14px;margin-bottom:14px}
.lu-g2{grid-template-columns:1.35fr 1fr}
.lu-g2b{grid-template-columns:1fr 1.35fr}
@media (max-width:980px){.lu-g2,.lu-g2b{grid-template-columns:1fr}}
.lu-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px 18px;min-width:0}
.lu-ch{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.lu-ch h3{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;margin:0;color:var(--text-2);font-weight:700}
.lu-ch span{font-size:10.5px;color:var(--text-3)}
.lu-need-top{display:flex;align-items:flex-end;gap:26px;flex-wrap:wrap}
.lu-big{font:600 36px/1 var(--mono);letter-spacing:-.02em}
.lu-big small{font-size:14px;color:var(--text-3);font-weight:500;margin-left:4px}
.lu-lbl{font-size:11.5px;color:var(--text-3);margin-top:6px}
.lu-pres{display:inline-block;font-weight:700;font-size:11.5px;padding:5px 10px;border-radius:999px;letter-spacing:.03em}
.lu-pres.alta{background:#f6dcd6;color:#a54132}
.lu-pres.media{background:var(--es-gold-light);color:#96700e}
.lu-pres.baja{background:var(--es-green-light);color:var(--es-green)}
.lu-stack{position:relative;display:flex;height:28px;border-radius:6px;overflow:hidden;margin-top:16px;background:var(--bg-input)}
.lu-stack>div{height:100%}
.lu-mark{position:absolute;top:0;bottom:0;width:3px;background:var(--text);border-radius:2px}
.lu-leg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:10px}
.lu-leg div{font-size:11.5px;color:var(--text-3)}
.lu-leg b{display:block;font:600 14px var(--mono);color:var(--text);margin-top:2px}
.lu-sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.lu-note{font-size:11.5px;color:var(--text-3);margin-top:12px;line-height:1.5}
.lu-note.sep{border-top:1px dashed var(--border);padding-top:10px}
.lu-kpis{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow)}
.lu-kpi{background:var(--bg-card);padding:14px 16px}
.lu-kpi .k{font-size:11px;color:var(--text-3);margin-bottom:6px;font-weight:600}
.lu-kpi .v{font:600 22px var(--mono)}
.lu-kpi .d{font-size:11px;color:var(--text-3);margin-top:4px}
.lu-up{color:#a54132}.lu-dn{color:var(--es-green)}
.lu-rows{display:grid;gap:9px}
.lu-row{display:grid;grid-template-columns:minmax(0,170px) 1fr 118px;align-items:center;gap:10px;font-size:12.5px}
.lu-row>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lu-bar2{height:11px;background:var(--bg-input);border-radius:3px;overflow:hidden}
.lu-bar2 i{display:block;height:100%;background:var(--es-green)}
.lu-row .n{text-align:right;white-space:nowrap;font-family:var(--mono);font-size:12px}
.lu-row .n em{font-style:normal;color:var(--text-3);font-size:10.5px;margin-left:4px}
.lu-tw{overflow-x:auto}
.lu-table{width:100%;border-collapse:collapse;font-size:12px}
.lu-table th{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3);font-weight:700;text-align:left;padding:0 8px 8px;border-bottom:1px solid var(--border);white-space:nowrap}
.lu-table td{padding:7px 8px;border-bottom:1px solid var(--border);white-space:nowrap}
.lu-table tr:last-child td{border-bottom:0}
.lu-table .r{text-align:right;font-family:var(--mono)}
.lu-table .b{font-weight:700}
.lu-table .t{color:var(--text-3);font-size:11px}
.lu-sect{font-size:11.5px}
.lu-sect td,.lu-sect th{padding-left:5px;padding-right:5px}
.lu-sect th{white-space:normal;line-height:1.25;vertical-align:bottom}
.lu-sect tr.tot td{background:var(--bg-input);font-weight:700}
.lu-eta{display:inline-block;font:500 11px var(--mono);background:var(--bg-input);padding:2px 6px;border-radius:4px}
.lu-eta.hoy{background:var(--es-gold-light);color:#96700e}
.lu-chart text{font-family:var(--mono);font-size:11px;fill:var(--text-3)}
.lu-empty{padding:28px;text-align:center;color:var(--text-3);font-size:12.5px}
.lu-setup{background:var(--es-gold-light);border:1px solid var(--es-gold);border-radius:var(--radius);padding:16px 18px;font-size:12.5px;color:#6d4f08;line-height:1.6}
.lu-setup code{font-family:var(--mono);background:#fff;padding:1px 5px;border-radius:4px}
.lu-loading{font-size:12px;color:var(--text-3)}
`;
  const st = document.createElement('style');
  st.id = 'lu-styles';
  st.textContent = css;
  document.head.appendChild(st);
})();

// ─── Contenedor del módulo ───
(function luCrearEspacio() {
  const cont = document.querySelector('.container');
  if (!cont || document.getElementById('lineup-space')) return;
  const div = document.createElement('div');
  div.id = 'lineup-space';
  div.innerHTML = `
    <div class="lu-head">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:28px;">🚢</span>
        <div>
          <div class="lu-title">Line-Up y Necesidad de Compra</div>
          <div class="lu-sub">Qué tiene que embarcar la exportación en las próximas semanas, cuánto ya compró y cuánto le falta originar.</div>
        </div>
      </div>
      <div class="lu-src" id="lu-src"></div>
    </div>
    <div id="lu-body"></div>`;
  cont.appendChild(div);
})();

// ─── Navegación: entrar/salir del módulo ───
function toggleLineUp() {
  lineupMode = true;
  theoryMode = false; retMode = false; paseMode = false; asstMode = false; spreadMode = false;
  if (typeof desvioMode !== 'undefined') desvioMode = false;
  if (typeof futOpcMode !== 'undefined') futOpcMode = false;
  ['workspace', 'theory-space', 'ret-space', 'pase-space', 'spreads-space', 'desvio-space', 'alertas-space', 'futopc-space']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  ['tabs-container', 'mkt-bar', 'fob-bar'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  document.getElementById('lineup-space').style.display = 'block';
  luMarcarPill();
  luRender();
  const edad = luData && luData._recibido ? (Date.now() - luData._recibido) / 60000 : Infinity;
  if (edad > LU_REFRESCO_MIN) luCargar(false);
}

function luMarcarPill() {
  document.querySelectorAll('.mod-pill').forEach(p => p.classList.toggle('active', p.id === 'pill-lineup'));
}

// Al ir a cualquier otro módulo, se oculta el Line-Up.
(function luEnvolverNavegacion() {
  ['switchToWorkspace', 'toggleTheory', 'toggleRetenciones', 'togglePases', 'toggleSpreads', 'toggleDesvio'].forEach(fn => {
    const orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function () {
      lineupMode = false;
      const el = document.getElementById('lineup-space');
      if (el) el.style.display = 'none';
      return orig.apply(this, arguments);
    };
  });
  const origRT = window.renderTabs;
  if (typeof origRT === 'function') {
    window.renderTabs = function () {
      const r = origRT.apply(this, arguments);
      if (lineupMode) { const tc = document.getElementById('tabs-container'); if (tc) tc.style.display = 'none'; }
      return r;
    };
  }
  const origRM = window.renderModules;
  if (typeof origRM === 'function') {
    window.renderModules = function () {
      const r = origRM.apply(this, arguments);
      if (lineupMode) luMarcarPill();
      return r;
    };
  }
})();

// ─── Datos ───
function luJsonp(force) {
  return new Promise((resolve, reject) => {
    const cb = 'luCb' + Date.now();
    const s = document.createElement('script');
    const limpiar = () => { clearTimeout(t); try { delete window[cb]; } catch (e) { window[cb] = undefined; } s.remove(); };
    const t = setTimeout(() => { limpiar(); reject(new Error('El servicio tardó más de 90 segundos en responder')); }, 90000);
    window[cb] = d => { limpiar(); resolve(d); };
    s.onerror = () => { limpiar(); reject(new Error('No se pudo conectar con el servicio de datos (Apps Script)')); };
    s.src = LU_API + (LU_API.includes('?') ? '&' : '?') + 'callback=' + cb + (force ? '&force=1' : '');
    document.body.appendChild(s);
  });
}

async function luCargar(force) {
  if (!LU_API || luCargando) return;
  luCargando = true; luError = null; luRender();
  try {
    const d = await luJsonp(force);
    if (!d || d.ok === false) throw new Error((d && d.error) || 'Respuesta vacía del servicio');
    d._recibido = Date.now();
    luData = d;
    try { localStorage.setItem(LU_CACHE_KEY, JSON.stringify(d)); } catch (e) { /* sin espacio: seguir */ }
  } catch (e) {
    luError = e.message || String(e);
  }
  luCargando = false;
  if (lineupMode) luRender();
}

(function luCacheLocal() {
  try { const raw = localStorage.getItem(LU_CACHE_KEY); if (raw) luData = JSON.parse(raw); } catch (e) { luData = null; }
})();

function luFilas() {
  const lu = luData && luData.lineup;
  if (!lu || !lu.filas) return [];
  if (!lu.cols) return lu.filas;
  return lu.filas.map(a => { const o = {}; lu.cols.forEach((k, i) => o[k] = a[i]); return o; });
}

// ─── Formatos ───
const luF1 = v => v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function luT(t) {                 // toneladas → texto corto
  const a = Math.abs(t);
  if (a >= 1e6) return (t / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + ' Mt';
  if (a >= 1e3) return Math.round(t / 1e3).toLocaleString('es-AR') + ' mil t';
  return Math.round(t).toLocaleString('es-AR') + ' t';
}
function luMilT(v) { return v == null ? '–' : luT(v * 1000); }   // compras vienen en miles de t
function luFechaCorta(iso) {
  if (!iso) return '–';
  const d = new Date(iso + 'T12:00:00');
  return d.getDate() + '-' + ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][d.getMonth()];
}
function luEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ─── Cálculos ───
function luCompras(prodKey, camp) {
  const P = LU_PRODS[prodKey], co = luData && luData.compras && luData.compras.productos;
  if (!co) return null;
  const CAMPOS = ['semanal', 'total', 'hecho', 'afijar', 'fijado', 'saldo', 'djve'];
  const vacio = () => ({ semanal: 0, total: 0, hecho: 0, afijar: 0, fijado: 0, saldo: 0, djve: 0, prevTotal: 0, hayPrev: false, fecha: null, hay: false });
  const S = { exp: vacio(), ind: vacio(), tot: vacio() };
  P.compras.forEach(k => {
    const c = co[k] && co[k][camp];
    if (!c) return;
    ['exp', 'ind', 'tot'].forEach(sec => {
      const e = c[sec];
      if (!e) return;
      const a = S[sec]; a.hay = true;
      CAMPOS.forEach(f => a[f] += e[f] || 0);
      if (e.prev && e.prev.total != null) { a.prevTotal += e.prev.total; a.hayPrev = true; }
      if (e.fecha) a.fecha = e.fecha;
    });
  });
  if (!S.exp.hay) return null;
  const e = S.exp;
  return { total: e.total, hecho: e.hecho, afijar: e.afijar, saldo: e.saldo, djve: e.djve, prevTotal: e.prevTotal, sect: S };
}

// Tabla igual al cuadro de SAGyP (miles de t), para poder controlar fila por fila.
function luTablaSectores(co) {
  const f = v => v == null ? '–' : v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fechaGral = luData.compras && luData.compras.fecha;
  const fila = (lbl, a, cls) => {
    if (!a.hay) return '';
    const yoy = a.hayPrev && a.prevTotal > 0 ? a.total / a.prevTotal - 1 : null;
    const nota = a.fecha && a.fecha !== fechaGral ? ` <span class="t">al ${luEsc(a.fecha.replace(/\/\d{4}$/, ''))}</span>` : '';
    return `<tr class="${cls || ''}"><td>${lbl}${nota}</td><td class="r">${f(a.total)}</td><td class="r">${f(a.hecho)}</td><td class="r">${f(a.afijar)}</td><td class="r">${f(a.fijado)}</td><td class="r">${f(a.saldo)}</td><td class="r">${f(a.djve)}</td>
      <td class="r">${yoy == null ? '–' : `<span class="${yoy >= 0 ? 'lu-dn' : 'lu-up'}">${yoy >= 0 ? '+' : ''}${Math.round(yoy * 100)}%</span>`}</td></tr>`;
  };
  return `<div class="lu-tw" style="margin-top:14px"><table class="lu-table lu-sect">
    <thead><tr><th>Miles de t · ${luEsc(luCamp)}</th><th class="r">Comprado</th><th class="r">Precio hecho</th><th class="r">A fijar</th><th class="r">Fijado</th><th class="r">Saldo a fijar</th><th class="r">DJVE</th><th class="r">vs año ant.</th></tr></thead>
    <tbody>${fila('Exportación', co.sect.exp)}${fila('Industria', co.sect.ind)}${fila('<b>Total</b>', co.sect.tot, 'tot')}</tbody></table></div>`;
}

function luCampanas(prodKey) {
  const co = luData && luData.compras && luData.compras.productos;
  if (!co) return [];
  const set = new Set();
  LU_PRODS[prodKey].compras.forEach(k => Object.keys(co[k] || {}).forEach(c => set.add(c)));
  return [...set].sort();
}

function luCampDefault(prodKey) {
  const cs = luCampanas(prodKey);
  if (!cs.length) return null;
  const dj = cs.map(c => (luCompras(prodKey, c) || {}).djve || 0);
  const mx = Math.max(...dj);
  for (let i = cs.length - 1; i >= 0; i--) if (dj[i] >= 0.3 * mx && mx > 0) return cs[i];
  return cs[cs.length - 1];
}

function luDjveMes(prodKey, offset) {
  const dj = luData && luData.djve && luData.djve.campanas;
  if (!dj) return null;
  const hoy = new Date(); const d = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1);
  const lbl = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][d.getMonth()] + '-' + d.getFullYear();
  const pesos = LU_PRODS[prodKey].djve;
  let tot = 0, hay = false;
  Object.values(dj).forEach(c => {
    const i = (c.meses || []).indexOf(lbl);
    if (i < 0) return;
    Object.keys(pesos).forEach(n => { const f = c.filas && c.filas[n]; if (f) { tot += (f.meses[i] || 0) * pesos[n]; hay = true; } });
  });
  return hay ? { t: tot, lbl } : null;
}

// ─── Render ───
function luRender() {
  const body = document.getElementById('lu-body');
  if (!body) return;
  luRenderFuentes();
  if (!LU_API) { body.innerHTML = luSetupHtml(); return; }
  if (!luData) {
    body.innerHTML = luCargando ? '<div class="lu-card lu-empty">⏳ Consultando ISA y SAGyP… la primera vez puede tardar hasta un minuto.</div>'
      : `<div class="lu-card lu-empty">${luError ? '⚠️ ' + luEsc(luError) : 'Sin datos todavía.'}<br><br><button class="btn btn-sm" onclick="luCargar(true)">Reintentar</button></div>`;
    return;
  }
  if (!LU_PRODS[luProd]) luProd = 'maiz';
  const camps = luCampanas(luProd);
  if (!luCamp || !camps.includes(luCamp)) luCamp = luCampDefault(luProd);
  const P = LU_PRODS[luProd];

  const filas = luFilas();
  const fotoIso = luData.lineup && luData.lineup.fecha;
  const f0 = fotoIso ? new Date(fotoIso + 'T12:00:00') : new Date();
  const arg = filas.filter(r => !r.uy);
  const mias = arg.filter(r => P.peso[r.grupo]);
  const w = r => r.t * (P.peso[r.grupo] || 0);
  const totLU = mias.reduce((s, r) => s + w(r), 0);
  const uyT = filas.filter(r => r.uy && P.peso[r.grupo]).reduce((s, r) => s + w(r), 0);
  const nBuques = new Set(mias.map(r => r.buque)).size;

  // semanas por ETS
  const semOf = r => { if (!r.ets) return 0; const d = Math.round((new Date(r.ets + 'T12:00:00') - f0) / 86400000); return d < 7 ? 0 : d < 14 ? 1 : d < 21 ? 2 : 3; };
  const sem = [0, 0, 0, 0]; mias.forEach(r => sem[semOf(r)] += w(r));
  let prev = null, prevTot = null;
  const aa = luData.anioAnterior;
  if (aa && aa.filas) {
    prev = [0, 0, 0, 0];
    aa.filas.forEach(r => { const p = P.peso[r.grupo]; if (p && !/NUEVA PALMIRA|MONTEVIDEO/.test(r.puerto)) prev[r.semana] += r.t * p; });
    prevTot = prev.reduce((a, b) => a + b, 0);
  }

  // zonas y exportadores
  const zonas = {}, expo = {};
  mias.forEach(r => { const z = luZona(r.puerto); zonas[z] = (zonas[z] || 0) + w(r); const e = (r.exportador || 'S/D').replace(/\s+(PY|UY)$/, ''); expo[e] = (expo[e] || 0) + w(r); });
  const zonasArr = Object.entries(zonas).sort((a, b) => b[1] - a[1]);
  let expoArr = Object.entries(expo).sort((a, b) => b[1] - a[1]);
  if (expoArr.length > 9) { const otros = expoArr.slice(8).reduce((s, x) => s + x[1], 0); expoArr = expoArr.slice(0, 8).concat([['Otros', otros]]); }

  // próximos buques (incluye aceite en soja/girasol)
  const lim = new Date(f0); lim.setDate(lim.getDate() - 1);
  const prox = arg.filter(r => P.incluir.includes(r.grupo) && r.etb && new Date(r.etb + 'T12:00:00') >= lim)
    .sort((a, b) => a.etb.localeCompare(b.etb) || b.t - a.t).slice(0, 14);

  const co = luCamp ? luCompras(luProd, luCamp) : null;
  const djm = luDjveMes(luProd, 0), djm1 = luDjveMes(luProd, 1);

  body.innerHTML = `
    <div class="lu-bar">
      ${Object.entries(LU_PRODS).map(([k, p]) => `<button class="lu-pill ${k === luProd ? 'on' : ''}" onclick="luSetProd('${k}')">${p.nombre}</button>`).join('')}
      <span class="lu-sep"></span>
      ${camps.map(c => `<button class="lu-pill camp ${c === luCamp ? 'on' : ''}" onclick="luSetCamp('${c}')">${c}</button>`).join('')}
      <span style="flex:1"></span>
      <button class="btn btn-sm btn-outline" onclick="luCargar(true)" ${luCargando ? 'disabled' : ''}>${luCargando ? '⏳ Actualizando…' : '🔄 Actualizar ahora'}</button>
    </div>
    ${luError ? `<div class="lu-setup" style="margin-bottom:14px;">⚠️ No se pudo actualizar: ${luEsc(luError)}. Se muestran los últimos datos recibidos.</div>` : ''}
    <div class="lu-grid lu-g2">
      ${luPanelCompras(P, co)}
      <div class="lu-kpis">
        <div class="lu-kpi"><div class="k">Line-up nominado · ${luEsc(P.nombre)}</div><div class="v">${luT(totLU)}</div><div class="d">${P.unidad} · ${nBuques} buques · foto ${luFechaCorta(fotoIso)}</div></div>
        <div class="lu-kpi"><div class="k">vs misma fecha año anterior</div>${prevTot ? `<div class="v ${totLU >= prevTot ? 'lu-up' : 'lu-dn'}">${totLU >= prevTot ? '+' : ''}${Math.round((totLU / prevTot - 1) * 100)}%</div><div class="d">${luT(prevTot)} el ${luFechaCorta(aa.fecha)}-${aa.fecha.slice(2, 4)}</div>` : `<div class="v" style="font-size:15px;color:var(--text-3)">Sin histórico</div><div class="d">se completa con cargarHistorico() en el Apps Script</div>`}</div>
        <div class="lu-kpi"><div class="k">Saldo a fijar · exportación + industria</div><div class="v">${co ? luMilT(co.sect.tot.hay ? co.sect.tot.saldo : co.saldo) : '–'}</div><div class="d">${co ? 'exportación ' + luMilT(co.sect.exp.saldo) + (co.sect.ind.hay ? ' · industria ' + luMilT(co.sect.ind.saldo) : '') : ''}</div></div>
        <div class="lu-kpi"><div class="k">DJVE con embarque en ${djm ? djm.lbl : 'el mes'}</div><div class="v">${djm ? luT(djm.t) : '–'}</div><div class="d">${djm1 ? djm1.lbl + ': ' + luT(djm1.t) : ''}</div></div>
      </div>
    </div>
    <div class="lu-grid lu-g2">
      <div class="lu-card">
        <div class="lu-ch"><h3>Embarques nominados por semana de zarpada</h3><span>${P.unidad}</span></div>
        ${luChart(sem, prev, f0)}
        <div class="lu-note">Las semanas más lejanas siempre se ven flacas porque los buques se nominan a medida que se acercan. Por eso la comparación válida es contra el line-up que se veía a la misma fecha del año anterior.</div>
      </div>
      <div class="lu-card">
        <div class="lu-ch"><h3>Por zona portuaria</h3><span>${P.unidad}</span></div>
        ${zonasArr.length ? luBarras(zonasArr, totLU) : '<div class="lu-empty">Sin buques nominados.</div>'}
        ${uyT > 0 ? `<div class="lu-note">No incluye ${luT(uyT)} en puertos de Uruguay.</div>` : ''}
      </div>
    </div>
    <div class="lu-grid lu-g2b">
      <div class="lu-card">
        <div class="lu-ch"><h3>Exportadores en el line-up</h3><span>${P.unidad}</span></div>
        ${expoArr.length ? luBarras(expoArr, totLU) : '<div class="lu-empty">Sin buques nominados.</div>'}
      </div>
      <div class="lu-card">
        <div class="lu-ch"><h3>Próximos buques</h3><span>por fecha de atraque</span></div>
        ${prox.length ? `<div class="lu-tw"><table class="lu-table"><thead><tr><th>Atraque</th><th>Buque · terminal</th><th>Exportador</th><th>Destino</th><th class="r">Toneladas</th></tr></thead><tbody>
          ${prox.map(r => `<tr><td><span class="lu-eta ${(new Date(r.etb + 'T12:00:00') - f0) / 86400000 <= 3 ? 'hoy' : ''}">${luFechaCorta(r.etb)}</span></td>
            <td><span class="b">${luEsc(r.buque)}</span><br><span class="t">${luEsc(r.muelle)} · ${luEsc(luZona(r.puerto))}</span></td>
            <td>${luEsc(r.exportador)}</td><td>${luEsc(r.destino)}${LU_GRUPO_LBL[r.grupo] ? ` <span class="t">· ${LU_GRUPO_LBL[r.grupo]}</span>` : ''}</td>
            <td class="r">${Math.round(r.t).toLocaleString('es-AR')}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="lu-empty">Sin buques próximos.</div>'}
      </div>
    </div>
    <div class="lu-note sep">
      <b>Fuentes:</b> line-up de ISA Agents (foto ${luFechaCorta(fotoIso)}); compras y DJVE de la SAGyP (${luEsc(luData.compras ? luData.compras.fecha : '–')}); DJVE por mes de embarque (${luEsc(luData.djve ? luData.djve.fecha : '–')}).
      Line-up: toneladas nominadas por buque (carga, no descarga), sin puertos de Uruguay. Soja en poroto equivalente: poroto + (harina + cascarilla) ÷ ${String(LU_SOJA_COEF).replace('.', ',')}; el aceite se lista en los buques pero no se suma, para no contar dos veces el mismo poroto.
      Cobertura = compras de la exportación ÷ DJVE registradas; presión alta por debajo de 95%, media entre 95% y 105%, baja por encima.
    </div>`;
}

function luPanelCompras(P, co) {
  if (!co) return `<div class="lu-card"><div class="lu-ch"><h3>Compras vs DJVE</h3></div><div class="lu-empty">Sin datos de compras para ${luEsc(P.nombre)}.</div></div>`;
  const diff = co.total - co.djve, cob = co.djve > 0 ? co.total / co.djve : null;
  const lvl = cob == null ? 'baja' : cob < 0.95 ? 'alta' : cob < 1.05 ? 'media' : 'baja';
  const sc = Math.max(co.total, co.djve) || 1;
  const pct = v => (v / sc * 100).toFixed(2) + '%';
  const dAbs = Math.abs(diff);
  const bigTxt = (diff >= 0 ? '+' : '−') + (dAbs < 1000 ? Math.round(dAbs).toLocaleString('es-AR') + '<small>mil t</small>' : luF1(dAbs / 1000) + '<small>Mt</small>');
  const yoy = co.prevTotal > 0 ? co.total / co.prevTotal - 1 : null;
  let extra = 'La cobertura se mide solo con la exportación, porque las DJVE son sus ventas al exterior; la industria compra para procesar y aparece en la tabla de abajo. ';
  if (LU_PRODS[luProd].compras.length > 1) extra += 'Suma cebada forrajera y cervecera. ';
  return `
    <div class="lu-card">
      <div class="lu-ch"><h3>Compras vs DJVE · exportación ${luEsc(luCamp)}</h3><span>SAGyP al ${luEsc(luData.compras.fecha)}</span></div>
      <div class="lu-need-top">
        <div><div class="lu-big" style="color:${diff >= 0 ? 'var(--es-green)' : '#a54132'}">${bigTxt}</div><div class="lu-lbl">${diff >= 0 ? 'Compras por encima de DJVE' : 'Falta comprar para cubrir DJVE'}</div></div>
        <div><div class="lu-big" style="font-size:26px">${cob == null ? '–' : Math.round(cob * 100) + '%'}</div><div class="lu-lbl">DJVE cubiertas con compras</div></div>
        <div><span class="lu-pres ${lvl}">${lvl.toUpperCase()}</span><div class="lu-lbl">Presión compradora</div></div>
        <div><div class="lu-big" style="font-size:20px">${yoy == null ? '–' : `<span class="${yoy >= 0 ? 'lu-dn' : 'lu-up'}">${yoy >= 0 ? '+' : ''}${Math.round(yoy * 100)}%</span>`}</div><div class="lu-lbl">Compras export. vs año anterior</div></div>
      </div>
      <div class="lu-stack" title="Compras de la exportación frente a DJVE registradas">
        <div style="width:${pct(co.hecho)};background:var(--es-green)"></div>
        <div style="width:${pct(co.afijar)};background:#7fb3a6"></div>
        ${diff < 0 ? `<div style="width:${pct(dAbs)};background:#a54132"></div>` : ''}
        ${co.djve > 0 ? `<span class="lu-mark" style="left:min(calc(${pct(co.djve)} - 1px), calc(100% - 3px))"></span>` : ''}
      </div>
      <div class="lu-leg">
        <div><span class="lu-sw" style="background:var(--es-green)"></span>Precio hecho<b>${luMilT(co.hecho)}</b></div>
        <div><span class="lu-sw" style="background:#7fb3a6"></span>A fijar<b>${luMilT(co.afijar)}</b></div>
        <div><span class="lu-sw" style="background:${diff >= 0 ? 'var(--text)' : '#a54132'}"></span>${diff >= 0 ? 'Excedente sobre DJVE' : 'Falta comprar'}<b>${luMilT(dAbs)}</b></div>
      </div>
      <div class="lu-note sep">La línea negra marca las DJVE registradas (${luMilT(co.djve)}). Por encima del 100% la exportación ya compró más de lo que declaró vender (está larga de físico); por debajo, tiene que salir a comprar. ${extra}</div>
      ${luTablaSectores(co)}
    </div>`;
}

function luBarras(arr, tot) {
  const mx = Math.max(...arr.map(a => a[1])) || 1;
  return `<div class="lu-rows">${arr.map(([k, v]) => `<div class="lu-row"><span title="${luEsc(k)}">${luEsc(k)}</span><div class="lu-bar2"><i style="width:${(v / mx * 100).toFixed(1)}%"></i></div><span class="n">${luT(v)}<em>${tot ? Math.round(v / tot * 100) : 0}%</em></span></div>`).join('')}</div>`;
}

function luChart(sem, prev, f0) {
  const W = 620, H = 230, L = 58, R = 12, T = 16, B = 34, iw = W - L - R, ih = H - T - B;
  const vmax = Math.max(...sem, ...(prev || [0]), 1);
  const paso = [50e3, 100e3, 250e3, 500e3, 1e6, 2e6].find(p => vmax / p <= 5) || 2e6;
  const max = Math.ceil(vmax / paso) * paso;
  const y = v => T + ih - v / max * ih, bw = iw / 4;
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const lbl = i => {
    const a = new Date(f0); a.setDate(a.getDate() + i * 7);
    if (i === 3) return 'desde ' + a.getDate() + ' ' + MES[a.getMonth()];
    const b = new Date(a); b.setDate(b.getDate() + 6);
    return a.getMonth() === b.getMonth() ? a.getDate() + '–' + b.getDate() + ' ' + MES[b.getMonth()] : a.getDate() + ' ' + MES[a.getMonth()] + '–' + b.getDate() + ' ' + MES[b.getMonth()];
  };
  let s = `<svg class="lu-chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Toneladas por semana de zarpada">`;
  for (let t = 0; t <= max + 1; t += paso) s += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#dde0d5"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${t ? (t >= 1e6 ? (t / 1e6).toLocaleString('es-AR') + 'M' : t / 1e3 + 'k') : '0'}</text>`;
  sem.forEach((v, i) => {
    const x = L + i * bw + bw * .2, w = bw * .6, h = T + ih - y(v), inside = h > 24;
    s += `<rect x="${x}" y="${y(v)}" width="${w}" height="${h}" rx="3" fill="${i === 0 ? '#1A6B3C' : '#C8A44A'}"/>`;
    if (v > 0) s += `<text x="${x + w / 2}" y="${inside ? y(v) + 17 : y(v) - 6}" text-anchor="middle" style="fill:${inside ? '#ffffff' : '#1c2118'};font-weight:600">${Math.round(v / 1000)}k</text>`;
    s += `<text x="${x + w / 2}" y="${H - 12}" text-anchor="middle">${lbl(i)}</text>`;
    if (prev) s += `<line x1="${x - 8}" x2="${x + w + 8}" y1="${y(prev[i])}" y2="${y(prev[i])}" stroke="#1c2118" stroke-width="2" stroke-dasharray="5 3"/>`;
  });
  s += `</svg><div class="lu-note" style="display:flex;gap:16px;flex-wrap:wrap;margin-top:4px">
    <span><span class="lu-sw" style="background:#1A6B3C"></span>Semana en curso</span>
    <span><span class="lu-sw" style="background:#C8A44A"></span>Próximas semanas (nominado)</span>
    ${prev ? '<span><span class="lu-sw" style="background:none;border-top:2px dashed #1c2118;height:0;width:16px;border-radius:0"></span>Misma fecha año anterior</span>' : '<span>Sin histórico del año anterior todavía</span>'}</div>`;
  return s;
}
function luIsoL(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

function luRenderFuentes() {
  const el = document.getElementById('lu-src');
  if (!el) return;
  if (!luData || !luData.fuentes) { el.innerHTML = luCargando ? '<span class="lu-loading">⏳ Actualizando…</span>' : ''; return; }
  const F = luData.fuentes;
  const chip = (f, nombre, fecha) => {
    if (!f) return '';
    const cls = f.ok ? '' : (fecha ? 'warn' : 'bad');
    const tip = f.ok ? 'Dato actualizado' : 'La fuente no respondió (' + (f.error || '') + '). Se muestra el último dato guardado.';
    return `<span class="lu-chip-src ${cls}" title="${luEsc(tip)}"><i></i>${nombre} · ${luEsc(fecha || 'sin datos')}${f.ok ? '' : ' (respaldo)'}</span>`;
  };
  el.innerHTML = chip(F.lineup, 'Line-up ISA', F.lineup && luFechaCorta(F.lineup.fecha))
    + chip(F.compras, 'Compras SAGyP', F.compras && F.compras.fecha)
    + chip(F.djve, 'DJVE', F.djve && F.djve.fecha)
    + (luCargando ? '<span class="lu-loading">⏳ Actualizando…</span>' : '');
}

function luSetupHtml() {
  return `<div class="lu-setup">
    <b>Falta conectar el servicio de datos.</b><br>
    El módulo necesita un Google Apps Script que vaya a buscar el line-up de ISA y las compras y DJVE de la SAGyP.
    Seguí los pasos de <code>LEEME_LineUp.txt</code> (carpeta de la Suite) y pegá la URL que termina en <code>/exec</code>
    en la constante <code>LU_API</code>, al principio de <code>lineup.js</code>.
  </div>`;
}

function luSetProd(k) { luProd = k; luCamp = null; luRender(); }
function luSetCamp(c) { luCamp = c; luRender(); }
