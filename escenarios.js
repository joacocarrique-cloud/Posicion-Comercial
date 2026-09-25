// ═══════════════════════════════════════════════════
// ─── ESCENARIOS: Posición comercial + coberturas ───
// Combina la posición del tablero "Posicion Comercial" (físico fijado, a fijar,
// saldo a vender y FyO abiertos) con coberturas nuevas armadas con primas de A3,
// y muestra qué precio final le queda a la posición en cada escenario de precios.
//
// Precio final (u$s/tn de producción disponible) a un movimiento d del mercado:
//   [ fijadas × precio físico fijado
//   + (a fijar + total a vender) × mercado × (1 + d)
//   + resultado a vencimiento de los FyO abiertos (futuro de su posición × (1 + d))
//   + resultado de las coberturas propuestas ] / producción disponible
// A diferencia del "Precio Final" del Excel, acá los futuros no suman toneladas
// (cubren el saldo) y las opciones sí mueven el precio según el escenario.
//
// Maíz se trabaja separado en temprano (posición ABR) y tardío (posición JUL);
// "Maíz total" es la suma de los dos, con las coberturas de cada uno.
// ═══════════════════════════════════════════════════

let escMode = false;
let escPos = null;          // posición importada del tablero (subconjunto compacto)
let escChart = null;
let escPosVieja = false;    // había una posición guardada con un formato anterior
let escState = { delta: 0, crop: 'trigo', otm: 3, presetCrops: ['trigo', 'maiz_temp', 'maiz_tard', 'soja'],
                 legs: {}, excl: {}, fut0: {}, mercado: {}, ejes: {}, seq: 1 };

const ESC_POS_KEY = 'espartina_esc_posicion_v1';
const ESC_STATE_KEY = 'espartina_esc_estado_v1';
const ESC_POS_VERSION = 2;
// col = nombre de la columna del tablero · a3 = cultivo en A3 · mes = posición por defecto para cubrir
const ESC_CULTIVOS = {
  trigo:     { lbl: 'Trigo',         col: 'TRIGO',       a3: 'trigo' },
  maiz_temp: { lbl: 'Maíz temprano', col: 'MAIZ TEMP.',  a3: 'maiz', mes: 'ABR' },
  maiz_tard: { lbl: 'Maíz tardío',   col: 'MAIZ TARDIO', a3: 'maiz', mes: 'JUL' },
  maiz:      { lbl: 'Maíz total',    col: 'MAIZ TOTAL',  a3: 'maiz', partes: ['maiz_temp', 'maiz_tard'] },
  soja:      { lbl: 'Soja',          col: 'SOJA',        a3: 'soja' },
  girasol:   { lbl: 'Girasol',       col: 'GIRASOL',     a3: 'girasol' }
};
const ESC_ORDEN = ['trigo', 'maiz_temp', 'maiz_tard', 'maiz', 'soja', 'girasol'];
// Meses de posición de los FyO de maíz que se asignan al tardío (el resto va al temprano)
const ESC_MAIZ_TARDIO = ['JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const ESC_FILAS = {
  prod: 'TN Producción Propias', disp: 'Producción disponible', fij: 'TN Fijadas',
  afijar: 'TN a Fijar', tav: 'Total a Vender', ppvFis: 'Precio Prom. Vta Físico',
  mercado: 'Precio Mercado', precioFinal: 'Precio Final',
  dolor: 'Precio Dolor', objetivo: 'Precio Objetivo'
};
const ESC_RANGO = 0.40;                        // ±40% en el slider y rango X por defecto del gráfico
const ESC_TABLA = [-0.30, -0.20, -0.10, 0, 0.10, 0.20, 0.30];
const ESC_COLOR_ACT = '#2563eb';
const ESC_COLOR_PROP = '#1A6B3C';
const ESC_COLOR_CRUCE = '#b7791f';

// ─── Helpers ───
function escF(n, d = 1) {
  if (n == null || !isFinite(n)) return '—';
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function escSig(n, d = 1) { return (n > 0.0001 ? '+' : n < -0.0001 ? '−' : '') + escF(Math.abs(n), d); }
function escUsd(n) { return (n < 0 ? '−' : '') + 'u$s ' + escF(Math.abs(n), 0); }
function escPct(v) { return escF(v * 100, 0) + '%'; }
function escCls(v) { return v > 0.05 ? 'rs-pos' : v < -0.05 ? 'rs-neg' : ''; }
function escNorm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim(); }
function escNum(v) {
  const s0 = String(v == null ? '' : v).trim();
  const s = s0.includes(',') ? s0.replace(/\./g, '').replace(',', '.') : s0;
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

// ─── Cultivos: los "grupos" (maíz total) suman sus partes ───
function escLbl(c) { return (ESC_CULTIVOS[c] || {}).lbl || c; }
function escA3(c) { return (ESC_CULTIVOS[c] || {}).a3 || c; }
function escPartes(c) { return (escPos.cultivos[c] || {}).partes || null; }
function escEsGrupo(c) { return !!escPartes(c); }
function escBase(c) { return escPartes(c) || [c]; }
function escCrops() { return ESC_ORDEN.filter(c => escPos.cultivos[c]); }
function escBaseCrops() { return escCrops().filter(c => !escEsGrupo(c)); }
function escSum(c, fn) { return escBase(c).reduce((s, b) => s + fn(b), 0); }

// ─── Persistencia (solo en este navegador) ───
function escCargarGuardado() {
  try { const r = localStorage.getItem(ESC_POS_KEY); if (r) escPos = JSON.parse(r); } catch (e) { escPos = null; }
  if (escPos && escPos.v !== ESC_POS_VERSION) { escPos = null; escPosVieja = true; }   // formato viejo: hay que volver a cargar el tablero
  try {
    const r = localStorage.getItem(ESC_STATE_KEY);
    if (r) escState = Object.assign(escState, JSON.parse(r) || {});
  } catch (e) {}
  escState.ejes = escState.ejes || {};
  escMigrarMaiz();
}
function escGuardar() {
  try { localStorage.setItem(ESC_STATE_KEY, JSON.stringify(escState)); } catch (e) {}
  if (typeof showSaveIndicator === 'function') showSaveIndicator();
}

// Coberturas guardadas cuando maíz era un solo cultivo: se reparten por mes de posición
function escMigrarMaiz() {
  if (!escPos || !escEsGrupo('maiz')) return;
  const viejas = escState.legs.maiz || [];
  viejas.forEach(l => {
    const destino = ESC_MAIZ_TARDIO.includes(String(l.pos || '').slice(0, 3)) ? 'maiz_tard' : 'maiz_temp';
    (escState.legs[destino] = escState.legs[destino] || []).push(l);
  });
  delete escState.legs.maiz;
  delete escState.mercado.maiz;
  if (escState.presetCrops.includes('maiz'))
    escState.presetCrops = escState.presetCrops.filter(x => x !== 'maiz').concat(['maiz_temp', 'maiz_tard']);
}

// ═══════════════════════════════════════════════════
// IMPORTAR LA POSICIÓN DEL TABLERO
// Se elige el mismo "Posicion Comercial 26-27.html" que genera el Excel: los datos
// vienen embebidos como `const DATOS = {...};`. También acepta ese JSON suelto.
// ═══════════════════════════════════════════════════
function escExtraerDatos(texto) {
  if (texto.trim().startsWith('{')) return JSON.parse(texto);
  const i = texto.indexOf('const DATOS');
  if (i < 0) throw new Error('No encuentro los datos de la posición. Elegí el archivo "Posicion Comercial 26-27.html".');
  const ini = texto.indexOf('{', i);
  // Se recorre hasta cerrar la llave de apertura, salteando el contenido de los strings
  let depth = 0, enStr = false, esc = false;
  for (let k = ini; k < texto.length; k++) {
    const c = texto[k];
    if (enStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') enStr = false; continue; }
    if (c === '"') enStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(texto.slice(ini, k + 1));
  }
  throw new Error('Los datos del tablero están incompletos.');
}

function escCompactar(d) {
  const D = d && d.dashboard;
  if (!D || !D.filas || !D.cultivos) throw new Error('El archivo no tiene la posición comercial.');
  const fila = lbl => D.filas.find(f => f.label === lbl);
  const cultivos = {};
  ESC_ORDEN.forEach(c => {
    const i = D.cultivos.findIndex(x => escNorm(x.nombre) === ESC_CULTIVOS[c].col);
    if (i < 0) return;
    const o = {};
    Object.entries(ESC_FILAS).forEach(([k, lbl]) => { const f = fila(lbl); o[k] = f ? f.vals[i] : null; });
    if (o.disp > 0) cultivos[c] = o;
  });
  if (!Object.keys(cultivos).length) throw new Error('No encontré Trigo, Maíz, Soja ni Girasol en el tablero.');
  // Maíz total pasa a ser la suma de temprano + tardío si el tablero trae las dos columnas
  const maizSeparado = cultivos.maiz && cultivos.maiz_temp && cultivos.maiz_tard;
  if (maizSeparado) cultivos.maiz.partes = ESC_CULTIVOS.maiz.partes.slice();
  else { delete cultivos.maiz_temp; delete cultivos.maiz_tard; }

  // FyO abiertos. Signos del extractor: futuro vendido = +, opción comprada = +
  const fyo = ((d.fyo || {}).posiciones || []).filter(p => Math.abs(p.neta) > 1e-9).map(p => {
    const m = String(p.instrumento).match(/^([A-Z]{3})\.([A-Z]{3})\/([A-Z]{3}\d{2})/);
    let crop = escNorm(p.cultivo).toLowerCase();
    if (crop === 'maiz' && maizSeparado)
      crop = m && ESC_MAIZ_TARDIO.includes(m[3].slice(0, 3)) ? 'maiz_tard' : 'maiz_temp';
    const fut = p.tipo === 'Futuro';
    return {
      ins: p.instrumento, crop, pos: m ? m[3] : null, plaza: m ? m[2] : null,
      tipo: fut ? 'futuro' : (p.clase === 'P' ? 'put' : 'call'),
      dir: fut ? (p.neta > 0 ? 'sell' : 'buy') : (p.neta > 0 ? 'buy' : 'sell'),
      tn: Math.abs(p.neta),
      strike: fut ? p.precio : p.strike,     // futuro: precio de la posición abierta
      prima: fut ? 0 : p.precio              // opción: prima promedio de lo abierto
    };
  }).filter(p => cultivos[p.crop] && !cultivos[p.crop].partes);

  return { v: ESC_POS_VERSION, meta: d.meta || {}, cultivos, fyo, importado: new Date().toISOString() };
}

function escElegirArchivo() { document.getElementById('esc-file').click(); }

function escImportar(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      escPos = escCompactar(escExtraerDatos(String(rd.result)));
      escPosVieja = false;
      try { localStorage.setItem(ESC_POS_KEY, JSON.stringify(escPos)); } catch (e) {}
      escMigrarMaiz();
      if (!escPos.cultivos[escState.crop]) escState.crop = escCrops()[0];
      escGuardar();
      escRender();
    } catch (e) {
      alert('No pude leer la posición: ' + e.message);
    }
  };
  rd.readAsText(file);
}

