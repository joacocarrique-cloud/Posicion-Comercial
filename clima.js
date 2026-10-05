// ═══════════════════════════════════════════════════
// ─── CLIMA POR CULTIVO ───
// Gráficos y mapas de World Ag Weather (worldagweather.com) para soja, maíz y trigo:
// lluvia y temperatura de los últimos 60 y 180 días y pronóstico a 15 días (ensemble GFS).
// Las imágenes se muestran directo desde su sitio (no se copian). Cada actualización de
// World Ag Weather publica las imágenes con un número de corrida nuevo; al abrir el módulo
// se busca solo el último número disponible, así que no hace falta cargar nada a mano.
// ═══════════════════════════════════════════════════

const CL_BASE = 'https://www.worldagweather.com/crops/';
const CL_WAW = 'https://www.worldagweather.com/crops.php';
const CL_RUN_KEY = 'esp_clima_runs_v1';
const CL_REFRESCO_MIN = 60;        // al abrir, si la última búsqueda tiene más de 60 min, se vuelve a buscar
// Último número conocido de cada corrida (punto de partida si no hay nada guardado)
const CL_RUN_DEFAULT = { fcst: 5184, pastPcp: 5187, pastTmp: 5180 };
// Imagen de prueba para detectar cada corrida (existe siempre que la corrida existe)
const CL_SONDA = {
  fcst:    n => `fcstwx/fcstpcp_corn_usa_${n}.png`,
  pastPcp: n => `pastwx/pastpcp_corn_usa_60day_${n}.png`,
  pastTmp: n => `pastwx/pasttmp_corn_usa_60day_${n}.png`
};

let climaMode = false, clRun = null, clBuscando = false, clError = null;
let clSel = { crop: 'soybeans', region: 'argentina', sub: 'argentina', view: 'chart' };

