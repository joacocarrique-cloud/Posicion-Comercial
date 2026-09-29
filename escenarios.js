// ═══════════════════════════════════════════════════
// ─── ESCENARIOS: Posición comercial + coberturas ───
// Combina la posición del tablero "Posicion Comercial" (físico fijado, a fijar,
// saldo a vender y FyO abiertos) con coberturas nuevas armadas con primas de A3,
// y muestra qué precio final le queda a la posición en cada escenario de precios.
//
// Precio final (u$s/tn de producción disponible) a un movimiento d del mercado:
//   [ fijadas × precio físico fijado
//   + (a fijar + total a vender) × mercado × (1 + d)
//   + resultado a vencimiento de los FyO abiertos (futuro de su posición × (1 + d);
//     los de otra plaza, como Kansas, a MATBA × (1 + d) + un basis fijo en u$s/tn)
//   + resultado de las coberturas propuestas ] / producción disponible
// A diferencia del "Precio Final" del Excel, acá los futuros no suman toneladas
// (cubren el saldo) y las opciones sí mueven el precio según el escenario.
//
// Maíz se trabaja separado en temprano (posición ABR) y tardío (posición JUL);
// "Maíz total" es la suma de los dos, con las coberturas de cada uno.
//
// Cada cultivo puede tener varias estrategias (puts, put sintético, collar…) para
// compararlas; la marcada como elegida (★) es la que va al consolidado y a Maíz total.
// ═══════════════════════════════════════════════════

let escMode = false;
let escPos = null;          // posición importada del tablero (subconjunto compacto)
let escChart = null;
let escChartDif = null;
let escPosVieja = false;    // había una posición guardada con un formato anterior
// estr[c] = [{ id, nombre, color, legs }] · elegida[c] / editando[c] = id de estrategia
// legs: formato anterior (una sola cobertura por cultivo), se migra a estr al cargar
let escState = { delta: 0, crop: 'trigo', otm: 3, presetCrops: ['trigo', 'maiz_temp', 'maiz_tard', 'soja'],
                 legs: {}, estr: {}, elegida: {}, editando: {}, detalle: false,
                 excl: {}, basis: {}, mercado: {}, ejes: {}, seq: 1 };

const ESC_POS_KEY = 'espartina_esc_posicion_v1';
const ESC_STATE_KEY = 'espartina_esc_estado_v1';
const ESC_POS_VERSION = 2;
// col = nombre de la columna del tablero · a3 = cultivo en A3 · mes = posición por defecto para cubrir
const ESC_CULTIVOS = {
  trigo:     { lbl: 'Trigo',         col: 'TRIGO',       a3: 'trigo' },
  maiz_temp: { lbl: 'Maíz temprano', col: 'MAIZ TEMP.',  a3: 'maiz', mes: 'ABR' },
  maiz_tard: { lbl: 'Maíz tardío',   col: 'MAIZ TARDIO', a3: 'maiz', mes: 'JUL' },
  maiz:      { lbl: 'Maíz total',    col: 'MAIZ TOTAL',  a3: 'maiz', partes: ['maiz_temp', 'maiz_tard'] },
  soja:      { lbl: 'Soja',          col: 'SOJA',        a3: 'soja' }
};
// Girasol no entra: no tiene futuros ni opciones, solo se cubre vendiendo forwards
const ESC_ORDEN = ['trigo', 'maiz_temp', 'maiz_tard', 'maiz', 'soja'];
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
// Colores de estrategia: la paleta de Coberturas sin el azul de "Posición actual"
const ESC_COLORES = (typeof COLORS !== 'undefined' ? COLORS : ['#1A6B3C', '#d97706', '#0891b2', '#be185d', '#65a30d'])
  .filter(x => x !== ESC_COLOR_ACT);
// Áreas entre la posición actual y la estrategia elegida
const ESC_FILL_GANA = 'rgba(26,107,60,0.13)';     // la estrategia queda mejor
const ESC_FILL_PIERDE = 'rgba(37,99,235,0.13)';   // no hacer nada queda mejor
// Plantillas: [nombre, preset de globals.js]; sin preset = venta de futuro
const ESC_PLANTILLAS = [
  ['Put seco', 'Put Seco'], ['Put sintético (futuro + call)', 'Futuro + Call'], ['Put spread', 'Put Spread'],
  ['Piso eficiente', 'Piso Eficiente'], ['Collar', 'Collar'], ['Gaviota', 'Gaviota'],
  ['Venta de futuro', null], ['Lanzamiento cubierto', 'Lanzamiento Cubierto']
];

// ─── Helpers ───
function escF(n, d = 1) {
  if (n == null || !isFinite(n)) return '—';
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function escSig(n, d = 1) { return (n > 0.0001 ? '+' : n < -0.0001 ? '−' : '') + escF(Math.abs(n), d); }
function escUsd(n) { return (n < 0 ? '−' : '') + 'u$s ' + escF(Math.abs(n), 0); }
// Con signo y abreviado: +u$s 350 mil · −u$s 1,25 M
function escUsdM(v) { return (v < 0 ? '−' : '+') + 'u$s ' + (Math.abs(v) >= 1e6 ? escF(Math.abs(v) / 1e6, 2) + ' M' : escF(Math.abs(v) / 1e3, 0) + ' mil'); }
function escPct(v) { return escF(v * 100, 0) + '%'; }
function escCls(v) { return v > 0.05 ? 'rs-pos' : v < -0.05 ? 'rs-neg' : ''; }
function escNorm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim(); }
// miles: el punto separa miles aunque no haya coma ("5.000" tn = 5000). Solo para toneladas:
// en primas y precios "4.125" sigue siendo decimal.
function escNum(v, miles) {
  const s0 = String(v == null ? '' : v).trim();
  const conMiles = miles && /^-?\d{1,3}(\.\d{3})+$/.test(s0);
  const s = s0.includes(',') || conMiles ? s0.replace(/\./g, '').replace(',', '.') : s0;
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
  ['legs', 'estr', 'elegida', 'editando', 'ejes', 'basis'].forEach(k => { escState[k] = escState[k] || {}; });
  delete escState.fut0;   // antes se cargaba el futuro de hoy de otra plaza; ahora es MATBA + basis
  escMigrarMaiz();
}
function escGuardar() {
  try { localStorage.setItem(ESC_STATE_KEY, JSON.stringify(escState)); } catch (e) {}
  if (typeof showSaveIndicator === 'function') showSaveIndicator();
}

// Coberturas guardadas cuando maíz era un solo cultivo: se reparten por mes de posición
// (Queda en escState.legs.maiz hasta que se cargue un tablero con maíz separado.)
function escMigrarMaiz() {
  if (escPos && escEsGrupo('maiz')) {
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
  escMigrarEstrategias();
}

// Formato anterior (una lista de patas por cultivo): pasa a ser la estrategia "Propuesta", elegida
function escMigrarEstrategias() {
  Object.keys(escState.legs).forEach(c => {
    if (c === 'maiz') return;
    const legs = escState.legs[c] || [];
    if (legs.length) {
      const e = escNuevaEstr(c, 'Propuesta', legs);
      if (legs.some(l => l.preset)) e.atajo = true;
      if (!escEstr(c, escState.elegida[c])) escState.elegida[c] = e.id;
    }
    delete escState.legs[c];
  });
}

// ─── Estrategias de un cultivo base ───
function escEstrs(c) { return escState.estr[c] || (escState.estr[c] = []); }
function escEstr(c, id) { return (escState.estr[c] || []).find(e => e.id === id) || null; }
function escElegida(c) { return escEstr(c, escState.elegida[c]) || (escState.estr[c] || [])[0] || null; }
function escEditando(c) { return escEstr(c, escState.editando[c]) || escElegida(c); }
function escNuevaEstr(c, nombre, legs) {
  const lista = escEstrs(c);
  const usados = lista.map(e => e.color);
  const color = ESC_COLORES.find(x => !usados.includes(x)) || ESC_COLORES[lista.length % ESC_COLORES.length];
  let nom = nombre, k = 2;
  while (lista.some(e => e.nombre === nom)) nom = `${nombre} ${k++}`;
  const e = { id: escState.seq++, nombre: nom, color, legs: legs || [] };
  lista.push(e);
  return e;
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
  if (!Object.keys(cultivos).length) throw new Error('No encontré Trigo, Maíz ni Soja en el tablero.');
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

// Toma el texto del tablero (archivo elegido o vinculado) y lo deja como posición activa
function escAplicarTexto(texto, file) {
  escPos = escCompactar(escExtraerDatos(texto));
  escPos.archivoNombre = file.name;
  escPos.archivoMod = file.lastModified;
  escPosVieja = false;
  try { localStorage.setItem(ESC_POS_KEY, JSON.stringify(escPos)); } catch (e) {}
  escMigrarMaiz();
  if (!escCrops().includes(escState.crop)) escState.crop = escCrops()[0];
  escGuardar();
}

function escElegirArchivo() { document.getElementById('esc-file').click(); }

function escImportar(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  file.text().then(t => { escAplicarTexto(t, file); escRender(); })
    .catch(e => alert('No pude leer la posición: ' + e.message));
}

// ─── Vínculo con el archivo del tablero (Chrome / Edge) ───
// Se elige una vez "Posicion Comercial 26-27.html" y el navegador guarda el acceso al archivo
// (en IndexedDB, solo en esta PC). Al abrir el módulo o volver a la pestaña se relee si cambió.
// Nada se sube a ningún lado: se lee el mismo archivo de OneDrive que regenera el .bat.
const ESC_IDB = 'espartina_escenarios', ESC_IDB_STORE = 'handles';
let escVinculo = null;   // { handle, nombre, estado: 'ok' | 'permiso' | 'error', msg, leido }

function escVinculoSoportado() { return typeof window.showOpenFilePicker === 'function'; }

function escIdb(modo, fn) {
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('Sin IndexedDB'));
    const rq = indexedDB.open(ESC_IDB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(ESC_IDB_STORE);
    rq.onerror = () => rej(rq.error);
    rq.onsuccess = () => {
      const tx = rq.result.transaction(ESC_IDB_STORE, modo);
      const r = fn(tx.objectStore(ESC_IDB_STORE));
      tx.oncomplete = () => res(r ? r.result : undefined);
      tx.onerror = () => rej(tx.error);
    };
  });
}

async function escVincular() {
  if (!escVinculoSoportado()) { escElegirArchivo(); return; }
  let h;
  try {
    [h] = await window.showOpenFilePicker({ types: [{ description: 'Tablero de posición comercial',
      accept: { 'text/html': ['.html', '.htm'], 'application/json': ['.json'] } }] });
  } catch (e) { return; }   // canceló el diálogo
  try { await escIdb('readwrite', s => s.put(h, 'tablero')); } catch (e) {}
  escVinculo = { handle: h, nombre: h.name };
  await escLeerVinculado(true, true);
}

async function escDesvincular() {
  if (!confirm('¿Desvincular el tablero? La posición cargada queda, pero ya no se actualiza sola.')) return;
  try { await escIdb('readwrite', s => s.delete('tablero')); } catch (e) {}
  escVinculo = null;
  escRender();
}