// ═══════════════════════════════════════════════════
// MODELO
// ═══════════════════════════════════════════════════
function escDisp(c) { return escSum(c, b => escPos.cultivos[b].disp || 0); }

// Precio de mercado de hoy. En un grupo: promedio de sus partes ponderado por producción.
function escMercado(c) {
  if (escEsGrupo(c)) return escSum(c, b => escMercado(b) * escPos.cultivos[b].disp) / escDisp(c);
  const o = escState.mercado[c];
  return (o > 0) ? o : (escPos.cultivos[c].mercado || 0);
}

// Futuro de hoy para una posición (A3). Sin A3, se usa el precio de mercado del tablero.
function escFutA3(c, pos) {
  const a3 = escA3(c);
  if (!sheetData || !pos || !sheetData.futuros[a3]) return null;
  const f = sheetData.futuros[a3].find(x => x.pos === pos && x.precio > 0);
  return f ? f.precio : null;
}
function escF0(c, l) {
  if (l.plaza && l.plaza !== 'ROS') return escState.fut0[l.ins] || null;   // otro subyacente (p.ej. Kansas)
  return escFutA3(c, l.pos) || escMercado(c);
}

// Un FyO abierto entra al cálculo salvo que se lo excluya. Los de otra plaza
// (Kansas, Chicago) solo entran si se carga el precio de hoy de su subyacente.
function escFyoIncluido(l) {
  if (escState.excl[l.ins]) return false;
  if (l.plaza && l.plaza !== 'ROS') return escState.fut0[l.ins] > 0;
  return true;
}
function escFyo(c) { const b = escBase(c); return escPos.fyo.filter(l => b.includes(l.crop)); }
// Coberturas propuestas. En un grupo es la lista (de solo lectura) de las de sus partes.
function escLegs(c) {
  if (escPos && escEsGrupo(c)) return escBase(c).reduce((a, b) => a.concat(escLegs(b).map(l => Object.assign({ parte: b }, l))), []);
  return escState.legs[c] || (escState.legs[c] = []);
}

// Resultado a vencimiento de una pata (u$s totales) con el mercado movido d
function escValorPata(c, l, d) {
  const F0 = escF0(c, l);
  if (!(F0 > 0) || !(l.tn > 0)) return 0;
  const F = F0 * (1 + d);
  if (l.tipo === 'futuro') return (l.dir === 'sell' ? 1 : -1) * l.tn * ((l.strike || F0) - F);
  const intr = l.tipo === 'put' ? Math.max(l.strike - F, 0) : Math.max(F - l.strike, 0);
  return (l.dir === 'buy' ? 1 : -1) * l.tn * (intr - (l.prima || 0));
}

function escIngreso(c, d, conProp) {
  if (escEsGrupo(c)) return escSum(c, b => escIngreso(b, d, conProp));
  const p = escPos.cultivos[c];
  const M = escMercado(c) * (1 + d);
  let usd = (p.fij || 0) * (p.ppvFis || 0) + ((p.afijar || 0) + (p.tav || 0)) * M;
  escFyo(c).filter(escFyoIncluido).forEach(l => { usd += escValorPata(c, l, d); });
  if (conProp) escLegs(c).forEach(l => { usd += escValorPata(c, l, d); });
  return usd;
}
function escPrecioFinal(c, d, conProp) { return escIngreso(c, d, conProp) / escDisp(c); }

// Tn cubiertas a la baja con el criterio del tablero: fijadas + futuros vendidos + puts netos
function escTnCubiertas(c, conProp) {
  let tn = escPos.cultivos[c].fij || 0;
  const suma = l => {
    const s = l.dir === 'sell' ? 1 : -1;
    if (l.tipo === 'futuro') tn += s * l.tn;
    else if (l.tipo === 'put') tn -= s * l.tn;
  };
  escFyo(c).filter(escFyoIncluido).forEach(suma);
  if (conProp) escLegs(c).forEach(suma);
  return tn;
}
// Saldo sin cobertura a la baja: a fijar + total a vender − futuros vendidos − puts netos.
// Las tn a fijar no tienen precio, así que cuentan como descubiertas.
function escTnSinCob(c, conProp) {
  return escSum(c, b => Math.max(0, escPos.cultivos[b].disp - escTnCubiertas(b, conProp)));
}
// Toneladas cubiertas de más: a partir de acá el precio final sube si el mercado baja
function escTnSobrecob(c, conProp) {
  return escSum(c, b => Math.max(0, escTnCubiertas(b, conProp) - escPos.cultivos[b].disp));
}
function escCobBaja(c, conProp) {
  const disp = escDisp(c);
  return Math.max(0, disp - escTnSinCob(c, conProp) + escTnSobrecob(c, conProp)) / disp;
}