// Regiones y zonas por cultivo (como las publica World Ag Weather). map = nombre que usa el mapa.
const CL_CFG = {
  soybeans: { label: 'Soja', regions: {
    usa:       { label: 'EE.UU.', map: 'usa', subs: { usa: 'Nacional', iowa: 'Iowa', illinois: 'Illinois', nebraska: 'Nebraska', minnesota: 'Minnesota', indiana: 'Indiana' } },
    brazil:    { label: 'Brasil', map: 'brazil', subs: { brazil: 'Nacional', matogrosso: 'Mato Grosso', parana: 'Paraná', riograndedosul: 'Rio Grande do Sul', goias: 'Goiás', matogrossodosul: 'Mato Grosso do Sul' } },
    argentina: { label: 'Argentina', map: 'argentina', subs: { argentina: 'Nacional', buenosaires: 'Buenos Aires', cordoba: 'Córdoba', santafe: 'Santa Fe', entrerios: 'Entre Ríos', santiagodelestero: 'Santiago del Estero' } }
  }, glance: [['usa', 'usa', 'EE.UU.'], ['brazil', 'brazil', 'Brasil'], ['argentina', 'argentina', 'Argentina']] },
  corn: { label: 'Maíz', regions: {
    usa:       { label: 'EE.UU.', map: 'usa', subs: { usa: 'Nacional', iowa: 'Iowa', illinois: 'Illinois', nebraska: 'Nebraska', minnesota: 'Minnesota', indiana: 'Indiana' } },
    brazil:    { label: 'Brasil', map: 'brazil', subs: { brazil: 'Nacional', parana: 'Paraná', matogrosso: 'Mato Grosso', minasgerais: 'Minas Gerais', goias: 'Goiás', riograndedosul: 'Rio Grande do Sul' } },
    argentina: { label: 'Argentina', map: 'argentina', subs: { argentina: 'Nacional', buenosaires: 'Buenos Aires', cordoba: 'Córdoba', santafe: 'Santa Fe', entrerios: 'Entre Ríos', santiagodelestero: 'Santiago del Estero' } },
    china:     { label: 'China', map: 'china', subs: { china: 'Nacional', heilongjiang: 'Heilongjiang', jilin: 'Jilin', shandong: 'Shandong', henan: 'Henan', hebei: 'Hebei' } }
  }, glance: [['usa', 'usa', 'EE.UU.'], ['brazil', 'brazil', 'Brasil'], ['argentina', 'argentina', 'Argentina'], ['china', 'china', 'China']] },
  wheat: { label: 'Trigo', regions: {
    usa:       { label: 'EE.UU.', map: 'usa', subs: { kansas: 'Kansas', oklahoma: 'Oklahoma', texas: 'Texas', montana: 'Montana', northdakota: 'Dakota del Norte', southdakota: 'Dakota del Sur', washington: 'Washington', idaho: 'Idaho' } },
    canada:    { label: 'Canadá', map: 'canada', subs: { canada: 'Nacional', saskatchewan: 'Saskatchewan', alberta: 'Alberta', manitoba: 'Manitoba' } },
    europe:    { label: 'Europa', map: 'europe', subs: { france: 'Francia', germany: 'Alemania', uk: 'Reino Unido', poland: 'Polonia', spain: 'España', czech: 'Rep. Checa', denmark: 'Dinamarca' } },
    westasia:  { label: 'Mar Negro', map: 'russia', subs: { southern: 'Rusia Sur', central: 'Rusia Centro', volga: 'Volga', urals: 'Urales', siberia: 'Siberia', ukraine: 'Ucrania', kazakhstan: 'Kazajistán' } },
    australia: { label: 'Australia', map: 'australia', subs: { australia: 'Nacional', westernaustralia: 'Australia Occ.', newsouthwales: 'Nueva Gales del Sur', victoria: 'Victoria' } },
    china:     { label: 'China', map: 'china', subs: { china: 'Nacional', henan: 'Henan', shandong: 'Shandong', hebei: 'Hebei', anhui: 'Anhui', jiangsu: 'Jiangsu' } },
    india:     { label: 'India', map: 'india', subs: { india: 'Nacional' } }
  }, glance: [['usa', 'usa', 'EE.UU.'], ['europe', 'europe', 'Europa'], ['westasia', 'russia', 'Rusia'], ['australia', 'australia', 'Australia']] }
};
const CL_VIEWS = { chart: 'Gráfico', map: 'Mapa' };
const CL_PERIODOS = [
  { key: '60', label: 'Últimos 60 días' },
  { key: '180', label: 'Últimos 180 días' },
  { key: '15', label: 'Pronóstico 15 días' }
];