// interactivo: puede pedir el permiso de lectura (el navegador lo exige desde un clic).
// forzar: relee aunque el archivo no haya cambiado.
async function escLeerVinculado(interactivo, forzar) {
  if (!escVinculoSoportado()) return;
  if (!escVinculo) {
    let h = null;
    try { h = await escIdb('readonly', s => s.get('tablero')); } catch (e) {}
    if (!h) return;
    escVinculo = { handle: h, nombre: h.name };
  }
  const antes = escVinculo.estado;
  try {
    const h = escVinculo.handle;
    let perm = await h.queryPermission({ mode: 'read' });
    if (perm !== 'granted' && interactivo) perm = await h.requestPermission({ mode: 'read' });
    if (perm !== 'granted') {
      escVinculo.estado = 'permiso';
    } else {
      const file = await h.getFile();
      escVinculo.estado = 'ok';
      escVinculo.leido = new Date();
      if (forzar || !escPos || escPos.archivoMod !== file.lastModified) {
        escAplicarTexto(await file.text(), file);
        escVinculo.cambio = true;
      }
    }
  } catch (e) {
    escVinculo.estado = 'error';
    escVinculo.msg = e.name === 'NotFoundError' ? 'no encuentro el archivo (¿se movió o renombró?)' : e.message;
  }
  if (escMode && (escVinculo.cambio || escVinculo.estado !== antes)) escRender();
  escVinculo.cambio = false;
}