// Prima neta de las coberturas propuestas (u$s; positivo = se paga)
function escCostoProp(c) {
  return escLegs(c).reduce((s, l) => l.tipo === 'futuro' ? s : s + (l.dir === 'buy' ? 1 : -1) * (l.prima || 0) * (l.tn || 0), 0);
}

// Precios de mercado donde se cruzan "posición actual" y "con cobertura" dentro de [xMin, xMax]
function escCruces(c, xMin, xMax) {
  const M = escMercado(c);
  const f = x => escPrecioFinal(c, x / M - 1, true) - escPrecioFinal(c, x / M - 1, false);
  const N = 400, out = [];
  let x0 = xMin, f0 = f(x0);
  for (let i = 1; i <= N; i++) {
    const x1 = xMin + (xMax - xMin) * i / N, f1 = f(x1);
    if (Math.abs(f0) > 1e-6 && Math.abs(f1) > 1e-6 && (f0 < 0) !== (f1 < 0)) {
      let a = x0, b = x1, fa = f0;
      for (let k = 0; k < 40; k++) {
        const m = (a + b) / 2, fm = f(m);
        if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else b = m;
      }
      // abajo = cuál conviene por debajo del cruce
      out.push({ x: (a + b) / 2, abajo: f0 > 0 ? 'cobertura' : 'actual' });
    }
    x0 = x1; f0 = f1;
  }
  return out;
}

// ─── Cadena de opciones A3 ───
function escPosicionesA3(c) {
  const a3 = escA3(c);
  if (!sheetData || !sheetData.futuros[a3]) return [];
  return sheetData.futuros[a3].filter(f => f.precio > 0).map(f => f.pos);
}
function escCadena(c, pos, tipo) {
  const byPos = sheetData && (sheetData.opciones[escA3(c)] || {})[pos];
  if (!byPos) return [];
  return (tipo === 'call' ? byPos.calls : byPos.puts).filter(o => o.prima > 0);
}
function escPrimaA3(c, pos, tipo, strike) {
  const o = escCadena(c, pos, tipo).find(x => Math.abs(x.strike - strike) < 1e-9);
  return o ? o.prima : null;
}

// Posición por defecto para cubrir: el mes propio del cultivo (maíz temprano ABR, tardío JUL),
// si no la de PRECIOS_REFERENCIA, si no la de Coberturas. Siempre la más próxima con puts.
function escPosDefault(c) {
  const posA3 = escPosicionesA3(c), a3 = escA3(c);
  const conPuts = pos => escCadena(c, pos, 'put').length > 0;
  const mesPropio = (ESC_CULTIVOS[c] || {}).mes;
  const propia = mesPropio && posA3.find(pos => pos.startsWith(mesPropio) && conPuts(pos));
  if (propia) return propia;
  const mesRef = Object.keys(typeof PRECIOS_REFERENCIA !== 'undefined' ? PRECIOS_REFERENCIA : {})
    .filter(k => k.startsWith(a3 + '|')).map(k => k.split('|')[1]);
  const ref = posA3.find(pos => mesRef.includes(pos.slice(0, 3)) && conPuts(pos));
  if (ref) return ref;
  const def = typeof defaultPositionFor === 'function' ? defaultPositionFor(a3) : '';
  return def || posA3.find(conPuts) || posA3[0] || '';
}

// Strike de la cadena más cercano a un objetivo; sin A3 se redondea el objetivo
function escStrikeCercano(c, pos, tipo, objetivo) {
  const ch = escCadena(c, pos, tipo);
  if (!ch.length) return Math.round(objetivo);
  return ch.reduce((b, o) => Math.abs(o.strike - objetivo) < Math.abs(b.strike - objetivo) ? o : b).strike;
}

// Refresca las primas automáticas con la última sincronización de A3
function escRefrescarPrimas() {
  Object.keys(escState.legs).filter(c => ESC_CULTIVOS[c]).forEach(c => (escState.legs[c] || []).forEach(l => {
    if (l.tipo === 'futuro' || !l.auto) return;
    const p = escPrimaA3(c, l.pos, l.tipo, l.strike);
    if (p != null) l.prima = p;
  }));
}

// ═══════════════════════════════════════════════════
// ACCIONES
// ═══════════════════════════════════════════════════
// Si ya hay una sincronización en curso (p.ej. la del arranque) no se lanza otra:
// se espera a que termine (hasta 15 s).
async function escAsegurarA3() {
  if (sheetData || typeof syncFromSheet !== 'function') return;
  const btn = document.getElementById('btn-sync-sheet');
  if (btn && btn.disabled) {
    for (let i = 0; i < 60 && !sheetData && btn.disabled; i++) await new Promise(r => setTimeout(r, 250));
    return;
  }
  try { await syncFromSheet(); } catch (e) {}
}

// Put X% abajo del futuro en cada cultivo marcado, por el saldo sin cobertura a la baja
// (lo que no tapan fijaciones, futuros vendidos, puts ni las patas cargadas a mano).
// Reemplaza las patas que se generaron así antes y deja las cargadas a mano.
async function escProponerPuts() {
  await escAsegurarA3();
  const otm = escNum(document.getElementById('esc-otm').value);
  escState.otm = otm != null ? otm : 3;
  const sinPrima = [];
  escState.presetCrops.filter(c => escPos.cultivos[c] && !escEsGrupo(c)).forEach(c => {
    const pos = escPosDefault(c);
    const F0 = escFutA3(c, pos) || escMercado(c);
    const strike = escStrikeCercano(c, pos, 'put', F0 * (1 - escState.otm / 100));
    const prima = escPrimaA3(c, pos, 'put', strike);
    escState.legs[c] = escLegs(c).filter(l => !l.preset);
    const tn = escTnSinCob(c, true);
    if (!(tn >= 1)) return;
    if (prima == null) sinPrima.push(escLbl(c));
    escState.legs[c].push({ id: escState.seq++, dir: 'buy', tipo: 'put', pos, strike,
      prima: prima || 0, tn: Math.round(tn), auto: true, preset: true });
  });
  escGuardar();
  escRender();
  if (sinPrima.length) alert(`Sin prima de A3 para: ${sinPrima.join(', ')}. Cargala a mano en la pata (quedó en 0).`);
}

function escTogglePresetCrop(c, on) {
  escState.presetCrops = escState.presetCrops.filter(x => x !== c);
  if (on) escState.presetCrops.push(c);
  escGuardar();
}

function escLimpiar(soloCultivo) {
  if (soloCultivo) escBase(escState.crop).forEach(b => { escState.legs[b] = []; });
  else if (confirm('¿Borrar todas las coberturas propuestas de todos los cultivos?')) escState.legs = {};
  else return;
  escGuardar();
  escRender();
}

function escAgregarPata() {
  const c = escState.crop;
  if (escEsGrupo(c)) return;
  const pos = escPosDefault(c);
  const F0 = escFutA3(c, pos) || escMercado(c);
  const strike = escStrikeCercano(c, pos, 'put', F0 * 0.97);
  escLegs(c).push({ id: escState.seq++, dir: 'buy', tipo: 'put', pos, strike,
    prima: escPrimaA3(c, pos, 'put', strike) || 0, tn: Math.round(escTnSinCob(c, true)), auto: true });
  escGuardar();
  escRender();
}

