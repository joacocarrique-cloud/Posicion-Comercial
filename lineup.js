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
// Panel de destinos: país o región, toneladas / promedio mensual / participación, carga (en soja y girasol), ver todos.
let luDestVista = 'pais', luDestModo = 't', luDestCarga = 'todo', luDestTodos = false;

const LU_PRODS = {
  maiz:    { nombre: 'Maíz',    unidad: 't',            peso: { maiz: 1 }, incluir: ['maiz'], compras: ['maiz'], djve: { 'MAIZ': 1 } },
  soja:    { nombre: 'Soja',    unidad: 't poroto eq.', peso: { soja_poroto: 1, soja_harina: 1 / LU_SOJA_COEF }, incluir: ['soja_poroto', 'soja_harina', 'soja_aceite'], compras: ['soja'], industria: true, djve: { 'SOJA': 1, 'SUBP. DE SOJA': 1 / LU_SOJA_COEF } },
  trigo:   { nombre: 'Trigo',   unidad: 't',            peso: { trigo: 1 }, incluir: ['trigo'], compras: ['trigo'], djve: { 'TRIGO PAN': 1 } },
  girasol: { nombre: 'Girasol', unidad: 't producto',   peso: { gira_grano: 1, gira_aceite: 1, gira_harina: 1 }, incluir: ['gira_grano', 'gira_aceite', 'gira_harina'], compras: ['girasol'], industria: true, djve: { 'GIRASOL': 1, 'ACEITE DE GIRASOL': 1, 'SUBP. DE GIRASOL': 1 } },
  cebada:  { nombre: 'Cebada',  unidad: 't',            peso: { cebada: 1 }, incluir: ['cebada'], compras: ['cebada_forr', 'cebada_cerv'], djve: { 'CEBADA FORRAJERA': 1, 'CEBADA CERVECERA': 1 } },
  sorgo:   { nombre: 'Sorgo',   unidad: 't',            peso: { sorgo: 1 }, incluir: ['sorgo'], compras: ['sorgo'], djve: { 'SORGO': 1 } }
};
// Necesidad inmediata: por sector comprador, qué DJVE (t de producto → t de grano) y qué cargas del line-up
// representan lo que tiene que embarcar. La exportación se mide en grano; en soja se suma la industria
// (harina en poroto eq.), que es la que más compra.
LU_PRODS.maiz.nec    = [{ sec: 'exp', lbl: 'Exportación', djve: { 'MAIZ': 1 }, lu: { maiz: 1 } }];
LU_PRODS.soja.nec    = [{ sec: 'exp', lbl: 'Exportación (poroto)', djve: { 'SOJA': 1 }, lu: { soja_poroto: 1 } },
                        { sec: 'ind', lbl: 'Industria (harina en poroto eq.)', djve: { 'SUBP. DE SOJA': 1 / LU_SOJA_COEF }, lu: { soja_harina: 1 / LU_SOJA_COEF } }];
LU_PRODS.trigo.nec   = [{ sec: 'exp', lbl: 'Exportación', djve: { 'TRIGO PAN': 1 }, lu: { trigo: 1 } }];
LU_PRODS.girasol.nec = [{ sec: 'exp', lbl: 'Exportación (grano)', djve: { 'GIRASOL': 1 }, lu: { gira_grano: 1 } }];
LU_PRODS.cebada.nec  = [{ sec: 'exp', lbl: 'Exportación', djve: { 'CEBADA FORRAJERA': 1, 'CEBADA CERVECERA': 1 }, lu: { cebada: 1 } }];
LU_PRODS.sorgo.nec   = [{ sec: 'exp', lbl: 'Exportación', djve: { 'SORGO': 1 }, lu: { sorgo: 1 } }];