// Botones y leyenda del vínculo para el encabezado del módulo
function escHtmlVinculo() {
  if (!escVinculoSoportado()) return {
    botones: `<button class="btn btn-outline btn-sm" onclick="escElegirArchivo()" title="Elegí el archivo Posicion Comercial 26-27.html">📂 Actualizar posición</button>`,
    meta: ' · este navegador no permite vincular el archivo (usá Chrome o Edge)'
  };
  const v = escVinculo;
  if (!v) return {
    botones: `<button class="btn btn-sm" onclick="escVincular()" title="Elegí una vez Posicion Comercial 26-27.html y se actualiza solo">🔗 Vincular tablero</button>
      <button class="btn btn-outline btn-sm" onclick="escElegirArchivo()">📂 Cargar una vez</button>`,
    meta: ' · sin vincular: cargada a mano'
  };
  const nom = escHtml(v.nombre);
  if (v.estado === 'permiso') return {
    botones: `<button class="btn btn-sm" onclick="escLeerVinculado(true)" title="El navegador pide confirmar el acceso al archivo">🔗 Reconectar ${nom}</button>`,
    meta: ` · vinculado a ${nom}: hace falta un clic para volver a leerlo`
  };
  if (v.estado === 'error') return {
    botones: `<button class="btn btn-sm" onclick="escVincular()">🔗 Volver a vincular</button>`,
    meta: ` · <span class="red-txt">vínculo con ${nom}: ${escHtml(v.msg || 'error')}</span>`
  };
  return {
    botones: `<button class="btn btn-outline btn-sm" onclick="escLeerVinculado(true, true)" title="Relee el archivo ahora">🔄 Releer</button>
      <button class="btn btn-outline btn-sm" onclick="escVincular()" title="Vincular otro archivo">🔗 Cambiar</button>
      <button class="btn btn-outline btn-sm" onclick="escDesvincular()">Desvincular</button>`,
    meta: ` · 🔗 vinculado a ${nom}, se relee solo al abrir el módulo`
  };
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
// ─── Otras plazas (Kansas, Chicago): basis fijo contra MATBA ───
// Otra plaza = MATBA de la misma posición + basis (u$s/tn), hoy y en cada escenario: se mueve
// los mismos u$s que MATBA, no el mismo %. El basis se edita por plaza; Kansas arranca en +30.
const ESC_BASIS_DEF = { KAN: 30 };
function escOtraPlaza(l) { return !!l.plaza && l.plaza !== 'ROS'; }
function escBasis(l) {
  const v = escState.basis[l.plaza];
  if (v != null) return v;
  return ESC_BASIS_DEF[l.plaza] != null ? ESC_BASIS_DEF[l.plaza] : null;
}
// Futuro MATBA de hoy para la posición de la pata (sin A3: precio de mercado del tablero)
function escFutRos(c, l) { return escFutA3(c, l.pos) || escMercado(c); }
function escF0(c, l) {
  if (!escOtraPlaza(l)) return escFutRos(c, l);
  const b = escBasis(l);
  return b == null ? null : escFutRos(c, l) + b;
}

// Un FyO abierto entra al cálculo salvo que se lo excluya. Los de otra plaza solo
// entran si tienen basis (Kansas lo trae por defecto; Chicago hay que cargarlo).
function escFyoIncluido(l) {
  if (escState.excl[l.ins]) return false;
  if (escOtraPlaza(l)) return escBasis(l) != null;
  return true;
}
function escFyo(c) { const b = escBase(c); return escPos.fyo.filter(l => b.includes(l.crop)); }
// Patas de una estrategia. est: false = ninguna (posición actual) · true / omitido = la elegida ·
// número = esa estrategia. En un grupo es la lista (de solo lectura) de las elegidas de sus partes.
function escLegs(c, est = true) {
  if (!est) return [];
  if (escPos && escEsGrupo(c)) return escBase(c).reduce((a, b) => {
    const e = escElegida(b);
    return a.concat(escLegs(b).map(l => Object.assign({ parte: b, estr: e ? e.nombre : '' }, l)));
  }, []);
  const e = est === true ? escElegida(c) : escEstr(c, est);
  return e ? e.legs : [];
}
// Patas de la estrategia en edición; si el cultivo no tiene ninguna, se crea
function escLegsEdit(c) {
  let e = escEditando(c);
  if (!e) { e = escNuevaEstr(c, 'Estrategia'); escState.elegida[c] = e.id; }
  escState.editando[c] = e.id;
  return e.legs;
}

// Resultado a vencimiento de una pata (u$s totales) con el mercado movido d
function escValorPata(c, l, d) {
  const F0 = escF0(c, l);
  if (!(F0 > 0) || !(l.tn > 0)) return 0;
  // Otra plaza: MATBA del escenario + basis fijo
  const F = escOtraPlaza(l) ? escFutRos(c, l) * (1 + d) + escBasis(l) : F0 * (1 + d);
  if (l.tipo === 'futuro') return (l.dir === 'sell' ? 1 : -1) * l.tn * ((l.strike || F0) - F);
  const intr = l.tipo === 'put' ? Math.max(l.strike - F, 0) : Math.max(F - l.strike, 0);
  return (l.dir === 'buy' ? 1 : -1) * l.tn * (intr - (l.prima || 0));
}

// est: igual que en escLegs (false = posición actual, true = elegida, número = esa estrategia)
function escIngreso(c, d, est) {
  if (escEsGrupo(c)) return escSum(c, b => escIngreso(b, d, est));
  const p = escPos.cultivos[c];
  const M = escMercado(c) * (1 + d);
  let usd = (p.fij || 0) * (p.ppvFis || 0) + ((p.afijar || 0) + (p.tav || 0)) * M;
  escFyo(c).filter(escFyoIncluido).forEach(l => { usd += escValorPata(c, l, d); });
  escLegs(c, est).forEach(l => { usd += escValorPata(c, l, d); });
  return usd;
}
function escPrecioFinal(c, d, est) { return escIngreso(c, d, est) / escDisp(c); }
// Diferencia en u$s totales entre una estrategia y la posición actual, con el mercado en x
function escDifUsd(c, x, est) {
  const d = x / escMercado(c) - 1;
  return escIngreso(c, d, est) - escIngreso(c, d, false);
}

// Tn cubiertas a la baja con el criterio del tablero: fijadas + futuros vendidos + puts netos
function escTnCubiertas(c, est) {
  let tn = escPos.cultivos[c].fij || 0;
  const suma = l => {
    const s = l.dir === 'sell' ? 1 : -1;
    if (l.tipo === 'futuro') tn += s * l.tn;
    else if (l.tipo === 'put') tn -= s * l.tn;
  };
  escFyo(c).filter(escFyoIncluido).forEach(suma);
  escLegs(c, est).forEach(suma);
  return tn;
}
// Saldo sin cobertura a la baja: a fijar + total a vender − futuros vendidos − puts netos.
// Las tn a fijar no tienen precio, así que cuentan como descubiertas.
function escTnSinCob(c, est) {
  return escSum(c, b => Math.max(0, escPos.cultivos[b].disp - escTnCubiertas(b, est)));
}
// Toneladas cubiertas de más: a partir de acá el precio final sube si el mercado baja
function escTnSobrecob(c, est) {
  return escSum(c, b => Math.max(0, escTnCubiertas(b, est) - escPos.cultivos[b].disp));
}
function escCobBaja(c, est) {
  const disp = escDisp(c);
  return Math.max(0, disp - escTnSinCob(c, est) + escTnSobrecob(c, est)) / disp;
}

// Toneladas por instrumento (FyO incluidos + la estrategia est):
//   vendidas = fijadas (forwards) + futuros vendidos netos · puts / calls = comprados − vendidos
//   % a la baja = criterio del tablero (escCobBaja)
//   % a la suba = participación: tn que acompañan una suba = producción − vendidas + calls netos
function escResumenTn(c, est) {
  const r = { disp: escDisp(c), fij: 0, fut: 0, puts: 0, calls: 0 };
  escBase(c).forEach(b => {
    r.fij += escPos.cultivos[b].fij || 0;
    const suma = l => {
      const s = l.dir === 'sell' ? 1 : -1;
      if (l.tipo === 'futuro') r.fut += s * l.tn;
      else if (l.tipo === 'put') r.puts -= s * l.tn;
      else r.calls -= s * l.tn;
    };
    escFyo(b).filter(escFyoIncluido).forEach(suma);
    escLegs(b, escEsGrupo(c) ? est && true : est).forEach(suma);
  });
  r.vendidas = r.fij + r.fut;
  r.tnSuba = Math.max(0, r.disp - r.vendidas + r.calls);
  r.pctSuba = r.tnSuba / r.disp;
  r.pctBaja = escCobBaja(c, est);
  r.sobrecob = escTnSobrecob(c, est);
  return r;
}

// Prima neta de una estrategia (u$s; positivo = se paga)
function escCostoProp(c, est = true) {
  return escLegs(c, est).reduce((s, l) => l.tipo === 'futuro' ? s : s + (l.dir === 'buy' ? 1 : -1) * (l.prima || 0) * (l.tn || 0), 0);
}

// Balance de una estrategia contra la posición actual, en u$s totales, dentro de ±ESC_RANGO del
// mercado de hoy. Se calcula numéricamente, así sirve para cualquier combinación de patas.
//   baja / suba: diferencia a −30% / +30% · pendBaja / pendSuba: u$s por cada u$s que se mueve el
//   mercado en el extremo (≈0 = la diferencia quedó fija) · peor: la peor diferencia y desde dónde
function escBalance(c, est) {
  const M = escMercado(c), xMin = M * (1 - ESC_RANGO), xMax = M * (1 + ESC_RANGO);
  const f = x => escDifUsd(c, x, est);
  const N = 240;
  let peor = Infinity, xPeor = M;
  for (let i = 0; i <= N; i++) {
    const x = xMin + (xMax - xMin) * i / N, v = f(x);
    if (v < peor - 1e-6) { peor = v; xPeor = x; }
  }
  const h = M * 0.02;
  const pendBaja = (f(xMin) - f(xMin + h)) / h;     // + = gana más cuanto más baja
  const pendSuba = (f(xMax) - f(xMax - h)) / h;     // − = pierde más cuanto más sube
  // Si la diferencia arriba quedó fija, desde qué precio (primer x donde ya vale lo mismo que el extremo)
  let fijaDesde = null;
  if (Math.abs(pendSuba) < 1) {
    const vFin = f(xMax), tol = Math.max(1, Math.abs(vFin) * 0.0002);
    const ok = x => Math.abs(f(x) - vFin) <= tol;
    for (let i = 0; i <= N; i++) {
      const x = M + (xMax - M) * i / N;
      if (!ok(x)) continue;
      // se afina entre el punto anterior de la grilla y este
      let a = i ? M + (xMax - M) * (i - 1) / N : x, z = x;
      for (let k = 0; k < 30 && z - a > 1e-3; k++) { const m = (a + z) / 2; if (ok(m)) z = m; else a = m; }
      fijaDesde = z;
      break;
    }
  }
  return { M, cruces: escCruces(c, xMin, xMax, est), baja: f(M * 0.7), suba: f(M * 1.3),
           pendBaja, pendSuba, peor, xPeor, fijaDesde, finSuba: f(xMax) };
}

// Precios de mercado donde se cruzan "posición actual" y la estrategia dentro de [xMin, xMax]
function escCruces(c, xMin, xMax, est = true) {
  const M = escMercado(c);
  const f = x => escPrecioFinal(c, x / M - 1, est) - escPrecioFinal(c, x / M - 1, false);
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
  Object.keys(escState.estr).filter(c => ESC_CULTIVOS[c]).forEach(c => escEstrs(c).forEach(e => e.legs.forEach(l => {
    if (l.tipo === 'futuro' || !l.auto) return;
    const p = escPrimaA3(c, l.pos, l.tipo, l.strike);
    if (p != null) l.prima = p;
  })));
}

// Patas de una plantilla (PRESETS de globals.js) sobre el futuro de la posición por defecto.
// Los strikes se ajustan a la cadena de A3 sin repetir strike entre patas del mismo tipo
// (misma lógica que buildPresetLegs de Coberturas) y las primas salen de A3.
function escPatasPlantilla(c, presetNombre) {
  const pos = escPosDefault(c);
  const F0 = escFutA3(c, pos) || escMercado(c);
  const preset = presetNombre && typeof PRESETS !== 'undefined' ? PRESETS.find(p => p.name === presetNombre) : null;
  const crudas = preset ? preset.legs(F0) : [{ dir: 'sell', type: 'futuro', ratio: 1, strike: F0 }];
  const saldo = escTnSinCob(c, false);
  const base = saldo >= 1 ? saldo : escTnDefault(c);
  const legs = crudas.map(l => ({ id: escState.seq++, dir: l.dir, tipo: l.type, pos, strike: l.strike,
    tn: Math.round(base * (l.ratio || 1)), prima: 0, auto: true }));
  ['put', 'call'].forEach(tp => {
    const g = escCadena(c, pos, tp).map(o => o.strike).sort((a, b) => a - b);
    const mismas = legs.filter(l => l.tipo === tp).sort((a, b) => b.strike - a.strike);
    if (!g.length) { mismas.forEach(l => { l.strike = Math.round(l.strike); }); return; }
    const usados = new Set();
    mismas.forEach(l => {
      let i = g.reduce((bi, v, k) => Math.abs(v - l.strike) < Math.abs(g[bi] - l.strike) ? k : bi, 0);
      while (usados.has(i) && i > 0) i--;
      while (usados.has(i) && i < g.length - 1) i++;
      usados.add(i);
      l.strike = g[i];
    });
  });
  legs.forEach(l => {
    if (l.tipo === 'futuro') l.strike = Math.round(F0 * 10) / 10;
    else l.prima = escPrimaA3(c, pos, l.tipo, l.strike) || 0;
  });
  return legs;
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

// Put X% abajo del futuro en cada cultivo marcado, por el saldo sin cobertura a la baja de la
// posición actual (lo que no tapan fijaciones, futuros vendidos ni puts). Crea o reemplaza la
// estrategia "Puts X%" de cada cultivo y la deja elegida; las demás estrategias no se tocan.
async function escProponerPuts() {
  await escAsegurarA3();
  const otm = escNum(document.getElementById('esc-otm').value);
  escState.otm = otm != null ? otm : 3;
  const sinPrima = [];
  escState.presetCrops.filter(c => escBaseCrops().includes(c)).forEach(c => {
    const pos = escPosDefault(c);
    const F0 = escFutA3(c, pos) || escMercado(c);
    const strike = escStrikeCercano(c, pos, 'put', F0 * (1 - escState.otm / 100));
    const prima = escPrimaA3(c, pos, 'put', strike);
    const tn = escTnSinCob(c, false);
    if (!(tn >= 1)) return;
    if (prima == null) sinPrima.push(escLbl(c));
    let e = escEstrs(c).find(x => x.atajo);
    if (!e) { e = escNuevaEstr(c, 'Puts'); e.atajo = true; }
    e.nombre = `Puts ${escF(escState.otm, 0)}%`;
    e.legs = [{ id: escState.seq++, dir: 'buy', tipo: 'put', pos, strike, prima: prima || 0, tn: Math.round(tn), auto: true }];
    escState.elegida[c] = escState.editando[c] = e.id;
  });
  escGuardar();
  escRender();
  if (sinPrima.length) alert(`Sin prima de A3 para: ${sinPrima.join(', ')}. Cargala a mano en la pata (quedó en 0).`);
}

// ─── Estrategias: crear desde plantilla, elegir, renombrar, borrar ───
async function escNuevaEstrategia(v) {
  const c = escState.crop;
  if (!v || escEsGrupo(c)) return;
  let e;
  if (v === 'blanco') e = escNuevaEstr(c, 'Estrategia');
  else if (v === 'dup') {
    const o = escEditando(c);
    if (!o) return;
    e = escNuevaEstr(c, o.nombre, o.legs.map(l => Object.assign({}, l, { id: escState.seq++ })));
  } else {
    const pl = ESC_PLANTILLAS[+v];
    if (!pl) return;
    await escAsegurarA3();
    e = escNuevaEstr(c, pl[0], escPatasPlantilla(c, pl[1]));
  }
  escState.editando[c] = e.id;
  if (!escEstr(c, escState.elegida[c])) escState.elegida[c] = e.id;
  escGuardar();
  escRender();
}
function escEditarEstr(id) { escState.editando[escState.crop] = id; escGuardar(); escRender(); }
function escElegir(id) { const c = escState.crop; escState.elegida[c] = escState.editando[c] = id; escGuardar(); escRender(); }
function escRenombrarEstr(id) {
  const e = escEstr(escState.crop, id);
  const n = e && prompt('Nombre de la estrategia', e.nombre);
  if (!n || !n.trim()) return;
  e.nombre = n.trim();
  escGuardar();
  escRender();
}
function escBorrarEstr(id) {
  const c = escState.crop, e = escEstr(c, id);
  if (!e || (e.legs.length && !confirm(`¿Borrar la estrategia "${e.nombre}"?`))) return;
  escState.estr[c] = escEstrs(c).filter(x => x.id !== id);
  if (escState.elegida[c] === id) escState.elegida[c] = (escEstrs(c)[0] || {}).id;
  if (escState.editando[c] === id) escState.editando[c] = escState.elegida[c];
  escGuardar();
  escRender();
}

function escTogglePresetCrop(c, on) {
  escState.presetCrops = escState.presetCrops.filter(x => x !== c);
  if (on) escState.presetCrops.push(c);
  escGuardar();
}

// soloCultivo: vacía las patas de la estrategia en edición · si no, borra todas las estrategias
function escLimpiar(soloCultivo) {
  if (soloCultivo) { const e = escEditando(escState.crop); if (e) e.legs = []; }
  else if (confirm('¿Borrar todas las estrategias de todos los cultivos?')) { escState.estr = {}; escState.elegida = {}; escState.editando = {}; }
  else return;
  escGuardar();
  escRender();
}

// Tn por defecto de una pata nueva: el saldo sin cobertura a la baja con la estrategia en edición.
// Si ya está todo cubierto (p.ej. se agrega un call vendido para financiar los puts), las tn de
// la última pata o, sin patas, las tn sin precio. Nunca 0: una pata en 0 tn no mueve nada.
function escTnDefault(c, sin) {
  const e = escEditando(c);
  const saldo = escTnSinCob(c, e ? e.id : false);
  if (saldo >= 1) return Math.round(saldo);
  const otras = (e ? e.legs : []).filter(l => l !== sin && l.tn > 0);
  if (otras.length) return otras[otras.length - 1].tn;
  const p = escPos.cultivos[c];
  return Math.round((p.afijar || 0) + (p.tav || 0)) || Math.round(p.disp || 0);
}

function escAgregarPata() {
  const c = escState.crop;
  if (escEsGrupo(c)) return;
  const pos = escPosDefault(c);
  const F0 = escFutA3(c, pos) || escMercado(c);
  const strike = escStrikeCercano(c, pos, 'put', F0 * 0.97);
  const tn = escTnDefault(c);
  escLegsEdit(c).push({ id: escState.seq++, dir: 'buy', tipo: 'put', pos, strike,
    prima: escPrimaA3(c, pos, 'put', strike) || 0, tn, auto: true });
  escGuardar();
  escRender();
}

function escBorrarPata(id) {
  const legs = escLegsEdit(escState.crop);
  const i = legs.findIndex(l => l.id === id);
  if (i >= 0) legs.splice(i, 1);
  escGuardar();
  escRender();
}

function escEditarPata(id, campo, valor) {
  const c = escState.crop;
  const l = escLegsEdit(c).find(x => x.id === id);
  if (!l) return;
  delete l.preset;   // una pata tocada a mano ya no la reemplaza el atajo
  if (campo === 'prima') {
    const v = escNum(valor);
    if (v == null) { l.auto = true; l.prima = escPrimaA3(c, l.pos, l.tipo, l.strike) || 0; }
    else { l.auto = false; l.prima = v; }
  } else if (campo === 'tn' || campo === 'strike') {
    const v = escNum(valor, campo === 'tn');
    l[campo] = v != null ? v : 0;
  } else {
    l[campo] = valor;
  }
  // Una pata en 0 tn (p.ej. agregada con todo ya cubierto) toma tn al cambiarle operación o instrumento
  if ((campo === 'dir' || campo === 'tipo') && !(l.tn > 0)) l.tn = escTnDefault(c, l);
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
// Basis de una plaza (vale para todos sus FyO); vacío vuelve al de defecto
function escSetBasis(plaza, v) { const n = escNum(v); if (n != null) escState.basis[plaza] = n; else delete escState.basis[plaza]; escGuardar(); escRender(); }
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
  if (!escCrops().includes(escState.crop)) escState.crop = escCrops()[0];

  const m = escPos.meta || {};
  const vin = escHtmlVinculo();
  const dPct = Math.round(escState.delta * 100);
  const ejeIn = (k, tit) => `<input id="esc-eje-${k}" class="esc-in esc-in-m" type="text" inputmode="decimal" title="${tit}. Vacío = automático." onchange="escSetEje('${k}', this.value)">`;

  body.innerHTML = `
    <div class="rs-head">
      <div>
        <div class="rs-title">🎯 Escenarios de posición</div>
        <div class="rs-subt">Posición comercial + coberturas propuestas: qué precio final le queda a cada cultivo según hacia dónde vaya el mercado.</div>
      </div>
      <div class="rs-actions">
        <button class="btn btn-sm" id="esc-btn-pdf" onclick="escPdf()" title="Informe en PDF para compartir (por cultivo: gráfico, estrategia elegida y escenarios; consolidado al final)">📄 PDF para compartir</button>
        ${vin.botones}
      </div>
    </div>
    <div class="rs-meta">Posición: ${escHtml(m.archivo || 'tablero')} · Excel modificado ${escHtml(m.modificado || '—')} · generado ${escHtml(m.generado || '—')}${vin.meta}${sheetData ? ` · A3 ${escHtml(sheetData.fechaDatos || '')}` : ' · sin datos A3 (strikes y primas a mano)'}</div>

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
          <button class="btn btn-outline btn-sm" onclick="escLimpiar(false)">Borrar estrategias</button>
        </div>
      </div>
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
          <div class="esc-dif-tit">Diferencia vs no hacer nada <span class="esc-muted">u$s totales · estrategia − posición actual, al mismo precio de mercado</span></div>
          <div class="esc-dif-wrap"><canvas id="esc-chart-dif"></canvas></div>
        </div>
        <div id="esc-balance"></div>
        <div class="rs-card">
          <h3>Comparar estrategias <span class="esc-h3-sub" id="esc-comp-sub"></span></h3>
          <div class="rs-tw"><table class="rs-table esc-comp" id="esc-comp"></table></div>
        </div>
        <div class="rs-card">
          <h3>Precio final por escenario <span class="esc-h3-sub">con la estrategia elegida</span></h3>
          <div class="rs-tw"><table class="rs-table" id="esc-tabla"></table></div>
        </div>
      </div>
    </div>

    <div class="rs-card">
      <h3>Consolidado <span class="esc-h3-sub" id="esc-cons-sub"></span></h3>
      <div class="rs-tw"><table class="rs-table" id="esc-cons"></table></div>
    </div>`;
  escRenderResultados();
}

function escHtmlVacio() {
  return `<div class="rs-card esc-vacio">
    <div class="rs-title">🎯 Escenarios de posición</div>
    ${escPosVieja ? '<p class="esc-aviso">El módulo cambió (ahora separa maíz temprano y tardío): volvé a cargar el tablero. Las coberturas que tenías cargadas se conservan.</p>' : ''}
    <p>Para simular coberturas sobre la posición real, cargá el tablero <b>Posicion Comercial 26-27.html</b>, el mismo archivo que abrís para ver la posición.</p>
    <p class="esc-nota">La suite lee los datos que ya trae ese archivo (producción, fijado, a fijar, saldo a vender y FyO abiertos). Quedan solo en este navegador; no se suben a ningún lado.${escVinculoSoportado() ? ' Si lo <b>vinculás</b>, se vuelve a leer solo cada vez que abrís el módulo, así que alcanza con regenerar el tablero.' : ' Cada vez que regenerás el tablero, volvé a cargarlo acá.'}</p>
    ${escVinculo && escVinculo.estado === 'permiso'
      ? `<button class="btn" onclick="escLeerVinculado(true)">🔗 Reconectar ${escHtml(escVinculo.nombre)}</button>`
      : escVinculoSoportado()
        ? `<button class="btn" onclick="escVincular()">🔗 Vincular tablero de posición</button> <button class="btn btn-outline" onclick="escElegirArchivo()">📂 Cargar una vez</button>`
        : `<button class="btn" onclick="escElegirArchivo()">📂 Cargar posición comercial</button>`}
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
    const otraPlaza = escOtraPlaza(l), b = otraPlaza ? escBasis(l) : null;
    const F0 = escF0(l.crop, l);
    const lado = l.tipo === 'futuro' ? (l.dir === 'sell' ? 'Venta' : 'Compra') : (l.dir === 'buy' ? 'Compra' : 'Venta');
    // En otra plaza: a qué precio de MATBA equivale el strike (o el precio del futuro)
    const equiv = otraPlaza && b != null
      ? `<div class="esc-muted">${l.tipo === 'futuro' ? '' : `strike ${escF(l.strike, 0)} `}= MATBA ${escF(l.strike - b)}</div>` : '';
    const precio = (l.tipo === 'futuro' ? escF(l.strike) : `prima ${escF(l.prima, 2)}`) + equiv;
    const chk = `<input type="checkbox" title="Incluir en el cálculo" ${escFyoIncluido(l) ? 'checked' : ''} onchange="escSetExcl('${escHtml(l.ins)}', this.checked)">`;
    const ctrl = otraPlaza
      ? `${chk} <span class="esc-inline esc-basis" title="Basis ${escHtml(l.plaza)} contra MATBA (u$s/tn): ${escHtml(l.plaza)} = MATBA + basis, hoy y en todos los escenarios. Vale para todos los FyO de ${escHtml(l.plaza)}. Vacío = ${ESC_BASIS_DEF[l.plaza] != null ? 'vuelve a ' + ESC_BASIS_DEF[l.plaza] : 'no se incluye'}.">basis <input class="esc-in esc-in-s" type="text" inputmode="decimal" placeholder="u$s/tn" value="${b != null ? escF(b, 1).replace(/,0$/, '') : ''}" onchange="escSetBasis('${escHtml(l.plaza)}', this.value)"></span>`
      : chk;
    return `<tr class="${escFyoIncluido(l) ? '' : 'esc-off'}">
      <td class="rs-l">${escHtml(l.ins)}${grupo ? ` <span class="esc-muted">${escLbl(l.crop).replace('Maíz ', '')}</span>` : ''}</td><td>${lado}</td><td>${escF(l.tn, 0)}</td><td>${precio}</td>
      <td>${F0 > 0 ? escF(F0) : '—'}${otraPlaza && F0 > 0 ? `<div class="esc-muted">MATBA ${escF(escFutRos(l.crop, l))} ${b < 0 ? '−' : '+'} ${escF(Math.abs(b), 0)}</div>` : ''}</td><td class="esc-c">${ctrl}</td></tr>`;
  }).join('');

  const mercadoFila = grupo
    ? fila('Precio mercado hoy', escF(M), `promedio de ${escBase(c).map(escLbl).join(' y ')} (se edita en cada uno)`)
    : `<tr><td class="rs-l">Precio mercado hoy</td><td><input class="esc-in esc-in-m" type="text" inputmode="decimal" value="${escF(M)}" onchange="escSetMercado(this.value)" title="Del tablero. Editalo para probar otra base; vacío vuelve al del tablero."></td>
        <td class="rs-l esc-muted">${escState.mercado[c] ? 'editado (tablero: ' + escF(p.mercado) + ')' : 'del tablero'}</td></tr>`;
  const difTablero = grupo ? (escPos.cultivos[c].disp || 0) - p.disp : 0;
  const r = escResumenTn(c, false);
  const neto = (v, pos, neg) => Math.abs(v) < 1 ? '' : v > 0 ? pos : neg;
  // Puts / calls de otra plaza incluidos: cobertura cruzada, con su strike equivalente en MATBA
  const cruzada = tipo => {
    const ls = fyo.filter(l => l.tipo === tipo && escOtraPlaza(l) && escFyoIncluido(l));
    return ls.length ? `incluye ${ls.map(l => `${l.dir === 'buy' ? '' : '−'}${escF(l.tn, 0)} ${escHtml(l.plaza)} (strike ${escF(l.strike, 0)} = MATBA ${escF(l.strike - escBasis(l), 0)})`).join(', ')}` : '';
  };

  return `<h3>Posición ${escLbl(c)}</h3>
    ${grupo ? `<div class="esc-nota-grupo">Suma de ${escBase(c).map(escLbl).join(' y ')}, con la estrategia elegida de cada uno.</div>` : ''}
    <table class="rs-table esc-pos">
      ${fila('Producción total', escF(r.disp, 0) + ' tn', Math.abs(difTablero) >= 1 ? `el tablero muestra ${escF(escPos.cultivos[c].disp, 0)} tn en la columna total` : '')}
      ${fila('Tn vendidas (forwards + futuros)', escF(r.vendidas, 0) + ' tn', `${escF(r.fij, 0)} fijadas${Math.abs(r.fut) >= 1 ? ` ${r.fut > 0 ? '+' : '−'} ${escF(Math.abs(r.fut), 0)} futuros ${r.fut > 0 ? 'vendidos' : 'comprados'}` : ''}`)}
      ${fila('Tn cobertura a la baja (puts)', escF(r.puts, 0) + ' tn', [neto(r.puts, 'puts comprados netos', 'puts vendidos netos'), cruzada('put')].filter(Boolean).join(' · '))}
      ${fila('Tn cobertura a la suba (calls)', escF(r.calls, 0) + ' tn', [neto(r.calls, 'calls comprados netos', 'calls vendidos netos'), cruzada('call')].filter(Boolean).join(' · '))}
      ${fila('<b>% cobertura a la baja</b>', `<b>${escPct(r.pctBaja)}</b>`, r.sobrecob >= 1 ? `<span class="red-txt">⚠ sobrecubierto en ${escF(r.sobrecob, 0)} tn</span>` : `sin cubrir: ${escF(escTnSinCob(c, false), 0)} tn`)}
      ${fila('<b>% a la suba</b>', `<b>${escPct(r.pctSuba)}</b>`, `acompañan una suba: ${escF(r.tnSuba, 0)} tn`)}
      ${mercadoFila}
    </table>
    <details class="esc-det" ${escState.detalle ? 'open' : ''} ontoggle="if (escState.detalle !== this.open) { escState.detalle = this.open; escGuardar(); }">
      <summary>Detalle físico y FyO abiertos (${fyo.length})</summary>
      <table class="rs-table esc-pos">
        ${fila('Fijadas', escF(p.fij, 0) + ' tn', `a u$s ${escF(p.ppvFis)} (precio prom. físico)`)}
        ${fila('A fijar', escF(p.afijar, 0) + ' tn', 'sin precio: toman el del escenario')}
        ${fila('Sin vender (Total a vender)', escF(p.tav, 0) + ' tn', 'toman el precio del escenario')}
        ${fila('Saldo sin cobertura a la baja', escF(escTnSinCob(c, false), 0) + ' tn', escDetalleSinCob(c))}
        ${fila('Precio dolor / objetivo', `${escF(p.dolor)} / ${escF(p.objetivo)}`)}
        ${fila('Precio Final (Excel)', escF(p.precioFinal), 'referencia: fórmula del tablero')}
      </table>
      <div class="rs-sub">FyO abiertos <span>se valúan a vencimiento contra el futuro de su posición${sheetData ? ' (A3)' : ' (sin A3: precio mercado)'}${fyo.some(escOtraPlaza) ? ' · otras plazas = MATBA + basis fijo' : ''}</span></div>
      ${fyo.length ? `<div class="rs-tw"><table class="rs-table esc-fyo">
        <thead><tr><th class="rs-l">Instrumento</th><th>Lado</th><th>Tn</th><th>Precio</th><th>Futuro hoy</th><th class="esc-c">Incluir</th></tr></thead>
        <tbody>${fyoRows}</tbody></table></div>` : '<div class="rs-empty">Sin futuros ni opciones abiertos.</div>'}
    </details>`;
}

// En un grupo las coberturas se muestran de solo lectura: se cargan en cada parte
function escHtmlPropuestaGrupo(c) {
  const legs = escLegs(c);
  const rows = legs.map(l => `<tr>
      <td class="rs-l">${escLbl(l.parte)} <span class="esc-muted">${escHtml(l.estr)}</span></td><td>${l.dir === 'buy' ? 'Compra' : 'Venta'}</td>
      <td>${l.tipo === 'futuro' ? 'Futuro' : l.tipo === 'put' ? 'Put' : 'Call'}</td><td>${escHtml(l.pos || '')}</td>
      <td>${escF(l.strike, l.tipo === 'futuro' ? 1 : 0)}</td><td>${l.tipo === 'futuro' ? '—' : escF(l.prima, 2)}</td><td>${escF(l.tn, 0)}</td></tr>`).join('');
  return `<h3>Estrategias elegidas ${escLbl(c)}</h3>
    ${legs.length ? `<div class="rs-tw"><table class="rs-table esc-legs">
      <thead><tr><th class="rs-l">Parte · estrategia</th><th>Operación</th><th>Instr.</th><th>Posición</th><th>Strike / precio</th><th>Prima</th><th>Tn</th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : `<div class="rs-empty">Sin estrategias elegidas.</div>`}
    <div class="esc-legs-foot">
      ${escBase(c).map(b => `<button class="btn btn-sm btn-outline" onclick="escSetCrop('${b}')">Comparar en ${escLbl(b)}</button>`).join('')}
      <span class="esc-muted">Saldo sin cobertura a la baja: ${escF(escTnSinCob(c, false), 0)} tn${legs.length ? ` → ${escF(escTnSinCob(c, true), 0)} tn con la propuesta` : ''}</span>
    </div>
    ${escTnSobrecob(c, true) >= 1 ? `<div class="esc-aviso">⚠ Sobrecubierto en <b>${escF(escTnSobrecob(c, true), 0)} tn</b>: hay más cobertura a la baja que producción sin precio, así que el precio final sube si el mercado baja.</div>` : ''}`;
}

function escHtmlPropuesta() {
  const c = escState.crop;
  if (escEsGrupo(c)) return escHtmlPropuestaGrupo(c);
  const ed = escEditando(c), eleg = escElegida(c);
  const legs = ed ? ed.legs : [];
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
      <td><input class="esc-in esc-in-m${l.tn > 0 ? '' : ' is-estimada'}" type="text" inputmode="decimal" value="${escF(l.tn, 0)}" title="${l.tn > 0 ? 'Toneladas' : 'Con 0 tn la pata no impacta en nada'}" onchange="escEditarPata(${l.id}, 'tn', this.value)"></td>
      <td><button class="btn btn-sm btn-outline" onclick="escBorrarPata(${l.id})" title="Borrar pata">✕</button></td>
    </tr>`;
  }).join('');

  const chips = escEstrs(c).map(e => `<div class="esc-chip${ed && e.id === ed.id ? ' active' : ''}" style="--esc-c:${e.color}" onclick="escEditarEstr(${e.id})" title="Editar ${escHtml(e.nombre)}">
      <button class="esc-chip-star${eleg && e.id === eleg.id ? ' on' : ''}" onclick="event.stopPropagation(); escElegir(${e.id})" title="${eleg && e.id === eleg.id ? 'Elegida: va al consolidado' : 'Marcar como elegida (va al consolidado)'}">★</button>
      <span class="esc-chip-dot"></span><span class="esc-chip-nom">${escHtml(e.nombre)}</span>
      <button class="esc-chip-btn" onclick="event.stopPropagation(); escRenombrarEstr(${e.id})" title="Renombrar">✎</button>
      <button class="esc-chip-btn" onclick="event.stopPropagation(); escBorrarEstr(${e.id})" title="Borrar estrategia">✕</button>
    </div>`).join('');
  const menu = `<select class="esc-in esc-nueva" onchange="escNuevaEstrategia(this.value); this.value = ''" title="Agregar una estrategia para comparar">
      <option value="">+ Estrategia…</option>
      <optgroup label="Plantillas (strikes y primas de A3)">${ESC_PLANTILLAS.map((p, i) => `<option value="${i}">${p[0]}</option>`).join('')}</optgroup>
      <option value="blanco">En blanco</option>
      ${ed ? `<option value="dup">Duplicar "${escHtml(ed.nombre)}"</option>` : ''}
    </select>`;
  const sobre = ed ? escTnSobrecob(c, ed.id) : 0;

  return `<h3>Estrategias ${escLbl(c)}</h3>
    <div class="esc-chips">${chips}${menu}</div>
    ${ed ? `<div class="esc-ed-tit">Patas de <b style="color:${ed.color}">${escHtml(ed.nombre)}</b>${eleg && ed.id === eleg.id ? ' <span class="esc-muted">· elegida</span>' : ''}</div>` : ''}
    ${legs.length ? `<div class="rs-tw"><table class="rs-table esc-legs">
      <thead><tr><th class="rs-l">Operación</th><th>Instr.</th><th>Posición</th><th>Strike / precio</th><th>Prima</th><th>Tn</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`
      : `<div class="rs-empty">${ed ? 'Sin patas. Agregá una.' : 'Sin estrategias. Elegí una plantilla en "+ Estrategia…", usá el atajo de arriba o agregá una pata.'}</div>`}
    <div class="esc-legs-foot">
      <button class="btn btn-sm" onclick="escAgregarPata()">+ Agregar pata</button>
      ${legs.length ? `<button class="btn btn-sm btn-outline" onclick="escLimpiar(true)">Vaciar patas</button>` : ''}
      <span class="esc-muted">Saldo sin cobertura a la baja: ${escF(escTnSinCob(c, false), 0)} tn${legs.length ? ` → ${escF(escTnSinCob(c, ed.id), 0)} tn con esta estrategia` : ''}</span>
    </div>
    ${sobre >= 1 ? `<div class="esc-aviso">⚠ Sobrecubierto en <b>${escF(sobre, 0)} tn</b>: hay más cobertura a la baja que producción sin precio, así que el precio final sube si el mercado baja.</div>` : ''}`;
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
  escRenderBalance(c);
  escRenderComparar(c, d);
  escRenderTabla(c, d);
}

// Curvas a dibujar y comparar en la solapa: cada estrategia con patas del cultivo; en un grupo,
// la suma de las elegidas de sus partes. est = parámetro para escIngreso y compañía.
function escSeries(c) {
  if (escEsGrupo(c)) return escLegs(c).length
    ? [{ est: true, nombre: 'Elegidas (' + escBase(c).map(b => escLbl(b).replace('Maíz ', '')).join(' + ') + ')', color: ESC_COLOR_PROP, eleg: true }] : [];
  const eleg = escElegida(c);
  return escEstrs(c).filter(e => e.legs.length).map(e => ({ est: e.id, nombre: e.nombre, color: e.color, eleg: !!eleg && e.id === eleg.id, id: e.id }));
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
    const rA = escResumenTn(x, false), rP = escResumenTn(x, true);
    const eleg = grupo ? null : escElegida(x);
    if (!grupo) { tAct += iA; tProp += iP; tCosto += costo; tDisp += disp; tSinA += sinA; tSinP += sinP; }
    const cls = [x === escState.crop ? 'rs-hot' : '', grupo ? 'esc-grupo' : '', partes.has(x) ? 'esc-parte' : ''].join(' ');
    return `<tr class="esc-row ${cls}" onclick="escSetCrop('${x}')" title="Ver ${escLbl(x)}">
      <td class="rs-l">${grupo ? escLbl(x) : `<b>${escLbl(x)}</b>`}${hay && eleg ? ` <span class="esc-muted" style="color:${eleg.color}">★ ${escHtml(eleg.nombre)}</span>` : ''}</td>
      <td>${escF(disp, 0)}</td><td>${escF(sinA, 0)}${hay ? ` → <b>${escF(sinP, 0)}</b>` : ''}</td>
      <td>${escPct(rA.pctBaja)}${hay ? ` → <b class="${sobre ? 'rs-neg' : ''}" title="${sobre ? 'Sobrecubierto' : ''}">${escPct(rP.pctBaja)}${sobre ? ' ⚠' : ''}</b>` : ''}</td>
      <td>${escPct(rA.pctSuba)}${hay ? ` → <b>${escPct(rP.pctSuba)}</b>` : ''}</td>
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
      <th title="Participación en la suba: (producción − vendidas + calls netos) / producción">% a la suba</th>
      <th>Precio final actual</th><th>Con estrategia elegida</th><th>Diferencia</th><th>Costo primas</th><th>Resultado total</th>
    </tr></thead><tbody>${rows}
    <tr class="esc-tot"><td class="rs-l">Total</td><td>${escF(tDisp, 0)}</td><td>${escF(tSinA, 0)}${Math.abs(tSinP - tSinA) >= 1 ? ' → ' + escF(tSinP, 0) : ''}</td><td></td><td></td>
      <td colspan="2" class="esc-muted">Ingreso: ${escUsd(tAct)} → ${escUsd(tProp)}</td><td></td>
      <td>${escUsd(tCosto)}</td><td class="${escCls(tProp - tAct)}">${escUsd(tProp - tAct)}</td></tr></tbody>`;
}

function escRenderKpis(c, d) {
  const hay = escLegs(c).length > 0;
  const pfA = escPrecioFinal(c, d, false), pfP = escPrecioFinal(c, d, true);
  const cA = escPrecioFinal(c, -0.30, false), cP = escPrecioFinal(c, -0.30, true);
  const sinA = escTnSinCob(c, false), sinP = escTnSinCob(c, true), sobre = escTnSobrecob(c, true);
  const rA = escResumenTn(c, false), rP = escResumenTn(c, true);
  const costo = escCostoProp(c);
  const bal = hay ? escBalance(c, escEsGrupo(c) ? true : escElegida(c).id) : null;
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
    + kpi('% a la suba', escPct(rA.pctSuba), escPct(rP.pctSuba),
          `acompañan una suba: ${escF(rA.tnSuba, 0)}${hay ? ' → ' + escF(rP.tnSuba, 0) : ''} tn`)
    + kpi('Costo de la cobertura', hay ? escUsd(costo) : '—', null,
          hay ? `primas: ${escF(costo / escDisp(c), 2)} u$s/tn de producción${costo < -0.5 ? ' (cobro neto)' : ''}`
              + (bal.peor < -0.5 ? ` · máx. en contra: <b>${escUsd(bal.peor)}</b>` : '') : 'sin estrategia elegida');
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
  if (!txt) { ctx.restore(); return; }
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
    (opts.cruces || []).forEach(v => escVertical(ch, v, ESC_COLOR_CRUCE, opts.sinTexto ? '' : `Cruce u$s ${escF(v)}`, true));
    escVertical(ch, opts.escenario, 'rgba(28,33,24,0.6)', opts.label || '', false);
  }
};

// Eje X: automático ±40% del mercado de hoy, salvo que se cargue a mano
function escEjeX(c) {
  const M = escMercado(c), ej = escState.ejes[c] || {};
  const auto = { xmin: Math.floor(M * (1 - ESC_RANGO) / 5) * 5, xmax: Math.ceil(M * (1 + ESC_RANGO) / 5) * 5 };
  let xMin = ej.xmin != null ? ej.xmin : auto.xmin, xMax = ej.xmax != null ? ej.xmax : auto.xmax;
  if (!(xMax > xMin)) { xMin = auto.xmin; xMax = auto.xmax; }
  return { xMin, xMax };
}
// Eje Y: automático para que entren las curvas (ys), las referencias y la diagonal de mercado
function escEjeY(c, ys, xMin, xMax) {
  const ej = escState.ejes[c] || {};
  const auto = { ymin: Math.floor(Math.min(...ys, xMin) / 10) * 10, ymax: Math.ceil(Math.max(...ys, xMax) / 10) * 10 };
  let yMin = ej.ymin != null ? ej.ymin : auto.ymin, yMax = ej.ymax != null ? ej.ymax : auto.ymax;
  if (!(yMax > yMin)) { yMin = auto.ymin; yMax = auto.ymax; }
  return { yMin, yMax };
}
// Grilla con los quiebres de las patas (strikes) para que las curvas no redondeen los vértices
function escGrillaX(c, series, xMin, xMax) {
  const M = escMercado(c), N = 160, xsSet = new Set();
  for (let i = 0; i <= N; i++) xsSet.add(xMin + (xMax - xMin) * i / N);
  series.forEach(s => escLegs(c, s.est).forEach(l => {
    const F0 = escF0(l.parte || c, l);
    if (l.tipo !== 'futuro' && F0 > 0) { const x = l.strike / F0 * M; if (x > xMin && x < xMax) xsSet.add(x); }
  }));
  return [...xsSet].sort((a, b) => a - b);
}

function escRenderChart(c, d) {
  const canvas = document.getElementById('esc-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const p = escPos.cultivos[c], M = escMercado(c);
  const series = escSeries(c), elegS = series.find(s => s.eleg);
  const ej = escState.ejes[c] || {};
  const { xMin, xMax } = escEjeX(c);
  const xs = escGrillaX(c, series, xMin, xMax);
  const mkt = xs.map(x => ({ x, y: x }));
  const act = xs.map(x => ({ x, y: escPrecioFinal(c, x / M - 1, false) }));
  const curvas = series.map(s => xs.map(x => ({ x, y: escPrecioFinal(c, x / M - 1, s.est) })));
  const linea = (label, data, color, extra) => Object.assign({ label, data, borderColor: color, borderWidth: 2.5,
    pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: color, tension: 0 }, extra || {});
  const ds = [
    linea('Precio de mercado', mkt, '#b0afa8', { borderWidth: 2, borderDash: [6, 4] }),
    linea('Posición actual', act, ESC_COLOR_ACT)
  ];
  // La elegida pinta el área contra la posición actual (dataset 1): verde donde conviene la
  // estrategia, azul donde conviene no hacer nada. Las demás van como líneas finas.
  series.forEach((s, i) => ds.push(linea((s.eleg && series.length > 1 ? '★ ' : '') + s.nombre, curvas[i], s.color,
    s.eleg ? { borderWidth: 3, fill: { target: 1, above: ESC_FILL_GANA, below: ESC_FILL_PIERDE } }
           : { borderWidth: 1.8, borderDash: [5, 3] })));
  const prop = curvas.flat();
  const refs = [];
  [['Precio Objetivo', p.objetivo, typeof REF_OBJ_COLOR !== 'undefined' ? REF_OBJ_COLOR : '#7c3aed'],
   ['Precio Dolor', p.dolor, typeof REF_DOL_COLOR !== 'undefined' ? REF_DOL_COLOR : '#c43030']].forEach(([n, v, col]) => {
    if (!(v > 0)) return;
    refs.push(v);
    ds.push(linea(`${n} (${escF(v)})`, [{ x: xMin, y: v }, { x: xMax, y: v }], col,
      { borderWidth: 1.6, borderDash: [10, 5], pointHoverRadius: 0, order: 20 }));
  });

  const { yMin, yMax } = escEjeY(c, act.concat(prop).map(o => o.y).concat(refs), xMin, xMax);

  // Los campos de ejes muestran el valor en uso; en gris cuando es el automático
  const vals = { xmin: xMin, xmax: xMax, ymin: yMin, ymax: yMax };
  Object.keys(vals).forEach(k => {
    const el = document.getElementById('esc-eje-' + k);
    if (!el || el === document.activeElement) return;
    el.value = escF(vals[k], 0);
    el.classList.toggle('esc-auto', ej[k] == null);
  });

  const cruces = elegS ? escCruces(c, xMin, xMax, elegS.est) : [];
  const nomE = elegS ? `<b style="color:${elegS.color}">${escHtml(elegS.nombre)}</b>` : '';
  const txt = document.getElementById('esc-cruce-txt');
  if (txt) txt.innerHTML = cruces.map(k => `${nomE} y la posición actual se cruzan con el mercado en <b>u$s ${escF(k.x)}</b> (${escSig((k.x / M - 1) * 100, 1)}% vs hoy): por debajo conviene ${k.abajo === 'cobertura' ? 'la estrategia' : '<b style="color:' + ESC_COLOR_ACT + '">no hacer nada</b>'}, por arriba ${k.abajo === 'cobertura' ? '<b style="color:' + ESC_COLOR_ACT + '">no hacer nada</b>' : 'la estrategia'}.`).join('<br>')
    || (elegS ? `${nomE} y la posición actual no se cruzan en el rango del gráfico.` : '');

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
  escRenderChartDif(c, d, series, xs, xMin, xMax, cruces);
}

// Franja de diferencia en u$s totales contra la posición actual, mismo eje X que el gráfico.
// La elegida como área (verde gana / azul pierde); las demás como líneas finas.
function escRenderChartDif(c, d, series, xs, xMin, xMax, cruces) {
  const canvas = document.getElementById('esc-chart-dif');
  if (!canvas) return;
  if (escChartDif) { escChartDif.destroy(); escChartDif = null; }
  const wrap = canvas.parentElement, tit = wrap.previousElementSibling;
  const hay = series.length > 0;
  wrap.style.display = tit.style.display = hay ? '' : 'none';
  if (!hay) return;
  const M = escMercado(c);
  const ds = series.map(s => ({
    label: (s.eleg && series.length > 1 ? '★ ' : '') + s.nombre,
    data: xs.map(x => ({ x, y: escDifUsd(c, x, s.est) })),
    borderColor: s.color, borderWidth: s.eleg ? 2 : 1.6, borderDash: s.eleg ? [] : [5, 3],
    pointRadius: 0, pointHoverRadius: 4, tension: 0,
    fill: s.eleg ? { target: { value: 0 }, above: 'rgba(26,107,60,0.22)', below: 'rgba(37,99,235,0.22)' } : false
  }));
  const mill = v => Math.abs(v) >= 1e6 ? escF(v / 1e6, 1) + ' M' : escF(v / 1e3, 0) + ' mil';
  escChartDif = new Chart(canvas, {
    type: 'line',
    data: { datasets: ds },
    plugins: [escLineasVerticales],
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, parsing: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        escLineas: { escenario: M * (1 + d), label: '', cruces: cruces.map(k => k.x), sinTexto: true },
        legend: { display: series.length > 1, labels: { font: { family: 'Montserrat', size: 11 }, usePointStyle: true, pointStyle: 'line' } },
        tooltip: { callbacks: {
          title: it => it.length ? `Mercado a vencimiento: u$s ${escF(it[0].parsed.x)} (${escSig((it[0].parsed.x / M - 1) * 100, 0)}%)` : '',
          label: x => `${x.dataset.label}: ${x.parsed.y < 0 ? '−' : '+'}u$s ${escF(Math.abs(x.parsed.y), 0)} (${escSig(x.parsed.y / escDisp(c))} u$s/tn)`
        } }
      },
      scales: {
        x: { type: 'linear', min: xMin, max: xMax, grid: { color: 'rgba(0,0,0,.05)' },
             ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#7e8574', callback: v => escF(v, 0) } },
        y: { grid: { color: ctx => ctx.tick.value === 0 ? 'rgba(0,0,0,.35)' : 'rgba(0,0,0,.05)' },
             ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#7e8574', maxTicksLimit: 6, callback: v => v === 0 ? '0' : (v > 0 ? '+' : '−') + mill(Math.abs(v)) } }
      }
    }
  });
}

// Balance de la estrategia elegida: equilibrio, qué pasa si baja y qué pasa si sube (u$s totales)
function escRenderBalance(c) {
  const el = document.getElementById('esc-balance');
  if (!el) return;
  const s = escSeries(c).find(x => x.eleg);
  if (!s) { el.innerHTML = ''; return; }
  const b = escBalance(c, s.est), M = b.M, disp = escDisp(c);
  const col = v => v >= 0 ? ESC_COLOR_PROP : ESC_COLOR_ACT;
  const usd = escUsdM;
  const porU = v => `${usd(v)} por cada u$s`;
  const cr = b.cruces.slice().sort((a, z) => Math.abs(a.x - M) - Math.abs(z.x - M))[0];

  const tEq = cr
    ? { val: `u$s ${escF(cr.x)}`, color: ESC_COLOR_CRUCE, notas: [`${escSig((cr.x / M - 1) * 100, 1)}% vs hoy (${escF(M)})`,
        cr.abajo === 'cobertura' ? 'abajo conviene la estrategia, arriba no hacer nada' : 'abajo conviene no hacer nada, arriba la estrategia']
        .concat(b.cruces.length > 1 ? [`otros cruces: ${b.cruces.filter(k => k !== cr).map(k => escF(k.x)).join(' · ')}`] : []) }
    : { val: 'sin cruce', color: '#7e8574', notas: [`en ±${ESC_RANGO * 100}% la estrategia queda siempre ${escDifUsd(c, M, s.est) >= 0 ? 'mejor' : 'peor'} que no hacer nada`] };
  const tBaja = { val: usd(b.baja), color: col(b.baja), notas: [
    `con el mercado −30% (${escF(M * 0.7)})`,
    Math.abs(b.pendBaja) < 1 ? 'la diferencia ya quedó fija en la baja' : `${porU(b.pendBaja)} que cae el mercado`,
    `${escSig(b.baja / disp)} u$s/tn de producción`] };
  const fija = b.fijaDesde != null;
  const vSuba = fija ? b.finSuba : b.suba;
  const tSuba = { val: usd(vSuba), color: col(vSuba), notas: fija
    ? [`${vSuba < 0 ? 'máximo en contra' : 'a favor'}, fijo desde ${escF(b.fijaDesde)}`, `${escSig(vSuba / disp)} u$s/tn de producción`]
      .concat(vSuba < 0 ? ['es lo que cuesta la estrategia si el mercado sube'] : [])
    : [`con el mercado +30% (${escF(M * 1.3)})`, `${b.pendSuba < 0 ? 'sigue cayendo' : 'sigue subiendo'} ${usd(Math.abs(b.pendSuba)).slice(1)} por cada u$s que sube: sin tope`,
       `${escSig(vSuba / disp)} u$s/tn de producción`] };

  const tarjeta = (lbl, t) => `<div class="esc-bal-t" style="--esc-c:${t.color}">
      <div class="esc-bal-l">${lbl}</div><div class="esc-bal-v" style="color:${t.color}">${t.val}</div>
      ${t.notas.map(n => `<div class="esc-bal-n">${n}</div>`).join('')}</div>`;
  el.innerHTML = `<div class="rs-card">
      <h3>Balance de <span style="color:${s.color}">${escHtml(s.nombre)}</span> <span class="esc-h3-sub">u$s totales contra no hacer nada</span></h3>
      <div class="esc-bal">${tarjeta('Punto de equilibrio', tEq)}${tarjeta('Si baja', tBaja)}${tarjeta('Si sube', tSuba)}</div>
    </div>`;
}

// Tabla comparativa: posición actual y cada estrategia (clic = editar)
function escRenderComparar(c, d) {
  const el = document.getElementById('esc-comp');
  if (!el) return;
  const series = escSeries(c), grupo = escEsGrupo(c), disp = escDisp(c);
  const sub = document.getElementById('esc-comp-sub');
  if (sub) sub.textContent = `u$s/tn salvo indicación · escenario ${escSig(d * 100, 0)}%${grupo ? '' : ' · ★ = va al consolidado · clic = editar'}`;
  const pf = (est, dd) => escPrecioFinal(c, dd, est);
  const fila = (s) => {
    const est = s ? s.est : false, r = escResumenTn(c, est);
    const b = s ? escBalance(c, est) : null, costo = s ? escCostoProp(c, est) : 0;
    const ed = s && !grupo && escEditando(c) && escEditando(c).id === s.id;
    const cls = [s && s.eleg ? 'rs-hot' : '', ed ? 'esc-comp-ed' : '', s && !grupo ? 'esc-row' : ''].join(' ');
    const celda = dd => { const v = pf(est, dd), a = pf(false, dd);
      return `<td>${escF(v)}${s ? `<div class="esc-muted ${escCls(v - a)}">${escSig(v - a)}</div>` : ''}</td>`; };
    return `<tr class="${cls}" ${s && !grupo ? `onclick="escEditarEstr(${s.id})"` : ''}>
      <td class="rs-l">${s ? `<span class="esc-chip-dot" style="--esc-c:${s.color}"></span> ${s.eleg && !grupo ? '★ ' : ''}${escHtml(s.nombre)}` : `<span class="esc-chip-dot" style="--esc-c:${ESC_COLOR_ACT}"></span> Posición actual`}</td>
      <td>${s ? escUsd(costo) + `<div class="esc-muted">${escF(costo / disp, 2)} u$s/tn</div>` : '—'}</td>
      <td>${b && b.peor < -0.5 ? escUsd(b.peor) + `<div class="esc-muted">${escSig(b.peor / disp)} u$s/tn</div>` : '—'}</td>
      <td>${b ? (b.cruces.map(k => escF(k.x)).join(' · ') || 'sin cruce') : '—'}</td>
      ${celda(-0.30)}${celda(d)}${celda(0.30)}
      <td>${escPct(r.pctBaja)}${r.sobrecob >= 1 ? ' ⚠' : ''}</td><td>${escPct(r.pctSuba)}</td>
    </tr>`;
  };
  el.innerHTML = `<thead><tr>
      <th class="rs-l">Estrategia</th><th>Costo primas</th>
      <th title="La peor diferencia contra no hacer nada en ±${ESC_RANGO * 100}% del mercado de hoy">Máx. en contra</th>
      <th title="Precio de mercado donde la estrategia empata con no hacer nada">Equilibrio</th>
      <th>Precio final −30%</th><th>Escenario ${escSig(d * 100, 0)}%</th><th>+30%</th><th>% baja</th><th>% suba</th>
    </tr></thead><tbody>${fila(null)}${series.map(fila).join('')}</tbody>`
    + (series.length ? '' : `<tbody><tr><td colspan="9" class="rs-empty">${grupo ? 'Sin estrategias elegidas en las partes.' : 'Agregá estrategias con "+ Estrategia…" para compararlas.'}</td></tr></tbody>`);
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
      ${hay ? '<th>Con elegida</th><th>Dif. u$s/tn</th><th>Dif. total</th>' : ''}<th>${hay ? 'Con elegida' : 'Actual'} vs Dolor</th>
    </tr></thead><tbody>${rows}</tbody>`;
}

// ═══════════════════════════════════════════════════
// PDF PARA COMPARTIR (WhatsApp)
// Informe aparte en hojas A5 verticales, que se leen bien en el celular: portada, una sección
// por cultivo (gráfico, estrategia elegida, balance y escenarios) y el consolidado al final.
// Cada bloque se pasa a imagen con html2canvas y se acomoda en las hojas con jsPDF sin cortarlo.
// Las dos librerías se bajan de cdnjs recién al primer clic.
// ═══════════════════════════════════════════════════
const ESC_PDF_W = 560, ESC_PDF_H = 794;   // hoja A5 en px CSS (420 × 595 pt)
const ESC_PDF_MARG = 24, ESC_PDF_PIE = 30;

function escCargarScript(url) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = res;
    s.onerror = () => { s.remove(); rej(new Error('no pude descargar ' + url.split('/').pop() + ' (¿sin internet?)')); };
    document.head.appendChild(s);
  });
}
async function escPdfLibs() {
  if (!window.html2canvas) await escCargarScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  if (!(window.jspdf && window.jspdf.jsPDF)) await escCargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
}