function escBorrarPata(id) {
  const c = escState.crop;
  escState.legs[c] = escLegs(c).filter(l => l.id !== id);
  escGuardar();
  escRender();
}

function escEditarPata(id, campo, valor) {
  const c = escState.crop;
  const l = escLegs(c).find(x => x.id === id);
  if (!l) return;
  delete l.preset;   // una pata tocada a mano ya no la reemplaza el atajo
  if (campo === 'prima') {
    const v = escNum(valor);
    if (v == null) { l.auto = true; l.prima = escPrimaA3(c, l.pos, l.tipo, l.strike) || 0; }
    else { l.auto = false; l.prima = v; }
  } else if (campo === 'tn' || campo === 'strike') {
    const v = escNum(valor);
    l[campo] = v != null ? v : 0;
  } else {
    l[campo] = valor;
  }
  // Al cambiar instrumento o posición, el strike se reubica en la cadena
  if (campo === 'tipo' || campo === 'pos') {
    const F0 = escFutA3(c, l.pos) || escMercado(c);
    if (l.tipo === 'futuro') l.strike = Math.round(F0 * 10) / 10;
    else if (!escCadena(c, l.pos, l.tipo).some(o => o.strike === l.strike))
      l.strike = escStrikeCercano(c, l.pos, l.tipo, l.tipo === 'put' ? F0 * 0.97 : F0 * 1.05);
  }
  if (l.tipo === 'futuro') l.prima = 0;
  else if (l.auto && campo !== 'prima') { const p = escPrimaA3(c, l.pos, l.tipo, l.strike); l.prima = p != null ? p : l.prima; }
  escGuardar();
  escRender();
}

function escSetExcl(ins, incluido) { escState.excl[ins] = !incluido; escGuardar(); escRender(); }
function escSetFut0(ins, v) { const n = escNum(v); if (n > 0) escState.fut0[ins] = n; else delete escState.fut0[ins]; escGuardar(); escRender(); }
function escSetMercado(v) { const n = escNum(v); if (n > 0) escState.mercado[escState.crop] = n; else delete escState.mercado[escState.crop]; escGuardar(); escRender(); }
function escSetCrop(c) { escState.crop = c; escGuardar(); escRender(); }

// Ejes del gráfico: un valor cargado a mano pisa el automático; vacío vuelve al automático
function escSetEje(k, v) {
  const c = escState.crop, n = escNum(v);
  const e = escState.ejes[c] = escState.ejes[c] || {};
  if (n != null) e[k] = n; else delete e[k];
  escGuardar();
  escRenderResultados();
}
function escEjesAuto() { delete escState.ejes[escState.crop]; escGuardar(); escRenderResultados(); }

// El slider solo recalcula resultados (no rehace los inputs del editor)
function escSetDelta(v) {
  escState.delta = (parseFloat(v) || 0) / 100;
  escRenderResultados();
  clearTimeout(escSetDelta._t);
  escSetDelta._t = setTimeout(escGuardar, 400);
}

// ═══════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════
function escRender() {
  const body = document.getElementById('esc-body');
  if (!body) return;
  if (!escPos) { body.innerHTML = escHtmlVacio(); return; }
  if (!escPos.cultivos[escState.crop]) escState.crop = escCrops()[0];

  const m = escPos.meta || {};
  const dPct = Math.round(escState.delta * 100);
  const ejeIn = (k, tit) => `<input id="esc-eje-${k}" class="esc-in esc-in-m" type="text" inputmode="decimal" title="${tit}. Vacío = automático." onchange="escSetEje('${k}', this.value)">`;

  body.innerHTML = `
    <div class="rs-head">
      <div>
        <div class="rs-title">🎯 Escenarios de posición</div>
        <div class="rs-subt">Posición comercial + coberturas propuestas: qué precio final le queda a cada cultivo según hacia dónde vaya el mercado.</div>
      </div>
      <div class="rs-actions">
        <button class="btn btn-outline btn-sm" onclick="escElegirArchivo()" title="Elegí el archivo Posicion Comercial 26-27.html">📂 Actualizar posición</button>
      </div>
    </div>
    <div class="rs-meta">Posición: ${escHtml(m.archivo || 'tablero')} · Excel modificado ${escHtml(m.modificado || '—')} · generado ${escHtml(m.generado || '—')}${sheetData ? ` · A3 ${escHtml(sheetData.fechaDatos || '')}` : ' · sin datos A3 (strikes y primas a mano)'}</div>

    <div class="rs-card esc-ctrl">
      <div class="esc-ctrl-bloque">
        <label class="esc-lbl" for="esc-delta">Escenario: movimiento del mercado a vencimiento</label>
        <div class="esc-slider">
          <span>−${ESC_RANGO * 100}%</span>
          <input type="range" id="esc-delta" min="${-ESC_RANGO * 100}" max="${ESC_RANGO * 100}" step="1" value="${dPct}" oninput="escSetDelta(this.value)">
          <span>+${ESC_RANGO * 100}%</span>
          <b id="esc-delta-lbl" class="esc-delta-lbl"></b>
        </div>
      </div>
      <div class="esc-ctrl-bloque">
        <label class="esc-lbl">Atajo: comprar puts por el saldo sin cobertura a la baja</label>
        <div class="esc-preset">
          ${escBaseCrops().map(c => `<label class="esc-chk"><input type="checkbox" ${escState.presetCrops.includes(c) ? 'checked' : ''} onchange="escTogglePresetCrop('${c}', this.checked)"> ${escLbl(c)}</label>`).join('')}
          <span class="esc-inline">strike <input id="esc-otm" class="esc-in esc-in-s" type="text" inputmode="decimal" value="${escState.otm}">% abajo del futuro</span>
          <button class="btn btn-sm" onclick="escProponerPuts()">Proponer puts</button>
          <button class="btn btn-outline btn-sm" onclick="escLimpiar(false)">Limpiar propuestas</button>
        </div>
      </div>
    </div>

    <div class="rs-card">
      <h3>Consolidado <span class="esc-h3-sub" id="esc-cons-sub"></span></h3>
      <div class="rs-tw"><table class="rs-table" id="esc-cons"></table></div>
    </div>

    <div class="esc-tabs">${escCrops().map(c => `<button class="esc-tab ${c === escState.crop ? 'active' : ''}${escEsGrupo(c) ? ' esc-tab-grupo' : ''}" onclick="escSetCrop('${c}')">${escLbl(c)}</button>`).join('')}</div>

    <div class="esc-grid">
      <div>
        <div class="rs-card">${escHtmlPosicion()}</div>
        <div class="rs-card">${escHtmlPropuesta()}</div>
      </div>
      <div>
        <div class="esc-kpis" id="esc-kpis"></div>
        <div class="rs-card">
          <div class="esc-ejes">
            <span class="esc-lbl">Ejes</span>
            <span class="esc-inline">X ${ejeIn('xmin', 'Mínimo del eje X (precio de mercado)')} a ${ejeIn('xmax', 'Máximo del eje X (precio de mercado)')}</span>
            <span class="esc-inline">Y ${ejeIn('ymin', 'Mínimo del eje Y (precio final)')} a ${ejeIn('ymax', 'Máximo del eje Y (precio final)')}</span>
            <button class="btn btn-sm btn-outline" onclick="escEjesAuto()" title="Vuelve a los ejes automáticos">Automático</button>
          </div>
          <div class="esc-chart-wrap"><canvas id="esc-chart"></canvas></div>
          <div class="esc-cruce-txt" id="esc-cruce-txt"></div>
        </div>
        <div class="rs-card">
          <h3>Precio final por escenario</h3>
          <div class="rs-tw"><table class="rs-table" id="esc-tabla"></table></div>
        </div>
      </div>
    </div>`;
  escRenderResultados();
}