// Semanas de embarque ya compradas por delante: por debajo de este número la presión es media.
function luSemanasMedia() {
  return (typeof RS_REGLAS !== 'undefined' && RS_REGLAS.lineup && RS_REGLAS.lineup.semanasCobertura) || 4;
}

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
.lu-nec-grid{display:grid;gap:14px}
.lu-nec-grid.multi{grid-template-columns:1fr 1fr}
.lu-nec-grid.multi .lu-big{font-size:28px}
@media (max-width:640px){.lu-nec-grid.multi{grid-template-columns:1fr}}
.lu-nec-t{font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.lu-nec .lu-need-top{gap:18px}
.lu-nec-tab td:first-child{white-space:normal}
.lu-nec-tab td:first-child .t{display:block}
.lu-g2>.lu-kpis{align-self:start}
.lu-nueva td:first-child,.lu-nueva td:last-child{white-space:normal}
.lu-nueva td:last-child .t{display:block}
.lu-mini{position:relative;display:flex;align-items:flex-end;gap:6px;height:70px;border-bottom:1px solid var(--border)}
.lu-mini>i{flex:1;border-radius:3px 3px 0 0}
.lu-mini>b{position:absolute;left:0;right:0;height:0;border-top:2px dashed var(--text)}
.lu-mini-lbl{display:flex;gap:6px;margin-top:4px}
.lu-mini-lbl span{flex:1;text-align:center;font:10px var(--mono);color:var(--text-3)}
.lu-ctrl{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.lu-ctrl .lu-pill{padding:4px 10px;font-size:11px}
.lu-ctrl .lu-sep{height:18px;margin:0 3px}
.lu-dest td:first-child{white-space:normal;min-width:150px}
.lu-dest td:first-child .t{display:block}
.lu-dest th.grp{text-align:center;border-bottom:0;padding-bottom:2px;color:var(--text-2)}
.lu-dest th small{display:block;font-weight:500;text-transform:none;letter-spacing:0;color:var(--text-3)}
.lu-dest .sepL{border-left:2px solid var(--border)}
.lu-dest tr.otros td{color:var(--text-2)}
.lu-dest td.r.nd{color:var(--text-3)}
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
  const vacio = () => ({ semanal: 0, total: 0, hecho: 0, afijar: 0, fijado: 0, saldo: 0, djve: 0, prevTotal: 0, prevSemanal: 0, hayPrev: false, fecha: null, hay: false });
  const S = { exp: vacio(), ind: vacio(), tot: vacio() };
  P.compras.forEach(k => {
    const c = co[k] && co[k][camp];
    if (!c) return;
    ['exp', 'ind', 'tot'].forEach(sec => {
      const e = c[sec];
      if (!e) return;
      const a = S[sec]; a.hay = true;
      CAMPOS.forEach(f => a[f] += e[f] || 0);
      if (e.prev && e.prev.total != null) { a.prevTotal += e.prev.total; a.prevSemanal += e.prev.semanal || 0; a.hayPrev = true; }
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

// Campaña que se está embarcando: la que tiene más DJVE con embarque en el mes en curso y el siguiente.
// Si ninguna tiene DJVE en esa ventana, la última campaña con DJVE relevantes.
function luCampDefault(prodKey) {
  const cs = luCampanas(prodKey);
  if (!cs.length) return null;
  const pesos = LU_PRODS[prodKey].nec[0].djve;
  let best = null, bestV = 0;
  cs.forEach(c => { const t = luDjveTramos(c, pesos); const v = t ? t.mes + t.sig : 0; if (v > bestV) { bestV = v; best = c; } });
  if (best) return best;
  const dj = cs.map(c => (luCompras(prodKey, c) || {}).djve || 0);
  const mx = Math.max(...dj);
  for (let i = cs.length - 1; i >= 0; i--) if (dj[i] >= 0.3 * mx && mx > 0) return cs[i];
  return cs[cs.length - 1];
}

// Cosecha nueva: la campaña siguiente a la que se está embarcando (si SAGyP ya la informa).
function luCampNueva(prodKey, vigente) {
  const cs = luCampanas(prodKey), i = cs.indexOf(vigente);
  return i >= 0 && i < cs.length - 1 ? cs[i + 1] : null;
}

const LU_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function luMesLbl(lbl) {            // "sep-2026" → 1° de septiembre de 2026
  const m = String(lbl || '').toLowerCase().match(/^([a-z]{3})-(\d{4})$/);
  const i = m ? LU_MES.indexOf(m[1]) : -1;
  return i < 0 ? null : new Date(+m[2], i, 1);
}
function luMesTxt(d) { return LU_MES[d.getMonth()] + '-' + String(d.getFullYear()).slice(2); }
function luMesesRef() {             // mes anterior, en curso y siguiente
  const h = new Date();
  return { ant: new Date(h.getFullYear(), h.getMonth() - 1, 1), m0: new Date(h.getFullYear(), h.getMonth(), 1), m1: new Date(h.getFullYear(), h.getMonth() + 1, 1) };
}

// DJVE de una campaña (t de grano) según mes de embarque: ya vencidas, mes en curso, mes siguiente y posteriores.
function luDjveTramos(camp, pesos) {
  const c = luData && luData.djve && luData.djve.campanas && luData.djve.campanas[camp];
  if (!c || !c.meses || !c.filas) return null;
  const { m0, m1 } = luMesesRef();
  const r = { vencido: 0, mes: 0, sig: 0, despues: 0, hay: false };
  c.meses.forEach((lbl, i) => {
    const d = luMesLbl(lbl);
    if (!d) return;
    let v = 0;
    Object.keys(pesos).forEach(n => { const f = c.filas[n]; if (f) { v += (f.meses[i] || 0) * pesos[n]; r.hay = true; } });
    if (d < m0) r.vencido += v; else if (+d === +m0) r.mes += v; else if (+d === +m1) r.sig += v; else r.despues += v;
  });
  return r.hay ? r : null;
}

// Line-up (sin Uruguay) por semana de zarpada, ponderado por grupo de carga.
function luFotoF0() { const iso = luData && luData.lineup && luData.lineup.fecha; return iso ? new Date(iso + 'T12:00:00') : new Date(); }
function luSemDe(r, f0) {
  if (!r.ets) return 0;
  const d = Math.round((new Date(r.ets + 'T12:00:00') - f0) / 86400000);
  return d < 7 ? 0 : d < 14 ? 1 : d < 21 ? 2 : 3;
}
function luSemanas(pesos) {
  const f0 = luFotoF0(), sem = [0, 0, 0, 0];
  luFilas().forEach(r => { const p = pesos[r.grupo]; if (p && !r.uy) sem[luSemDe(r, f0)] += r.t * p; });
  return sem;
}

// Necesidad de compra inmediata, por sector comprador.
// Compromisos = DJVE con embarque hasta fin del mes siguiente; si el line-up de las próximas 4 semanas
// es mayor que lo declarado para este mes y el siguiente, se toma el line-up (hay DJVE por registrar).
// Falta = compromisos − todo lo comprado de la campaña. Positivo: tiene que salir a comprar disponible.
function luNecesidad(prodKey, camp) {
  const co = camp ? luCompras(prodKey, camp) : null;
  if (!co) return [];
  return LU_PRODS[prodKey].nec.map(def => {
    const s = co.sect[def.sec], dj = luDjveTramos(camp, def.djve);
    if (!s || !s.hay || !dj) return null;
    const sem = luSemanas(def.lu);
    const lu4 = sem.reduce((a, b) => a + b, 0);
    const ritmo = (sem[0] + sem[1]) / 2;            // embarque semanal: las 2 semanas más completas del line-up
    const usaLU = lu4 > dj.mes + dj.sig;
    const compromisos = dj.vencido + (usaLU ? lu4 : dj.mes + dj.sig);
    const comprado = s.total * 1000;
    const falta = compromisos - comprado;
    const semanas = ritmo > 0 ? -falta / ritmo : null;  // + semanas de embarque ya compradas / − semanas sin comprar
    const nivel = falta > 0 ? 'alta' : (semanas != null && semanas < luSemanasMedia() ? 'media' : 'baja');
    return {
      def, dj, sem, lu4, ritmo, usaLU, compromisos, comprado, falta, semanas, nivel, fecha: s.fecha,
      semanal: s.semanal * 1000, prevSemanal: s.hayPrev ? s.prevSemanal * 1000 : null
    };
  }).filter(Boolean);
}

// Compra semanal de las últimas publicaciones de SAGyP (hoja "compras_hist" del Apps Script), en t.
function luHistSemanal(prodKey, camp, sec) {
  const h = luData && luData.comprasHist;
  if (!h || !h.cols || !h.filas) return [];
  const ix = {}; h.cols.forEach((k, i) => ix[k] = i);
  const keys = LU_PRODS[prodKey].compras, porFecha = {};
  h.filas.forEach(f => {
    if (!keys.includes(f[ix.prod]) || f[ix.camp] !== camp || f[ix.sector] !== sec) return;
    porFecha[f[ix.fecha]] = (porFecha[f[ix.fecha]] || 0) + (+f[ix.semanal] || 0);
  });
  return Object.keys(porFecha).sort().map(k => ({ fecha: k, t: porFecha[k] * 1000 }));
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
  const sem = luSemanas(P.peso);
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
  const nec = luNecesidad(luProd, luCamp), n0 = nec[0];

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
      ${luPanelNecesidad(P, nec)}
      <div class="lu-kpis">
        <div class="lu-kpi"><div class="k">Line-up nominado · ${luEsc(P.nombre)}</div><div class="v">${luT(totLU)}</div><div class="d">${P.unidad} · ${nBuques} buques · foto ${luFechaCorta(fotoIso)}</div></div>
        <div class="lu-kpi"><div class="k">vs misma fecha año anterior</div>${prevTot ? `<div class="v ${totLU >= prevTot ? 'lu-dn' : 'lu-up'}">${totLU >= prevTot ? '+' : ''}${Math.round((totLU / prevTot - 1) * 100)}%</div><div class="d">${luT(prevTot)} el ${luFechaCorta(aa.fecha)}-${aa.fecha.slice(2, 4)}</div>` : `<div class="v" style="font-size:15px;color:var(--text-3)">Sin histórico</div><div class="d">se completa con cargarHistorico() en el Apps Script</div>`}</div>
        <div class="lu-kpi"><div class="k">Saldo a fijar · exportación + industria</div><div class="v">${co ? luMilT(co.sect.tot.hay ? co.sect.tot.saldo : co.saldo) : '–'}</div><div class="d">${co ? 'exportación ' + luMilT(co.sect.exp.saldo) + (co.sect.ind.hay ? ' · industria ' + luMilT(co.sect.ind.saldo) : '') : ''}</div></div>
        <div class="lu-kpi"><div class="k">Compra semanal · ${n0 ? luEsc(n0.def.lbl.toLowerCase()) : 'exportación'}</div>${n0 ? `<div class="v ${n0.semanal >= n0.ritmo ? 'lu-dn' : 'lu-up'}">${luT(n0.semanal)}</div><div class="d">embarca ≈ ${luT(n0.ritmo)}/sem → el colchón ${n0.semanal >= n0.ritmo ? 'crece' : 'se achica'} ${luT(Math.abs(n0.semanal - n0.ritmo))}${n0.prevSemanal != null ? ` · año ant. ${luT(n0.prevSemanal)}` : ''}</div>` : '<div class="v">–</div>'}</div>
      </div>
    </div>
    <div class="lu-grid lu-g2">
      ${luPanelCompras(P, co)}
      ${luPanelNueva()}
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
    <div class="lu-grid">${luPanelDestinos(P, f0)}</div>
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
      Necesidad inmediata = DJVE con embarque hasta fin del mes siguiente (o el line-up de 4 semanas si es mayor) − todo lo comprado de la campaña. Presión alta si falta comprar; media si lo comprado de más cubre menos de ${luSemanasMedia()} semanas de embarque; baja por encima.
    </div>`;
}

function luPanelCompras(P, co) {
  if (!co) return `<div class="lu-card"><div class="lu-ch"><h3>Compras vs DJVE</h3></div><div class="lu-empty">Sin datos de compras para ${luEsc(P.nombre)}.</div></div>`;
  const diff = co.total - co.djve, cob = co.djve > 0 ? co.total / co.djve : null;
  const sc = Math.max(co.total, co.djve) || 1;
  const pct = v => (v / sc * 100).toFixed(2) + '%';
  const dAbs = Math.abs(diff);
  const bigTxt = (diff >= 0 ? '+' : '−') + (dAbs < 1000 ? Math.round(dAbs).toLocaleString('es-AR') + '<small>mil t</small>' : luF1(dAbs / 1000) + '<small>Mt</small>');
  const yoy = co.prevTotal > 0 ? co.total / co.prevTotal - 1 : null;
  let extra = 'La cobertura se mide solo con la exportación, porque las DJVE son sus ventas al exterior; la industria compra para procesar y aparece en la tabla de abajo. ';
  if (LU_PRODS[luProd].compras.length > 1) extra += 'Suma cebada forrajera y cervecera. ';
  return `
    <div class="lu-card">
      <div class="lu-ch"><h3>Cobertura de la campaña · exportación ${luEsc(luCamp)}</h3><span>SAGyP al ${luEsc(luData.compras.fecha)}</span></div>
      <div class="lu-need-top">
        <div><div class="lu-big" style="color:${diff >= 0 ? 'var(--es-green)' : '#a54132'}">${bigTxt}</div><div class="lu-lbl">${diff >= 0 ? 'Compras por encima de DJVE' : 'Falta comprar para cubrir DJVE'}</div></div>
        <div><div class="lu-big" style="font-size:26px">${cob == null ? '–' : Math.round(cob * 100) + '%'}</div><div class="lu-lbl">DJVE cubiertas con compras</div></div>
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
      <div class="lu-note sep">La línea negra marca las DJVE registradas (${luMilT(co.djve)}) de toda la campaña, embarquen cuando embarquen. Es la foto acumulada: la urgencia de corto plazo está en "Necesidad de compra inmediata". ${extra}</div>
      ${luTablaSectores(co)}
    </div>`;
}

// Semanas de embarque en texto (con ritmo casi nulo el número pierde sentido: se corta en 12).
function luSemTxt(s) { const a = Math.abs(s); return a > 12 ? 'más de 12' : luF1(a); }

function luTBig(t) { const [n, ...u] = luT(t).split(' '); return n + '<small>' + u.join(' ') + '</small>'; }

// ─── Necesidad de compra inmediata (lo que falta comprar para lo que hay que embarcar ya) ───
function luPanelNecesidad(P, nec) {
  const titulo = `Necesidad de compra inmediata · ${luEsc(P.nombre)} ${luEsc(luCamp || '')}`;
  if (!nec.length) return `<div class="lu-card"><div class="lu-ch"><h3>${titulo}</h3></div><div class="lu-empty">Faltan las DJVE por mes de embarque o las compras de SAGyP para esta campaña.</div></div>`;
  const { ant, m0, m1 } = luMesesRef();
  const multi = nec.length > 1;
  const top = nec.map(n => {
    const falta = n.falta > 0;
    const sem = n.semanas == null ? 'Sin buques nominados para medir el ritmo de embarque.'
      : falta ? `≈ ${luSemTxt(n.semanas)} semanas de embarque sin comprar.` : `≈ ${luSemTxt(n.semanas)} semanas de embarque ya compradas por delante.`;
    return `<div class="lu-nec">
      ${multi ? `<div class="lu-nec-t">${luEsc(n.def.lbl)}</div>` : ''}
      <div class="lu-need-top">
        <div><div class="lu-big" style="color:${falta ? '#a54132' : 'var(--es-green)'}">${falta ? '−' : '+'}${luTBig(Math.abs(n.falta))}</div><div class="lu-lbl">${falta ? 'Falta comprar para lo que tiene que embarcar' : 'Comprado por encima de lo que tiene que embarcar'}</div></div>
        <div><span class="lu-pres ${n.nivel}">${n.nivel.toUpperCase()}</span><div class="lu-lbl">Presión compradora</div></div>
      </div>
      <div class="lu-lbl">${sem}</div>
    </div>`;
  }).join('');
  const td = f => nec.map(n => `<td class="r">${f(n)}</td>`).join('');
  const th = multi ? nec.map(n => `<th class="r">${luEsc(n.def.lbl.replace(/\s*\(.*\)/, ''))}</th>`).join('') : '<th class="r"></th>';
  const fCompras = luData.compras && luData.compras.fecha;
  const otrasFechas = nec.filter(n => n.fecha && n.fecha !== fCompras).map(n => `${n.def.lbl.replace(/\s*\(.*\)/, '').toLowerCase()} al ${n.fecha}`);
  return `
    <div class="lu-card">
      <div class="lu-ch"><h3>${titulo}</h3><span>hasta fin de ${luMesTxt(m1)}</span></div>
      <div class="lu-nec-grid ${multi ? 'multi' : ''}">${top}</div>
      <div class="lu-tw" style="margin-top:14px"><table class="lu-table lu-sect lu-nec-tab">
        <thead><tr><th>Toneladas de grano</th>${th}</tr></thead>
        <tbody>
          <tr><td>DJVE con embarque hasta ${luMesTxt(ant)} <span class="t">· se toman como embarcadas</span></td>${td(n => luT(n.dj.vencido))}</tr>
          <tr><td>DJVE con embarque en ${luMesTxt(m0)}</td>${td(n => n.usaLU ? `<span class="t">${luT(n.dj.mes)}</span>` : luT(n.dj.mes))}</tr>
          <tr><td>DJVE con embarque en ${luMesTxt(m1)}</td>${td(n => n.usaLU ? `<span class="t">${luT(n.dj.sig)}</span>` : luT(n.dj.sig))}</tr>
          <tr><td>Line-up próximas 4 semanas</td>${td(n => n.usaLU ? `<b>${luT(n.lu4)}</b> ▲` : `<span class="t">${luT(n.lu4)}</span>`)}</tr>
          <tr class="tot"><td>Tiene que embarcar hasta fin de ${luMesTxt(m1)}</td>${td(n => luT(n.compromisos))}</tr>
          <tr><td>Comprado de la campaña ${luEsc(luCamp)}</td>${td(n => '− ' + luT(n.comprado))}</tr>
          <tr class="tot"><td>Falta comprar (+) / comprado de más (−)</td>${td(n => `<span class="${n.falta > 0 ? 'lu-up' : 'lu-dn'}">${n.falta > 0 ? '+' : '−'}${luT(Math.abs(n.falta))}</span>`)}</tr>
          <tr><td>Compra semanal <span class="t">· año anterior</span></td>${td(n => luT(n.semanal) + (n.prevSemanal != null ? ` <span class="t">· ${luT(n.prevSemanal)}</span>` : ''))}</tr>
          <tr><td>Embarque semanal <span class="t">· line-up, próximas 2 semanas</span></td>${td(n => luT(n.ritmo))}</tr>
        </tbody></table></div>
      ${luMiniSemanal(luHistSemanal(luProd, luCamp, nec[0].def.sec), nec[0].ritmo, nec[0].def.lbl)}
      <div class="lu-note sep">Lo que la exportación declaró que va a embarcar hasta fin de ${luMesTxt(m1)}, contra todo lo que ya compró de la campaña. Si falta, tiene que salir a comprar disponible ya.
        ▲ = el line-up supera lo declarado para ${luMesTxt(m0)} y ${luMesTxt(m1)} (hay DJVE por registrar): se toma el line-up.
        ${nec.some(n => n.def.sec === 'ind') ? `Industria: DJVE y line-up de harina y pellets pasados a poroto (÷ ${String(LU_SOJA_COEF).replace('.', ',')}); no incluye la molienda para el mercado interno, así que su necesidad real es algo mayor.` : ''}
        Compras SAGyP al ${luEsc(fCompras || '–')}${otrasFechas.length ? ' (' + luEsc(otrasFechas.join(', ')) + ')' : ''}; DJVE por mes de embarque al ${luEsc(luData.djve ? luData.djve.fecha : '–')}.</div>
    </div>`;
}

function luMiniSemanal(hist, ritmo, lbl) {
  const head = `<div class="lu-ch" style="margin:16px 0 8px"><h3>Compra semanal · ${luEsc(lbl.toLowerCase())}</h3><span>línea punteada: embarque semanal</span></div>`;
  if (hist.length < 2) return head + '<div class="lu-note" style="margin-top:0">La tendencia aparece cuando el Apps Script haya guardado al menos dos publicaciones semanales de SAGyP (se guardan solas desde la nueva versión).</div>';
  const h = hist.slice(-10), mx = Math.max(ritmo, ...h.map(x => x.t)) || 1;
  return head + `<div class="lu-mini">${h.map(x => `<i title="${luFechaCorta(x.fecha)}: ${luT(x.t)}" style="height:${Math.max(x.t / mx * 100, 1).toFixed(1)}%;background:${x.t >= ritmo ? 'var(--es-green)' : '#a54132'}"></i>`).join('')}${ritmo > 0 ? `<b style="bottom:${(ritmo / mx * 100).toFixed(1)}%"></b>` : ''}</div>
    <div class="lu-mini-lbl">${h.map(x => `<span>${luFechaCorta(x.fecha)}</span>`).join('')}</div>
    <div class="lu-note" style="margin-top:6px">Verde: compró más de lo que embarca (el colchón crece). Rojo: compró menos (el colchón se achica y la presión sube).</div>`;
}

// ─── Cosecha nueva: compras anticipadas de todos los granos vs misma fecha del año anterior ───
function luPanelNueva() {
  const filas = Object.keys(LU_PRODS).map(k => {
    const nueva = luCampNueva(k, luCampDefault(k));
    const co = nueva ? luCompras(k, nueva) : null;
    if (!co) return null;
    const t = co.sect.tot.hay ? co.sect.tot : co.sect.exp;
    if (!(t.total >= 10) && !(t.prevTotal >= 10)) return null;   // menos de 10 mil t: sin compras anticipadas que mirar
    return { k, nueva, t };
  }).filter(Boolean);
  const varTxt = t => {
    if (!t.hayPrev || !(t.prevTotal > 0)) return '–';
    const v = t.total / t.prevTotal - 1;
    return `<span class="${v >= 0 ? 'lu-dn' : 'lu-up'}">${v >= 0 ? '+' : ''}${Math.round(v * 100)}%</span>`;
  };
  return `<div class="lu-card">
    <div class="lu-ch"><h3>Cosecha nueva · compras anticipadas</h3><span>exportación + industria · miles de t</span></div>
    ${filas.length ? `<div class="lu-tw"><table class="lu-table lu-sect lu-nueva">
      <thead><tr><th>Grano</th><th class="r">Comprado</th><th class="r">Año ant.</th><th class="r">Var.</th><th class="r">Precio hecho</th><th class="r">Semanal · año ant.</th></tr></thead>
      <tbody>${filas.map(({ k, nueva, t }) => `<tr${k === luProd ? ' class="tot"' : ''}><td>${LU_PRODS[k].nombre} ${nueva}</td>
        <td class="r">${luF1(t.total)}</td><td class="r">${t.hayPrev ? luF1(t.prevTotal) : '–'}</td><td class="r">${varTxt(t)}</td>
        <td class="r">${t.total > 0 ? Math.round(t.hecho / t.total * 100) + '%' : '–'}</td>
        <td class="r">${luF1(t.semanal)}${t.hayPrev ? ` <span class="t">· ${luF1(t.prevSemanal)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="lu-empty">SAGyP todavía no informa compras de cosecha nueva.</div>'}
    <div class="lu-note sep">Cuánto adelantó la demanda de la próxima campaña contra la misma fecha del año anterior. Más compras que el año pasado = más apetito comprador para preventa; menos = la demanda de cosecha nueva todavía no aparece. "Precio hecho" es la parte con precio; el resto es a fijar.</div>
  </div>`;
}

// ─── Destinos: embarcado en los últimos 6/3/1 meses y nominado para los próximos 1/3/6 ───
const LU_REGIONES = {
  'CONTINENT': 'Europa (Continente)', 'SOUTH EAST ASIA': 'Sudeste asiático', 'EAST ASIA': 'Asia oriental', 'WCSAM': 'Sudamérica costa oeste',
  'ARAB GULF': 'Golfo Arábigo', 'ECSA': 'Sudamérica costa este', 'INDIC ASIA': 'Subcontinente indio', 'MX & CARIBS': 'México y Caribe',
  'MEDITERRANEAN SEA': 'Mediterráneo', 'N.AMERICA': 'Norteamérica', 'MAGHREB': 'Magreb', 'OCEANIA': 'Oceanía', 'C.AFRICA': 'África central',
  'MASCARENES': 'Índico (Mascareñas)', 'S.AFRICA': 'África austral', 'TBC': 'A confirmar'
};
const LU_PAISES = {
  'ALGERIA': 'Argelia', 'ANGOLA': 'Angola', 'ARGENTINA': 'Argentina (cabotaje)', 'AUSTRALIA': 'Australia', 'BANGLADESH': 'Bangladesh', 'BELGIUM': 'Bélgica',
  'BOLIVIA': 'Bolivia', 'BRAZIL': 'Brasil', 'BRUNEI': 'Brunéi', 'BULGARIA': 'Bulgaria', 'CAMEROON': 'Camerún', 'CANADA': 'Canadá', 'CHILE': 'Chile', 'CHINA': 'China',
  'COLOMBIA': 'Colombia', 'CUBA': 'Cuba', 'CYPRUS': 'Chipre', 'DEM.REP.CONGO': 'R. D. del Congo', 'DENMARK': 'Dinamarca', 'DOMINICAN REPUBLIC': 'Rep. Dominicana',
  'ECUADOR': 'Ecuador', 'EGYPT': 'Egipto', 'EL SALVADOR': 'El Salvador', 'FRANCE': 'Francia', 'GERMANY': 'Alemania', 'GHANA': 'Ghana', 'GREECE': 'Grecia',
  'GUATEMALA': 'Guatemala', 'GUINEA': 'Guinea', 'HONDURAS': 'Honduras', 'INDET.(EUROPA)': 'Europa (sin definir)', 'INDIA': 'India', 'INDONESIA': 'Indonesia',
  'IRAN': 'Irán', 'IRAQ': 'Irak', 'IRELAND': 'Irlanda', 'ISRAEL': 'Israel', 'ITALY': 'Italia', 'IVORY COAST': 'Costa de Marfil', 'JAMAICA': 'Jamaica',
  'JAPAN': 'Japón', 'JORDAN': 'Jordania', 'KENYA': 'Kenia', 'KUWAIT': 'Kuwait', 'LATVIA': 'Letonia', 'LEBANON': 'Líbano', 'LIBYA': 'Libia', 'LITHUANIA': 'Lituania',
  'MADAGASCAR': 'Madagascar', 'MALAYSIA': 'Malasia', 'MAURITIUS': 'Mauricio', 'MEXICO': 'México', 'MOROCCO': 'Marruecos', 'MOZAMBIQUE': 'Mozambique',
  'NETHERLANDS': 'Países Bajos', 'NEW ZEALAND': 'Nueva Zelanda', 'NIGERIA': 'Nigeria', 'OMAN': 'Omán', 'PAKISTAN': 'Pakistán', 'PARAGUAY': 'Paraguay',
  'PERU': 'Perú', 'PHILIPPINES': 'Filipinas', 'POLAND': 'Polonia', 'PORTUGAL': 'Portugal', 'PUERTO RICO': 'Puerto Rico', 'REUNION': 'Reunión', 'ROMANIA': 'Rumania',
  'RUSSIA': 'Rusia', 'SAUDI ARABIA': 'Arabia Saudita', 'SENEGAL': 'Senegal', 'SOUTH AFRICA': 'Sudáfrica', 'SOUTH KOREA': 'Corea del Sur', 'SPAIN': 'España',
  'SYRIA': 'Siria', 'TAIWAN': 'Taiwán', 'TBC': 'A confirmar', 'THAILAND': 'Tailandia', 'TOGO': 'Togo', 'TUNISIA': 'Túnez', 'TURKEY': 'Turquía',
  'UAE': 'Emiratos Árabes', 'UK': 'Reino Unido', 'URUGUAY': 'Uruguay', 'USA': 'Estados Unidos', 'VENEZUELA': 'Venezuela', 'VIETNAM': 'Vietnam', 'YEMEN': 'Yemen'
};
function luDestTxt(k, mapa) {
  if (mapa[k]) return mapa[k];
  return k.charAt(0) + k.slice(1).toLowerCase();
}
function luMasMeses(d, k) { const x = new Date(d); x.setMonth(x.getMonth() + k); return x; }

function luPanelDestinos(P, f0) {
  const E = luData.embarques;
  const grupos = Object.keys(P.peso);
  if (luDestCarga !== 'todo' && !grupos.includes(luDestCarga)) luDestCarga = 'todo';
  const w = g => luDestCarga === 'todo' ? (P.peso[g] || 0) : (g === luDestCarga ? 1 : 0);
  const unidad = luDestCarga === 'todo' ? P.unidad : 't de ' + (LU_GRUPO_LBL[luDestCarga] || luDestCarga);
  const porPais = luDestVista === 'pais';
  const norm = s => { const x = String(s || '').trim().toUpperCase(); return x || 'TBC'; };

  const MP = [6, 3, 1], MF = [1, 3, 6];
  const limP = MP.map(k => luMasMeses(f0, -k)), limF = MF.map(k => luMasMeses(f0, k));
  const filas = {}, tot = { p: [0, 0, 0], f: [0, 0, 0] };
  const fila = (dest, reg) => {
    const d = norm(dest), rg = norm(reg), k = porPais ? d : rg;
    const o = filas[k] || (filas[k] = { k, p: [0, 0, 0], f: [0, 0, 0], reg: {} });
    if (porPais && rg !== 'TBC') o.reg[rg] = (o.reg[rg] || 0) + 1;
    return o;
  };

  // Pasado: cargas que zarparon (hoja "embarques" del Apps Script)
  if (E && E.filas) {
    const base = new Date(E.desde + 'T12:00:00');
    E.filas.forEach(([dia, gi, di, t]) => {
      const p = w(E.grupos[gi]);
      if (!p) return;
      const d = new Date(base); d.setDate(d.getDate() + dia);
      if (d >= f0) return;
      const [dest, reg] = E.dest[di] || [];
      const o = fila(dest, reg);
      limP.forEach((lim, i) => { if (d >= lim) { o.p[i] += t * p; tot.p[i] += t * p; } });
    });
  }
  // Por delante: buques nominados en el line-up de hoy, por fecha de zarpada
  let maxEts = null;
  luFilas().forEach(r => {
    const p = w(r.grupo);
    if (!p || r.uy) return;
    const d = r.ets ? new Date(r.ets + 'T12:00:00') : f0;
    if (d < f0) return;                      // ya figura como zarpado en el histórico
    if (!maxEts || d > maxEts) maxEts = d;
    const o = fila(r.destino, r.region);
    limF.forEach((lim, i) => { if (d < lim) { o.f[i] += r.t * p; tot.f[i] += r.t * p; } });
  });

  // Meses efectivos de cada ventana (para el promedio mensual): el pasado arranca donde arranca el histórico
  // y lo nominado termina en el último buque del line-up.
  const DM = 30.44 * 86400000;
  const inicio = E ? new Date((E.inicio || E.desde) + 'T12:00:00') : null;
  const mesesP = limP.map(lim => inicio ? Math.max((f0 - Math.max(lim, inicio)) / DM, 0) : 0);
  const mesesF = limF.map(lim => maxEts ? Math.max((Math.min(lim, maxEts) - f0) / DM + 1 / 30.44, 0) : 0);
  const parcialP = limP.map(lim => !inicio || inicio > lim);
  const cortoF = limF.map(lim => !maxEts || maxEts < lim);

  // Orden: participación en lo embarcado (6 meses) + en lo nominado, para que un destino que recién aparece no quede en "Otros".
  const peso = o => (tot.p[0] > 0 ? o.p[0] / tot.p[0] : 0) + (tot.f[2] > 0 ? o.f[2] / tot.f[2] : 0);
  let arr = Object.values(filas).filter(o => o.p[0] > 0 || o.f[2] > 0).sort((a, b) => peso(b) - peso(a));
  const N = 14, nDest = arr.length;
  if (!luDestTodos && arr.length > N + 1) {
    const resto = arr.slice(N), otros = { k: '__otros', p: [0, 0, 0], f: [0, 0, 0], reg: {}, n: resto.length };
    resto.forEach(o => { for (let i = 0; i < 3; i++) { otros.p[i] += o.p[i]; otros.f[i] += o.f[i]; } });
    arr = arr.slice(0, N).concat([otros]);
  }

  const fmtT = v => { if (!(v > 0)) return '–'; const k = v / 1e3; return k >= 10 ? Math.round(k).toLocaleString('es-AR') : luF1(k); };
  const val = (v, totCol, meses) => luDestModo === 'pct' ? (totCol > 0 && v > 0 ? luF1(v / totCol * 100) + '%' : '–')
    : luDestModo === 'mes' ? (meses > 0 ? fmtT(v / meses) : '–') : fmtT(v);
  const maxP = tot.p.map((_, i) => Math.max(...arr.filter(o => o.k !== '__otros').map(o => o.p[i]), 1));
  const maxF = tot.f.map((_, i) => Math.max(...arr.filter(o => o.k !== '__otros').map(o => o.f[i]), 1));
  const celda = (v, totCol, meses, mx, cls) => {
    const a = v > 0 && mx > 0 ? Math.round(v / mx * 30) : 0;
    return `<td class="r ${cls || ''}${v > 0 ? '' : ' nd'}"${a ? ` style="background:color-mix(in srgb, var(--es-green) ${a}%, transparent)"` : ''}>${val(v, totCol, meses)}</td>`;
  };
  const delta = o => {
    if (o.k === '__total' || !(tot.p[0] > 0) || !(tot.f[0] > 0)) return '<td class="r sepL nd"></td>';
    const pp = (o.f[0] / tot.f[0] - o.p[0] / tot.p[0]) * 100;
    if (Math.abs(pp) < 0.05) return '<td class="r sepL nd">0,0</td>';
    return `<td class="r sepL"><span class="${pp > 0 ? 'lu-dn' : 'lu-up'}">${pp > 0 ? '+' : '−'}${luF1(Math.abs(pp))}</span></td>`;
  };
  const nombre = o => {
    if (o.k === '__total') return 'Total';
    if (o.k === '__otros') return `Otros <span class="t">${o.n} destinos</span>`;
    if (!porPais) return luEsc(luDestTxt(o.k, LU_REGIONES));
    const rg = Object.entries(o.reg).sort((a, b) => b[1] - a[1])[0];
    return `${luEsc(luDestTxt(o.k, LU_PAISES))}${rg ? `<span class="t">${luEsc(luDestTxt(rg[0], LU_REGIONES))}</span>` : ''}`;
  };
  const filaHtml = (o, cls) => `<tr class="${cls || ''}"><td>${nombre(o)}</td>
    ${o.p.map((v, i) => celda(v, tot.p[i], mesesP[i], cls ? 0 : maxP[i], i === 0 ? 'sepL' : '')).join('')}
    ${o.f.map((v, i) => celda(v, tot.f[i], mesesF[i], cls ? 0 : maxF[i], i === 0 ? 'sepL' : '')).join('')}
    ${delta(o)}</tr>`;

  const hdrP = MP.map((k, i) => `<th class="r${i === 0 ? ' sepL' : ''}">${k} ${k === 1 ? 'mes' : 'meses'}${parcialP[i] && inicio ? '*' : ''}<small>desde ${luFechaCorta(luIsoL(limP[i]))}</small></th>`).join('');
  const hdrF = MF.map((k, i) => `<th class="r${i === 0 ? ' sepL' : ''}">${k} ${k === 1 ? 'mes' : 'meses'}<small>${cortoF[i] && maxEts ? 'nominado al ' + luFechaCorta(luIsoL(maxEts)) : 'hasta ' + luFechaCorta(luIsoL(limF[i]))}</small></th>`).join('');
  const pill = (campo, v, txt, on) => `<button class="lu-pill ${on ? 'on' : ''}" onclick="luSetDest('${campo}','${v}')">${txt}</button>`;
  const modoTxt = { t: 'miles de ' + unidad, mes: 'miles de ' + unidad + ' por mes', pct: '% del total de cada columna' }[luDestModo];

  const sinHist = !E || !E.filas;
  const aviso = sinHist
    ? `<div class="lu-setup" style="margin-bottom:12px">Para ver lo embarcado en los últimos meses hay que actualizar el Apps Script y ejecutar una vez <code>cargarEmbarques()</code> (ver <code>LEEME_LineUp.txt</code>). Mientras tanto se muestra solo lo nominado por delante.</div>`
    : (parcialP.some(Boolean) ? `<div class="lu-note" style="margin:0 0 10px">* El histórico arranca el ${luFechaCorta(luIsoL(inicio))}-${String(inicio.getFullYear()).slice(2)}: esa ventana está incompleta${luDestModo === 'mes' ? ' (el promedio mensual usa solo los meses con datos)' : ''}. Se completa ejecutando <code>cargarEmbarques()</code> en el Apps Script.</div>` : '');

  return `<div class="lu-card">
    <div class="lu-ch"><h3>Destinos · embarcado y nominado · ${luEsc(P.nombre)}</h3>
      <div class="lu-ctrl">
        ${pill('vista', 'pais', 'País', porPais)}${pill('vista', 'region', 'Región', !porPais)}
        <span class="lu-sep"></span>
        ${pill('modo', 't', 'Toneladas', luDestModo === 't')}${pill('modo', 'mes', 'Por mes', luDestModo === 'mes')}${pill('modo', 'pct', 'Participación', luDestModo === 'pct')}
        ${grupos.length > 1 ? `<span class="lu-sep"></span>${pill('carga', 'todo', P.unidad === 't poroto eq.' ? 'Poroto eq.' : 'Todo', luDestCarga === 'todo')}${grupos.map(g => pill('carga', g, (LU_GRUPO_LBL[g] || g).replace(/^./, c => c.toUpperCase()), luDestCarga === g)).join('')}` : ''}
      </div>
    </div>
    ${aviso}
    ${arr.length ? `<div class="lu-tw"><table class="lu-table lu-sect lu-dest">
      <thead>
        <tr><th></th><th class="grp sepL" colspan="3">← Embarcado · últimos</th><th class="grp sepL" colspan="3">Nominado · próximos →</th><th class="grp sepL"></th></tr>
        <tr><th>${porPais ? 'País de destino' : 'Región de destino'}<small>${luEsc(modoTxt)}</small></th>${hdrP}${hdrF}<th class="r sepL">Cambio part.<small>próx. 1 vs últ. 6 (pp)</small></th></tr>
      </thead>
      <tbody>${arr.map(o => filaHtml(o, o.k === '__otros' ? 'otros' : '')).join('')}${filaHtml({ k: '__total', p: tot.p, f: tot.f, reg: {} }, 'tot')}</tbody>
    </table></div>
    ${nDest > N + 1 ? `<button class="btn btn-sm btn-outline" style="margin-top:10px" onclick="luSetDest('todos')">${luDestTodos ? `Ver los ${N} principales` : `Ver los ${nDest} destinos`}</button>` : ''}`
    : '<div class="lu-empty">Sin embarques ni buques nominados para este producto.</div>'}
    <div class="lu-note sep">
      <b>Embarcado:</b> cargas que zarparon según las fotos diarias del line-up de ISA, cada una con el último destino informado antes de zarpar${E && E.ultima ? ` (última foto procesada: ${luFechaCorta(E.ultima)})` : ''}.
      <b>Nominado:</b> buques del line-up de hoy por fecha estimada de zarpada. Los buques se nominan con 4 a 6 semanas de anticipación, así que las columnas de 3 y 6 meses por delante se parecen a la de 1 mes: sirven para ver hacia dónde va lo que ya está nominado, no como pronóstico.
      <b>Cambio part.:</b> participación del destino en lo nominado para el próximo mes menos su participación en lo embarcado en los últimos 6 meses (verde = gana peso).
      "A confirmar" = destino todavía sin informar (TBC). Sin puertos de Uruguay.
      ${P.peso.soja_harina && luDestCarga === 'todo' ? `Soja en poroto equivalente: el destino de la harina pesa mucho más que el del poroto; para mirar solo uno, elegir "Poroto" o "Harina".` : ''}
    </div>
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

function luSetProd(k) { luProd = k; luCamp = null; luDestCarga = 'todo'; luRender(); }
function luSetDest(campo, v) {
  if (campo === 'vista') luDestVista = v; else if (campo === 'modo') luDestModo = v; else if (campo === 'carga') luDestCarga = v; else if (campo === 'todos') luDestTodos = !luDestTodos;
  luRender();
}
function luSetCamp(c) { luCamp = c; luRender(); }