// ─── Estilos del módulo ───
(function clEstilos() {
  const css = `
#clima-space{display:none}
.cl-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:14px}
.cl-title{font-size:18px;font-weight:700}
.cl-sub{font-size:12px;color:var(--text-2);max-width:75ch}
.cl-src{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.cl-chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;border:1px solid var(--border);background:var(--bg-card);border-radius:999px;padding:4px 10px;color:var(--text-2)}
.cl-chip i{width:7px;height:7px;border-radius:50%;background:var(--es-green)}
.cl-chip.warn{background:var(--es-gold-light);border-color:var(--es-gold);color:#96700e}
.cl-chip.warn i{background:var(--es-gold)}
.cl-chip.busy i{background:var(--es-gold);animation:clPulso 1s infinite alternate}
@keyframes clPulso{from{opacity:.3}to{opacity:1}}
.cl-chip a{color:var(--es-green)}
.cl-controls{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end;margin-bottom:6px;padding:10px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow)}
.cl-ctl label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:var(--text-3);margin-bottom:5px;font-weight:700}
.cl-seg{display:flex;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;overflow:hidden}
.cl-seg button{border:0;background:none;padding:6px 12px;font:inherit;font-size:12px;cursor:pointer;color:var(--text)}
.cl-seg button+button{border-left:1px solid var(--border)}
.cl-seg button.on{background:var(--es-green);color:#fff;font-weight:600}
.cl-controls select{font:inherit;font-size:12px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-input)}
.cl-h2{font-size:14px;font-weight:700;margin:18px 0 10px;display:flex;align-items:baseline;gap:10px}
.cl-h2 small{font-weight:400;color:var(--text-3);font-size:12px}
.cl-grid{display:grid;gap:12px}
.cl-g3{grid-template-columns:repeat(3,1fr)}
.cl-g4{grid-template-columns:repeat(4,1fr)}
.cl-tile{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--shadow);break-inside:avoid}
.cl-tile header{display:flex;justify-content:space-between;align-items:center;padding:7px 10px;font-size:12px;font-weight:600;border-bottom:1px solid var(--border)}
.cl-tile header span{font-weight:400;color:var(--text-3)}
.cl-tile img{width:100%;display:block;cursor:zoom-in;aspect-ratio:635/495;object-fit:contain;background:#fff}
.cl-miss{aspect-ratio:635/495;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;color:var(--text-3);font-size:12px;background:repeating-linear-gradient(45deg,#fafaf6,#fafaf6 8px,#f2f3ec 8px,#f2f3ec 16px)}
.cl-miss a{color:var(--es-green)}
.cl-row{font-size:11px;font-weight:700;color:var(--es-green);margin:4px 0 6px;text-transform:uppercase;letter-spacing:.6px}
.cl-nota{font-size:11px;color:var(--text-3);margin-top:16px;line-height:1.6}
#cl-lb{position:fixed;inset:0;background:rgba(20,25,23,.82);display:none;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out}
#cl-lb img{max-width:94vw;max-height:92vh;background:#fff;border-radius:6px}
@media (max-width:1000px){.cl-g3,.cl-g4{grid-template-columns:1fr 1fr}}
@media (max-width:600px){.cl-g3,.cl-g4{grid-template-columns:1fr}}
@media print{
  #clima-space{display:none!important}
  body[data-print-mod="clima-space"] #clima-space{display:block!important}
  body[data-print-mod="clima-space"] .cl-controls{display:none!important}
}
`;
  const st = document.createElement('style');
  st.id = 'cl-styles';
  st.textContent = css;
  document.head.appendChild(st);
})();

// ─── Contenedor del módulo ───
(function clCrearEspacio() {
  const cont = document.querySelector('.container');
  if (!cont || document.getElementById('clima-space')) return;
  const div = document.createElement('div');
  div.id = 'clima-space';
  div.innerHTML = `
    <div class="cl-head">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:28px;">🌦</span>
        <div>
          <div class="cl-title">Clima por cultivo</div>
          <div class="cl-sub">Lluvia y temperatura de los últimos 60 y 180 días y pronóstico a 15 días, ponderados por zona productiva. Se actualiza solo al abrir el módulo.</div>
        </div>
      </div>
      <div class="cl-src">
        <span class="cl-chip" id="cl-estado"><i></i>—</span>
        <button class="btn btn-outline" style="font-size:11px;" onclick="clBuscarCorridas(true)">🔄 Actualizar ahora</button>
      </div>
    </div>
    <div class="cl-controls">
      <div class="cl-ctl"><label>Cultivo</label><div class="cl-seg" id="cl-crop"></div></div>
      <div class="cl-ctl"><label>Región</label><div class="cl-seg" id="cl-reg"></div></div>
      <div class="cl-ctl"><label>Zona</label><select id="cl-sub"></select></div>
      <div class="cl-ctl"><label>Vista</label><div class="cl-seg" id="cl-view"></div></div>
    </div>
    <div class="cl-h2">Pantallazo global <small id="cl-glance-sub"></small></div>
    <div class="cl-grid cl-g4" id="cl-glance"></div>
    <div class="cl-h2">Detalle <small id="cl-det-sub"></small></div>
    <div class="cl-row">Lluvia</div>
    <div class="cl-grid cl-g3" id="cl-pcp"></div>
    <div class="cl-row" style="margin-top:14px">Temperatura</div>
    <div class="cl-grid cl-g3" id="cl-tmp"></div>
    <div class="cl-nota">
      Gráficos: promedio ponderado por producción vs. normal (pulgadas / °F; 1 in = 25,4 mm). Mapas: % de lo normal (lluvia) y desvío vs. normal (temperatura).
      Pronóstico: ensemble GFS (NOAA) a 15 días. Clic en cualquier imagen para ampliar.
      Fuente: <a href="${CL_WAW}" target="_blank" rel="noopener" style="color:var(--es-green)">World Ag Weather</a> — uso interno.
    </div>
    <div id="cl-lb" onclick="this.style.display='none'"><img alt=""></div>`;
  cont.appendChild(div);
  // Que el botón 🖨 PDF imprima este módulo cuando está abierto
  if (typeof PRINT_SPACES !== 'undefined' && !PRINT_SPACES.includes('clima-space')) PRINT_SPACES.push('clima-space');
  if (typeof PRINT_TITLES !== 'undefined') PRINT_TITLES['clima-space'] = 'Clima por cultivo';
})();