function escHtmlVacio() {
  return `<div class="rs-card esc-vacio">
    <div class="rs-title">🎯 Escenarios de posición</div>
    ${escPosVieja ? '<p class="esc-aviso">El módulo cambió (ahora separa maíz temprano y tardío): volvé a cargar el tablero. Las coberturas que tenías cargadas se conservan.</p>' : ''}
    <p>Para simular coberturas sobre la posición real, cargá el tablero <b>Posicion Comercial 26-27.html</b>, el mismo archivo que abrís para ver la posición.</p>
    <p class="esc-nota">La suite lee los datos que ya trae ese archivo (producción, fijado, a fijar, saldo a vender y FyO abiertos). Quedan guardados solo en este navegador; no se suben a ningún lado. Cada vez que regenerás el tablero, volvé a cargarlo acá.</p>
    <button class="btn" onclick="escElegirArchivo()">📂 Cargar posición comercial</button>
  </div>`;
}

// Datos físicos del cultivo; en un grupo, sumados (precio fijado ponderado por tn)
function escFisico(c) {
  if (!escEsGrupo(c)) return escPos.cultivos[c];
  const g = escPos.cultivos[c], sum = k => escSum(c, b => escPos.cultivos[b][k] || 0);
  const fij = sum('fij');
  return Object.assign({}, g, {
    disp: sum('disp'), fij, afijar: sum('afijar'), tav: sum('tav'),
    ppvFis: fij ? escSum(c, b => (escPos.cultivos[b].fij || 0) * (escPos.cultivos[b].ppvFis || 0)) / fij : 0
  });
}

// Desglose del saldo sin cobertura: "a fijar + sin vender − futuros vendidos ± puts netos"
function escDetalleSinCob(c) {
  const p = escFisico(c);
  let fut = 0, puts = 0;   // futuros vendidos netos · puts comprados netos (FyO incluidos)
  escFyo(c).filter(escFyoIncluido).forEach(l => {
    const s = l.dir === 'sell' ? 1 : -1;
    if (l.tipo === 'futuro') fut += s * l.tn;
    else if (l.tipo === 'put') puts -= s * l.tn;
  });
  const term = (v, pos, neg) => Math.abs(v) < 1 ? '' : (v > 0 ? ` − ${escF(v, 0)} ${pos}` : ` + ${escF(-v, 0)} ${neg}`);
  return `${escF(p.afijar, 0)} a fijar + ${escF(p.tav, 0)} sin vender`
    + term(fut, 'fut. vendidos', 'fut. comprados') + term(puts, 'puts comprados', 'puts vendidos');
}

function escHtmlPosicion() {
  const c = escState.crop, p = escFisico(c), grupo = escEsGrupo(c);
  const fyo = escFyo(c);
  const M = escMercado(c);
  const fila = (k, v, extra = '') => `<tr><td class="rs-l">${k}</td><td>${v}</td><td class="rs-l esc-muted">${extra}</td></tr>`;
  const fyoRows = fyo.map(l => {
    const otraPlaza = l.plaza && l.plaza !== 'ROS';
    const F0 = escF0(l.crop, l);
    const lado = l.tipo === 'futuro' ? (l.dir === 'sell' ? 'Venta' : 'Compra') : (l.dir === 'buy' ? 'Compra' : 'Venta');
    const precio = l.tipo === 'futuro' ? escF(l.strike) : `prima ${escF(l.prima, 2)}`;
    const ctrl = otraPlaza
      ? `<input class="esc-in esc-in-m" type="text" inputmode="decimal" placeholder="futuro hoy" title="Otro subyacente (${escHtml(l.plaza)}): cargá su precio de hoy para incluirlo. Se mueve el mismo % que el escenario." value="${escState.fut0[l.ins] || ''}" onchange="escSetFut0('${escHtml(l.ins)}', this.value)">`
      : `<input type="checkbox" title="Incluir en el cálculo" ${escFyoIncluido(l) ? 'checked' : ''} onchange="escSetExcl('${escHtml(l.ins)}', this.checked)">`;
    return `<tr class="${escFyoIncluido(l) ? '' : 'esc-off'}">
      <td class="rs-l">${escHtml(l.ins)}${grupo ? ` <span class="esc-muted">${escLbl(l.crop).replace('Maíz ', '')}</span>` : ''}</td><td>${lado}</td><td>${escF(l.tn, 0)}</td><td>${precio}</td>
      <td>${F0 > 0 ? escF(F0) : '—'}</td><td class="esc-c">${ctrl}</td></tr>`;
  }).join('');

  const mercadoFila = grupo
    ? fila('Precio mercado hoy', escF(M), `promedio de ${escBase(c).map(escLbl).join(' y ')} (se edita en cada uno)`)
    : `<tr><td class="rs-l">Precio mercado hoy</td><td><input class="esc-in esc-in-m" type="text" inputmode="decimal" value="${escF(M)}" onchange="escSetMercado(this.value)" title="Del tablero. Editalo para probar otra base; vacío vuelve al del tablero."></td>
        <td class="rs-l esc-muted">${escState.mercado[c] ? 'editado (tablero: ' + escF(p.mercado) + ')' : 'del tablero'}</td></tr>`;
  const difTablero = grupo ? (escPos.cultivos[c].disp || 0) - p.disp : 0;

  return `<h3>Posición ${escLbl(c)}</h3>
    ${grupo ? `<div class="esc-nota-grupo">Suma de ${escBase(c).map(escLbl).join(' y ')}, con las coberturas propuestas de cada uno.</div>` : ''}
    <table class="rs-table esc-pos">
      ${fila('Producción disponible', escF(p.disp, 0) + ' tn', Math.abs(difTablero) >= 1 ? `el tablero muestra ${escF(escPos.cultivos[c].disp, 0)} tn en la columna total` : '')}
      ${fila('Fijadas', escF(p.fij, 0) + ' tn', `a u$s ${escF(p.ppvFis)} (precio prom. físico)`)}
      ${fila('A fijar', escF(p.afijar, 0) + ' tn', 'sin precio: toman el del escenario')}
      ${fila('Sin vender (Total a vender)', escF(p.tav, 0) + ' tn', 'toman el precio del escenario')}
      ${fila('<b>Saldo sin cobertura a la baja</b>', '<b>' + escF(escTnSinCob(c, false), 0) + ' tn</b>', escDetalleSinCob(c))}
      ${mercadoFila}
      ${fila('Precio dolor / objetivo', `${escF(p.dolor)} / ${escF(p.objetivo)}`)}
      ${fila('Precio Final (Excel)', escF(p.precioFinal), 'referencia: fórmula del tablero')}
    </table>
    <div class="rs-sub">FyO abiertos <span>se valúan a vencimiento contra el futuro de su posición${sheetData ? ' (A3)' : ' (sin A3: precio mercado)'}</span></div>
    ${fyo.length ? `<div class="rs-tw"><table class="rs-table esc-fyo">
      <thead><tr><th class="rs-l">Instrumento</th><th>Lado</th><th>Tn</th><th>Precio</th><th>Futuro hoy</th><th class="esc-c">Incluir</th></tr></thead>
      <tbody>${fyoRows}</tbody></table></div>` : '<div class="rs-empty">Sin futuros ni opciones abiertos.</div>'}`;
}