function escPdfFecha() { return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function escPdfEsc(d) { return Math.abs(d) < 1e-9 ? 'Mercado sin cambios' : `Mercado ${escSig(d * 100, 0)}%`; }
function escPdfCls(v) { return v > 0.05 ? 'escpdf-pos' : v < -0.05 ? 'escpdf-neg' : ''; }

// Gráfico de precio final (posición actual vs estrategia elegida) como imagen PNG
function escPdfGrafico(c, d, host) {
  const p = escPos.cultivos[c], M = escMercado(c);
  const s = escSeries(c).find(x => x.eleg);
  const { xMin, xMax } = escEjeX(c);
  const xs = escGrillaX(c, s ? [s] : [], xMin, xMax);
  const curva = est => xs.map(x => ({ x, y: escPrecioFinal(c, x / M - 1, est) }));
  const linea = (label, data, color, extra) => Object.assign({ label, data, borderColor: color, borderWidth: 2.2, pointRadius: 0, tension: 0 }, extra || {});
  const act = curva(false), prop = s ? curva(s.est) : [];
  const ds = [linea('Precio de mercado', xs.map(x => ({ x, y: x })), '#b0afa8', { borderWidth: 1.5, borderDash: [5, 4] }),
              linea('Posición actual', act, ESC_COLOR_ACT)];
  if (s) ds.push(linea(s.nombre, prop, ESC_COLOR_PROP, { borderWidth: 2.8, fill: { target: 1, above: ESC_FILL_GANA, below: ESC_FILL_PIERDE } }));
  const refs = [];
  [['Objetivo', p.objetivo, typeof REF_OBJ_COLOR !== 'undefined' ? REF_OBJ_COLOR : '#7c3aed'],
   ['Dolor', p.dolor, typeof REF_DOL_COLOR !== 'undefined' ? REF_DOL_COLOR : '#c43030']].forEach(([n, v, col]) => {
    if (!(v > 0)) return;
    refs.push(v);
    ds.push(linea(`${n} ${escF(v)}`, [{ x: xMin, y: v }, { x: xMax, y: v }], col, { borderWidth: 1.3, borderDash: [8, 4] }));
  });
  const { yMin, yMax } = escEjeY(c, act.concat(prop).map(o => o.y).concat(refs), xMin, xMax);
  const cruces = s ? escCruces(c, xMin, xMax, s.est) : [];
  const tick = { font: { family: 'JetBrains Mono', size: 9 }, color: '#7e8574' };
  const titulo = text => ({ display: true, text, font: { family: 'Montserrat', size: 10, weight: '600' }, color: '#505845' });

  const cv = document.createElement('canvas');
  cv.width = 520; cv.height = 300;
  cv.style.width = '520px'; cv.style.height = '300px';
  host.appendChild(cv);
  const ch = new Chart(cv, {
    type: 'line', data: { datasets: ds }, plugins: [escLineasVerticales],
    options: {
      responsive: false, animation: false, devicePixelRatio: 2, parsing: false, events: [],
      plugins: {
        escLineas: { escenario: M * (1 + d), label: Math.abs(d) < 1e-9 ? `Hoy ${escF(M)}` : `Escenario ${escSig(d * 100, 0)}%`, cruces: cruces.map(k => k.x) },
        legend: { position: 'bottom', labels: { font: { family: 'Montserrat', size: 10 }, color: '#505845', usePointStyle: true, pointStyle: 'line', boxWidth: 22, padding: 10 } },
        tooltip: { enabled: false }
      },
      scales: {
        x: { type: 'linear', min: xMin, max: xMax, title: titulo('Mercado a vencimiento (u$s/tn)'), grid: { color: 'rgba(0,0,0,.05)' }, ticks: Object.assign({ callback: v => escF(v, 0) }, tick) },
        y: { min: yMin, max: yMax, title: titulo('Precio final (u$s/tn)'), grid: { color: 'rgba(0,0,0,.05)' }, ticks: tick }
      }
    }
  });
  const url = cv.toDataURL('image/png');
  ch.destroy();
  cv.remove();
  return { url, cruces };
}

function escPdfCabecera(d) {
  const m = escPos.meta || {};
  const chips = [escPdfFecha(), escPdfEsc(d), m.modificado ? 'Posición: Excel ' + m.modificado : null,
                 sheetData && sheetData.fechaDatos ? 'Primas A3 ' + sheetData.fechaDatos : null];
  return `<div class="escpdf-blk escpdf-head">
    <div class="escpdf-band">
      <div class="escpdf-brand">Espartina S.A. · Comercial</div>
      <div class="escpdf-tit">Escenarios de posición</div>
      <div class="escpdf-sub">Qué precio final le queda a cada cultivo según hacia dónde vaya el mercado: la posición actual y con la estrategia de cobertura elegida.</div>
      <div class="escpdf-chips">${chips.filter(Boolean).map(x => `<span>${escHtml(x)}</span>`).join('')}</div>
    </div>
    <div class="escpdf-ley">
      <span><i style="background:${ESC_COLOR_ACT}"></i>Posición actual (sin coberturas nuevas)</span>
      <span><i style="background:${ESC_COLOR_PROP}"></i>Con la estrategia elegida</span>
    </div>
  </div>`;
}

// Tres bloques por cultivo: resumen + gráfico · posición, estrategia y balance · escenarios
function escPdfCultivo(c, d, graf) {
  const s = escSeries(c).find(x => x.eleg), hay = !!s, est = hay ? s.est : false;
  const disp = escDisp(c), M = escMercado(c), lbl = escLbl(c);
  const pfA = escPrecioFinal(c, d, false), pfP = escPrecioFinal(c, d, est);
  const cA = escPrecioFinal(c, -0.30, false), cP = escPrecioFinal(c, -0.30, est);
  const rA = escResumenTn(c, false), rP = escResumenTn(c, est);
  const costo = hay ? escCostoProp(c, est) : 0;
  const par = (a, b) => `<span class="escpdf-act">${a}</span>${hay ? `<span class="escpdf-fl">→</span><span class="escpdf-prop">${b}</span>` : ''}`;
  const kpi = (l, v, n) => `<div class="escpdf-kpi"><div class="escpdf-kpi-l">${l}</div><div class="escpdf-kpi-v">${v}</div><div class="escpdf-kpi-n">${n || '&nbsp;'}</div></div>`;
  const dif = (a, b) => hay ? `<span class="${escPdfCls(b - a)}">${escSig(b - a)} u$s/tn</span>` : 'sin estrategia';

  const cruceTxt = graf.cruces.length
    ? graf.cruces.map(k => `Se cruzan con el mercado en <b>u$s ${escF(k.x)}</b> (${escSig((k.x / M - 1) * 100, 1)}% vs hoy): por debajo conviene ${k.abajo === 'cobertura' ? 'la estrategia' : 'no hacer nada'}, por arriba ${k.abajo === 'cobertura' ? 'no hacer nada' : 'la estrategia'}.`).join('<br>')
    : '';
  const b1 = `<div class="escpdf-blk" data-hoja="nueva">
    <div class="escpdf-sec"><span class="escpdf-sec-t">${lbl}</span>
      <span class="escpdf-sec-e">${hay ? `Estrategia: <b>${escHtml(s.nombre)}</b>` : 'Sin estrategia elegida'}</span></div>
    <div class="escpdf-kpis">
      ${kpi(Math.abs(d) < 1e-9 ? 'Precio final hoy' : `Precio final con mercado ${escSig(d * 100, 0)}%`, par(escF(pfA), escF(pfP)), dif(pfA, pfP))}
      ${kpi('Si el mercado cae 30%', par(escF(cA), escF(cP)), dif(cA, cP))}
      ${kpi('Cobertura a la baja', par(escPct(rA.pctBaja), escPct(rP.pctBaja)), rP.sobrecob >= 1 && hay ? `<span class="escpdf-neg">sobrecubierto ${escF(rP.sobrecob, 0)} tn</span>` : `% a la suba: ${escPct(rA.pctSuba)}${hay ? ' → ' + escPct(rP.pctSuba) : ''}`)}
      ${kpi('Costo de primas', hay ? `<span class="escpdf-prop">${escF(costo / disp, 2)}</span>` : '—', hay ? `u$s/tn · total ${escUsd(costo)}` : '')}
    </div>
    <img class="escpdf-chart" src="${graf.url}">
    ${cruceTxt ? `<div class="escpdf-linea escpdf-cruce">${cruceTxt}</div>` : ''}
  </div>`;

  // Posición, patas de la estrategia y balance contra no hacer nada
  const legs = escLegs(c, est), grupo = escEsGrupo(c);
  const legRows = legs.map(l => `<tr>
      ${grupo ? `<td class="l">${escLbl(l.parte).replace('Maíz ', '')}</td>` : ''}
      <td class="l">${l.dir === 'buy' ? 'Compra' : 'Venta'} ${l.tipo === 'futuro' ? 'futuro' : l.tipo}</td><td class="l">${escHtml(l.pos || '')}</td>
      <td>${escF(l.strike, l.tipo === 'futuro' ? 1 : 0)}</td><td>${l.tipo === 'futuro' ? '—' : escF(l.prima, 2)}</td><td>${escF(l.tn, 0)}</td></tr>`).join('');
  let bal = '';
  if (hay) {
    const b = escBalance(c, est);
    const cr = b.cruces.slice().sort((a, z) => Math.abs(a.x - M) - Math.abs(z.x - M))[0];
    const vSuba = b.fijaDesde != null ? b.finSuba : b.suba;
    const col = v => v >= 0 ? ESC_COLOR_PROP : ESC_COLOR_ACT;
    const t = (l, v, color, n) => `<div style="--c:${color}"><span class="escpdf-kpi-l">${l}</span><b>${v}</b>${n}</div>`;
    bal = `<div class="escpdf-h">Balance contra no hacer nada <span>u$s totales</span></div>
      <div class="escpdf-bal">
        ${t('Punto de equilibrio', cr ? `u$s ${escF(cr.x)}` : 'sin cruce', cr ? ESC_COLOR_CRUCE : '#7e8574',
            cr ? `${escSig((cr.x / M - 1) * 100, 1)}% vs hoy (${escF(M)})` : `en ±${ESC_RANGO * 100}% queda siempre ${escDifUsd(c, M, est) >= 0 ? 'mejor' : 'peor'}`)}
        ${t('Si baja 30%', escUsdM(b.baja), col(b.baja), `${escSig(b.baja / disp)} u$s/tn`)}
        ${t('Si sube', escUsdM(vSuba), col(vSuba), b.fijaDesde != null ? `fijo desde ${escF(b.fijaDesde)} · ${escSig(vSuba / disp)} u$s/tn` : `con +30% · ${escSig(vSuba / disp)} u$s/tn`)}
      </div>`;
  }
  const b2 = `<div class="escpdf-blk">
    <div class="escpdf-h">${lbl} · posición</div>
    <div class="escpdf-linea">Producción disponible <b>${escF(disp, 0)} tn</b> · vendidas (forwards + futuros) <b>${escF(rA.vendidas, 0)} tn</b>
      · sin cobertura a la baja <b>${escF(escTnSinCob(c, false), 0)} tn</b>${hay ? ` → <b>${escF(escTnSinCob(c, est), 0)} tn</b> con la estrategia` : ''}
      · mercado hoy <b>u$s ${escF(M)}</b></div>
    ${hay ? `<div class="escpdf-h">Estrategia elegida · ${escHtml(s.nombre)}</div>
      <table class="escpdf-t"><thead><tr>${grupo ? '<th class="l">Parte</th>' : ''}<th class="l">Operación</th><th class="l">Posición</th><th>Strike / precio</th><th>Prima</th><th>Tn</th></tr></thead>
      <tbody>${legRows}</tbody></table>` : ''}
    ${bal}`;

  // Precio final por escenario (va en el mismo bloque que la posición: hoja 2 del cultivo)
  const deltas = ESC_TABLA.slice();
  if (!deltas.some(x => Math.abs(x - d) < 1e-9)) deltas.push(d);
  deltas.sort((a, z) => a - z);
  const filas = deltas.map(dd => {
    const a = escPrecioFinal(c, dd, false), pr = escPrecioFinal(c, dd, est);
    return `<tr class="${Math.abs(dd - d) < 1e-9 ? 'hot' : ''}">
      <td class="l">${Math.abs(dd) < 1e-9 ? 'Sin cambios' : escSig(dd * 100, 0) + '%'}</td><td>${escF(M * (1 + dd))}</td><td>${escF(a)}</td>
      ${hay ? `<td><b>${escF(pr)}</b></td><td class="${escPdfCls(pr - a)}">${escSig(pr - a)}</td><td class="${escPdfCls(pr - a)}">${escUsdM((pr - a) * disp)}</td>` : ''}
    </tr>`;
  }).join('');
  const b3 = `<div class="escpdf-h">${lbl} · precio final por escenario <span>u$s/tn</span></div>
    <table class="escpdf-t"><thead><tr><th class="l">Mercado</th><th>Precio</th><th>Actual</th>
      ${hay ? '<th>Con estrategia</th><th>Dif. u$s/tn</th><th>Dif. total</th>' : ''}</tr></thead><tbody>${filas}</tbody></table>
  </div>`;
  return [b1, b2 + b3];
}

function escPdfConsolidado(d) {
  let tAct = 0, tProp = 0, tCosto = 0, tDisp = 0;
  const partes = new Set(escCrops().filter(escEsGrupo).flatMap(escBase));
  const rows = escCrops().map(x => {
    const grupo = escEsGrupo(x), disp = escDisp(x), hay = escLegs(x).length > 0;
    const iA = escIngreso(x, d, false), iP = escIngreso(x, d, true), costo = escCostoProp(x);
    const rA = escResumenTn(x, false), rP = escResumenTn(x, true), eleg = grupo ? null : escElegida(x);
    if (!grupo) { tAct += iA; tProp += iP; tCosto += costo; tDisp += disp; }
    return `<tr class="${grupo ? 'grupo' : ''}${partes.has(x) ? ' sub' : ''}">
      <td class="l"><b>${escLbl(x)}</b>${hay && eleg ? `<div class="escpdf-mini">${escHtml(eleg.nombre)}</div>` : ''}</td>
      <td>${escF(disp, 0)}</td>
      <td>${escPct(rA.pctBaja)}${hay ? `<div class="escpdf-mini escpdf-prop">→ ${escPct(rP.pctBaja)}</div>` : ''}</td>
      <td>${escF(iA / disp)}</td><td>${hay ? `<b>${escF(iP / disp)}</b>` : '—'}</td>
      <td class="${hay ? escPdfCls((iP - iA) / disp) : ''}">${hay ? escSig((iP - iA) / disp) : ''}</td>
      <td>${hay ? escF(costo / disp, 2) : '—'}</td>
      <td class="${hay ? escPdfCls(iP - iA) : ''}">${hay ? escUsdM(iP - iA) : ''}</td>
    </tr>`;
  }).join('');
  return `<div class="escpdf-blk" data-hoja="nueva">
    <div class="escpdf-sec"><span class="escpdf-sec-t">Consolidado</span><span class="escpdf-sec-e">${escPdfEsc(d)} · u$s/tn salvo indicación</span></div>
    <table class="escpdf-t escpdf-cons"><thead><tr>
      <th class="l">Cultivo</th><th>Prod. tn</th><th>Cob. baja</th><th>Precio final actual</th><th>Con estrategia</th><th>Dif.</th><th>Primas</th><th>Resultado</th>
    </tr></thead><tbody>${rows}
      <tr class="tot"><td class="l">Total</td><td>${escF(tDisp, 0)}</td><td></td><td colspan="2" class="l">ingreso ${escUsdM(tAct).slice(1)} → ${escUsdM(tProp).slice(1)}</td><td></td>
        <td>${tDisp ? escF(tCosto / tDisp, 2) : '—'}</td><td class="${escPdfCls(tProp - tAct)}">${escUsdM(tProp - tAct)}</td></tr>
    </tbody></table>
    <div class="escpdf-nota">El total no suma dos veces el maíz (Maíz total = temprano + tardío). Resultado = ingreso con la estrategia − ingreso actual, en u$s totales.</div>
  </div>`;
}

function escPdfNotas() {
  return `<div class="escpdf-blk"><div class="escpdf-nota">
    <b>Cómo se calcula.</b> Precio final = (tn fijadas × precio fijado + tn a fijar y sin vender × mercado del escenario
    + resultado a vencimiento de los futuros y opciones abiertos + resultado de la estrategia) ÷ producción disponible.
    Primas de A3; otras plazas (Kansas) = MATBA + basis fijo. Precios indicativos.
  </div></div>`;
}

// Pasa cada bloque a imagen y los acomoda en hojas A5; un bloque que no entra en lo que
// queda de la hoja pasa a la siguiente (solo se corta si es más alto que una hoja entera).
// data-hoja="nueva": el bloque arranca hoja (cada cultivo y el consolidado).
async function escPdfArmar(host) {
  const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a5', orientation: 'portrait' });
  const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), k = pw / ESC_PDF_W;
  const util = ESC_PDF_H - ESC_PDF_PIE;
  let y = 0;   // la portada arranca pegada arriba
  for (const blk of [...host.children]) {
    const cv = await html2canvas(blk, { scale: 2, backgroundColor: '#ffffff', logging: false });
    const h = blk.offsetHeight, r = cv.height / h;
    const nueva = blk.dataset.hoja === 'nueva' && y > ESC_PDF_H / 3;   // en la portada el primer cultivo sigue abajo
    if (y > ESC_PDF_MARG && (nueva || y + Math.min(h, util - ESC_PDF_MARG) > util)) { pdf.addPage(); y = ESC_PDF_MARG; }
    for (let desde = 0; desde < h;) {
      const alto = Math.min(h - desde, util - y);
      const trozo = document.createElement('canvas');
      trozo.width = cv.width; trozo.height = Math.max(1, Math.round(alto * r));
      trozo.getContext('2d').drawImage(cv, 0, Math.round(desde * r), cv.width, trozo.height, 0, 0, cv.width, trozo.height);
      pdf.addImage(trozo.toDataURL('image/jpeg', 0.92), 'JPEG', 0, y * k, pw, alto * k);
      desde += alto; y += alto;
      if (desde < h) { pdf.addPage(); y = ESC_PDF_MARG; }
    }
  }
  // Franja arriba (desde la hoja 2) y pie con número de hoja
  const n = pdf.getNumberOfPages(), fecha = escPdfFecha();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    if (i > 1) { pdf.setFillColor(26, 107, 60); pdf.rect(0, 0, pw, 5, 'F'); }
    pdf.setDrawColor(200, 164, 74); pdf.setLineWidth(0.6); pdf.line(18, ph - 20, pw - 18, ph - 20);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(126, 133, 116);
    pdf.text(`Espartina S.A. · Escenarios de posición · ${fecha} · precios indicativos`, 18, ph - 10);
    pdf.text(`${i} / ${n}`, pw - 18, ph - 10, { align: 'right' });
  }
  const f = new Date(), dos = v => String(v).padStart(2, '0');
  pdf.save(`Escenarios posicion ${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}.pdf`);
}

async function escPdf() {
  if (!escPos) return;
  const btn = document.getElementById('esc-btn-pdf'), txt = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Generando PDF…'; }
  const host = document.createElement('div');
  host.className = 'escpdf';
  document.body.appendChild(host);
  try {
    await escPdfLibs();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const d = escState.delta, bloques = [escPdfCabecera(d)];
    escCrops().forEach(c => bloques.push(...escPdfCultivo(c, d, escPdfGrafico(c, d, host))));
    bloques.push(escPdfConsolidado(d), escPdfNotas());
    host.innerHTML = bloques.join('');
    await Promise.all([...host.querySelectorAll('img')].map(i => i.decode().catch(() => {})));
    await escPdfArmar(host);
  } catch (e) {
    alert('No pude generar el PDF: ' + e.message);
  } finally {
    host.remove();
    if (btn) { btn.disabled = false; btn.innerHTML = txt; }
  }
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
  await escLeerVinculado(false);
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

// Al volver a la pestaña (p.ej. después de regenerar el tablero) se relee el archivo vinculado
window.addEventListener('focus', () => { if (escMode) escLeerVinculado(false); });

escCargarGuardado();