// ─── Navegación: entrar/salir del módulo ───
function toggleClima() {
  climaMode = true;
  theoryMode = false; retMode = false; paseMode = false; asstMode = false; spreadMode = false;
  if (typeof desvioMode !== 'undefined') desvioMode = false;
  if (typeof futOpcMode !== 'undefined') futOpcMode = false;
  if (typeof lineupMode !== 'undefined') lineupMode = false;
  if (typeof resumenMode !== 'undefined') resumenMode = false;
  if (typeof escMode !== 'undefined') escMode = false;
  ['workspace', 'theory-space', 'ret-space', 'pase-space', 'spreads-space', 'desvio-space', 'alertas-space',
   'futopc-space', 'lineup-space', 'resumen-space', 'esc-space']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  ['tabs-container', 'mkt-bar', 'fob-bar'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  document.getElementById('clima-space').style.display = 'block';
  clMarcarPill();
  clRender();
  const edad = clRun && clRun._buscado ? (Date.now() - clRun._buscado) / 60000 : Infinity;
  if (edad > CL_REFRESCO_MIN) clBuscarCorridas(false);
}

function clMarcarPill() {
  document.querySelectorAll('.mod-pill').forEach(p => p.classList.toggle('active', p.id === 'pill-clima'));
}

// Al ir a cualquier otro módulo se oculta Clima
(function clEnvolverNavegacion() {
  ['switchToWorkspace', 'toggleTheory', 'toggleRetenciones', 'togglePases', 'toggleSpreads', 'toggleDesvio',
   'toggleLineUp', 'toggleResumen', 'toggleEscenarios', 'switchTab'].forEach(fn => {
    const orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function () {
      climaMode = false;
      const el = document.getElementById('clima-space');
      if (el) el.style.display = 'none';
      return orig.apply(this, arguments);
    };
  });
  const origRT = window.renderTabs;
  if (typeof origRT === 'function') window.renderTabs = function () {
    const r = origRT.apply(this, arguments);
    if (climaMode) { const tc = document.getElementById('tabs-container'); if (tc) tc.style.display = 'none'; }
    return r;
  };
  const origRM = window.renderModules;
  if (typeof origRM === 'function') window.renderModules = function () {
    const r = origRM.apply(this, arguments);
    if (climaMode) clMarcarPill();
    return r;
  };
})();

// ─── Detección automática de la última corrida ───
function clExiste(path) {
  return new Promise(resolve => {
    const img = new Image();
    const t = setTimeout(() => { img.src = ''; resolve(false); }, 15000);
    img.onload = () => { clearTimeout(t); resolve(img.naturalWidth > 0); };
    img.onerror = () => { clearTimeout(t); resolve(false); };
    img.src = CL_BASE + path + '?t=' + Date.now();   // evita que el navegador recuerde un "no existe" viejo
  });
}

// Desde el último número conocido, sube de a tandas hasta encontrar el más alto que existe.
// World Ag Weather numera todo con un contador compartido entre productos y conserva varias
// corridas viejas, así que entre una corrida y la siguiente puede haber huecos: se cortan
// la búsqueda recién después de 3 tandas seguidas vacías.
async function clUltimo(tipo, desde) {
  const sonda = CL_SONDA[tipo];
  let mejor = (await clExiste(sonda(desde))) ? desde : null;
  let ini = desde + 1, vacias = 0;
  const TANDA = 12, TOPE = desde + 1500;   // ~3 números por día: alcanza aunque no se abra en meses
  while (ini < TOPE) {
    const nums = Array.from({ length: TANDA }, (_, i) => ini + i);
    const ok = await Promise.all(nums.map(n => clExiste(sonda(n))));
    const hallados = nums.filter((n, i) => ok[i]);
    if (hallados.length) { mejor = Math.max(...hallados); ini = mejor + 1; vacias = 0; continue; }
    ini += TANDA;
    if (mejor !== null && ++vacias >= 3) break;   // ya había uno y no aparece nada más arriba: es el último
  }
  return mejor;
}

async function clBuscarCorridas(force) {
  if (clBuscando) return;
  clBuscando = true; clError = null; clRender();
  try {
    // Primero, ver si el sitio responde (si no, no tiene sentido buscar corridas)
    if (!(await clExiste('../header.png'))) throw new Error('el sitio no responde; se muestra la última corrida conocida');
    const base = Object.assign({}, CL_RUN_DEFAULT, clRun || {});
    const tipos = Object.keys(CL_SONDA);
    const res = await Promise.all(tipos.map(k => clUltimo(k, Math.max(base[k], CL_RUN_DEFAULT[k]))));
    const nuevo = {};
    tipos.forEach((k, i) => { nuevo[k] = res[i] !== null ? res[i] : base[k]; });
    if (res.some(v => v === null)) clError = 'No se pudo confirmar alguna corrida; se muestra la última conocida.';
    nuevo._buscado = Date.now();
    clRun = nuevo;
    try { localStorage.setItem(CL_RUN_KEY, JSON.stringify(clRun)); } catch (e) { /* sin espacio: seguir */ }
  } catch (e) {
    clError = 'No se pudo conectar con World Ag Weather: ' + (e.message || e);
  }
  clBuscando = false;
  if (climaMode) clRender();
}

(function clCacheLocal() {
  try { const raw = localStorage.getItem(CL_RUN_KEY); if (raw) clRun = JSON.parse(raw); } catch (e) { clRun = null; }
  try { const s = (typeof uiGet === 'function') ? uiGet('clima_sel', null) : null; if (s && CL_CFG[s.crop]) clSel = Object.assign(clSel, s); } catch (e) { /* seguir */ }
})();

// ─── URLs ───
function clImg(vrbl, nday, view, crop, place) {
  const r = Object.assign({}, CL_RUN_DEFAULT, clRun || {});
  const m = view === 'map' ? 'map' : '';
  if (nday === '15') return `${CL_BASE}fcstwx/fcst${vrbl}${m}_${crop}_${place}_${r.fcst}.png`;
  const n = vrbl === 'pcp' ? r.pastPcp : r.pastTmp;
  return `${CL_BASE}pastwx/past${vrbl}${m}_${crop}_${place}_${nday}day_${n}.png`;
}
function clLink(vrbl, nday, view, crop, region, sub) {
  return `${CL_WAW}#map=${view}&crop=${crop}&region=${region}&subregion=${sub}&vrbl=${vrbl}&nday=${nday}`;
}

// ─── Render ───
function clTile(titulo, sub, src, link) {
  const d = document.createElement('div');
  d.className = 'cl-tile';
  d.innerHTML = `<header>${titulo}<span>${sub || ''}</span></header>`;
  const img = new Image();
  img.alt = titulo; img.loading = 'lazy'; img.src = src;
  img.onclick = () => { const lb = document.getElementById('cl-lb'); lb.querySelector('img').src = src; lb.style.display = 'flex'; };
  img.onerror = () => {
    const m = document.createElement('div');
    m.className = 'cl-miss';
    m.innerHTML = `No disponible para esta zona.<br><a href="${link}" target="_blank" rel="noopener">Ver en World Ag Weather</a>`;
    img.replaceWith(m);
  };
  d.appendChild(img);
  return d;
}

function clSeg(id, items, actual, alElegir) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  Object.entries(items).forEach(([k, v]) => {
    const b = document.createElement('button');
    b.textContent = v;
    if (k === actual) b.className = 'on';
    b.onclick = () => alElegir(k);
    el.appendChild(b);
  });
}