// En un grupo las coberturas se muestran de solo lectura: se cargan en cada parte
function escHtmlPropuestaGrupo(c) {
  const legs = escLegs(c);
  const rows = legs.map(l => `<tr>
      <td class="rs-l">${escLbl(l.parte)}</td><td>${l.dir === 'buy' ? 'Compra' : 'Venta'}</td>
      <td>${l.tipo === 'futuro' ? 'Futuro' : l.tipo === 'put' ? 'Put' : 'Call'}</td><td>${escHtml(l.pos || '')}</td>
      <td>${escF(l.strike, l.tipo === 'futuro' ? 1 : 0)}</td><td>${l.tipo === 'futuro' ? '—' : escF(l.prima, 2)}</td><td>${escF(l.tn, 0)}</td></tr>`).join('');
  return `<h3>Cobertura propuesta ${escLbl(c)}</h3>
    ${legs.length ? `<div class="rs-tw"><table class="rs-table esc-legs">
      <thead><tr><th class="rs-l">Parte</th><th>Operación</th><th>Instr.</th><th>Posición</th><th>Strike / precio</th><th>Prima</th><th>Tn</th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : `<div class="rs-empty">Sin coberturas propuestas.</div>`}
    <div class="esc-legs-foot">
      ${escBase(c).map(b => `<button class="btn btn-sm btn-outline" onclick="escSetCrop('${b}')">Editar ${escLbl(b)}</button>`).join('')}
      <span class="esc-muted">Saldo sin cobertura a la baja: ${escF(escTnSinCob(c, false), 0)} tn${legs.length ? ` → ${escF(escTnSinCob(c, true), 0)} tn con la propuesta` : ''}</span>
    </div>
    ${escTnSobrecob(c, true) >= 1 ? `<div class="esc-aviso">⚠ Sobrecubierto en <b>${escF(escTnSobrecob(c, true), 0)} tn</b>: hay más cobertura a la baja que producción sin precio, así que el precio final sube si el mercado baja.</div>` : ''}`;
}

function escHtmlPropuesta() {
  const c = escState.crop;
  if (escEsGrupo(c)) return escHtmlPropuestaGrupo(c);
  const legs = escLegs(c);
  const posA3 = escPosicionesA3(c);
  const rows = legs.map(l => {
    const F0 = escFutA3(c, l.pos) || escMercado(c);
    const posCtl = posA3.length
      ? `<select class="esc-in" onchange="escEditarPata(${l.id}, 'pos', this.value)">${(posA3.includes(l.pos) ? posA3 : [l.pos, ...posA3]).map(p => `<option ${p === l.pos ? 'selected' : ''}>${escHtml(p)}</option>`).join('')}</select>`
      : `<input class="esc-in esc-in-m" type="text" value="${escHtml(l.pos || '')}" onchange="escEditarPata(${l.id}, 'pos', this.value.toUpperCase())">`;
    const cadena = l.tipo === 'futuro' ? [] : escCadena(c, l.pos, l.tipo);
    const strikeCtl = cadena.length
      ? `<select class="esc-in" onchange="escEditarPata(${l.id}, 'strike', this.value)">${cadena.some(o => o.strike === l.strike) ? '' : `<option selected value="${l.strike}">${l.strike} ✎</option>`}${cadena.map(o => `<option value="${o.strike}" ${o.strike === l.strike ? 'selected' : ''}>${o.strike}</option>`).join('')}</select>`
      : `<input class="esc-in esc-in-m" type="text" inputmode="decimal" value="${l.strike}" onchange="escEditarPata(${l.id}, 'strike', this.value)">`;
    const dist = F0 > 0 ? (l.strike / F0 - 1) * 100 : null;
    const sinPrima = l.tipo !== 'futuro' && !(l.prima > 0);
    return `<tr>
      <td class="rs-l"><select class="esc-in" onchange="escEditarPata(${l.id}, 'dir', this.value)"><option value="buy" ${l.dir === 'buy' ? 'selected' : ''}>Compra</option><option value="sell" ${l.dir === 'sell' ? 'selected' : ''}>Venta</option></select></td>
      <td><select class="esc-in" onchange="escEditarPata(${l.id}, 'tipo', this.value)"><option value="put" ${l.tipo === 'put' ? 'selected' : ''}>Put</option><option value="call" ${l.tipo === 'call' ? 'selected' : ''}>Call</option><option value="futuro" ${l.tipo === 'futuro' ? 'selected' : ''}>Futuro</option></select></td>
      <td>${posCtl}</td>
      <td>${strikeCtl}<div class="esc-muted">${dist != null ? escSig(dist) + '% vs ' + escF(F0) : ''}</div></td>
      <td>${l.tipo === 'futuro' ? '—' : `<input class="esc-in esc-in-s${sinPrima ? ' is-estimada' : ''}" type="text" inputmode="decimal" value="${l.prima}" title="${l.auto ? 'Prima de A3. Editala para fijar otra; vacía vuelve a A3.' : 'Prima manual. Vaciala para volver a A3.'}" onchange="escEditarPata(${l.id}, 'prima', this.value)"><div class="esc-muted">${l.auto ? 'A3' : 'manual'}</div>`}</td>
      <td><input class="esc-in esc-in-m" type="text" inputmode="decimal" value="${escF(l.tn, 0)}" onchange="escEditarPata(${l.id}, 'tn', this.value)"></td>
      <td><button class="btn btn-sm btn-outline" onclick="escBorrarPata(${l.id})" title="Borrar pata">✕</button></td>
    </tr>`;
  }).join('');

  return `<h3>Cobertura propuesta ${escLbl(c)}</h3>
    ${legs.length ? `<div class="rs-tw"><table class="rs-table esc-legs">
      <thead><tr><th class="rs-l">Operación</th><th>Instr.</th><th>Posición</th><th>Strike / precio</th><th>Prima</th><th>Tn</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`
      : `<div class="rs-empty">Sin coberturas propuestas. Usá el atajo de arriba o agregá una pata.</div>`}
    <div class="esc-legs-foot">
      <button class="btn btn-sm" onclick="escAgregarPata()">+ Agregar pata</button>
      ${legs.length ? `<button class="btn btn-sm btn-outline" onclick="escLimpiar(true)">Borrar las de ${escLbl(c)}</button>` : ''}
      <span class="esc-muted">Saldo sin cobertura a la baja: ${escF(escTnSinCob(c, false), 0)} tn${legs.length ? ` → ${escF(escTnSinCob(c, true), 0)} tn con la propuesta` : ''}</span>
    </div>
    ${escTnSobrecob(c, true) >= 1 ? `<div class="esc-aviso">⚠ Sobrecubierto en <b>${escF(escTnSobrecob(c, true), 0)} tn</b>: hay más cobertura a la baja que producción sin precio, así que el precio final sube si el mercado baja.</div>` : ''}`;
}

// Consolidado, KPIs, gráfico y tabla (todo lo que depende del escenario)
function escRenderResultados() {
  if (!escPos || !document.getElementById('esc-cons')) return;
  const d = escState.delta, c = escState.crop;
  const lbl = document.getElementById('esc-delta-lbl');
  if (lbl) lbl.textContent = `${escSig(d * 100, 0)}% · ${escLbl(c)} a u$s ${escF(escMercado(c) * (1 + d))}`;
  escRenderConsolidado(d);
  escRenderKpis(c, d);
  escRenderChart(c, d);
  escRenderTabla(c, d);
}

function escRenderConsolidado(d) {
  let tAct = 0, tProp = 0, tCosto = 0, tDisp = 0, tSinA = 0, tSinP = 0;
  const partes = new Set(escCrops().filter(escEsGrupo).flatMap(escBase));
  const rows = escCrops().map(x => {
    const grupo = escEsGrupo(x), disp = escDisp(x);
    const iA = escIngreso(x, d, false), iP = escIngreso(x, d, true), costo = escCostoProp(x);
    const pfA = iA / disp, pfP = iP / disp;
    const hay = escLegs(x).length > 0;
    const sinA = escTnSinCob(x, false), sinP = escTnSinCob(x, true), sobre = escTnSobrecob(x, true) >= 1;
    if (!grupo) { tAct += iA; tProp += iP; tCosto += costo; tDisp += disp; tSinA += sinA; tSinP += sinP; }
    const cls = [x === escState.crop ? 'rs-hot' : '', grupo ? 'esc-grupo' : '', partes.has(x) ? 'esc-parte' : ''].join(' ');
    return `<tr class="esc-row ${cls}" onclick="escSetCrop('${x}')" title="Ver ${escLbl(x)}">
      <td class="rs-l">${grupo ? escLbl(x) : `<b>${escLbl(x)}</b>`}</td>
      <td>${escF(disp, 0)}</td><td>${escF(sinA, 0)}${hay ? ` → <b>${escF(sinP, 0)}</b>` : ''}</td>
      <td>${escPct(escCobBaja(x, false))}${hay ? ` → <b class="${sobre ? 'rs-neg' : ''}" title="${sobre ? 'Sobrecubierto' : ''}">${escPct(escCobBaja(x, true))}${sobre ? ' ⚠' : ''}</b>` : ''}</td>
      <td>${escF(pfA)}</td>
      <td>${hay ? `<b>${escF(pfP)}</b>` : '—'}</td>
      <td class="${hay ? escCls(pfP - pfA) : ''}">${hay ? escSig(pfP - pfA) : ''}</td>
      <td>${hay ? escUsd(costo) : '—'}</td>
      <td class="${hay ? escCls(iP - iA) : ''}">${hay ? escUsd(iP - iA) : ''}</td>
    </tr>`;
  }).join('');
  document.getElementById('esc-cons-sub').textContent = `escenario ${escSig(d * 100, 0)}% · u$s/tn salvo indicación · el total no suma dos veces el maíz`;
  document.getElementById('esc-cons').innerHTML = `<thead><tr>
      <th class="rs-l">Cultivo</th><th>Prod. disp. (tn)</th><th>Sin cob. a la baja (tn)</th><th>Cob. a la baja</th>
      <th>Precio final actual</th><th>Con cobertura</th><th>Diferencia</th><th>Costo primas</th><th>Resultado total</th>
    </tr></thead><tbody>${rows}
    <tr class="esc-tot"><td class="rs-l">Total</td><td>${escF(tDisp, 0)}</td><td>${escF(tSinA, 0)}${Math.abs(tSinP - tSinA) >= 1 ? ' → ' + escF(tSinP, 0) : ''}</td><td></td>
      <td colspan="2" class="esc-muted">Ingreso: ${escUsd(tAct)} → ${escUsd(tProp)}</td><td></td>
      <td>${escUsd(tCosto)}</td><td class="${escCls(tProp - tAct)}">${escUsd(tProp - tAct)}</td></tr></tbody>`;
}

function escRenderKpis(c, d) {
  const hay = escLegs(c).length > 0;
  const pfA = escPrecioFinal(c, d, false), pfP = escPrecioFinal(c, d, true);
  const cA = escPrecioFinal(c, -0.30, false), cP = escPrecioFinal(c, -0.30, true);
  const sinA = escTnSinCob(c, false), sinP = escTnSinCob(c, true), sobre = escTnSobrecob(c, true);
  const costo = escCostoProp(c);
  const kpi = (lbl, act, prop, nota) => `<div class="kpi-card esc-kpi">
    <div class="k-lbl">${lbl}</div>
    <div class="k-val"><span style="color:${ESC_COLOR_ACT}">${act}</span>${hay && prop != null ? ` → <span style="color:${ESC_COLOR_PROP}">${prop}</span>` : ''}</div>
    ${nota ? `<div class="esc-kpi-n">${nota}</div>` : ''}</div>`;
  document.getElementById('esc-kpis').innerHTML =
    kpi(`Precio final (${escSig(d * 100, 0)}%)`, escF(pfA), escF(pfP), hay ? `${escSig(pfP - pfA)} u$s/tn` : 'actual')
    + kpi('Si el mercado cae 30%', escF(cA), escF(cP), hay ? `${escSig(cP - cA)} u$s/tn` : '')
    + kpi('Cobertura a la baja', escPct(escCobBaja(c, false)), escPct(escCobBaja(c, true)),
          hay && sobre >= 1 ? `<span class="red-txt">⚠ sobrecubierto en ${escF(sobre, 0)} tn</span>`
                            : `sin cubrir: ${escF(sinA, 0)}${hay ? ' → ' + escF(sinP, 0) : ''} tn`)
    + kpi('Costo de la cobertura', hay ? escUsd(costo) : '—', null, hay ? `${escF(costo / escDisp(c), 2)} u$s/tn de producción` : 'sin propuesta');
}

// Líneas verticales: escenario elegido (gris) y cruces entre las dos curvas (dorado)
function escVertical(ch, v, color, txt, abajo) {
  const x = ch.scales.x;
  if (!(v > 0) || v < x.min || v > x.max) return;
  const px = x.getPixelForValue(v), { top, bottom } = ch.chartArea, ctx = ch.ctx;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bottom); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '600 11px Montserrat, sans-serif';
  const w = ctx.measureText(txt).width + 10, y = abajo ? bottom - 22 : top + 4;
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(px - w / 2, y, w, 18);
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, px, y + 9);
  ctx.restore();
}
const escLineasVerticales = {
  id: 'escLineas',
  afterDatasetsDraw(ch, args, opts) {
    if (!opts) return;
    (opts.cruces || []).forEach(v => escVertical(ch, v, ESC_COLOR_CRUCE, `Cruce u$s ${escF(v)}`, true));
    escVertical(ch, opts.escenario, 'rgba(28,33,24,0.6)', opts.label || '', false);
  }
};

function escRenderChart(c, d) {
  const canvas = document.getElementById('esc-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const p = escPos.cultivos[c], M = escMercado(c);
  const hay = escLegs(c).length > 0;
  const ej = escState.ejes[c] || {};

  // Eje X: automático ±40% del mercado de hoy, salvo que se cargue a mano
  const autoX = { xmin: Math.floor(M * (1 - ESC_RANGO) / 5) * 5, xmax: Math.ceil(M * (1 + ESC_RANGO) / 5) * 5 };
  let xMin = ej.xmin != null ? ej.xmin : autoX.xmin, xMax = ej.xmax != null ? ej.xmax : autoX.xmax;
  if (!(xMax > xMin)) { xMin = autoX.xmin; xMax = autoX.xmax; }

  const act = [], prop = [], mkt = [];
  const N = 160;
  for (let i = 0; i <= N; i++) {
    const x = xMin + (xMax - xMin) * i / N, dd = x / M - 1;
    mkt.push({ x, y: x });
    act.push({ x, y: escPrecioFinal(c, dd, false) });
    if (hay) prop.push({ x, y: escPrecioFinal(c, dd, true) });
  }
  const linea = (label, data, color, extra) => Object.assign({ label, data, borderColor: color, borderWidth: 2.5,
    pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: color, tension: 0 }, extra || {});
  const ds = [
    linea('Precio de mercado', mkt, '#b0afa8', { borderWidth: 2, borderDash: [6, 4] }),
    linea('Posición actual', act, ESC_COLOR_ACT)
  ];
  if (hay) ds.push(linea('Con cobertura propuesta', prop, ESC_COLOR_PROP, { borderWidth: 3 }));
  const refs = [];
  [['Precio Objetivo', p.objetivo, typeof REF_OBJ_COLOR !== 'undefined' ? REF_OBJ_COLOR : '#7c3aed'],
   ['Precio Dolor', p.dolor, typeof REF_DOL_COLOR !== 'undefined' ? REF_DOL_COLOR : '#c43030']].forEach(([n, v, col]) => {
    if (!(v > 0)) return;
    refs.push(v);
    ds.push(linea(`${n} (${escF(v)})`, [{ x: xMin, y: v }, { x: xMax, y: v }], col,
      { borderWidth: 1.6, borderDash: [10, 5], pointHoverRadius: 0, order: 20 }));
  });

  // Eje Y: automático para que entren las curvas, las referencias y la diagonal de mercado
  const ys = act.concat(prop).map(o => o.y).concat(refs);
  const autoY = { ymin: Math.floor(Math.min(...ys, xMin) / 10) * 10, ymax: Math.ceil(Math.max(...ys, xMax) / 10) * 10 };
  let yMin = ej.ymin != null ? ej.ymin : autoY.ymin, yMax = ej.ymax != null ? ej.ymax : autoY.ymax;
  if (!(yMax > yMin)) { yMin = autoY.ymin; yMax = autoY.ymax; }

  // Los campos de ejes muestran el valor en uso; en gris cuando es el automático
  const vals = { xmin: xMin, xmax: xMax, ymin: yMin, ymax: yMax };
  Object.keys(vals).forEach(k => {
    const el = document.getElementById('esc-eje-' + k);
    if (!el || el === document.activeElement) return;
    el.value = escF(vals[k], 0);
    el.classList.toggle('esc-auto', ej[k] == null);
  });

  const cruces = hay ? escCruces(c, xMin, xMax) : [];
  const txt = document.getElementById('esc-cruce-txt');
  if (txt) txt.innerHTML = cruces.map(k => `Las curvas se cruzan cuando el mercado está en <b>u$s ${escF(k.x)}</b> (${escSig((k.x / M - 1) * 100, 1)}% vs hoy): por debajo queda mejor ${k.abajo === 'cobertura' ? '<b style="color:' + ESC_COLOR_PROP + '">con la cobertura</b>' : '<b style="color:' + ESC_COLOR_ACT + '">la posición actual</b>'}, por arriba ${k.abajo === 'cobertura' ? 'la posición actual' : 'con la cobertura'}.`).join('<br>')
    || (hay ? 'Las curvas no se cruzan en el rango del gráfico.' : '');

  if (escChart) escChart.destroy();
  escChart = new Chart(canvas, {
    type: 'line',
    data: { datasets: ds },
    plugins: [escLineasVerticales],
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, parsing: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        escLineas: { escenario: M * (1 + d), label: `Escenario ${escSig(d * 100, 0)}%`, cruces: cruces.map(k => k.x) },
        tooltip: { callbacks: {
          title: it => it.length ? `Mercado a vencimiento: u$s ${escF(it[0].parsed.x)} (${escSig((it[0].parsed.x / M - 1) * 100, 0)}%)` : '',
          label: x => `${x.dataset.label}: u$s ${escF(x.parsed.y)}`
        } },
        legend: { labels: { font: { family: 'Montserrat', size: 12 }, usePointStyle: true, pointStyle: 'line' } }
      },
      scales: {
        x: { type: 'linear', min: xMin, max: xMax,
             title: { display: true, text: `Precio de mercado ${escLbl(c)} a vencimiento (u$s/tn)`, font: { family: 'Montserrat', size: 12, weight: '600' }, color: '#505845' },
             grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#7e8574', callback: v => escF(v, 0) } },
        y: { min: yMin, max: yMax,
             title: { display: true, text: 'Precio final de la posición (u$s/tn)', font: { family: 'Montserrat', size: 12, weight: '600' }, color: '#505845' },
             grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#7e8574' } }
      }
    }
  });
}

function escRenderTabla(c, d) {
  const p = escPos.cultivos[c], M = escMercado(c), disp = escDisp(c);
  const hay = escLegs(c).length > 0;
  const deltas = ESC_TABLA.slice();
  if (!deltas.some(x => Math.abs(x - d) < 1e-9)) deltas.push(d);
  deltas.sort((a, b) => a - b);
  const rows = deltas.map(dd => {
    const a = escPrecioFinal(c, dd, false), pr = escPrecioFinal(c, dd, true);
    const vsDol = p.dolor > 0 ? (hay ? pr : a) - p.dolor : null;
    return `<tr class="${Math.abs(dd - d) < 1e-9 ? 'rs-hot' : ''}">
      <td class="rs-l">${dd === 0 ? 'Sin cambios' : escSig(dd * 100, 0) + '%'}</td>
      <td>${escF(M * (1 + dd))}</td>
      <td>${escF(a)}</td>
      ${hay ? `<td><b>${escF(pr)}</b></td><td class="${escCls(pr - a)}">${escSig(pr - a)}</td><td class="${escCls(pr - a)}">${escUsd((pr - a) * disp)}</td>` : ''}
      <td class="${vsDol == null ? '' : escCls(vsDol)}">${vsDol == null ? '—' : escSig(vsDol)}</td>
    </tr>`;
  }).join('');
  document.getElementById('esc-tabla').innerHTML = `<thead><tr>
      <th class="rs-l">Mercado</th><th>Precio</th><th>Actual</th>
      ${hay ? '<th>Con cobertura</th><th>Dif. u$s/tn</th><th>Dif. total</th>' : ''}<th>${hay ? 'Con cobertura' : 'Actual'} vs Dolor</th>
    </tr></thead><tbody>${rows}</tbody>`;
}

// ═══════════════════════════════════════════════════
// NAVEGACIÓN (mismo patrón que Resumen y Line-Up)
// ═══════════════════════════════════════════════════
async function toggleEscenarios() {
  escMode = true;
  theoryMode = false; retMode = false; paseMode = false; asstMode = false; spreadMode = false; desvioMode = false;
  if (typeof lineupMode !== 'undefined') lineupMode = false;
  if (typeof resumenMode !== 'undefined') resumenMode = false;
  ['workspace', 'theory-space', 'ret-space', 'pase-space', 'spreads-space', 'desvio-space', 'lineup-space', 'resumen-space']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  ['tabs-container', 'mkt-bar', 'fob-bar'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  document.getElementById('esc-space').style.display = 'block';
  escMarcarPill();
  escRender();
  if (typeof refrescarBarras === 'function') refrescarBarras();
  if (!sheetData && escPos) {
    await escAsegurarA3();
    if (escMode) { escRefrescarPrimas(); escRender(); }
  }
}

function escMarcarPill() {
  document.querySelectorAll('.mod-pill').forEach(p => p.classList.toggle('active', p.id === 'pill-escenarios'));
}

// Al ir a cualquier otro módulo se oculta Escenarios
(function escEnvolverNavegacion() {
  ['switchToWorkspace', 'toggleTheory', 'toggleRetenciones', 'togglePases', 'toggleSpreads', 'toggleDesvio',
   'toggleLineUp', 'toggleResumen', 'switchTab'].forEach(fn => {
    const orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function () {
      escMode = false;
      const el = document.getElementById('esc-space');
      if (el) el.style.display = 'none';
      return orig.apply(this, arguments);
    };
  });
  const origRT = window.renderTabs;
  if (typeof origRT === 'function') window.renderTabs = function () {
    const r = origRT.apply(this, arguments);
    if (escMode) { const tc = document.getElementById('tabs-container'); if (tc) tc.style.display = 'none'; }
    return r;
  };
  const origRM = window.renderModules;
  if (typeof origRM === 'function') window.renderModules = function () {
    const r = origRM.apply(this, arguments);
    if (escMode) escMarcarPill();
    return r;
  };
  // Si se sincroniza A3 con Escenarios abierto, se actualizan primas y futuros
  const origFS = window.finishSync;
  if (typeof origFS === 'function') window.finishSync = function () {
    const r = origFS.apply(this, arguments);
    if (escMode) { escRefrescarPrimas(); escRender(); }
    return r;
  };
})();

escCargarGuardado();