function clCambiar(cambios) {
  Object.assign(clSel, cambios);
  try { if (typeof uiSet === 'function') uiSet('clima_sel', Object.assign({}, clSel)); } catch (e) { /* seguir */ }
  clRender();
}

function clEstado() {
  const el = document.getElementById('cl-estado');
  if (!el) return;
  const r = Object.assign({}, CL_RUN_DEFAULT, clRun || {});
  if (clBuscando) { el.className = 'cl-chip busy'; el.innerHTML = '<i></i>Buscando la última corrida…'; return; }
  const cuando = clRun && clRun._buscado
    ? 'verificado ' + new Date(clRun._buscado).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : 'sin verificar';
  el.className = 'cl-chip' + (clError ? ' warn' : '');
  el.title = clError || '';
  el.innerHTML = `<i></i>World Ag Weather · ${cuando} · <span style="font-family:var(--mono)">#${r.fcst} / #${r.pastPcp} / #${r.pastTmp}</span>`;
}

function clRender() {
  if (!document.getElementById('clima-space')) return;
  clEstado();
  const c = CL_CFG[clSel.crop];
  if (!c.regions[clSel.region]) clSel.region = Object.keys(c.regions)[0];
  const r = c.regions[clSel.region];
  if (!r.subs[clSel.sub]) clSel.sub = Object.keys(r.subs)[0];

  clSeg('cl-crop', Object.fromEntries(Object.entries(CL_CFG).map(([k, v]) => [k, v.label])), clSel.crop, k => {
    const regs = CL_CFG[k].regions;
    const reg = regs[clSel.region] ? clSel.region : Object.keys(regs)[0];
    clCambiar({ crop: k, region: reg, sub: Object.keys(regs[reg].subs)[0] });
  });
  clSeg('cl-reg', Object.fromEntries(Object.entries(c.regions).map(([k, v]) => [k, v.label])), clSel.region,
    k => clCambiar({ region: k, sub: Object.keys(c.regions[k].subs)[0] }));
  clSeg('cl-view', CL_VIEWS, clSel.view, k => clCambiar({ view: k }));

  const sel = document.getElementById('cl-sub');
  sel.innerHTML = Object.entries(r.subs).map(([k, v]) => `<option value="${k}" ${k === clSel.sub ? 'selected' : ''}>${v}</option>`).join('');
  sel.disabled = clSel.view === 'map';
  sel.title = clSel.view === 'map' ? 'Los mapas muestran toda la región' : '';
  sel.onchange = e => clCambiar({ sub: e.target.value });

  // Pantallazo: mapa de pronóstico de lluvia en las regiones clave del cultivo
  document.getElementById('cl-glance-sub').textContent = `${c.label} · pronóstico de lluvia 15 días, % de lo normal`;
  const gl = document.getElementById('cl-glance');
  gl.innerHTML = '';
  c.glance.forEach(([reg, mapa, lbl]) => {
    gl.appendChild(clTile(lbl, '15 días', clImg('pcp', '15', 'map', clSel.crop, mapa), clLink('pcp', '15', 'map', clSel.crop, reg, reg)));
  });

  // Detalle: 3 períodos × lluvia / temperatura
  const lugar = clSel.view === 'map' ? r.map : clSel.sub;
  const donde = clSel.view === 'map' ? r.label : r.subs[clSel.sub];
  document.getElementById('cl-det-sub').textContent = `${c.label} · ${donde} · ${CL_VIEWS[clSel.view].toLowerCase()}`;
  [['pcp', 'cl-pcp'], ['tmp', 'cl-tmp']].forEach(([v, id]) => {
    const fila = document.getElementById(id);
    fila.innerHTML = '';
    CL_PERIODOS.forEach(p => {
      fila.appendChild(clTile(p.label, donde, clImg(v, p.key, clSel.view, clSel.crop, lugar),
        clLink(v, p.key, clSel.view, clSel.crop, clSel.region, clSel.sub)));
    });
  });
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { const lb = document.getElementById('cl-lb'); if (lb) lb.style.display = 'none'; }
});
