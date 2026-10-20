// ═══════════════════════════════════════════════════
// ─── RECOMENDACIONES DE OPERACIONES ───
// Lee las señales que ya calcula la Suite (relaciones de Spreads, VI y posición
// comercial) y propone operaciones con futuros y opciones de A3: qué operar, cuánto,
// dónde entrar, objetivos, stop y por qué. RECOMIENDA, NO EJECUTA.
//
// Fuentes (todas ya cargadas por otros módulos, acá no se duplica nada):
//   ASST_FUTPOS (futuros_posicion) → series de precios por posición y días al vto.
//   ASST_SERIE / ASST_VI_PERC      → VI ATM actual y percentiles por mes.
//   sheetData (A3)                 → precios en vivo, interés abierto y cadena de opciones.
//   escPos (Escenarios)            → posición comercial: tn sin precio por cultivo.
//   config_operaciones (opcional)  → tamaño de contrato y garantías por cultivo.
// Black-76: asstB76 de asistente.js. PDF: escPdfLibs de escenarios.js.
//
// Vive dentro del módulo Spreads: puntúa el par que esté seleccionado (Basis → spread,
// Relación → ratio) y arriba muestra el radar con las señales de REC_CONFIG.pares.
// El cálculo replica el de spCalcSpread (spreads.js) y respeta los años excluidos
// del filtro de campañas, para que los números coincidan con lo que muestra Spreads.
// ═══════════════════════════════════════════════════

// ─── Parámetros (editar acá) ───
const REC_CONFIG = {
  // Señales del radar (favoritos). desfase = año pos. 2 − año pos. 1
  //   'ratio'  = precio 1 / precio 2
  //   'spread' = precio 1 − precio 2, en USD/t (spreads entre posiciones y carry)
  //   'precio' = precio de una sola posición (coberturas direccionales; sin pata 2)
  pares: [
    { id: 'maiz_soja', nombre: 'Maíz ABR / Soja MAY', tipo: 'ratio', c1: 'maiz', m1: 'ABR', c2: 'soja', m2: 'MAY', desfase: 0 },
    { id: 'soja_nov_may', nombre: 'Soja NOV − MAY (vieja / nueva)', tipo: 'spread', c1: 'soja', m1: 'NOV', c2: 'soja', m2: 'MAY', desfase: 1 },
    { id: 'maiz_abr_jul', nombre: 'Maíz ABR − JUL (temprano / tardío)', tipo: 'spread', c1: 'maiz', m1: 'ABR', c2: 'maiz', m2: 'JUL', desfase: 0 },
    { id: 'trigo_carry', nombre: 'Trigo MAR − DIC (carry)', tipo: 'spread', c1: 'trigo', m1: 'MAR', c2: 'trigo', m2: 'DIC', desfase: -1 },
    { id: 'soja_precio', nombre: 'Soja MAY (cobertura)', tipo: 'precio', c1: 'soja', m1: 'MAY' },
    { id: 'maiz_precio', nombre: 'Maíz ABR (cobertura)', tipo: 'precio', c1: 'maiz', m1: 'ABR' },
    { id: 'trigo_precio', nombre: 'Trigo DIC (cobertura)', tipo: 'precio', c1: 'trigo', m1: 'DIC' },
  ],
  diasMinVto: 30,                 // se usa la primera posición del mes cuyas patas vencen en ≥ 30 días
  ajustarRetenciones: true,       // comparar campañas con las retenciones de la entrega actual (ver REC_RET_HIST)
  consistenciaEstacional: 2 / 3,  // la estacionalidad cuenta solo si ≥ 2 de cada 3 campañas van en el mismo sentido
  ruedasPiso: 5,                  // "encontró piso": ≥ 5 ruedas sin un extremo nuevo y pendiente de 10 ruedas plana o a favor
  pesos: { extremo: 0.40, estacional: 0.20, momentum: 0.15, persistencia: 0.15, vi: 0.10 },
  fuerte: 70, moderada: 50,       // clasificación del puntaje
  extremoMin: 50,                 // condición previa: con el extremo estadístico < 50 la señal queda Débil, sume lo que sume
  regimenPct: 80,                 // persistencia > 80% → posible cambio de régimen
  tramosSigma: [0, 1, 2],         // entradas: actual, ±1σ, ±2σ (⅓ del volumen cada una)
  stopSigma: 2.5,                 // stop: actual ∓ 2,5σ hist.
  stopFijo: null,                 // o un nivel fijo de relación (p.ej. 0.4800); null = usar stopSigma
  habilesAntesVto: 10,            // cerrar o rolar N días hábiles antes del vto de la primera pata
  topeVolumen: { fuerte: 0.30, moderada: 0.15, debil: 0 },   // % de las tn sin precio de la pata vendida
  viBaja: 30, viAlta: 70,         // percentiles de VI para preferir calls comprados / avisar calls vendidos
  liquidezPctIA: 0.10,            // contratos > 10% del interés abierto → aviso de liquidez
  tasa: 0.05,                     // tasa para Black-76
  // Valores manuales mientras no exista la pestaña config_operaciones
  contratoT: { soja: 100, maiz: 100, trigo: 100, girasol: 100 },
  garantiaUsdT: { soja: 20, maiz: 12, trigo: 15, girasol: 20 },
};

// Pestaña opcional con tamaño de contrato y garantías (mismo libro que futuros_posicion)
const REC_CONFIG_URL = 'https://docs.google.com/spreadsheets/d/1XBwsmTKJl_Vp9_4kLF_K6NS-eOFBLT9z3hme1w7n2ug/gviz/tq?tqx=out:csv&sheet=config_operaciones';

const REC_LBL = { soja: 'Soja', maiz: 'Maíz', trigo: 'Trigo', girasol: 'Girasol' };

// Cómo se nombra y se formatea cada tipo de señal (dec: valor · decD: cambios y pendientes)
const REC_TIPO = {
  ratio:  { lbl: 'Relación', el: 'la relación', El: 'La relación', dec: 4, decD: 4, eje: 2 },
  spread: { lbl: 'Spread', el: 'el spread', El: 'El spread', dec: 1, decD: 2, eje: 0 },
  precio: { lbl: 'Precio', el: 'el precio', El: 'El precio', dec: 1, decD: 2, eje: 0 },
};
function recComb(tipo, p1, p2) { return tipo === 'ratio' ? (p2 > 0 ? p1 / p2 : null) : tipo === 'spread' ? p1 - p2 : p1; }

// precioId: cobertura de precio abierta desde el radar (null = se muestra el par de los selectores)
let recState = { precioId: null, clave: null, estr: null, tnManual: null, senal: null, senales: {}, radarClave: null, cfgSheet: null, cfgEstado: 'pendiente' };
let recChSenal = null, recChPayoff = null;

// ─── Formatos: coma decimal; USD y % con 1 decimal; relaciones con 4 ───
const recF = (v, d) => (v == null || !isFinite(v)) ? '—' : v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const recR = v => recF(v, 4);
const recSig = (v, d) => (v == null || !isFinite(v)) ? '—' : (v < 0 ? '−' : '+') + recF(Math.abs(v), d);
const recUsd = v => recSig(v, 1);
const recMil = v => (v == null || !isFinite(v)) ? '—' : (v < 0 ? '−' : '+') + 'USD ' + recF(Math.abs(v) / 1000, 1) + ' mil';
const recT = v => Math.round(v).toLocaleString('es-AR');
const recClamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const recFk = f => String(f).slice(0, 10);
function recFecha(k) { const p = recFk(k).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function recHoy() { const h = new Date(); h.setHours(0, 0, 0, 0); return h; }
function recMean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; }
function recStd(a) { if (a.length < 2) return null; const m = recMean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); }
function recPendiente(a) {          // pendiente por observación (rueda) de una regresión lineal
  const n = a.length; if (n < 3) return null;
  const mx = (n - 1) / 2, my = recMean(a);
  let num = 0, den = 0;
  a.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; });
  return num / den;
}
function recRestarHabiles(fecha, n) {
  const d = new Date(fecha);
  while (n > 0) { d.setDate(d.getDate() - 1); if (asstBizDay(d)) n--; }
  return d;
}
function recHabilesEntre(a, b) {    // hábiles estrictamente entre a y b
  let n = 0; const d = new Date(a); d.setDate(d.getDate() + 1);
  while (d < b) { if (asstBizDay(d)) n++; d.setDate(d.getDate() + 1); }
  return n;
}
function recLegLbl(c, p) { return `${(REC_LBL[c] || c).toUpperCase()} ${p}`; }
function recMediana(a) { if (!a.length) return null; const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }

// ─── Retenciones históricas: para comparar campañas en el régimen de hoy ───
// Cada precio histórico se pasa a la retención de la entrega del contrato actual:
//   precio ajustado = (precio + fobbing) / (1 − ret. de entonces) × (1 − ret. de la entrega actual) − fobbing
// "Ret. de entonces" = la vigente (o ya anunciada para esa entrega) en la FECHA DEL PRECIO.
// Desde REC_RET_DESDE_CRONOGRAMA rige RET_SCHEDULE de globals.js; desde el anuncio del cronograma
// 2027–2028 (REC_RET_ANUNCIO) los contratos ya descuentan la alícuota de su mes de entrega.
// Cultivos sin tabla (trigo, girasol) no se ajustan. Fobbing: RET_DEFAULTS de globals.js.
const REC_RET_HIST = {
  soja: [{ desde: '2000-01-01', ret: 33 }, { desde: '2025-01-27', ret: 26 }, { desde: '2025-12-01', ret: 24 }],
  maiz: [{ desde: '2000-01-01', ret: 12 }, { desde: '2025-01-27', ret: 9.5 }, { desde: '2025-12-01', ret: 8.5 }],
};
const REC_RET_DESDE_CRONOGRAMA = '2025-12-01';
const REC_RET_ANUNCIO = '2026-05-21';

function recRetVigente(c, fk) {
  const t = REC_RET_HIST[c]; if (!t) return null;
  if (fk >= REC_RET_DESDE_CRONOGRAMA) { const d = recFecha(fk); return getRetencion(c, d.getFullYear(), d.getMonth() + 1); }
  let v = t[0].ret; t.forEach(x => { if (fk >= x.desde) v = x.ret; });
  return v;
}
function recRetEsperada(c, fk, anio, mes) {
  if (!REC_RET_HIST[c]) return null;
  return fk >= REC_RET_ANUNCIO ? getRetencion(c, anio, mes) : recRetVigente(c, fk);
}
// Devuelve el ajustador del par, o null si algún cultivo no tiene tabla (c2 null = señal de precio)
function recAjustador(c1, pos1, c2, pos2) {
  if (!REC_RET_HIST[c1] || (c2 && !REC_RET_HIST[c2])) return null;
  const obj = [null, getRetencionForPos(c1, pos1), c2 ? getRetencionForPos(c2, pos2) : null];
  const fob = [null, (RET_DEFAULTS[c1] || {}).fobbing || 0, c2 ? (RET_DEFAULTS[c2] || {}).fobbing || 0 : 0];
  if (obj[1] == null || (c2 && obj[2] == null)) return null;
  return { obj, fob, p(r, leg) {
    const rt = recRetEsperada(r.cultivo, recFk(r.fecha), r.anio_pos, r.mes_pos);
    if (rt == null) return r.precio;
    return (r.precio + fob[leg]) / (1 - rt / 100) * (1 - obj[leg] / 100) - fob[leg];
  } };
}

// ═══════════════════════════════════════════════════
// MOTOR DE SEÑALES
// ═══════════════════════════════════════════════════

// Primera posición del mes m1 con ≥ diasMinVto días y su par (mes m2, año + desfase), que también
// tiene que vencer en ≥ diasMinVto días. Las señales de precio no tienen pata 2.
function recResolverPar(par) {
  const pos2Lista = par.c2 ? spGetPositions(par.c2) : [];
  const vigente = (c, p) => { const d = spDteHoy(c, p); return d && d.dias >= REC_CONFIG.diasMinVto; };
  for (const pos1 of spGetPositions(par.c1).filter(p => p.slice(0, 3) === par.m1)) {
    if (!vigente(par.c1, pos1)) continue;
    if (!par.c2) return { pos1, pos2: null };
    const pos2 = par.m2 + String(parseInt(pos1.slice(3), 10) + par.desfase).padStart(2, '0');
    if (pos2Lista.includes(pos2) && vigente(par.c2, pos2)) return { pos1, pos2 };
  }
  return null;
}

// Por qué no hay par vigente: la próxima posición del mes vence pronto o la otra pata todavía no cotiza
function recSinParMotivo(par) {
  const lista = spGetPositions(par.c1).filter(p => p.slice(0, 3) === par.m1);
  const prox = lista.map(p => ({ p, d: spDteHoy(par.c1, p) })).find(x => x.d && x.d.dias >= 0);
  const partes = [];
  if (prox && prox.d.dias < REC_CONFIG.diasMinVto) partes.push(`${recLegLbl(par.c1, prox.p)} vence en ${prox.d.dias} días (mínimo ${REC_CONFIG.diasMinVto})`);
  if (par.c2) {
    const sig = lista.map(p => ({ p, d: spDteHoy(par.c1, p) })).find(x => x.d && x.d.dias >= REC_CONFIG.diasMinVto);
    if (sig) {
      const pos2 = par.m2 + String(parseInt(sig.p.slice(3), 10) + par.desfase).padStart(2, '0');
      if (!spGetPositions(par.c2).includes(pos2)) partes.push(`${recLegLbl(par.c2, pos2)} todavía no cotiza en futuros_posicion`);
    }
  }
  return `Sin par vigente${partes.length ? ': ' + partes.join(' y ') : ''}.`;
}

// ajustar = true: precios pasados a las retenciones de la entrega actual (null si no hay tabla para el par)
// Si el par trae pos1/pos2 (el seleccionado en Spreads) se usan esas posiciones tal cual.
function recSenal(par, ajustar) {
  const res = par.pos1 ? { pos1: par.pos1, pos2: par.pos2 || null } : recResolverPar(par);
  if (!res) return { error: recSinParMotivo(par) };
  // Años excluidos en el filtro de campañas de Spreads: no entran en la comparación histórica
  const excl = typeof spExcludedYears !== 'undefined' ? spExcludedYears : new Set();
  const tipo = par.tipo || 'ratio', T = REC_TIPO[tipo], precio = tipo === 'precio';
  const c1 = par.c1, c2 = precio ? null : par.c2, { pos1, pos2 } = res;
  const cfgRel = (typeof RS_REGLAS !== 'undefined' && RS_REGLAS.relaciones) || {};
  const ventana = cfgRel.ventanaDias || 20, minPts = cfgRel.minPuntosHist || 15;
  const aj = ajustar ? recAjustador(c1, pos1, c2, pos2) : null;
  if (ajustar && !aj) return { error: 'Sin tabla de retenciones para este par.', sinAjuste: true };
  const px1 = r => aj ? aj.p(r, 1) : r.precio, px2 = r => aj ? aj.p(r, 2) : r.precio;
  const comb = (r1, r2) => precio ? px1(r1) : (r2.precio > 0 ? recComb(tipo, px1(r1), px2(r2)) : null);

  // Serie del par actual (igual que Spreads; con ajuste, a las retenciones de su entrega)
  const d1 = {}, d2 = {};
  ASST_FUTPOS.forEach(r => {
    if (r.cultivo === c1 && r.pos === pos1) d1[recFk(r.fecha)] = r;
    if (!precio && r.cultivo === c2 && r.pos === pos2) d2[recFk(r.fecha)] = r;
  });
  const fechas = Object.keys(d1).filter(f => precio || f in d2).sort();
  const serie = fechas.map(f => {
    const p1 = px1(d1[f]), p2 = precio ? null : px2(d2[f]);
    return { fecha: f, p1, p2, dte1: d1[f].dias_vto, val: comb(d1[f], d2[f]) };
  }).filter(s => s.val !== null);
  if (serie.length < 20) return { error: precio ? `Pocos datos de ${recLegLbl(c1, pos1)}.` : `Pocos datos comunes entre ${recLegLbl(c1, pos1)} y ${recLegLbl(c2, pos2)}.` };
  const vals = serie.map(s => s.val);
  const ult = serie[serie.length - 1];
  const actual = ult.val, avgCamp = recMean(vals), stdCamp = recStd(vals);
  const minCamp = Math.min(...vals), maxCamp = Math.max(...vals);

  // Campañas anteriores equivalentes (mismo mes, mismo desfase de año)
  const mes1 = pos1.slice(0, 3), mes2 = precio ? null : pos2.slice(0, 3);
  const off = precio ? 0 : parseInt(pos2.slice(-2), 10) - parseInt(pos1.slice(-2), 10);
  const idx2 = {};
  if (!precio) ASST_FUTPOS.forEach(r => { if (r.cultivo === c2 && r.mes_label === mes2) (idx2[r.anio_pos + '|' + recFk(r.fecha)] = idx2[r.anio_pos + '|' + recFk(r.fecha)] || []).push(r); });
  const season = {};
  ASST_FUTPOS.forEach(r1 => {
    if (r1.cultivo !== c1 || r1.mes_label !== mes1) return;
    if (excl.has(r1.anio_pos) || (!precio && excl.has(r1.anio_pos + off))) return;
    if (precio) { if (r1.precio > 0) (season[r1.pos] = season[r1.pos] || []).push({ dte: r1.dias_vto, val: px1(r1) }); return; }
    (idx2[(r1.anio_pos + off) + '|' + recFk(r1.fecha)] || []).forEach(r2 => {
      const v = comb(r1, r2); if (v == null) return;
      const k = `${r1.pos}-${r2.pos}`;
      (season[k] = season[k] || []).push({ dte: r1.dias_vto, val: v });
    });
  });
  const curKey = precio ? pos1 : `${pos1}-${pos2}`;
  const histKeys = Object.keys(season).filter(k => k !== curKey);
  const histAll = histKeys.flatMap(k => season[k]);
  const curDte = ult.dte1;
  let histWin = histAll.filter(p => Math.abs(p.dte - curDte) <= ventana);
  const enVentana = histWin.length >= minPts;
  if (!enVentana) histWin = histAll;
  const histVals = histWin.map(p => p.val);
  if (histVals.length < minPts) return { error: 'No hay suficientes campañas anteriores para comparar.' };
  const histMean = recMean(histVals), sigH = recStd(histVals);
  const pctl = Math.round(histVals.filter(v => v <= actual).length / histVals.length * 100);
  const zHist = sigH ? (actual - histMean) / sigH : null;
  const zProp = stdCamp ? (actual - avgCamp) / stdCamp : null;
  const dir = actual < histMean ? 'baja' : 'alta';
  const f = dir === 'baja' ? 1 : -1;                    // +1: a favor si la relación sube

  // Dispersión entre campañas al mismo punto del ciclo
  const mediasCamp = histKeys.map(k => recMean(season[k].filter(p => Math.abs(p.dte - curDte) <= ventana).map(p => p.val))).filter(v => v != null);
  const nCamp = mediasCamp.length;

  // Fechas: vto de cada pata (desde los datos, como Spreads) y fecha límite
  const vto1 = spVtoDate(c1, pos1), vto2 = precio ? null : spVtoDate(c2, pos2);
  const vtoPrimera = vto1 && vto2 ? (vto1 <= vto2 ? vto1 : vto2) : (vto1 || vto2);
  const fechaLimite = vtoPrimera ? recRestarHabiles(vtoPrimera, REC_CONFIG.habilesAntesVto) : null;
  const dteSalida = vtoPrimera && vto1 ? Math.max(0, Math.round((vto1 - fechaLimite) / 864e5)) : 0;

  // Drift estacional: cambio de cada campaña entre el DTE actual y el DTE de salida.
  // Se usa la MEDIANA (una campaña rara no arrastra el resultado) y cuenta solo si al menos
  // consistenciaEstacional de las campañas van en el mismo sentido; si no, no hay patrón.
  const valEn = (pts, d) => {
    let c = pts.filter(p => Math.abs(p.dte - d) <= 3);
    if (!c.length) c = pts.filter(p => Math.abs(p.dte - d) <= 10);
    return c.length ? recMean(c.map(p => p.val)) : null;
  };
  const drifts = histKeys.map(k => { const a = valEn(season[k], curDte), b = valEn(season[k], dteSalida); return a != null && b != null ? b - a : null; }).filter(v => v != null);
  const drift = recMediana(drifts), driftProm = drifts.length ? recMean(drifts) : null;
  const nDriftFav = drifts.filter(v => f * v > 0).length;
  const nDriftSube = drifts.filter(v => v > 0).length;
  const nMismoSentido = drift == null ? 0 : drifts.filter(v => Math.sign(v) === Math.sign(drift)).length;
  const patronEst = drifts.length >= 3 && nMismoSentido / drifts.length >= REC_CONFIG.consistenciaEstacional;

  // Momentum: pendiente de las últimas 10 y 20 ruedas, extremo de la campaña y "piso":
  // ruedas desde el último mínimo (o máximo, si la relación está alta) de la campaña
  const slope10 = recPendiente(vals.slice(-10)), slope20 = recPendiente(vals.slice(-20));
  const enMin = actual <= minCamp + 1e-9, enMax = actual >= maxCamp - 1e-9;
  const idxExt = dir === 'baja' ? vals.lastIndexOf(minCamp) : vals.lastIndexOf(maxCamp);
  const ruedasDesdeExt = vals.length - 1 - idxExt;
  const piso = ruedasDesdeExt >= REC_CONFIG.ruedasPiso && f * (slope10 || 0) >= 0;

  // Persistencia: % de días de la campaña del mismo lado del promedio histórico (a su DTE)
  const maxD = Math.max(...histAll.map(p => p.dte), ...serie.map(s => s.dte1)) + ventana + 1;
  const suma = new Array(maxD + 2).fill(0), cnt = new Array(maxD + 2).fill(0);
  histAll.forEach(p => { if (p.dte >= 0) { suma[p.dte + 1] += p.val; cnt[p.dte + 1]++; } });
  for (let i = 1; i < suma.length; i++) { suma[i] += suma[i - 1]; cnt[i] += cnt[i - 1]; }
  const mediaHistEn = d => { const a = Math.max(0, d - ventana), b = Math.min(maxD, d + ventana) + 1; const n = cnt[b] - cnt[a]; return n ? (suma[b] - suma[a]) / n : null; };
  const lado = Math.sign(actual - histMean);
  const conRef = serie.map(s => ({ s, m: mediaHistEn(s.dte1) })).filter(x => x.m != null);
  const persistencia = conRef.length ? conRef.filter(x => Math.sign(x.s.val - x.m) === lado).length / conRef.length * 100 : null;
  const regimen = persistencia != null && persistencia > REC_CONFIG.regimenPct;

  // Curva histórica por DTE (bins de 5 días) para el gráfico
  const bins = {};
  histAll.forEach(p => { const b = Math.round(p.dte / 5) * 5; (bins[b] = bins[b] || []).push(p.val); });
  const curva = Object.keys(bins).map(Number).sort((a, b) => b - a).filter(b => bins[b].length >= 3)
    .map(b => ({ dte: b, m: recMean(bins[b]), s: recStd(bins[b]) || 0 }));

  // VI de cada pata
  const vi1 = recVI(c1), vi2 = precio ? null : recVI(c2);

  const s = {
    par, tipo, T, lbl: recParLbl(c1, pos1, c2, pos2, tipo), c1, c2, pos1, pos2, serie, actual, avgCamp, stdCamp, minCamp, maxCamp,
    histMean, sigH, pctl, zHist, zProp, dir, f, enVentana, ventana, curDte, nCampPrev: nCamp || histKeys.length,   // campañas con datos a este punto del ciclo
    nCamp, dispRango: nCamp ? [Math.min(...mediasCamp), Math.max(...mediasCamp)] : null, dispStd: recStd(mediasCamp),
    vto1, vto2, fechaLimite, dteSalida, drift, driftProm, nDrift: drifts.length, nDriftFav, nDriftSube, patronEst,
    slope10, slope20, enMin, enMax, ruedasDesdeExt, piso, persistencia, regimen, curva, vi1, vi2,
    p1Last: ult.p1, p2Last: ult.p2, ultFecha: ult.fecha,
    ajustado: !!aj, retObj: aj ? { r1: aj.obj[1], r2: aj.obj[2] } : null, exclAnios: excl.size ? [...excl].sort() : null,
    fv: v => recF(v, T.dec), fd: v => recSig(v, T.decD),
  };
  s.puntaje = recPuntaje(s);
  return s;
}

// "Maíz ABR27 / Soja MAY27" · "Maíz ABR27 − JUL27" · "Soja MAY27"
function recParLbl(c1, pos1, c2, pos2, tipo) {
  if (tipo === 'precio') return `${REC_LBL[c1]} ${pos1}`;
  if (tipo === 'spread') return c1 === c2 ? `${REC_LBL[c1]} ${pos1} − ${pos2}` : `${REC_LBL[c1]} ${pos1} − ${REC_LBL[c2]} ${pos2}`;
  return `${REC_LBL[c1]} ${pos1} / ${REC_LBL[c2]} ${pos2}`;
}

// Señal de un par en sus dos versiones: ajustada por retenciones (la que puntúa, salvo que se elija
// la otra) y sin ajustar (la que coincide con Spreads). La otra queda en s.alt.
function recCalcPar(par) {
  try {
    const sRaw = recSenal(par, false);
    const sAj = REC_CONFIG.ajustarRetenciones && !sRaw.error ? recSenal(par, true) : null;
    const hayAj = sAj && !sAj.error;
    const usarAj = hayAj && recState.ajuste !== false;
    const s = usarAj ? sAj : sRaw;
    if (!s.error) s.alt = usarAj ? sRaw : (hayAj ? sAj : null);
    return s;
  } catch (e) { console.error('Recomendaciones:', par.id, e); return { error: 'Error al calcular la señal: ' + e.message }; }
}

// VI ATM más reciente del cultivo y su percentil contra vi_percentiles del mes
function recVI(crop) {
  let u = null;
  ASST_SERIE.forEach(r => { if (r.cultivo === crop && r.vi_atm > 0 && (!u || recFk(r.fecha) > recFk(u.fecha))) u = r; });
  if (!u) return null;
  const mes = recFecha(u.fecha).getMonth() + 1, v = u.vi_atm;
  const p = ASST_VI_PERC.find(x => x.cultivo === crop && x.mes === mes);
  let pct = null;
  if (p) {
    const k = [[10, p.p10], [25, p.p25], [50, p.p50], [75, p.p75], [90, p.p90]];
    if (v <= k[0][1]) pct = recClamp(10 - (k[0][1] - v) / Math.max(k[1][1] - k[0][1], 0.1) * 15, 1, 10);
    else if (v >= k[4][1]) pct = recClamp(90 + (v - k[4][1]) / Math.max(k[4][1] - k[3][1], 0.1) * 15, 90, 99);
    else for (let i = 0; i < 4; i++) if (v <= k[i + 1][1]) { pct = k[i][0] + (v - k[i][1]) / Math.max(k[i + 1][1] - k[i][1], 1e-6) * (k[i + 1][0] - k[i][0]); break; }
  }
  return { vi: v, pct: pct == null ? null : Math.round(pct), fecha: recFk(u.fecha) };
}

// ─── Puntaje 0–100 con desglose ───
function recPuntaje(s) {
  const W = REC_CONFIG.pesos, sig = s.sigH || 1e-9;
  const comp = [];
  // 1. Extremo estadístico: distancia del percentil a P50 y |z hist.|
  const e = Math.abs(s.pctl - 50);
  const sExt = 0.5 * recClamp((e - 20) / 28 * 100) + 0.5 * recClamp((Math.abs(s.zHist || 0) - 0.5) / 1.5 * 100);
  comp.push({ k: 'extremo', lbl: 'Extremo estadístico', peso: W.extremo, sub: sExt,
    why: `P${s.pctl} y z hist. ${recSig(s.zHist, 2)}` });
  // 2. Estacionalidad: mediana del cambio hasta la fecha límite; sin patrón consistente queda neutra (50)
  let sEst = 50, whyEst = 'sin datos suficientes';
  if (s.drift != null && s.nDrift) {
    if (s.patronEst) {
      sEst = 0.5 * (50 + 50 * Math.max(-1, Math.min(1, s.f * s.drift / sig))) + 0.5 * (s.nDriftFav / s.nDrift * 100);
      whyEst = `mediana ${s.fd(s.drift)} hasta la fecha límite · ${s.nDriftFav} de ${s.nDrift} campañas a favor`;
    } else {
      whyEst = `sin patrón claro: subió en ${s.nDriftSube} de ${s.nDrift} campañas (mediana ${s.fd(s.drift)})`;
    }
  }
  comp.push({ k: 'estacional', lbl: 'Estacionalidad', peso: W.estacional, sub: sEst, why: whyEst });
  // 3. Momentum: penaliza entrar mientras sigue haciendo extremos nuevos y premia que "encuentre piso"
  //    (≥ ruedasPiso ruedas sin extremo nuevo y pendiente de 10 ruedas plana o a favor)
  const mFav = s.f * (((s.slope10 || 0) * 10 + (s.slope20 || 0) * 20) / 2) / sig;
  const extremoHoy = s.ruedasDesdeExt === 0;
  const sMom = recClamp(50 + 100 * mFav - (extremoHoy ? 15 : 0) + (s.piso ? 20 : 0));
  const nomExt = s.dir === 'baja' ? 'mínimo' : 'máximo';
  comp.push({ k: 'momentum', lbl: 'Momentum', peso: W.momentum, sub: sMom,
    why: `pendiente ${s.fd(s.slope10)} (10) · ${s.fd(s.slope20)} (20) por rueda · ` +
      (extremoHoy ? `${nomExt} de campaña hoy` : s.piso ? `encontró piso: ${s.ruedasDesdeExt} ruedas sin ${nomExt} nuevo` : `${s.ruedasDesdeExt} ruedas desde el ${nomExt}`) });
  // 4. Persistencia: muchos días del mismo lado = desvío estructural
  const sPer = s.persistencia == null ? 50 : recClamp((100 - s.persistencia) / 50 * 100);
  comp.push({ k: 'persistencia', lbl: 'Persistencia y régimen', peso: W.persistencia, sub: sPer,
    why: s.persistencia == null ? 'sin datos' : `${recF(s.persistencia, 1)} % de los días ${s.dir === 'baja' ? 'debajo' : 'encima'} del prom. histórico${s.regimen ? ' · posible cambio de régimen' : ''}` });
  // 5. VI adecuada (piso 50: los futuros no dependen de la VI)
  if (s.tipo === 'precio') {
    // Precio alto: puts comprados si la VI está baja (o calls vendidos si está alta). Precio bajo: calls comprados si está baja.
    const pc = s.vi1 && s.vi1.pct != null ? s.vi1.pct : null;
    const sVi = pc == null ? 50 : Math.max(50, s.dir === 'alta' ? Math.max(100 - pc, pc) : 100 - pc);
    comp.push({ k: 'vi', lbl: 'Volatilidad implícita', peso: W.vi, sub: sVi,
      why: `VI ${REC_LBL[s.c1].toLowerCase()} ${pc != null ? 'P' + pc : '—'} · ${s.dir === 'alta' ? 'puts comprados si está baja' : 'calls comprados si está baja'}` });
  } else {
    // La mejor de calls comprados en la pata barata o calls vendidos en la cara
    const viC = s.dir === 'baja' ? s.vi1 : s.vi2, viV = s.dir === 'baja' ? s.vi2 : s.vi1;
    const cC = s.dir === 'baja' ? s.c1 : s.c2, cV = s.dir === 'baja' ? s.c2 : s.c1;
    const sVi = Math.max(50, viC && viC.pct != null ? 100 - viC.pct : 0, viV && viV.pct != null ? viV.pct : 0);
    comp.push({ k: 'vi', lbl: 'Volatilidad implícita', peso: W.vi, sub: sVi,
      why: s.c1 === s.c2 ? `VI ${REC_LBL[s.c1].toLowerCase()} ${viC && viC.pct != null ? 'P' + viC.pct : '—'} (la misma para las dos patas)`
        : `VI ${REC_LBL[cC].toLowerCase()} ${viC && viC.pct != null ? 'P' + viC.pct : '—'} · VI ${REC_LBL[cV].toLowerCase()} ${viV && viV.pct != null ? 'P' + viV.pct : '—'}` });
  }
  comp.forEach(c => { c.sub = Math.round(c.sub); c.pts = c.sub * c.peso; });
  const total = Math.round(comp.reduce((a, c) => a + c.pts, 0));
  // Sin extremo no hay nada para operar: los otros componentes solo deciden cuándo y cuánto entrar
  const sinExtremo = comp[0].sub < REC_CONFIG.extremoMin;
  const clase = sinExtremo ? 'debil' : total >= REC_CONFIG.fuerte ? 'fuerte' : total >= REC_CONFIG.moderada ? 'moderada' : 'debil';
  return { comp, total, clase, sinExtremo };
}

// ═══════════════════════════════════════════════════
// MOTOR DE RECOMENDACIONES
// ═══════════════════════════════════════════════════

function recContratoT(c) { const x = recState.cfgSheet && recState.cfgSheet[c]; return (x && x.contrato > 0) ? x.contrato : (REC_CONFIG.contratoT[c] || 100); }
function recGarantia(c) { const x = recState.cfgSheet && recState.cfgSheet[c]; return (x && x.garantia > 0) ? x.garantia : (REC_CONFIG.garantiaUsdT[c] || 0); }

// Tn sin precio (a fijar + total a vender) del cultivo, desde la posición de Escenarios.
// Maíz: posición de JUN a DIC → tardío; el resto → temprano (si el tablero los trae separados).
function recSinPrecio(crop, pos) {
  if (typeof escPos === 'undefined' || !escPos || !escPos.cultivos) return null;
  let k = crop;
  if (crop === 'maiz' && escPos.cultivos.maiz_temp && escPos.cultivos.maiz_tard)
    k = (typeof ESC_MAIZ_TARDIO !== 'undefined' && ESC_MAIZ_TARDIO.includes(pos.slice(0, 3))) ? 'maiz_tard' : 'maiz_temp';
  const c = escPos.cultivos[k];
  if (!c) return null;
  return { tn: Math.max(0, (c.afijar || 0) + (c.tav || 0)), clave: k };
}

function recPrecioA3(c, p) {
  const f = typeof sheetData !== 'undefined' && sheetData && sheetData.futuros[c] && sheetData.futuros[c].find(x => x.pos === p);
  return f && f.precio > 0 ? { v: f.precio, ia: f.ia || null } : null;
}

// Arma la recomendación para la señal s y la estructura estr ('fisica' | 'spread' | 'calls').
// Relación: neutral en dólares. Spread: mismas toneladas en las dos patas y P&L en USD del spread.
// Mismo grano (calSp): la física es guardar la pata cercana; entre granos, reservar la barata.
function recArmar(s, estr) {
  const C = REC_CONFIG, baja = s.dir === 'baja', esSpread = s.tipo === 'spread', calSp = s.c1 === s.c2;
  const compra = baja ? { c: s.c1, p: s.pos1, i: 1 } : { c: s.c2, p: s.pos2, i: 2 };
  const venta = baja ? { c: s.c2, p: s.pos2, i: 2 } : { c: s.c1, p: s.pos1, i: 1 };
  const a1 = recPrecioA3(s.c1, s.pos1), a2 = recPrecioA3(s.c2, s.pos2);
  const P1 = a1 ? a1.v : s.p1Last, P2 = a2 ? a2.v : s.p2Last;
  const S = P2;                                  // P&L con la pata 2 fija en su precio actual
  const sig = s.sigH, R0 = s.actual, sg = baja ? -1 : 1;
  const px1 = (R, S1) => esSpread ? R + S1 : R * S1;   // precio de la pata 1 para un valor de la señal

  // Estructuras disponibles. En un spread, "física" es guardar el grano sin fijar (pata comprada,
  // la que vence primero) y vender el diferido: solo existe si la pata barata es la cercana.
  const spC = recSinPrecio(compra.c, compra.p), spV = recSinPrecio(venta.c, venta.p);
  const vtoC = compra.i === 1 ? s.vto1 : s.vto2, vtoV = venta.i === 1 ? s.vto1 : s.vto2;
  const compraCercana = !!(vtoC && vtoV && vtoC < vtoV);
  const hayFisica = calSp ? !!(compraCercana && spC && spC.tn > 0) : !!(spC && spV && spC.tn > 0 && spV.tn > 0);
  const viC = compra.i === 1 ? s.vi1 : s.vi2, viV = venta.i === 1 ? s.vi1 : s.vi2;
  const viBarata = !!(viC && viC.pct != null && viC.pct < C.viBaja);
  const viVentaCara = !!(viV && viV.pct != null && viV.pct > C.viAlta);
  // Entre posiciones del mismo grano no se sugieren calls: la prima suele ser mayor que todo el movimiento del spread
  const sugerida = hayFisica ? 'fisica' : (viBarata && !calSp ? 'calls' : 'spread');
  if (!estr || !REC_ESTR[estr] || (estr === 'fisica' && !hayFisica)) estr = sugerida;

  // Volumen: tope según la señal sobre las tn sin precio de la pata vendida
  // (mismo grano con física: sobre las tn que se guardan)
  const tope = C.topeVolumen[s.puntaje.clase] || 0;
  const spBase = calSp && estr === 'fisica' ? spC : spV;
  const base = recState.tnManual != null ? recState.tnManual : (spBase ? spBase.tn : 0);
  const V = tope * base;
  const ctV = recContratoT(venta.c), ctC = recContratoT(compra.c);
  const sinVolumen = !(V >= ctV * 3);
  const vTramo = sinVolumen ? ctV : Math.max(ctV, Math.round(V / 3 / ctV) * ctV);

  // Calls de la pata comprada: strike apenas fuera del dinero, prima de A3 si hay o Black-76
  const dteC = Math.max(1, (compra.i === 1 ? s.vto1 : s.vto2) ? Math.round(((compra.i === 1 ? s.vto1 : s.vto2) - recHoy()) / 864e5) : s.curDte);
  const cadena = typeof sheetData !== 'undefined' && sheetData && sheetData.opciones[compra.c] && sheetData.opciones[compra.c][compra.p];
  const sigC = viC ? viC.vi / 100 : 0.20;
  // usarA3: solo el tramo 1 toma strike y prima de la cadena (si hay un strike a ≤ 5% del precio);
  // los tramos 2 y 3 todavía no tienen precio, así que se valúan con Black-76.
  const callPara = (F, usarA3) => {
    const calls = usarA3 && cadena ? cadena.calls.filter(o => o.strike >= F && o.strike <= F * 1.05 && o.prima > 0) : [];
    if (calls.length) return { k: calls[0].strike, prima: calls[0].prima, fuente: 'A3' };
    const k = Math.ceil(F / 5) * 5;
    return { k, prima: asstB76(F, k, dteC / 365, C.tasa, sigC, 'call'), fuente: 'Black-76' };
  };

  const tramos = C.tramosSigma.map((k, i) => {
    const r = R0 + sg * k * sig;
    const qV = vTramo;
    const qC = Math.max(ctC, Math.round(qV * (esSpread ? 1 : baja ? 1 / r : r) / ctC) * ctC);
    const t = { n: i + 1, k, r, qV, qC, p1e: px1(r, S), p2e: S, cuando: (k === 0 ? (s.piso ? 'Hoy (valor actual, con piso)' : 'Al confirmar piso')
        : `${sg < 0 ? '−' : '+'}${k}σ hist.${s.piso ? '' : ', con piso'}`) };
    if (estr === 'calls') Object.assign(t, callPara(baja ? t.p1e : S, i === 0));
    return t;
  });

  // P&L de la estructura a un valor R de la señal, con la pata 2 en S1 (P1 = R × S1, o R + S1 en un spread)
  const pnl = (R, S1, ts) => ts.reduce((a, t) => {
    const p1 = px1(R, S1), p2 = S1;
    const q1 = baja ? t.qC : -t.qV, q2 = baja ? -t.qV : t.qC;
    if (estr !== 'calls') return a + q1 * (p1 - t.p1e) + q2 * (p2 - t.p2e);
    const pCompra = baja ? p1 : p2;
    const opc = (baja ? t.qC : t.qC) * (Math.max(pCompra - t.k, 0) - t.prima);
    const fut = baja ? q2 * (p2 - t.p2e) : q1 * (p1 - t.p1e);
    return a + opc + fut;
  }, 0);

  // Niveles
  const fijo = C.stopFijo != null && !esSpread;          // stopFijo es un nivel de relación
  const stop = fijo ? C.stopFijo : R0 + sg * C.stopSigma * sig;
  const niveles = [
    { k: 'Objetivo 1', lbl: 'Promedio de la campaña', r: s.avgCamp },
    { k: 'Objetivo 2', lbl: baja ? 'Techo del rango de la campaña' : 'Piso del rango de la campaña', r: baja ? s.maxCamp : s.minCamp },
    { k: 'Objetivo extendido', lbl: 'Promedio histórico' + (s.regimen ? ' · no contar con esto (posible cambio de régimen)' : ''), r: s.histMean, ext: s.regimen },
    { k: 'Stop', lbl: fijo ? 'Nivel fijo' : `Actual ${sg < 0 ? '−' : '+'} ${recF(C.stopSigma, 1)}σ hist.`, r: stop, stop: true },
  ];
  niveles.forEach(n => { n.superado = !n.stop && (baja ? n.r <= R0 : n.r >= R0); });
  const t1 = [tramos[0]];
  const rb = ts => { const g = pnl(niveles[0].r, S, ts), l = pnl(stop, S, ts); return g > 0 && l < 0 ? -g / l : null; };

  // Garantías y primas
  const qVTot = tramos.reduce((a, t) => a + t.qV, 0), qCTot = tramos.reduce((a, t) => a + t.qC, 0);
  const garV = qVTot * recGarantia(venta.c);
  const garC = estr === 'spread' ? qCTot * recGarantia(compra.c) : 0;
  const primas = estr === 'calls' ? tramos.reduce((a, t) => a + t.qC * t.prima, 0) : 0;

  return { estr, sugerida, hayFisica, compraCercana, viBarata, viVentaCara, viC, viV, compra, venta, P1, P2, a1, a2, S, px1,
    tope, base, spBase, spV, spC, V, sinVolumen, ctV, ctC, tramos, niveles, pnl, t1, rb1: rb(t1), rb3: rb(tramos),
    qVTot, qCTot, garV, garC, primas, dteC };
}

// Cobertura direccional de una posición (señal de precio). Espartina está larga en física:
//   precio alto → cubrir: venta de futuro o puts comprados (si la VI está baja)
//   precio bajo → no cubrir; si hay que vender física, recomprar la suba con calls
function recArmarPrecio(s, estr) {
  const C = REC_CONFIG, alta = s.dir === 'alta', sg = alta ? 1 : -1;
  const a1 = recPrecioA3(s.c1, s.pos1), P = a1 ? a1.v : s.p1Last;
  const sig = s.sigH, R0 = s.actual;
  const vi = s.vi1, viPct = vi && vi.pct != null ? vi.pct : null;
  const viBarata = viPct != null && viPct < C.viBaja, viCara = viPct != null && viPct > C.viAlta;
  const disp = alta ? ['venta', 'puts'] : ['calls'];
  const sugerida = alta ? (viBarata ? 'puts' : 'venta') : 'calls';
  if (!estr || !disp.includes(estr)) estr = sugerida;

  // Volumen: tope según la señal sobre las tn sin precio del grano
  const tope = C.topeVolumen[s.puntaje.clase] || 0;
  const sp = recSinPrecio(s.c1, s.pos1);
  const base = recState.tnManual != null ? recState.tnManual : (sp ? sp.tn : 0);
  const V = tope * base, ct = recContratoT(s.c1);
  const sinVolumen = !(V >= ct * 3);
  const qTramo = sinVolumen ? ct : Math.max(ct, Math.round(V / 3 / ct) * ct);

  // Opciones: strike apenas fuera del dinero; tramo 1 con prima de A3 si hay, el resto con Black-76
  const tp = estr === 'puts' ? 'put' : 'call';
  const dte = Math.max(1, s.vto1 ? Math.round((s.vto1 - recHoy()) / 864e5) : s.curDte);
  const cadena = typeof sheetData !== 'undefined' && sheetData && sheetData.opciones[s.c1] && sheetData.opciones[s.c1][s.pos1];
  const sigma = vi ? vi.vi / 100 : 0.20;
  const opcPara = (F, usarA3) => {
    const lista = !usarA3 || !cadena ? [] : tp === 'put'
      ? cadena.puts.filter(o => o.strike <= F && o.strike >= F * 0.95 && o.prima > 0).sort((a, b) => b.strike - a.strike)
      : cadena.calls.filter(o => o.strike >= F && o.strike <= F * 1.05 && o.prima > 0).sort((a, b) => a.strike - b.strike);
    if (lista.length) return { k: lista[0].strike, prima: lista[0].prima, fuente: 'A3' };
    const k = tp === 'put' ? Math.floor(F / 5) * 5 : Math.ceil(F / 5) * 5;
    return { k, prima: asstB76(F, k, dte / 365, C.tasa, sigma, tp), fuente: 'Black-76' };
  };

  // Tramos: venta/puts en el valor actual, +1σ y +2σ; calls en el actual, −1σ y −2σ
  const tramos = C.tramosSigma.map((k, i) => {
    const r = R0 + sg * k * sig;
    const t = { n: i + 1, k, r, q: qTramo, cuando: k === 0 ? (s.piso ? 'Hoy (valor actual, con piso)' : 'Al confirmar piso')
      : `${sg < 0 ? '−' : '+'}${k}σ hist.${s.piso ? '' : ', con piso'}` };
    if (estr !== 'venta') Object.assign(t, opcPara(r, i === 0));
    return t;
  });

  // P&L de la cobertura sola (sin la física) a un precio X al vencimiento
  const pnl = (X, ts) => ts.reduce((a, t) => a + t.q * (
    estr === 'venta' ? t.r - X : estr === 'puts' ? Math.max(t.k - X, 0) - t.prima : Math.max(X - t.k, 0) - t.prima), 0);

  const stop = R0 + sg * C.stopSigma * sig;   // stopFijo es un nivel de relación: acá no aplica
  const niveles = [
    { k: 'Objetivo 1', lbl: 'Promedio de la campaña', r: s.avgCamp },
    { k: 'Objetivo 2', lbl: alta ? 'Piso del rango de la campaña' : 'Techo del rango de la campaña', r: alta ? s.minCamp : s.maxCamp },
    { k: 'Objetivo extendido', lbl: 'Promedio histórico' + (s.regimen ? ' · no contar con esto (posible cambio de régimen)' : ''), r: s.histMean, ext: s.regimen },
    { k: 'Invalidación', lbl: `Actual ${sg < 0 ? '−' : '+'} ${recF(C.stopSigma, 1)}σ hist.`, r: stop, stop: true },
  ];
  niveles.forEach(n => { n.superado = !n.stop && (alta ? n.r >= R0 : n.r <= R0); });
  const t1 = [tramos[0]];
  const rb = ts => { const g = pnl(niveles[0].r, ts), l = pnl(stop, ts); return g > 0 && l < 0 ? -g / l : null; };

  const qTot = tramos.reduce((a, t) => a + t.q, 0);
  const gar = estr === 'venta' ? qTot * recGarantia(s.c1) : 0;
  const primas = estr === 'venta' ? 0 : tramos.reduce((a, t) => a + t.q * t.prima, 0);

  return { estr, sugerida, disp, alta, P, a1, vi, viPct, viBarata, viCara, tope, base, sp, V, sinVolumen, ct,
    tramos, niveles, pnl, t1, rb1: rb(t1), rb3: rb(tramos), qTot, gar, primas, dte };
}

// ═══════════════════════════════════════════════════
// FUENTES
// ═══════════════════════════════════════════════════

async function recCargarConfig() {
  if (recState.cfgEstado !== 'pendiente') return;
  recState.cfgEstado = 'cargando';
  try {
    const t = await (await fetch(REC_CONFIG_URL)).text();
    const rows = Papa.parse(t.trim(), { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
    // gviz devuelve la primera pestaña si la pedida no existe: se valida por columnas
    if (!rows.length || !('cultivo' in rows[0]) || !('garantia_usd_t' in rows[0])) throw new Error('sin pestaña');
    const cfg = {};
    rows.forEach(r => {
      const c = String(r.cultivo || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (c) cfg[c] = { contrato: +r.tamano_contrato_t || null, garantia: +r.garantia_usd_t || null };
    });
    recState.cfgSheet = cfg; recState.cfgEstado = 'ok';
  } catch (e) { recState.cfgSheet = null; recState.cfgEstado = 'falta'; }
}

function recUltimaFecha(arr) { let m = ''; arr.forEach(r => { const k = recFk(r.fecha); if (k > m) m = k; }); return m || null; }

function recEstadoFuentes() {
  const hoy = recHoy();
  const porAtraso = k => { if (!k) return 'mal'; const n = recHabilesEntre(recFecha(k), hoy); return n <= 1 ? 'ok' : n <= 5 ? 'warn' : 'mal'; };
  const fmt = k => k ? spFmtFecha(recFecha(k)) : 'sin datos';
  const fFut = recUltimaFecha(ASST_FUTPOS), fVi = recUltimaFecha(ASST_SERIE);
  const pos = typeof escPos !== 'undefined' && escPos;
  const posFecha = pos ? new Date(pos.archivoMod || pos.importado) : null;
  const posEdad = posFecha ? (hoy - posFecha) / 864e5 : null;
  return [
    { lbl: 'Precios A3 en vivo', det: typeof sheetData !== 'undefined' && sheetData ? (sheetData.fechaDatos || 'cargado') : 'sin conexión',
      est: typeof sheetData !== 'undefined' && sheetData ? 'ok' : 'mal' },
    { lbl: 'Históricos MATba', sub: 'futuros_posicion', det: fmt(fFut), est: porAtraso(fFut) },
    { lbl: 'Volatilidad implícita', sub: 'serie_vi_diaria, vi_percentiles', det: fmt(fVi), est: porAtraso(fVi) },
    { lbl: 'Posición comercial', sub: pos ? (pos.archivoNombre || 'tablero') : 'sin cargar',
      det: pos ? posFecha.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'cargala en Escenarios → Vincular tablero',
      est: !pos ? 'mal' : posEdad > 7 ? 'warn' : 'ok' },
    { lbl: 'config_operaciones', sub: recState.cfgEstado === 'ok' ? 'cargada' : 'falta la pestaña',
      det: recState.cfgEstado === 'ok' ? 'contrato y garantías desde la planilla' : 'garantías y contrato: valores manuales',
      est: recState.cfgEstado === 'ok' ? 'ok' : recState.cfgEstado === 'falta' ? 'mal' : 'warn' },
  ];
}

// ═══════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════

function recCss() {
  if (document.getElementById('rec-css')) return;
  const st = document.createElement('style');
  st.id = 'rec-css';
  st.textContent = `
.rc-scope { --marca:#006e5a; --marca-claro:#e3f1ed; --terra:#a54132; --terra-claro:#f6e6e2; --oro:#d79b23; --oro-claro:#fbf1dc;
  --tinta:#10120f; --tinta2:#53544e; --mudo:#8b8a83; --plano:#f4f3ef; --sup:#fbfaf7; --blanco:#fff; --borde:#e2e0d8; --borde2:#cfccc1;
  --ok:#0ca30c; --warn:#fab219; --mal:#d03b3b; color:var(--tinta); }
.rc-scope .num { font-family: var(--mono); }
.rc-banda { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
.rc-banda .rc-banda-txt { flex:1; min-width:240px; font-size:12px; color:var(--tinta2); line-height:1.5; }
.rc-banda .rc-banda-txt b.t { color:var(--tinta); font-size:13px; }
.rc-banda .rc-total-n { font-family:var(--mono); font-size:26px; font-weight:700; }
details.rc-radar > summary { cursor:pointer; list-style:none; }
details.rc-radar > summary::-webkit-details-marker { display:none; }
details.rc-radar > summary .rc-card-h { margin-bottom:0; }
details.rc-radar[open] > summary .rc-card-h { margin-bottom:10px; }
.rc-h2 { font-size:16px; font-weight:700; margin:6px 0 12px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
.rc-top { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; margin-bottom:14px; }
.rc-h1 { font-size:20px; font-weight:700; }
.rc-sub { font-size:12px; color:var(--tinta2); margin-top:3px; max-width:760px; line-height:1.5; }
.rc-btn { font-family:inherit; font-size:12px; font-weight:600; padding:8px 14px; border-radius:7px; cursor:pointer; border:1px solid var(--marca); background:var(--marca); color:#fff; }
.rc-btn.out { background:var(--blanco); color:var(--tinta2); border-color:var(--borde2); }
.rc-btn:disabled { opacity:.6; cursor:wait; }
.rc-card { background:var(--blanco); border:1px solid var(--borde); border-radius:12px; padding:16px 18px; margin-bottom:16px; box-shadow:0 1px 3px rgba(16,18,15,.04); }
.rc-card-h { font-size:11px; font-weight:700; letter-spacing:.6px; text-transform:uppercase; color:var(--mudo); margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
.rc-card-h .rc-aux { text-transform:none; letter-spacing:0; font-weight:500; }
.rc-fuentes { display:flex; gap:8px; flex-wrap:wrap; }
.rc-fuente { display:flex; align-items:center; gap:8px; font-size:11px; padding:7px 11px; border-radius:8px; border:1px solid var(--borde); background:var(--sup); }
.rc-dot { width:9px; height:9px; border-radius:50%; flex:none; }
.rc-dot.ok { background:var(--ok); } .rc-dot.warn { background:var(--warn); } .rc-dot.mal { background:var(--mal); }
.rc-fuente .num { color:var(--tinta2); }
.rc-tabla { width:100%; border-collapse:collapse; font-size:12px; }
.rc-tabla th { text-align:left; font-size:10px; font-weight:700; color:var(--mudo); text-transform:uppercase; letter-spacing:.4px; padding:6px 8px; border-bottom:2px solid var(--marca); }
.rc-tabla td { padding:7px 8px; border-bottom:1px solid var(--borde); vertical-align:middle; }
.rc-tabla td.r, .rc-tabla th.r { text-align:right; }
.rc-tabla tr.sel td { background:var(--marca-claro); }
.rc-tabla tr.clic { cursor:pointer; }
.rc-tabla tr.gris td { color:var(--mudo); }
.rc-tabla tr.ext td { opacity:.7; }
.rc-tabla td.pnl-pos { color:var(--marca); font-weight:700; }
.rc-tabla td.pnl-neg { color:var(--terra); font-weight:700; }
.rc-score { display:inline-flex; align-items:center; gap:8px; }
.rc-score-bar { width:90px; height:8px; border-radius:4px; background:var(--plano); overflow:hidden; }
.rc-score-bar span { display:block; height:100%; border-radius:4px; }
.rc-badge { font-size:10px; font-weight:700; padding:3px 8px; border-radius:10px; white-space:nowrap; display:inline-block; }
.rc-badge.fuerte { background:var(--marca); color:#fff; }
.rc-badge.moderada { background:var(--oro); color:#fff; }
.rc-badge.debil { background:var(--plano); color:var(--tinta2); border:1px solid var(--borde2); }
.rc-badge.flag { background:var(--terra-claro); color:var(--terra); }
.rc-grid2 { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(0,1fr); gap:16px; }
@media (max-width:1100px) { .rc-grid2 { grid-template-columns:minmax(0,1fr); } }
.rc-tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:8px; margin-bottom:14px; }
.rc-tile { border:1px solid var(--borde); border-radius:10px; padding:10px 12px; background:var(--sup); }
.rc-tile .k { font-size:10px; font-weight:700; color:var(--mudo); text-transform:uppercase; letter-spacing:.4px; }
.rc-tile .v { font-family:var(--mono); font-size:19px; font-weight:700; margin-top:3px; }
.rc-tile .d { font-size:10.5px; color:var(--tinta2); margin-top:2px; line-height:1.35; }
.rc-tile.neg .v { color:var(--terra); } .rc-tile.pos .v { color:var(--marca); }
.rc-chart-box { position:relative; height:270px; }
.rc-desg { display:flex; flex-direction:column; gap:9px; }
.rc-desg-row { display:grid; grid-template-columns:170px 1fr 56px; gap:10px; align-items:center; font-size:12px; }
.rc-desg-row .lbl b { display:block; font-weight:600; }
.rc-desg-row .lbl small { color:var(--mudo); font-size:10.5px; }
.rc-desg-bar { height:12px; background:var(--plano); border-radius:6px; position:relative; overflow:hidden; }
.rc-desg-bar span { position:absolute; left:0; top:0; bottom:0; border-radius:6px; }
.rc-desg-row .pts { font-family:var(--mono); font-weight:700; text-align:right; }
.rc-desg-why { grid-column:2 / 4; font-size:10.5px; color:var(--tinta2); margin-top:-5px; }
.rc-total { display:flex; justify-content:space-between; align-items:center; border-top:2px solid var(--borde); padding-top:10px; margin-top:4px; }
.rc-total .num { font-size:26px; font-weight:700; color:var(--marca); }
.rc-reco { border:2px solid var(--marca); }
.rc-reco-title { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.rc-reco-title h2 { margin:0; font-size:18px; }
.rc-reco-meta { font-size:11.5px; color:var(--tinta2); margin-top:4px; }
.rc-chips { display:flex; gap:6px; flex-wrap:wrap; margin:14px 0 6px; }
.rc-chip { font-family:inherit; font-size:11.5px; padding:7px 12px; border-radius:8px; cursor:pointer; border:1px solid var(--borde2); background:var(--blanco); color:var(--tinta2); text-align:left; }
.rc-chip.on { border-color:var(--marca); background:var(--marca-claro); color:var(--marca); font-weight:700; }
.rc-chip small { display:block; font-weight:500; font-size:10px; color:var(--mudo); margin-top:2px; }
.rc-estr-why { font-size:11.5px; color:var(--tinta2); background:var(--sup); border:1px solid var(--borde); border-radius:8px; padding:8px 11px; margin-bottom:10px; line-height:1.5; }
.rc-base { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:11.5px; color:var(--tinta2); margin-bottom:4px; }
.rc-base input { font-family:var(--mono); font-size:12px; width:110px; padding:5px 8px; border:1px solid var(--borde2); border-radius:6px; }
.rc-aviso { font-size:11.5px; color:var(--terra); background:var(--terra-claro); border-radius:8px; padding:8px 11px; margin:8px 0; line-height:1.5; }
.rc-sec { font-size:12px; font-weight:700; color:var(--marca); margin:16px 0 6px; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
.rc-sec small { font-weight:500; color:var(--mudo); font-size:11px; }
.rc-note { font-size:11px; color:var(--tinta2); margin-top:6px; line-height:1.5; }
.rc-kv { display:flex; gap:12px; flex-wrap:wrap; font-size:12px; margin-top:8px; }
.rc-kv div { background:var(--sup); border:1px solid var(--borde); border-radius:8px; padding:8px 12px; }
.rc-kv span { display:block; font-size:10px; color:var(--mudo); font-weight:700; text-transform:uppercase; letter-spacing:.4px; }
.rc-kv b { font-family:var(--mono); font-size:14px; }
.rc-payoff-box { position:relative; height:300px; }
.rc-lists { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media (max-width:900px) { .rc-lists { grid-template-columns:1fr; } }
.rc-list { font-size:12px; line-height:1.55; padding-left:18px; margin:4px 0 0; }
.rc-list li { margin-bottom:5px; }
.rc-list.riesgos li::marker { color:var(--terra); }
.rc-acciones { display:flex; gap:8px; flex-wrap:wrap; margin-top:16px; }
.rc-legal { margin-top:14px; font-size:11px; font-style:italic; color:var(--tinta2); background:var(--plano); border-left:3px solid var(--oro); padding:8px 12px; border-radius:0 6px 6px 0; }
details.rc-cfg summary { cursor:pointer; font-size:12px; font-weight:700; color:var(--tinta2); }
.rc-cfg-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:10px; margin-top:12px; }
.rc-cfg-grid div { font-size:11.5px; background:var(--sup); border:1px solid var(--borde); border-radius:8px; padding:8px 11px; line-height:1.5; }
.rc-cfg-grid b { font-family:var(--mono); }
.rc-scroll { overflow-x:auto; }
.rc-vacio { font-size:12.5px; color:var(--tinta2); padding:24px; text-align:center; }
@media (max-width:700px) { .rc-desg-row { grid-template-columns:120px 1fr 52px; } }`;
  document.head.appendChild(st);
}

// ─── Render dentro de Spreads ───
// Tres lugares del módulo: #sp-rec-radar (arriba de los selectores), #sp-rec-banda (debajo
// de los recuadros: puntaje del par en una línea) y #sp-rec (señal completa + recomendación).

// Par armado desde los selectores de Spreads: Basis → 'spread', Relación → 'ratio'
function recParSeleccion() {
  const v = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const c1 = v('sp-crop1'), c2 = v('sp-crop2'), pos1 = v('sp-pos1'), pos2 = v('sp-pos2');
  if (!pos1 || !pos2 || (c1 === c2 && pos1 === pos2)) return null;
  const tipo = spMode === 'basis' ? 'spread' : 'ratio';
  return { id: 'sel', nombre: recParLbl(c1, pos1, c2, pos2, tipo), tipo, c1, c2, pos1, pos2,
    m1: pos1.slice(0, 3), m2: pos2.slice(0, 3), desfase: parseInt(pos2.slice(3), 10) - parseInt(pos1.slice(3), 10) };
}

// Señales del radar: se recalculan solo si cambian los datos, el filtro de campañas o el ajuste
function recSpRadar() {
  const clave = [ASST_FUTPOS.length, recUltimaFecha(ASST_FUTPOS), [...spExcludedYears].sort().join(','), recState.ajuste].join('|');
  if (clave === recState.radarClave) return;
  recState.senales = {};
  REC_CONFIG.pares.forEach(p => { recState.senales[p.id] = recCalcPar(p); });
  recState.radarClave = clave;
}

// Se puede armar la operación mientras no haya pasado la fecha límite (vto. de la primera pata − hábiles)
function recOperable(s) { return !s.fechaLimite || s.fechaLimite >= recHoy(); }

// Varios cambios seguidos de los selectores (cultivo → posición → modo) se agrupan en un solo cálculo
let recSpTimer = null;
function recSpProgramar() { clearTimeout(recSpTimer); recSpTimer = setTimeout(recSpRender, 0); }

function recSpRender() {
  recCss();
  const hRadar = document.getElementById('sp-rec-radar'), hBanda = document.getElementById('sp-rec-banda'), host = document.getElementById('sp-rec');
  if (!host || !hRadar || !hBanda) return;
  if (!ASST_FUTPOS.length) {
    hRadar.innerHTML = hBanda.innerHTML = '';
    host.innerHTML = `<div class="rc-card"><div class="rc-vacio">⏳ Cargando datos históricos…</div></div>`;
    return;
  }
  recSpRadar();
  const parPrecio = recState.precioId && REC_CONFIG.pares.find(p => p.id === recState.precioId);
  const par = parPrecio || recParSeleccion();
  const s = !par ? { error: 'Seleccioná dos posiciones diferentes.' } : parPrecio ? recState.senales[par.id] : recCalcPar(par);
  // Al cambiar de par se vuelve a la estructura sugerida y a la base de la posición comercial
  const clave = par ? [par.tipo, par.c1, par.pos1 || par.m1, par.c2, par.pos2 || par.m2].join('|') : '';
  if (clave !== recState.clave) { recState.clave = clave; recState.estr = null; recState.tnManual = null; }
  recState.senal = s.error ? null : s;

  const fuentes = recEstadoFuentes().map(f => `<div class="rc-fuente"><span class="rc-dot ${f.est}"></span><div><b>${f.lbl}</b>${f.sub ? ' · ' + escHtml(f.sub) : ''}<br><span class="num">${escHtml(f.det)}</span></div></div>`).join('');
  const operable = !s.error && recOperable(s);
  const avisoVig = s.error || operable ? recAvisoVto(s) : `<div class="rc-card"><div class="rc-aviso" style="margin:0"><b>Fecha límite vencida:</b> la fecha límite para operar ${escHtml(s.lbl)} fue el ${spFmtFecha(s.fechaLimite)} (vto. de la primera pata menos ${REC_CONFIG.habilesAntesVto} hábiles). El puntaje queda como referencia${s.ultFecha ? `, con el último dato del ${spFmtFecha(recFecha(s.ultFecha))}` : ''}; no se arma operación.</div></div>`;
  const volver = parPrecio ? `<div class="rc-card"><div class="rc-aviso" style="margin:0;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;"><span>Se muestra la <b>cobertura de precio ${escHtml(s.lbl || par.nombre)}</b> elegida en el radar. Los recuadros y gráficos de arriba siguen siendo del par de los selectores.</span><button class="rc-btn out" onclick="recState.precioId=null;recSpRender();">Volver al par seleccionado</button></div></div>` : '';

  hRadar.innerHTML = recHtmlRadar(par);
  hBanda.innerHTML = recHtmlBanda(s, par, operable);
  host.innerHTML = `
  <div class="rc-h2"><span>💡 Señal y recomendación${s.lbl ? ' · ' + escHtml(s.lbl) : ''}</span>
    <span style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="rc-btn out" onclick="recRecargar()">🔄 Recalcular</button>
      <button class="rc-btn out" onclick="const d=document.getElementById('rc-cfg');d.open=true;d.scrollIntoView({behavior:'smooth'})">⚙ Parámetros</button>
    </span></div>
  ${volver}
  <div class="rc-card"><div class="rc-card-h">Estado de las fuentes</div><div class="rc-fuentes">${fuentes}</div></div>
  ${s.error ? `<div class="rc-card"><div class="rc-vacio">⚠️ ${par ? escHtml(par.nombre) + ': ' : ''}${escHtml(s.error)}</div></div>`
    : recHtmlSenal(s) + avisoVig + (operable ? `<div class="rc-card rc-reco" id="rc-tarjeta"></div>` : '')}
  ${recHtmlCfg()}`;

  if (!s.error) { recDibujarSenal(s); if (operable) recRenderTarjeta(); }
}

// Par elegido a mano que vence pronto: se puede operar, pero con poco margen
function recAvisoVto(s) {
  if (s.error) return '';
  const patas = [[s.c1, s.pos1], [s.c2, s.pos2]].filter(x => x[0] && x[1]).map(([c, p]) => ({ l: recLegLbl(c, p), d: spDteHoy(c, p) })).filter(x => x.d);
  const cerca = patas.filter(x => x.d.dias < REC_CONFIG.diasMinVto);
  if (!cerca.length) return '';
  return `<div class="rc-card"><div class="rc-aviso" style="margin:0"><b>Vencimiento cercano:</b> ${cerca.map(x => `${x.l} vence en ${x.d.dias} días`).join(' y ')} (el radar pide al menos ${REC_CONFIG.diasMinVto}). Hay poco tiempo para que ${s.T.el} vuelva a su promedio antes de la fecha límite (${s.fechaLimite ? spFmtFecha(s.fechaLimite) : '—'}).</div></div>`;
}

// Línea de puntaje debajo de los recuadros de Spreads
function recHtmlBanda(s, par, operable) {
  if (s.error) return `<div class="rc-card rc-banda"><div class="rc-banda-txt">💡 <b class="t">Puntaje de la señal:</b> ${escHtml(s.error)}</div></div>`;
  const p = s.puntaje, baja = s.dir === 'baja';
  let accion;
  if (s.tipo === 'precio') accion = p.clase === 'debil' ? `sin señal de cobertura (P${s.pctl})` : baja ? 'precio bajo: no cubrir' : 'precio alto: cubrir';
  else {
    const lC = baja ? recLegLbl(s.c1, s.pos1) : recLegLbl(s.c2, s.pos2), lV = baja ? recLegLbl(s.c2, s.pos2) : recLegLbl(s.c1, s.pos1);
    const adj = s.tipo === 'ratio' ? (baja ? 'baja' : 'alta') : (baja ? 'bajo' : 'alto');
    accion = !operable ? `${s.T.el} está ${adj}, solo como referencia` : p.clase === 'debil' ? `${s.T.el} está ${adj}, sin operación sugerida` : `largo ${lC} / corto ${lV}`;
  }
  const avisos = [
    p.sinExtremo ? '<span class="rc-badge flag">Sin extremo</span>' : '',
    s.ajustado ? '<span class="rc-badge debil">Ajustada por retenciones</span>' : '',
    s.exclAnios ? `<span class="rc-badge debil">Sin ${s.exclAnios.join(', ')}</span>` : '',
    s.regimen ? '<span class="rc-badge flag">Posible cambio de régimen</span>' : '',
    operable ? '' : '<span class="rc-badge flag">Fecha límite vencida</span>',
  ].join(' ');
  return `<div class="rc-card rc-banda">
    <span class="rc-total-n" style="color:${p.sinExtremo ? 'var(--terra)' : recColorSub(p.total)}">${p.total}</span>
    <span class="rc-badge ${p.clase}">${recClaseLbl(p.clase)}</span>
    <div class="rc-banda-txt">💡 <b class="t">Puntaje de la señal · ${escHtml(s.lbl)}</b> — ${accion}. P${s.pctl} · z hist. ${recSig(s.zHist, 2)} contra ${s.nCampPrev} campañas previas.<br>${avisos}</div>
    <button class="rc-btn out" onclick="document.getElementById('sp-rec').scrollIntoView({behavior:'smooth',block:'start'})">Ver señal y recomendación ↓</button>
  </div>`;
}

function recClaseLbl(c) { return c === 'fuerte' ? 'Fuerte' : c === 'moderada' ? 'Moderada' : 'Débil'; }
function recColorSub(v) { return v >= 70 ? 'var(--marca)' : v >= 50 ? 'var(--oro)' : 'var(--terra)'; }

const REC_TIPO_RADAR = { ratio: 'Relación', spread: 'Spread', precio: 'Cobertura' };

// Orden de la tabla: primero las señales con extremo (por puntaje), después las sin extremo, al final las sin par vigente
function recOrden(s) { return s.error ? -1e4 : s.puntaje.total - (s.puntaje.sinExtremo ? 1000 : 0); }

// Radar: los favoritos de REC_CONFIG.pares, ordenados por puntaje. Clic = cargar el par en los selectores.
function recHtmlRadar(cur) {
  const esSel = (p, s) => recState.precioId ? p.id === recState.precioId
    : !!cur && !s.error && s.tipo === cur.tipo && s.c1 === cur.c1 && s.pos1 === cur.pos1 && s.c2 === cur.c2 && s.pos2 === cur.pos2;
  const pares = REC_CONFIG.pares.map(p => ({ p, s: recState.senales[p.id] })).sort((a, b) => recOrden(b.s) - recOrden(a.s));
  const alt = (s, fn) => s.alt ? `<br><small style="color:var(--mudo)">${s.alt.ajustado ? 'ajust.' : 'sin ajustar'} ${fn(s.alt)}</small>` : '';
  const nFuertes = pares.filter(x => !x.s.error && !x.s.puntaje.sinExtremo && x.s.puntaje.clase !== 'debil').length;
  const filas = pares.map(({ p, s }) => {
    const tipo = REC_TIPO_RADAR[p.tipo || 'ratio'];
    if (s.error) return `<tr class="gris"><td>${escHtml(p.nombre)}</td><td>${tipo}</td><td colspan="6">${escHtml(s.error)}</td></tr>`;
    const lado = s.tipo === 'precio' ? (s.dir === 'alta' ? 'precio alto' : 'precio bajo') : null;
    return `<tr class="clic ${esSel(p, s) ? 'sel' : ''}" onclick="recElegirPar('${p.id}')"><td><b>${s.lbl}</b>${s.tipo === 'spread' && /carry/i.test(p.nombre) ? ' <small style="color:var(--mudo)">carry</small>' : ''}</td><td>${tipo}</td>
        <td class="r num">${s.fv(s.actual)}</td><td class="r num">${s.fv(s.histMean)}${alt(s, x => x.fv(x.histMean))}</td>
        <td class="r num">P${s.pctl}${alt(s, x => 'P' + x.pctl)}</td><td class="r num">${recSig(s.zHist, 2)}${alt(s, x => recSig(x.zHist, 2))}</td>
        <td><span class="rc-score"><span class="rc-score-bar"><span style="width:${s.puntaje.total}%;background:${s.puntaje.sinExtremo ? 'var(--terra)' : recColorSub(s.puntaje.total)}"></span></span><span class="num" style="font-weight:700">${s.puntaje.total}</span><span class="rc-badge ${s.puntaje.clase}">${recClaseLbl(s.puntaje.clase)}</span></span></td>
        <td>${s.puntaje.sinExtremo ? '<span class="rc-badge flag">Sin extremo</span> ' : ''}${lado ? `<span class="rc-badge debil">${lado}</span> ` : ''}${s.ajustado ? '<span class="rc-badge debil">Ajustada por retenciones</span> ' : ''}${s.regimen ? '<span class="rc-badge flag">Posible cambio de régimen</span>' : ''}</td></tr>`;
  }).join('');
  return `<div class="rc-card"><details class="rc-radar" ${uiGet('recRadarAbierto', false) ? 'open' : ''} ontoggle="uiSet('recRadarAbierto',this.open)">
    <summary><div class="rc-card-h">💡 Radar de señales <span class="rc-aux">${nFuertes ? `${nFuertes} con señal Moderada o Fuerte · ` : 'ninguna con señal · '}favoritos de REC_CONFIG · clic para abrir o cerrar ▾</span></div></summary>
    <div class="rc-scroll"><table class="rc-tabla">
    <thead><tr><th>Par</th><th>Tipo</th><th class="r">Actual</th><th class="r">Prom. histórico</th><th class="r">Percentil</th><th class="r">z hist.</th><th>Puntaje</th><th>Avisos</th></tr></thead>
    <tbody>${filas}</tbody></table></div>
    <div class="rc-note">Relación = precio 1 / precio 2 · Spread = precio 1 − precio 2, en USD/t · Cobertura = precio de una sola posición contra las campañas anteriores, para decidir si cubrir la física sin precio. Cualquier otro par se puntúa eligiéndolo en los selectores.${spExcludedYears.size ? ` Sin las campañas ${[...spExcludedYears].sort().join(', ')} (filtro de abajo).` : ''}</div>
  </details></div>`;
}

// Fila del radar: un par se carga en los selectores (y Spreads recalcula todo); una cobertura de precio
// no tiene pata 2, así que se muestra solo en la sección de recomendación
function recElegirPar(id) {
  const par = REC_CONFIG.pares.find(p => p.id === id), s = recState.senales[id];
  if (!par || !s || s.error) return;
  if (par.tipo === 'precio') { recState.precioId = id; recSpRender(); }
  else {
    const set = (el, v) => { const e = document.getElementById(el); if (e) e.value = v; };
    set('sp-crop1', s.c1); spUpdatePos1(); set('sp-pos1', s.pos1);
    set('sp-crop2', s.c2); spUpdatePos2(); set('sp-pos2', s.pos2);
    spSetMode(s.tipo === 'spread' ? 'basis' : 'ratio');
  }
  setTimeout(() => { const el = document.getElementById(par.tipo === 'precio' ? 'sp-rec' : 'sp-rec-banda'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
}

function recHtmlSenal(s) {
  const below = s.dir === 'baja';
  const tile = (k, v, d, cls) => `<div class="rc-tile ${cls || ''}"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  const contra = cond => cond ? 'neg' : 'pos';
  const momContra = s.f * ((s.slope10 || 0) + (s.slope20 || 0)) < 0;
  const nomExt = below ? 'mínimo' : 'máximo';
  const p = s.puntaje, a = s.alt;
  const altTxt = fn => a ? `<br><span style="color:var(--mudo)">${a.ajustado ? 'ajustada' : 'sin ajustar'}: ${fn(a)}</span>` : '';
  const momTxt = s.ruedasDesdeExt === 0 ? `<b>${nomExt} de campaña hoy</b>`
    : s.piso ? `<b>encontró piso</b>: ${s.ruedasDesdeExt} ruedas sin ${nomExt} nuevo` : `${s.ruedasDesdeExt} ruedas desde el ${nomExt}; falta que la pendiente se aplane`;
  const fv = s.fv, T = s.T;
  const retTxt = !s.retObj ? '' : s.tipo === 'precio'
    ? `${REC_LBL[s.c1].toLowerCase()} ${s.pos1} ${recF(s.retObj.r1, 2)} %`
    : `${REC_LBL[s.c1].toLowerCase()} ${s.pos1} ${recF(s.retObj.r1, 2)} % y ${REC_LBL[s.c2].toLowerCase()} ${s.pos2} ${recF(s.retObj.r2, 2)} %`;
  const nota = (s.ajustado
    ? `<b>Comparación ajustada por retenciones:</b> los precios de las campañas anteriores (y de esta campaña antes del anuncio del cronograma) se pasan a las retenciones de la entrega actual, ${retTxt}, con fobbing. El puntaje usa esta versión.`
    : `<b>Sin ajustar por retenciones:</b> ${s.tipo === 'precio' ? 'precios tal como cotizaron.' : 'son los mismos números que muestra Spreads.'} ${a ? 'El puntaje usa esta versión porque así se eligió.' : `No hay tabla de retenciones para ${REC_LBL[s.c1].toLowerCase()}${s.c2 && s.c2 !== s.c1 ? ' o ' + REC_LBL[s.c2].toLowerCase() : ''}.`}`)
    + (s.exclAnios ? ` <b>Campañas excluidas</b> por el filtro de Spreads: ${s.exclAnios.join(', ')}.` : '');
  const actualDet = s.tipo === 'ratio' ? `${recF(s.p1Last, 1)} / ${recF(s.p2Last, 1)}` : s.tipo === 'spread' ? `${recF(s.p1Last, 1)} − ${recF(s.p2Last, 1)} USD/t` : 'USD/t';
  return `<div class="rc-grid2">
    <div class="rc-card">
      <div class="rc-card-h">Señal · ${s.lbl} <span class="rc-aux num">${s.curDte} días al vto. de ${s.pos1} · último dato ${spFmtFecha(recFecha(s.ultFecha))}</span></div>
      <div class="rc-estr-why" style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;"><span>${nota}</span>
        ${a ? `<button class="rc-btn out" data-html2canvas-ignore onclick="recState.ajuste=${s.ajustado ? 'false' : 'true'};recSpRender();">${s.ajustado ? 'Ver sin ajustar' : 'Ver ajustada'}</button>` : ''}</div>
      <div class="rc-tiles">
        ${tile(T.lbl + ' actual', fv(s.actual), actualDet)}
        ${tile('Prom. campaña', fv(s.avgCamp), `${s.fd(s.actual - s.avgCamp)} · rango ${fv(s.minCamp)}–${fv(s.maxCamp)}${altTxt(x => x.fv(x.avgCamp))}`)}
        ${tile('Prom. histórico', fv(s.histMean), (s.enVentana ? `${s.nCampPrev} campañas a ${s.curDte} ± ${s.ventana} días` : 'toda la historia (pocos puntos en la ventana)') + altTxt(x => x.fv(x.histMean)))}
        ${tile('Percentil hist.', 'P' + s.pctl, (below ? `solo ${recF(s.pctl, 1)} % de los días más bajo` : `solo ${recF(100 - s.pctl, 1)} % de los días más alto`) + altTxt(x => 'P' + x.pctl), s.pctl <= 30 || s.pctl >= 70 ? 'neg' : '')}
        ${tile('z hist.', recSig(s.zHist, 2), `σ entre campañas ${fv(s.sigH)}${altTxt(x => recSig(x.zHist, 2))}`, Math.abs(s.zHist) >= 1.5 ? 'neg' : '')}
        ${tile('z propia', recSig(s.zProp, 2), `σ de esta campaña ${fv(s.stdCamp)}`)}
        ${tile('Drift estacional', s.fd(s.drift), !s.nDrift ? 'sin datos' : s.patronEst ? `mediana hasta la fecha límite · ${s.nDriftFav} de ${s.nDrift} campañas a favor` : `<b>sin patrón claro</b>: subió en ${s.nDriftSube} de ${s.nDrift} campañas`, !s.patronEst || s.drift == null ? '' : contra(s.f * s.drift < 0))}
        ${tile('Momentum', s.fd(s.slope10), `por rueda (10) · ${s.fd(s.slope20)} (20) · ${momTxt}`, s.piso ? 'pos' : contra(momContra || s.ruedasDesdeExt === 0))}
        ${tile('Persistencia', recF(s.persistencia, 1) + ' %', `de los días ${below ? 'debajo' : 'encima'} del prom. histórico${s.regimen ? ' · <b>posible cambio de régimen</b>' : ''}${altTxt(x => recF(x.persistencia, 1) + ' %')}`, s.regimen ? 'neg' : '')}
        ${tile('Dispersión campañas', s.dispRango ? fv(s.dispRango[1] - s.dispRango[0]) : '—', s.dispRango ? `rango ${fv(s.dispRango[0])}–${fv(s.dispRango[1])} · σ ${fv(s.dispStd)}` : 'sin datos')}
      </div>
      <div class="rc-chart-box"><canvas id="rc-chart-senal"></canvas></div>
      <div class="rc-note">${T.El} de esta campaña contra el promedio de las campañas previas, por días al vencimiento de ${s.pos1}. La banda es ± 1σ entre campañas.</div>
    </div>
    <div class="rc-card">
      <div class="rc-card-h">Puntaje de la señal <span class="rc-badge ${p.clase}">${recClaseLbl(p.clase)}</span></div>
      <div class="rc-desg">${p.comp.map(c => `<div class="rc-desg-row">
        <div class="lbl"><b>${c.lbl}</b><small>peso ${recF(c.peso * 100, 1)} % · ${c.sub}/100</small></div>
        <div class="rc-desg-bar"><span style="width:${c.sub}%;background:${recColorSub(c.sub)}"></span></div>
        <div class="pts">${recF(c.pts, 1)}</div><div class="rc-desg-why">${c.why}</div></div>`).join('')}</div>
      <div class="rc-total"><div><b style="font-size:13px;">Total</b><div style="font-size:11px;color:var(--mudo);">Fuerte ≥ ${REC_CONFIG.fuerte} · Moderada ${REC_CONFIG.moderada}–${REC_CONFIG.fuerte - 1} · Débil &lt; ${REC_CONFIG.moderada} · con extremo &lt; ${REC_CONFIG.extremoMin}, siempre Débil</div></div><span class="num">${p.total}</span></div>
      ${p.sinExtremo ? `<div class="rc-aviso"><b>Sin extremo estadístico (${p.comp[0].sub}/100, mínimo ${REC_CONFIG.extremoMin}):</b> ${s.T.el} no está ni ${s.tipo === 'ratio' ? 'barata ni cara' : 'barato ni caro'} contra las campañas anteriores, así que la señal queda Débil${p.total >= REC_CONFIG.moderada ? `, aunque el total dé ${p.total}` : ''}. Los otros componentes solo deciden cuándo y cuánto entrar cuando ya hay un extremo.</div>` : ''}
    </div>
  </div>`;
}

function recHtmlCfg() {
  const C = REC_CONFIG, W = C.pesos, pc = v => recF(v * 100, 1) + ' %';
  const cfgTxt = ['soja', 'maiz', 'trigo'].map(c => `${REC_LBL[c].toLowerCase()} <b>${recT(recContratoT(c))} t</b> · USD <b>${recF(recGarantia(c), 1)}</b>/t`).join('<br>');
  return `<div class="rc-card"><details class="rc-cfg" id="rc-cfg"><summary>⚙ Parámetros del motor (REC_CONFIG en recomendaciones.js)</summary>
    <div class="rc-cfg-grid">
      <div>Pesos del puntaje: extremo <b>${pc(W.extremo)}</b> · estacionalidad <b>${pc(W.estacional)}</b> · momentum <b>${pc(W.momentum)}</b> · persistencia <b>${pc(W.persistencia)}</b> · VI <b>${pc(W.vi)}</b></div>
      <div>Clasificación: Fuerte <b>≥ ${C.fuerte}</b> · Moderada <b>${C.moderada}–${C.fuerte - 1}</b> · Débil <b>&lt; ${C.moderada}</b> · condición previa: extremo estadístico <b>≥ ${C.extremoMin}</b>, si no, Débil</div>
      <div>Ventana histórica: los mismos días al vto. ± ventana de Spreads (<b>RS_REGLAS.relaciones</b>)</div>
      <div>Cambio de régimen: persistencia <b>&gt; ${recF(C.regimenPct, 1)} %</b></div>
      <div>Retenciones: ${C.ajustarRetenciones ? '<b>se ajustan</b>' : '<b>no se ajustan</b>'} · soja ${REC_RET_HIST.soja.map(x => `<b>${recF(x.ret, 1)} %</b> desde ${spFmtFecha(recFecha(x.desde))}`).slice(1).join(', ')} (antes <b>${recF(REC_RET_HIST.soja[0].ret, 1)} %</b>) · maíz ${REC_RET_HIST.maiz.map(x => `<b>${recF(x.ret, 1)} %</b> desde ${spFmtFecha(recFecha(x.desde))}`).slice(1).join(', ')} (antes <b>${recF(REC_RET_HIST.maiz[0].ret, 1)} %</b>) · luego el cronograma de globals.js</div>
      <div>Estacionalidad: mediana; cuenta solo si <b>${recF(C.consistenciaEstacional * 100, 1)} %</b> de las campañas van en el mismo sentido</div>
      <div>Piso: <b>${C.ruedasPiso} ruedas</b> sin extremo nuevo y pendiente de 10 ruedas plana o a favor; sin piso, el tramo 1 espera</div>
      <div>Tramos de entrada: <b>${C.tramosSigma.map(k => k ? k + 'σ' : 'actual').join(' · ')}</b> (⅓ cada uno)</div>
      <div>Stop: ${C.stopFijo != null ? `relaciones en nivel fijo <b>${recR(C.stopFijo)}</b>; spreads y coberturas en actual ∓ <b>${recF(C.stopSigma, 1)}σ</b>` : `actual ∓ <b>${recF(C.stopSigma, 1)}σ</b>`}</div>
      <div>Radar: ${C.pares.map(p => `<b>${escHtml(p.nombre)}</b>`).join(' · ')}. Se usa la primera posición de cada mes con las dos patas a <b>≥ ${C.diasMinVto} días</b> del vencimiento. El par de los selectores se puntúa con las posiciones elegidas.</div>
      <div>Campañas: las excluidas en el filtro de Spreads tampoco entran en el puntaje${spExcludedYears.size ? ` (hoy: <b>${[...spExcludedYears].sort().join(', ')}</b>)` : ''}</div>
      <div>Fecha límite: vto. de la primera pata menos <b>${C.habilesAntesVto} hábiles</b></div>
      <div>Tope de volumen: Fuerte <b>${pc(C.topeVolumen.fuerte)}</b> · Moderada <b>${pc(C.topeVolumen.moderada)}</b> · Débil <b>${pc(C.topeVolumen.debil)}</b> de lo sin precio</div>
      <div>VI: <b>&lt; P${C.viBaja}</b> → calls comprados · <b>&gt; P${C.viAlta}</b> → aviso de calls vendidos</div>
      <div>Contrato y garantía ${recState.cfgEstado === 'ok' ? '(config_operaciones)' : '(manual)'}:<br>${cfgTxt}</div>
    </div></details></div>`;
}

const REC_ESTR = {
  fisica: { chip: 'Física + venta de la pata cara', sub: 'si hay física sin precio en los dos granos' },
  spread: { chip: 'Spread en futuros', sub: 'neutral en dólares, sin física' },
  calls:  { chip: 'Calls + venta de la pata cara', sub: 'si la VI de la pata barata está baja' },
};
// En un spread entre posiciones del mismo grano, "física" es guardar el grano y vender el diferido
const REC_ESTR_SPREAD = {
  fisica: { chip: 'Guardar física + venta del diferido', sub: 'si la pata barata es la cercana y hay física sin precio' },
  spread: { chip: 'Spread en futuros', sub: 'mismas toneladas en las dos patas, sin física' },
  calls:  { chip: 'Calls + venta de la pata cara', sub: 'no se sugiere: la prima suele superar el movimiento del spread' },
};
// Textos de las estructuras según el par: mismo grano (calendario) o entre granos; spread o relación
function recEstrTxt(s) {
  const base = s.c1 === s.c2 ? REC_ESTR_SPREAD : REC_ESTR;
  return { ...base, spread: { chip: base.spread.chip, sub: (s.tipo === 'spread' ? 'mismas toneladas en las dos patas' : 'neutral en dólares') + ', sin física' } };
}

function recRenderTarjeta() {
  const s = recState.senal, host = document.getElementById('rc-tarjeta');
  if (!s || !host) return;
  if (s.tipo === 'precio') return recRenderTarjetaPrecio(s, host);
  const R = recArmar(s, recState.estr);
  recState.estr = R.estr;
  // esSp: resultado en USD/t con mismas toneladas (si no, relación neutral en dólares)
  // calSp: mismo grano, la física es guardar la pata cercana y las patas se nombran por posición
  const baja = s.dir === 'baja', p = s.puntaje, esSp = s.tipo === 'spread', calSp = s.c1 === s.c2, T = s.T, fv = s.fv;
  const lC = recLegLbl(R.compra.c, R.compra.p), lV = recLegLbl(R.venta.c, R.venta.p);
  const nC = calSp ? lC : REC_LBL[R.compra.c].toLowerCase(), nV = calSp ? lV : REC_LBL[R.venta.c].toLowerCase();
  const adj = s.tipo === 'ratio' ? (baja ? 'baja' : 'alta') : (baja ? 'bajo' : 'alto');
  const ton = esSp ? 'con las mismas toneladas en las dos patas' : `neutral en dólares (${recF(baja ? 1 / s.actual : s.actual, 3)} t de ${nC} por t de ${nV}, redondeado a contratos)`;
  const t1 = R.tramos[0];
  // Con física guardada la única pata en futuros es la vendida: la fecha límite sale de su vencimiento
  const vtoV = R.venta.i === 1 ? s.vto1 : s.vto2;
  const flFisica = calSp && R.estr === 'fisica' && vtoV;
  const fechaLim = flFisica ? recRestarHabiles(vtoV, REC_CONFIG.habilesAntesVto) : s.fechaLimite;
  const fl = fechaLim ? spFmtFecha(fechaLim) : '—';
  const pctFmt = v => v && v.pct != null ? 'P' + v.pct : '—';

  const chips = Object.entries(recEstrTxt(s)).map(([k, e]) => {
    const disp = k !== 'fisica' || R.hayFisica;
    const tag = k === R.sugerida ? ' · sugerida' : '';
    return `<button class="rc-chip ${k === R.estr ? 'on' : ''}" ${disp ? '' : 'disabled style="opacity:.5;cursor:not-allowed"'} onclick="recState.estr='${k}';recRenderTarjeta();">${k === R.estr ? '✓ ' : ''}${e.chip}<small>${e.sub}${tag}</small></button>`;
  }).join('');

  const why = calSp ? {
    fisica: `<b>Guardar física + venta de ${lV}:</b> ${T.el} está ${adj}: ${lC} está barato contra ${lV}. En lugar de vender la física en ${lC}, se guarda sin fijar y se vende ${lV} en futuros, así se captura ${T.el} sin poner garantía por la pata comprada. El grano guardado <b>no se vende</b> hasta cerrar la venta de ${lV}. No incluye almacenaje, financiación ni merma: restalos antes de decidir.`,
    spread: `<b>Spread en futuros:</b> compra de ${lC} y venta de ${lV}, ${ton}. El resultado depende solo ${s.tipo === 'ratio' ? 'de la relación' : 'del spread'}, no del nivel de precios. Es la variante para cuando no hay física para guardar${R.compraCercana ? '' : ` (acá la pata barata, ${lC}, vence después que ${lV}, así que no se puede armar con física guardada)`}. Requiere garantía en las dos patas.`,
    calls: `<b>Calls de ${lC} en lugar de futuro comprado:</b> la VI de ${REC_LBL[s.c1].toLowerCase()} está en ${pctFmt(R.viC)}${R.viBarata ? `, por debajo de P${REC_CONFIG.viBaja}` : ''}. Se paga la prima por adelantado y, si ${T.el} sigue en contra, la pérdida de esa pata queda limitada a la prima. La venta de ${lV} sigue igual. Primas: tramo 1 ${t1.fuente === 'A3' ? 'de A3' : 'por Black-76'}, tramos 2 y 3 por Black-76 (VI ${recF(R.viC ? R.viC.vi : 20, 1)} %, ${R.dteC} días). Payoff al vencimiento.`,
  }[R.estr] : {
    fisica: `<b>Física + venta de ${nV}:</b> ${T.el} está ${adj} y hay ${nV} y ${nC} sin precio. La regla es cubrir la pata cara (${lV}) y dejar sin fijar la barata (${nC}). El resultado económico es el mismo que el del spread en futuros, pero no hay que poner garantía por el ${nC}. El ${nC} reservado <b>no se vende</b> mientras la operación esté abierta.`,
    spread: `<b>Spread en futuros:</b> compra de ${lC} y venta de ${lV}, ${ton}. Es la variante para cuando no hay posición física. Requiere garantía en las dos patas.`,
    calls: `<b>Calls de ${nC} en lugar de futuro comprado:</b> la VI de ${nC} está en ${pctFmt(R.viC)}${R.viBarata ? `, por debajo de P${REC_CONFIG.viBaja}` : ''}. Se paga la prima por adelantado y, si ${T.el} sigue en contra, la pérdida de esa pata queda limitada a la prima. La venta de ${nV} sigue igual. Primas: tramo 1 ${t1.fuente === 'A3' ? 'de A3' : 'por Black-76'}, tramos 2 y 3 por Black-76 (VI ${recF(R.viC ? R.viC.vi : 20, 1)} %, ${R.dteC} días). Payoff al vencimiento.`,
  }[R.estr];

  // Patas
  const garTxt = v => v > 0 ? `USD ${recF(v / 1000, 1)} mil` : '—';
  const cto = (q, ct) => `${recT(q)} t · ${recT(q / ct)}`;
  const filaV = `<tr><td><b>${lV}</b></td><td>Venta futuro</td><td class="r num">${cto(t1.qV, R.ctV)}</td><td class="r num">${cto(R.qVTot, R.ctV)}</td><td class="r num">${recF(R.venta.i === 1 ? R.P1 : R.P2, 1)}</td><td class="r num">${garTxt(R.garV)}</td></tr>`;
  const pC = R.compra.i === 1 ? R.P1 : R.P2;
  let filaC;
  if (R.estr === 'fisica') filaC = `<tr><td><b>${lC}</b></td><td>${calSp ? 'Físico guardado sin fijar' : 'Físico sin fijar (reservado)'}</td><td class="r num">${recT(t1.qC)} t</td><td class="r num">${recT(R.qCTot)} t</td><td class="r num">${recF(pC, 1)}</td><td class="r num">—</td></tr>`;
  else if (R.estr === 'spread') filaC = `<tr><td><b>${lC}</b></td><td>Compra futuro</td><td class="r num">${cto(t1.qC, R.ctC)}</td><td class="r num">${cto(R.qCTot, R.ctC)}</td><td class="r num">${recF(pC, 1)}</td><td class="r num">${garTxt(R.garC)}</td></tr>`;
  else filaC = `<tr><td><b>${lC} call ${recF(t1.k, 0)}</b></td><td>Compra call</td><td class="r num">${cto(t1.qC, R.ctC)}</td><td class="r num">${cto(R.qCTot, R.ctC)}</td><td class="r num">prima ${recF(t1.prima, 1)}</td><td class="r num">prima ${garTxt(R.primas)}</td></tr>`;

  // Base de volumen: con física guardada (mismo grano) son las t que se guardan (pata comprada)
  const nBase = calSp && R.estr === 'fisica' ? nC : nV;
  const n1 = calSp ? s.pos1 : REC_LBL[s.c1], n2 = calSp ? recLegLbl(s.c2, s.pos2) : REC_LBL[s.c2].toLowerCase();
  const sinPos = !R.spBase && recState.tnManual == null;
  const baseTxt = R.spBase && recState.tnManual == null
    ? `${recT(R.spBase.tn)} t de ${nBase} sin precio (posición comercial)`
    : recState.tnManual != null ? `${recT(recState.tnManual)} t ingresadas a mano` : 'sin posición cargada';
  const avisoVol = R.tope === 0
    ? `<div class="rc-aviso">Señal débil: no se propone operar (tope de volumen 0,0 %). Los niveles y el P&L por t son de referencia, calculados con 1 contrato por tramo.</div>`
    : R.sinVolumen ? `<div class="rc-aviso">${sinPos ? 'No hay posición comercial cargada: ingresá las t sin precio de ' + nBase + ' o vinculá el tablero en Escenarios.' : 'El volumen no alcanza para 1 contrato por tramo.'} Los valores por t se calculan con 1 contrato por tramo.</div>` : '';

  // Niveles
  const pnlT1 = r => R.pnl(r, R.S, R.t1), pnl3 = r => R.pnl(r, R.S, R.tramos);
  const qT1 = t1.qV, q3 = R.qVTot;
  const cl = v => v >= 0 ? 'pnl-pos' : 'pnl-neg';
  const filasNiv = R.niveles.map(n => {
    const a = pnlT1(n.r), b = pnl3(n.r);
    const tot = v => R.sinVolumen ? '—' : recMil(v);
    return `<tr class="${n.ext ? 'ext' : ''}"><td><b>${n.k}</b>${n.superado ? ' <span class="rc-badge debil">ya superado</span>' : ''}<br><small style="color:var(--mudo)">${n.lbl}</small></td><td class="r num">${fv(n.r)}</td><td class="r num">${recF(R.px1(n.r, R.S), 1)}</td>
      <td class="r num ${cl(a)}">${recUsd(a / qT1)}</td><td class="r num ${cl(a)}">${tot(a)}</td><td class="r num ${cl(b)}">${recUsd(b / q3)}</td><td class="r num ${cl(b)}">${tot(b)}</td></tr>`;
  }).join('');
  const rbTxt = v => v == null ? 'sin ganancia' : recF(v, 2);
  const rbBajo = R.rb1 != null && R.rb1 < 1;

  // Riesgos y por qué
  const momContra = s.f * ((s.slope10 || 0) + (s.slope20 || 0)) < 0, extremoHoy = s.ruedasDesdeExt === 0;
  const nomExt = baja ? 'mínimo' : 'máximo';
  const vtoTxt = (v) => v ? spFmtFecha(v) : '—';
  const gap = s.vto1 && s.vto2 ? Math.abs(Math.round((s.vto2 - s.vto1) / 864e5)) : null;
  const primera = s.vto1 && s.vto2 && s.vto2 < s.vto1 ? recLegLbl(s.c2, s.pos2) : recLegLbl(s.c1, s.pos1);
  const otra = primera === recLegLbl(s.c1, s.pos1) ? recLegLbl(s.c2, s.pos2) : recLegLbl(s.c1, s.pos1);
  const iaC = (R.compra.i === 1 ? R.a1 : R.a2) || {}, iaV = (R.venta.i === 1 ? R.a1 : R.a2) || {};
  const nCtoC = R.qCTot / R.ctC, nCtoV = R.qVTot / R.ctV;
  const liq = [];
  if (R.estr !== 'fisica' && iaC.ia) liq.push(`${recT(nCtoC)} contratos de ${lC} (interés abierto ${recT(iaC.ia)})`);
  if (iaV.ia) liq.push(`${recT(nCtoV)} contratos de ${lV} (interés abierto ${recT(iaV.ia)})`);
  const liqAlta = (R.estr !== 'fisica' && iaC.ia && nCtoC > iaC.ia * REC_CONFIG.liquidezPctIA) || (iaV.ia && nCtoV > iaV.ia * REC_CONFIG.liquidezPctIA);

  const a = s.alt;
  const porQue = [
    `${T.El} está en <b>${fv(s.actual)}</b>, en el <b>percentil ${s.pctl}</b> de las ${s.nCampPrev} campañas previas ${s.enVentana ? `al mismo punto del ciclo (${s.curDte} ± ${s.ventana} días al vencimiento)` : '(toda la historia)'}${s.ajustado ? ', comparando con las retenciones de hoy' : ''}.`,
    `Está <b>${fv(Math.abs(s.actual - s.histMean))}${esSp ? ' USD/t' : ''} ${baja ? 'debajo' : 'encima'}</b> del promedio histórico (${fv(s.histMean)}), a <b>${recSig(s.zHist, 2)} desvíos</b> entre campañas, y ${fv(Math.abs(s.actual - s.avgCamp))} ${s.actual < s.avgCamp ? 'debajo' : 'encima'} del promedio de esta campaña (${fv(s.avgCamp)}).`
      + (a && s.ajustado ? ` Sin ajustar por retenciones daría P${a.pctl} y promedio ${a.fv(a.histMean)}: la diferencia es lo que explican las retenciones.` : ''),
    s.drift == null ? 'No hay datos suficientes para medir la estacionalidad hasta la fecha límite.'
      : s.patronEst ? `Estacionalidad ${s.f * s.drift > 0 ? 'a favor' : 'en contra'}: desde este punto hasta la fecha límite ${T.el} ${s.drift > 0 ? 'subió' : 'bajó'} (mediana <b>${s.fd(s.drift)}</b>) en ${s.f * s.drift > 0 ? s.nDriftFav : s.nDrift - s.nDriftFav} de ${s.nDrift} campañas.`
      : `Sin patrón estacional claro: de acá a la fecha límite ${T.el} subió en ${s.nDriftSube} de ${s.nDrift} campañas y bajó en las demás (mediana ${s.fd(s.drift)}).`,
    R.viC && R.viC.pct != null ? `La VI de ${calSp ? REC_LBL[s.c1].toLowerCase() :nC} está en <b>P${R.viC.pct}</b> (${recF(R.viC.vi, 1)} %)${R.viC.pct < REC_CONFIG.viBaja ? ': si se quiere opcionalidad en esa pata, los calls están baratos.' : R.viC.pct > REC_CONFIG.viAlta ? ': las opciones están caras, conviene futuros.' : ': en rango normal.'}` : `No hay VI de ${calSp ? REC_LBL[s.c1].toLowerCase() :nC} disponible.`,
    s.piso ? `<b>Encontró piso:</b> lleva ${s.ruedasDesdeExt} ruedas sin un ${nomExt} nuevo y la pendiente de 10 ruedas es ${s.fd(s.slope10)} por rueda.`
      : `${extremoHoy ? `Hoy marcó un <b>${nomExt} de la campaña</b>` : `Lleva ${s.ruedasDesdeExt} ruedas desde el ${nomExt} de la campaña`}, con pendiente de ${s.fd(s.slope10)} por rueda (10) y ${s.fd(s.slope20)} (20): <b>todavía no encontró piso</b>.`,
  ];
  const condPiso = `${REC_CONFIG.ruedasPiso} ruedas sin un ${nomExt} nuevo y pendiente de 10 ruedas plana o ${baja ? 'positiva' : 'negativa'}`;
  const riesgos = [
    `<b>Cambio de régimen:</b> ${recF(s.persistencia, 1)} % de la campaña ${baja ? 'debajo' : 'encima'} del promedio histórico${s.ajustado ? ' (ya ajustado por retenciones)' : ''}. ${s.regimen ? `El objetivo extendido (${fv(s.histMean)}) puede no llegar.` : 'Por ahora no hay señal de un desvío estructural.'}`,
    s.piso ? `<b>Momentum:</b> encontró piso, pero puede volver a ${baja ? 'caer' : 'subir'}. La entrada sigue siendo en tramos.`
      : `<b>Momentum en contra:</b> ${T.el} ${extremoHoy ? `hizo un ${nomExt} nuevo hoy` : `viene ${baja ? 'cayendo' : 'subiendo'}`}. <b>Esperar piso</b> antes del tramo 1: ${condPiso}.`,
    flFisica ? `<b>Vencimiento:</b> ${lV} vence el ${vtoTxt(vtoV)}. Cerrar o rolar antes del <b>${fl}</b> y vender la física guardada al cerrar la venta: si se vende antes, la venta de futuro queda sola.` :
    `<b>Vencimientos desalineados:</b> ${primera} vence el ${vtoTxt(s.vto1 && s.vto2 ? (s.vto1 <= s.vto2 ? s.vto1 : s.vto2) : s.vto1)}${gap != null ? `, ${gap} días antes que ${otra} (${vtoTxt(s.vto1 && s.vto2 ? (s.vto1 <= s.vto2 ? s.vto2 : s.vto1) : null)})` : ''}. Cerrar o rolar antes del <b>${fl}</b>; si no se cierran juntas, la otra pata queda sola.`,
    R.estr === 'calls'
      ? `<b>Pata en opciones:</b> los calls comprados pierden valor con el paso del tiempo; si ${T.el} tarda en moverse, se pierde parte de la prima aunque la tesis sea correcta.`
      : `<b>Pata vendida:</b> la venta de ${lV} pierde si sube ${esSp ? lV : 'el ' + nV}${R.estr === 'fisica' ? ' (lo compensa el físico, que se vende más caro)' : ''}. ${R.viVentaCara ? `La VI de ${calSp ? REC_LBL[s.c1].toLowerCase() :nV} está en P${R.viV.pct}: se podría financiar vendiendo calls de ${nV}, pero la pérdida de esa pata <b>no tiene techo</b>.` : 'No se proponen calls vendidos: la VI de ' + (calSp ? REC_LBL[s.c1].toLowerCase() :nV) + ' no está alta.'}`,
    ...(calSp && R.estr === 'fisica' ? [`<b>Costo de guardar:</b> almacenaje, financiación y merma del grano guardado no están en el P&L. Si suman más que la mejora esperada del spread, no conviene.`] : []),
    `<b>Liquidez:</b> ${liq.length ? liq.join(' y ') + '.' : 'sin dato de interés abierto de A3.'} ${liqAlta ? 'Superan el ' + recF(REC_CONFIG.liquidezPctIA * 100, 1) + ' % del interés abierto: entrar con órdenes límite y repartido en varias ruedas.' : 'Conviene entrar con órdenes límite.'}`,
  ];

  const desdeA3 = R.a1 && R.a2;
  const vivo = desdeA3 ? recComb(s.tipo, R.P1, R.P2) : null;
  const difVivo = vivo != null ? Math.abs(vivo - s.actual) : 0;
  const notaPatas = esSp
    ? `Toneladas y contratos de ${recT(R.ctV)} t. Mismas toneladas en las dos patas: el resultado es el cambio del spread por t.`
    : `Toneladas y contratos de ${recT(R.ctV)} t. Tramo 1: ${recF(t1.qC / t1.qV, 3)} t de ${nC} por t de ${nV} (el neutral exacto es ${recF(baja ? 1 / t1.r : t1.r, 3)}; la diferencia es el redondeo a contratos).`;

  host.innerHTML = `
    <div class="rc-reco-title">
      <h2>${baja ? `Largo ${nC} / corto ${nV}` : `Corto ${nV} / largo ${nC}`} — Señal ${recClaseLbl(p.clase)} ${p.total}</h2>
      <span class="rc-badge ${p.clase}">${recClaseLbl(p.clase)}</span>
      ${s.regimen ? '<span class="rc-badge flag">Objetivo extendido: no contar con esto</span>' : ''}
      ${rbBajo ? '<span class="rc-badge flag">Beneficio / riesgo bajo al objetivo 1</span>' : ''}
    </div>
    <div class="rc-reco-meta num">${recLegLbl(s.c1, s.pos1)} ${esSp ? '−' : '/'} ${recLegLbl(s.c2, s.pos2)} · ${esSp ? 'mismas toneladas en las dos patas' : 'neutral en dólares'} · generado ${new Date().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })} · cerrar o rolar antes del ${fl}</div>
    <div class="rc-chips" data-html2canvas-ignore>${chips}</div>
    <div class="rc-estr-why">${why}</div>
    <div class="rc-base" data-html2canvas-ignore>Base de volumen: <b>${baseTxt}</b> · tope ${recF(R.tope * 100, 1)} % (señal ${recClaseLbl(p.clase)}).
      <span>Usar otra base (t de ${nBase}):</span><input type="number" min="0" step="100" value="${recState.tnManual != null ? recState.tnManual : ''}" placeholder="${R.spBase ? recT(R.spBase.tn).replace(/\./g, '') : 't'}" onchange="recState.tnManual=this.value===''?null:Math.max(0,+this.value);recRenderTarjeta();"></div>
    ${avisoVol}

    <div class="rc-sec">1 · Patas <small>${R.sinVolumen ? '' : `volumen: ${recF(R.tope * 100, 1)} % de ${recT(R.base)} t de ${nBase} = ${recT(R.V)} t`}</small></div>
    <div class="rc-scroll"><table class="rc-tabla"><thead><tr><th>Contrato</th><th>Operación</th><th class="r">Tramo 1 (hoy)</th><th class="r">Con los 3 tramos</th><th class="r">Precio ref.</th><th class="r">Garantía est.</th></tr></thead><tbody>${filaV}${filaC}</tbody></table></div>
    <div class="rc-note">${notaPatas}
      Precios ${desdeA3 ? 'de A3 en vivo' : 'del último dato histórico (A3 sin datos de alguna pata)'}${difVivo > (esSp ? 0.5 : 0.002) ? ` · ojo: ${T.el} en vivo (${fv(vivo)}) difiere de la serie (${fv(s.actual)})` : ''}.
      ${R.estr === 'fisica' ? `Opcional: puts de ${lC} para proteger el ${calSp ? 'grano guardado' : nC + ' abierto'}; no están incluidos en el payoff.` : ''}
      Garantías: ${recState.cfgEstado === 'ok' ? 'config_operaciones' : 'valores manuales hasta cargar config_operaciones'}.</div>

    <div class="rc-sec">2 · Entradas escalonadas <small>⅓ del volumen en cada tramo · ${n2} en ${recF(R.S, 1)} como referencia</small></div>
    <div class="rc-scroll"><table class="rc-tabla"><thead><tr><th>Tramo</th><th>Cuándo</th><th class="r">${T.lbl}</th><th class="r">${n1} equivalente</th><th class="r">${calSp ? R.venta.p : REC_LBL[R.venta.c]} (venta)</th><th class="r">${calSp ? R.compra.p : REC_LBL[R.compra.c]} (${R.estr === 'fisica' ? (calSp ? 'guardado' : 'reservado') : R.estr === 'calls' ? 'calls' : 'compra'})</th></tr></thead><tbody>
      ${R.tramos.map(t => `<tr><td><b>${t.n}</b></td><td>${t.cuando}</td><td class="r num">${fv(t.r)}</td><td class="r num">${recF(t.p1e, 1)}</td><td class="r num">${cto(t.qV, R.ctV)}</td><td class="r num">${R.estr === 'fisica' ? recT(t.qC) + ' t' : cto(t.qC, R.ctC)}${R.estr === 'calls' ? ` · K ${recF(t.k, 0)} · prima ${recF(t.prima, 1)}` : ''}</td></tr>`).join('')}
    </tbody></table></div>

    <div class="rc-sec">3 · Objetivos y stop <small>P&L con ${n2} fija en ${recF(R.S, 1)} · por t de ${nV} vendida</small></div>
    <div class="rc-scroll"><table class="rc-tabla"><thead><tr><th>Nivel</th><th class="r">${T.lbl}</th><th class="r">${n1} a ${n2} ${recF(R.S, 1)}</th><th class="r">Tramo 1 · USD/t</th><th class="r">Tramo 1 · total</th><th class="r">3 tramos · USD/t</th><th class="r">3 tramos · total</th></tr></thead><tbody>${filasNiv}</tbody></table></div>
    <div class="rc-kv">
      <div><span>Beneficio / riesgo · tramo 1</span><b>${rbTxt(R.rb1)}</b> al objetivo 1</div>
      <div><span>Beneficio / riesgo · 3 tramos</span><b>${rbTxt(R.rb3)}</b> al objetivo 1</div>
      <div><span>Fecha límite</span><b>${fl}</b> · vto. ${flFisica ? lV : primera} menos ${REC_CONFIG.habilesAntesVto} hábiles</div>
      ${R.garV + R.garC > 0 ? `<div><span>Garantía estimada (3 tramos)</span><b>USD ${recF((R.garV + R.garC) / 1000, 1)} mil</b></div>` : ''}
    </div>

    <div class="rc-sec">4 · Payoff según ${T.el} <small>líneas finas: tramo 1 con ${n2} ± 10,0 %${esSp && R.estr !== 'calls' ? ' (en futuros coinciden: el resultado depende solo del spread)' : ''}</small></div>
    <div class="rc-payoff-box"><canvas id="rc-chart-payoff"></canvas></div>

    <div class="rc-lists">
      <div><div class="rc-sec">5 · Por qué</div><ul class="rc-list">${porQue.map(x => `<li>${x}</li>`).join('')}</ul></div>
      <div><div class="rc-sec" style="color:var(--terra)">6 · Riesgos</div><ul class="rc-list riesgos">${riesgos.map(x => `<li>${x}</li>`).join('')}</ul></div>
    </div>

    <div class="rc-acciones" data-html2canvas-ignore>
      <button class="rc-btn" id="rc-btn-pdf" onclick="recPdf()">📄 Exportar PDF</button>
      <button class="rc-btn out" onclick="recCopiar()">📋 Copiar resumen</button>
    </div>
    <div class="rc-legal">Propuesta generada automáticamente. Requiere validación del equipo comercial. No constituye asesoramiento financiero.</div>`;

  recState.ultima = { R, porQue, riesgos, fl };
  recDibujarPayoff(s, R);
}

const REC_ESTR_PRECIO = {
  venta: { chip: 'Venta de futuro', sub: 'fija el precio de la física sin precio' },
  puts:  { chip: 'Compra de puts', sub: 'piso de precio y conserva la suba · si la VI está baja' },
  calls: { chip: 'Venta de física + calls', sub: 'si hay que vender por caja, recomprar la suba' },
};

// Tarjeta de una cobertura direccional (señal de precio)
function recRenderTarjetaPrecio(s, host) {
  const R = recArmarPrecio(s, recState.estr);
  recState.estr = R.estr;
  const p = s.puntaje, alta = R.alta, fv = s.fv;
  const l = recLegLbl(s.c1, s.pos1), n = REC_LBL[s.c1].toLowerCase();
  const t1 = R.tramos[0];
  const fl = s.fechaLimite ? spFmtFecha(s.fechaLimite) : '—';
  const opc = R.estr !== 'venta';
  const nomExt = alta ? 'máximo' : 'mínimo';
  const neutral = p.clase === 'debil';     // sin extremo: la estructura queda solo como referencia

  const chips = R.disp.map(k => {
    const e = REC_ESTR_PRECIO[k], tag = k === R.sugerida ? ' · sugerida' : '';
    return `<button class="rc-chip ${k === R.estr ? 'on' : ''}" onclick="recState.estr='${k}';recRenderTarjeta();">${k === R.estr ? '✓ ' : ''}${e.chip}<small>${e.sub}${tag}</small></button>`;
  }).join('');
  const viTxt = R.viPct != null ? `P${R.viPct}` : '—';
  const primasTxt = opc ? ` Primas: tramo 1 ${t1.fuente === 'A3' ? 'de A3' : 'por Black-76'}, tramos 2 y 3 por Black-76 (VI ${recF(R.vi ? R.vi.vi : 20, 1)} %, ${R.dte} días). Payoff al vencimiento.` : '';
  const sinSenal = neutral ? `<b>Sin señal:</b> ${l} está en P${s.pctl}, dentro de su rango histórico, así que no hay un extremo que justifique ${alta ? 'cubrir' : 'dejar de cubrir'} por precio. Lo que sigue queda como referencia.<br>` : '';
  const why = sinSenal + {
    venta: `<b>Venta de ${l}:</b> el precio está alto contra las campañas anteriores y hay ${n} sin precio. Vender futuros fija ese precio para la parte cubierta: si baja, la ganancia del futuro compensa la física; si sube, se pierde la suba en esa parte. Requiere garantía.${R.viCara ? ` La VI está en ${viTxt}: se podría sumar la venta de calls (collar), pero esa pata no tiene techo si el precio sigue subiendo.` : ''}`,
    puts: `<b>Puts de ${l}:</b> la VI de ${n} está en ${viTxt}${R.viBarata ? `, por debajo de P${REC_CONFIG.viBaja}` : ''}. El put pone un piso a la física sin precio y deja abierta la suba; el costo es la prima, que se paga por adelantado y no requiere garantía.${primasTxt}`,
    calls: `${neutral ? '<b>Venta de física + calls:</b>' : `<b>Precio bajo: no se recomienda cubrir.</b> El precio de ${l} está debajo de su nivel histórico; fijar ahora sería vender barato.`} Si hace falta vender física por caja, la alternativa es venderla y <b>recomprar la suba con calls</b>: se cobra hoy y, si el precio vuelve a su promedio, los calls recuperan parte de la diferencia. La pérdida máxima es la prima.${primasTxt}`,
  }[R.estr];

  const garTxt = v => v > 0 ? `USD ${recF(v / 1000, 1)} mil` : '—';
  const cto = q => `${recT(q)} t · ${recT(q / R.ct)}`;
  const fila = R.estr === 'venta'
    ? `<tr><td><b>${l}</b></td><td>Venta futuro</td><td class="r num">${cto(t1.q)}</td><td class="r num">${cto(R.qTot)}</td><td class="r num">${recF(R.P, 1)}</td><td class="r num">${garTxt(R.gar)}</td></tr>`
    : `<tr><td><b>${l} ${R.estr === 'puts' ? 'put' : 'call'} ${recF(t1.k, 0)}</b></td><td>Compra ${R.estr === 'puts' ? 'put' : 'call'}</td><td class="r num">${cto(t1.q)}</td><td class="r num">${cto(R.qTot)}</td><td class="r num">prima ${recF(t1.prima, 1)}</td><td class="r num">prima ${garTxt(R.primas)}</td></tr>`
      + (R.estr === 'calls' ? `<tr><td><b>${REC_LBL[s.c1]} física</b></td><td>Venta (solo si hace falta caja)</td><td class="r num">${recT(t1.q)} t</td><td class="r num">${recT(R.qTot)} t</td><td class="r num">${recF(R.P, 1)}</td><td class="r num">—</td></tr>` : '');

  const sinPos = !R.sp && recState.tnManual == null;
  const baseTxt = R.sp && recState.tnManual == null ? `${recT(R.sp.tn)} t de ${n} sin precio (posición comercial)`
    : recState.tnManual != null ? `${recT(recState.tnManual)} t ingresadas a mano` : 'sin posición cargada';
  const avisoVol = R.tope === 0
    ? `<div class="rc-aviso">Señal débil: no se propone ${alta ? 'cubrir' : 'operar'} (tope de volumen 0,0 %). Los niveles y el P&L por t son de referencia, calculados con 1 contrato por tramo.</div>`
    : R.sinVolumen ? `<div class="rc-aviso">${sinPos ? 'No hay posición comercial cargada: ingresá las t sin precio de ' + n + ' o vinculá el tablero en Escenarios.' : 'El volumen no alcanza para 1 contrato por tramo.'} Los valores por t se calculan con 1 contrato por tramo.</div>` : '';

  const cl = v => v >= 0 ? 'pnl-pos' : 'pnl-neg';
  const filasNiv = R.niveles.map(nv => {
    const a = R.pnl(nv.r, R.t1), b = R.pnl(nv.r, R.tramos);
    const tot = v => R.sinVolumen ? '—' : recMil(v);
    return `<tr class="${nv.ext ? 'ext' : ''}"><td><b>${nv.k}</b>${nv.superado ? ' <span class="rc-badge debil">ya superado</span>' : ''}<br><small style="color:var(--mudo)">${nv.lbl}</small></td><td class="r num">${fv(nv.r)}</td>
      <td class="r num ${cl(a)}">${recUsd(a / t1.q)}</td><td class="r num ${cl(a)}">${tot(a)}</td><td class="r num ${cl(b)}">${recUsd(b / R.qTot)}</td><td class="r num ${cl(b)}">${tot(b)}</td></tr>`;
  }).join('');
  const rbTxt = v => v == null ? 'sin ganancia' : recF(v, 2);

  const extremoHoy = s.ruedasDesdeExt === 0, a = s.alt;
  const porQue = [
    `El precio de ${l} está en <b>${fv(s.actual)}</b> USD/t, en el <b>percentil ${s.pctl}</b> de las ${s.nCampPrev} campañas previas ${s.enVentana ? `al mismo punto del ciclo (${s.curDte} ± ${s.ventana} días al vencimiento)` : '(toda la historia)'}${s.ajustado ? ', con los precios de antes pasados a las retenciones de hoy' : ''}.`,
    `Está <b>${fv(Math.abs(s.actual - s.histMean))} USD/t ${alta ? 'encima' : 'debajo'}</b> del promedio histórico (${fv(s.histMean)}), a <b>${recSig(s.zHist, 2)} desvíos</b> entre campañas, y ${fv(Math.abs(s.actual - s.avgCamp))} ${s.actual < s.avgCamp ? 'debajo' : 'encima'} del promedio de esta campaña (${fv(s.avgCamp)}).`
      + (a && s.ajustado ? ` Sin ajustar por retenciones daría P${a.pctl} y promedio ${a.fv(a.histMean)}.` : ''),
    s.drift == null ? 'No hay datos suficientes para medir la estacionalidad hasta la fecha límite.'
      : s.patronEst ? `Estacionalidad ${s.f * s.drift > 0 ? 'a favor' : 'en contra'} de ${alta ? 'cubrir ahora' : 'esperar'}: hasta la fecha límite el precio ${s.drift > 0 ? 'subió' : 'bajó'} (mediana <b>${s.fd(s.drift)}</b>) en ${s.f * s.drift > 0 ? s.nDriftFav : s.nDrift - s.nDriftFav} de ${s.nDrift} campañas.`
      : `Sin patrón estacional claro: hasta la fecha límite el precio subió en ${s.nDriftSube} de ${s.nDrift} campañas (mediana ${s.fd(s.drift)}).`,
    R.vi ? `La VI de ${n} está en <b>${viTxt}</b> (${recF(R.vi.vi, 1)} %)${R.viBarata ? ': las opciones están baratas.' : R.viCara ? ': las opciones están caras.' : ': en rango normal.'}` : `No hay VI de ${n} disponible.`,
    s.piso ? `<b>Encontró ${alta ? 'techo' : 'piso'}:</b> lleva ${s.ruedasDesdeExt} ruedas sin un ${nomExt} nuevo y la pendiente de 10 ruedas es ${s.fd(s.slope10)} por rueda.`
      : `${extremoHoy ? `Hoy marcó un <b>${nomExt} de la campaña</b>` : `Lleva ${s.ruedasDesdeExt} ruedas desde el ${nomExt} de la campaña`}, con pendiente de ${s.fd(s.slope10)} por rueda (10): <b>todavía no encontró ${alta ? 'techo' : 'piso'}</b>.`,
  ];
  const riesgos = [
    `<b>Cambio de régimen:</b> ${recF(s.persistencia, 1)} % de la campaña ${alta ? 'encima' : 'debajo'} del promedio histórico. ${s.regimen ? 'El precio puede haber cambiado de nivel (oferta, demanda o tipo de cambio): el promedio histórico puede no volver.' : 'Por ahora no hay señal de un desvío estructural.'}`,
    s.piso ? `<b>Momentum:</b> encontró ${alta ? 'techo' : 'piso'}, pero puede retomar la ${alta ? 'suba' : 'baja'}. La entrada sigue siendo en tramos.`
      : `<b>Momentum en contra:</b> el precio ${extremoHoy ? `hizo un ${nomExt} nuevo hoy` : `viene ${alta ? 'subiendo' : 'bajando'}`}. Esperar ${REC_CONFIG.ruedasPiso} ruedas sin un ${nomExt} nuevo antes del tramo 1.`,
    R.estr === 'venta'
      ? `<b>Pata vendida:</b> si el precio sube, el futuro pierde y pide márgenes diarios; lo compensa la física, pero la caja sale antes de vender el grano. La invalidación no es una pérdida económica neta: marca que la señal dejó de valer.`
      : `<b>Pata en opciones:</b> la prima se pierde si el precio no se mueve a favor antes del vencimiento (${s.vto1 ? spFmtFecha(s.vto1) : '—'}).`,
    `<b>Vencimiento:</b> ${l} vence el ${s.vto1 ? spFmtFecha(s.vto1) : '—'}. Cerrar o rolar antes del <b>${fl}</b>; si la física se vende en otro mes, queda riesgo de base entre el disponible y el futuro.`,
    `<b>Liquidez:</b> ${R.a1 && R.a1.ia ? `${recT(R.qTot / R.ct)} contratos contra un interés abierto de ${recT(R.a1.ia)}.` : 'sin dato de interés abierto de A3.'} Conviene entrar con órdenes límite.`,
  ];

  const titulo = neutral ? `Sin señal de cobertura: ${n} ${s.pos1} en P${s.pctl}`
    : alta ? (R.estr === 'puts' ? `Puts de ${n} ${s.pos1}` : `Cobertura: venta de ${n} ${s.pos1}`) : `Precio bajo: no cubrir ${n} ${s.pos1}`;
  host.innerHTML = `
    <div class="rc-reco-title">
      <h2>${titulo} — Señal ${recClaseLbl(p.clase)} ${p.total}</h2>
      <span class="rc-badge ${p.clase}">${recClaseLbl(p.clase)}</span>
      ${s.regimen ? '<span class="rc-badge flag">Objetivo extendido: no contar con esto</span>' : ''}
      ${R.rb1 != null && R.rb1 < 1 ? '<span class="rc-badge flag">Beneficio / riesgo bajo al objetivo 1</span>' : ''}
    </div>
    <div class="rc-reco-meta num">${l} · cobertura direccional · generado ${new Date().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })} · cerrar o rolar antes del ${fl}</div>
    <div class="rc-chips" data-html2canvas-ignore>${chips}</div>
    <div class="rc-estr-why">${why}</div>
    <div class="rc-base" data-html2canvas-ignore>Base de volumen: <b>${baseTxt}</b> · tope ${recF(R.tope * 100, 1)} % (señal ${recClaseLbl(p.clase)}).
      <span>Usar otra base (t de ${n}):</span><input type="number" min="0" step="100" value="${recState.tnManual != null ? recState.tnManual : ''}" placeholder="${R.sp ? recT(R.sp.tn).replace(/\./g, '') : 't'}" onchange="recState.tnManual=this.value===''?null:Math.max(0,+this.value);recRenderTarjeta();"></div>
    ${avisoVol}

    <div class="rc-sec">1 · Operación <small>${R.sinVolumen ? '' : `volumen: ${recF(R.tope * 100, 1)} % de ${recT(R.base)} t de ${n} = ${recT(R.V)} t`}</small></div>
    <div class="rc-scroll"><table class="rc-tabla"><thead><tr><th>Contrato</th><th>Operación</th><th class="r">Tramo 1 (hoy)</th><th class="r">Con los 3 tramos</th><th class="r">Precio ref.</th><th class="r">Garantía est.</th></tr></thead><tbody>${fila}</tbody></table></div>
    <div class="rc-note">Toneladas y contratos de ${recT(R.ct)} t. Precio ${R.a1 ? 'de A3 en vivo' : 'del último dato histórico (A3 sin datos)'}. El P&L es el de la cobertura sola: la física sin precio se mueve en sentido contrario.
      Garantías: ${recState.cfgEstado === 'ok' ? 'config_operaciones' : 'valores manuales hasta cargar config_operaciones'}.</div>

    <div class="rc-sec">2 · Entradas escalonadas <small>⅓ del volumen en cada tramo</small></div>
    <div class="rc-scroll"><table class="rc-tabla"><thead><tr><th>Tramo</th><th>Cuándo</th><th class="r">Precio ${s.pos1}</th><th class="r">${R.estr === 'venta' ? 'Venta' : R.estr === 'puts' ? 'Puts' : 'Calls'}</th></tr></thead><tbody>
      ${R.tramos.map(t => `<tr><td><b>${t.n}</b></td><td>${t.cuando}</td><td class="r num">${fv(t.r)}</td><td class="r num">${cto(t.q)}${opc ? ` · K ${recF(t.k, 0)} · prima ${recF(t.prima, 1)}` : ''}</td></tr>`).join('')}
    </tbody></table></div>

    <div class="rc-sec">3 · Objetivos e invalidación <small>P&L de la cobertura por t cubierta, al vencimiento</small></div>
    <div class="rc-scroll"><table class="rc-tabla"><thead><tr><th>Nivel</th><th class="r">Precio ${s.pos1}</th><th class="r">Tramo 1 · USD/t</th><th class="r">Tramo 1 · total</th><th class="r">3 tramos · USD/t</th><th class="r">3 tramos · total</th></tr></thead><tbody>${filasNiv}</tbody></table></div>
    <div class="rc-kv">
      <div><span>Beneficio / riesgo · tramo 1</span><b>${rbTxt(R.rb1)}</b> al objetivo 1</div>
      <div><span>Beneficio / riesgo · 3 tramos</span><b>${rbTxt(R.rb3)}</b> al objetivo 1</div>
      <div><span>Fecha límite</span><b>${fl}</b> · vto. ${l} menos ${REC_CONFIG.habilesAntesVto} hábiles</div>
      ${R.gar > 0 ? `<div><span>Garantía estimada (3 tramos)</span><b>USD ${recF(R.gar / 1000, 1)} mil</b></div>` : ''}
      ${R.primas > 0 ? `<div><span>Primas (3 tramos)</span><b>USD ${recF(R.primas / 1000, 1)} mil</b></div>` : ''}
    </div>

    <div class="rc-sec">4 · Payoff según el precio <small>la cobertura sola, al vencimiento</small></div>
    <div class="rc-payoff-box"><canvas id="rc-chart-payoff"></canvas></div>

    <div class="rc-lists">
      <div><div class="rc-sec">5 · Por qué</div><ul class="rc-list">${porQue.map(x => `<li>${x}</li>`).join('')}</ul></div>
      <div><div class="rc-sec" style="color:var(--terra)">6 · Riesgos</div><ul class="rc-list riesgos">${riesgos.map(x => `<li>${x}</li>`).join('')}</ul></div>
    </div>

    <div class="rc-acciones" data-html2canvas-ignore>
      <button class="rc-btn" id="rc-btn-pdf" onclick="recPdf()">📄 Exportar PDF</button>
      <button class="rc-btn out" onclick="recCopiar()">📋 Copiar resumen</button>
    </div>
    <div class="rc-legal">Propuesta generada automáticamente. Requiere validación del equipo comercial. No constituye asesoramiento financiero.</div>`;

  recState.ultima = { R, porQue, riesgos, fl };
  recDibujarPayoffPrecio(s, R);
}

// ─── Gráficos ───
const recLineasV = {
  id: 'recLineasV',
  afterDatasetsDraw(ch, args, opts) {
    if (!opts || !opts.lineas) return;
    const { ctx, chartArea: a, scales: { x } } = ch;
    ctx.save(); ctx.font = '600 10px Montserrat, sans-serif'; ctx.textAlign = 'center';
    opts.lineas.forEach(l => {
      const px = x.getPixelForValue(l.x); if (px < a.left || px > a.right) return;
      ctx.strokeStyle = l.c; ctx.setLineDash(l.dash || [4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, a.top + 14); ctx.lineTo(px, a.bottom); ctx.stroke();
      ctx.fillStyle = l.c; ctx.fillText(l.t, px, a.top + 9);
    });
    ctx.restore();
  }
};
const recFont = { family: 'Montserrat', size: 10 }, recMono = { family: 'JetBrains Mono', size: 10 };

function recDibujarSenal(s) {
  const cv = document.getElementById('rc-chart-senal'); if (!cv) return;
  if (recChSenal) recChSenal.destroy();
  const cur = s.serie.map(p => ({ x: p.dte1, y: p.val }));
  const ys = cur.map(p => p.y).concat(s.curva.flatMap(c => [c.m - c.s, c.m + c.s]));
  const xMax = Math.max(...cur.map(p => p.x)) + 10;
  const curva = s.curva.filter(c => c.dte <= xMax);
  const yMin = Math.min(...ys), yMax = Math.max(...ys), pad = (yMax - yMin) * 0.08;
  recChSenal = new Chart(cv, {
    type: 'line',
    data: { datasets: [
      { label: '+1σ', data: curva.map(c => ({ x: c.dte, y: c.m + c.s })), borderWidth: 0, pointRadius: 0, fill: '+1', backgroundColor: 'rgba(215,155,35,.13)' },
      { label: '−1σ', data: curva.map(c => ({ x: c.dte, y: c.m - c.s })), borderWidth: 0, pointRadius: 0, fill: false },
      { label: `Promedio ${s.nCampPrev} campañas`, data: curva.map(c => ({ x: c.dte, y: c.m })), borderColor: '#d79b23', borderWidth: 2, borderDash: [6, 3], pointRadius: 0, tension: .3 },
      { label: 'Campaña actual', data: cur, borderColor: '#006e5a', borderWidth: 2.5, pointRadius: 0, tension: .2 },
    ]},
    options: { responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { labels: { font: recFont, boxWidth: 14, filter: i => !i.text.includes('σ') } },
        tooltip: { callbacks: { title: it => it[0].parsed.x + ' días al vto.', label: it => `${it.dataset.label}: ${s.fv(it.parsed.y)}` } } },
      scales: {
        x: { type: 'linear', reverse: true, min: 0, max: xMax, title: { display: true, text: `Días al vencimiento (${s.pos1})`, font: recFont }, ticks: { font: recMono }, grid: { display: false } },
        y: { min: yMin - pad, max: yMax + pad, title: { display: s.tipo !== 'ratio', text: 'USD/t', font: recFont }, ticks: { font: recMono, callback: v => recF(v, s.T.eje) }, grid: { color: 'rgba(16,18,15,.05)' } } } }
  });
}

function recDibujarPayoff(s, R) {
  const cv = document.getElementById('rc-chart-payoff'); if (!cv) return;
  if (recChPayoff) recChPayoff.destroy();
  const niv = R.niveles.map(n => n.r).concat(R.tramos.map(t => t.r));
  const lo = Math.min(...niv), hi = Math.max(...niv), m = (hi - lo) * 0.12 || 0.01;
  const xs = []; for (let r = lo - m; r <= hi + m + 1e-9; r += (hi - lo + 2 * m) / 120) xs.push(r);
  const ds = (label, fn, c, w, dash) => ({ label, data: xs.map(r => ({ x: r, y: fn(r) / 1000 })), borderColor: c, borderWidth: w, borderDash: dash || [], pointRadius: 0, tension: 0 });
  const nom = s.c1 === s.c2 ? s.pos2 : REC_LBL[s.c2].toLowerCase();
  const lineas = [
    ...R.tramos.map(t => ({ x: t.r, t: 'E' + t.n, c: '#53544e' })),
    { x: R.niveles[0].r, t: 'Obj 1', c: '#006e5a' }, { x: R.niveles[1].r, t: 'Obj 2', c: '#006e5a' },
    { x: R.niveles[2].r, t: 'Ext', c: '#d79b23' }, { x: R.niveles[3].r, t: 'Stop', c: '#a54132', dash: [] },
  ];
  recChPayoff = new Chart(cv, {
    type: 'line', plugins: [recLineasV],
    data: { datasets: [
      ds(`Tramo 1 (${nom} ${recF(R.S, 1)})`, r => R.pnl(r, R.S, R.t1), '#006e5a', 2.5),
      ds(`3 tramos completos (${nom} ${recF(R.S, 1)})`, r => R.pnl(r, R.S, R.tramos), '#2a78d6', 2.5),
      ds(`Tramo 1, ${nom} −10,0 %`, r => R.pnl(r, R.S * 0.9, R.t1), 'rgba(0,110,90,.45)', 1, [3, 3]),
      ds(`Tramo 1, ${nom} +10,0 %`, r => R.pnl(r, R.S * 1.1, R.t1), 'rgba(0,110,90,.45)', 1, [3, 3]),
    ]},
    options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: { recLineasV: { lineas }, legend: { labels: { font: recFont, boxWidth: 14 } },
        tooltip: { callbacks: { title: it => s.T.lbl + ' ' + s.fv(it[0].parsed.x), label: it => `${it.dataset.label}: ${R.sinVolumen ? recUsd(it.parsed.y * 1000) + ' USD' : recMil(it.parsed.y * 1000)}` } } },
      scales: {
        x: { type: 'linear', min: lo - m, max: hi + m, title: { display: true, text: `${s.T.lbl} ${s.lbl} al cierre${s.tipo === 'ratio' ? '' : ' (USD/t)'}`, font: recFont },
          ticks: { font: recMono, callback: v => recF(v, s.T.eje) }, grid: { color: 'rgba(16,18,15,.05)' } },
        y: { title: { display: true, text: 'Resultado (USD mil)', font: recFont }, ticks: { font: recMono, callback: v => recF(v, 1) },
          grid: { color: c => c.tick.value === 0 ? 'rgba(16,18,15,.45)' : 'rgba(16,18,15,.05)' } } } }
  });
}

function recDibujarPayoffPrecio(s, R) {
  const cv = document.getElementById('rc-chart-payoff'); if (!cv) return;
  if (recChPayoff) recChPayoff.destroy();
  const niv = R.niveles.map(n => n.r).concat(R.tramos.map(t => t.r));
  const lo = Math.min(...niv), hi = Math.max(...niv), m = (hi - lo) * 0.12 || 5;
  const xs = []; for (let x = lo - m; x <= hi + m + 1e-9; x += (hi - lo + 2 * m) / 120) xs.push(x);
  const ds = (label, fn, c, w) => ({ label, data: xs.map(x => ({ x, y: fn(x) / 1000 })), borderColor: c, borderWidth: w, pointRadius: 0, tension: 0 });
  const lineas = [
    ...R.tramos.map(t => ({ x: t.r, t: 'E' + t.n, c: '#53544e' })),
    { x: R.niveles[0].r, t: 'Obj 1', c: '#006e5a' }, { x: R.niveles[1].r, t: 'Obj 2', c: '#006e5a' },
    { x: R.niveles[2].r, t: 'Ext', c: '#d79b23' }, { x: R.niveles[3].r, t: 'Inv.', c: '#a54132', dash: [] },
  ];
  recChPayoff = new Chart(cv, {
    type: 'line', plugins: [recLineasV],
    data: { datasets: [
      ds('Tramo 1', x => R.pnl(x, R.t1), '#006e5a', 2.5),
      ds('3 tramos completos', x => R.pnl(x, R.tramos), '#2a78d6', 2.5),
    ]},
    options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: { recLineasV: { lineas }, legend: { labels: { font: recFont, boxWidth: 14 } },
        tooltip: { callbacks: { title: it => 'Precio ' + s.fv(it[0].parsed.x), label: it => `${it.dataset.label}: ${R.sinVolumen ? recUsd(it.parsed.y * 1000) + ' USD' : recMil(it.parsed.y * 1000)}` } } },
      scales: {
        x: { type: 'linear', min: lo - m, max: hi + m, title: { display: true, text: `Precio ${recLegLbl(s.c1, s.pos1)} al vencimiento (USD/t)`, font: recFont },
          ticks: { font: recMono, callback: v => recF(v, 0) }, grid: { color: 'rgba(16,18,15,.05)' } },
        y: { title: { display: true, text: 'Resultado de la cobertura (USD mil)', font: recFont }, ticks: { font: recMono, callback: v => recF(v, 1) },
          grid: { color: c => c.tick.value === 0 ? 'rgba(16,18,15,.45)' : 'rgba(16,18,15,.05)' } } } }
  });
}

// ─── Acciones ───
async function recRecargar() {
  recState.cfgEstado = 'pendiente';
  await Promise.all([recCargarConfig(), typeof escLeerVinculado === 'function' ? escLeerVinculado(false).catch(() => {}) : null]);
  recState.radarClave = null;
  recSpRender();
}

function recCopiar() {
  const s = recState.senal, u = recState.ultima; if (!s || !u) return;
  const txt = d => d.replace(/<[^>]+>/g, '');
  const R = u.R, t1 = R.tramos[0], fv = s.fv, precio = s.tipo === 'precio';
  const estrLbl = (precio ? REC_ESTR_PRECIO : recEstrTxt(s))[R.estr].chip;
  const tramo1 = precio
    ? `Tramo 1: ${R.estr === 'venta' ? 'venta' : R.estr === 'puts' ? 'compra puts K ' + recF(t1.k, 0) + ' de' : 'compra calls K ' + recF(t1.k, 0) + ' de'} ${recT(t1.q)} t ${recLegLbl(s.c1, s.pos1)}`
    : `Tramo 1: venta ${recT(t1.qV)} t ${recLegLbl(R.venta.c, R.venta.p)} · ${R.estr === 'fisica' ? (s.c1 === s.c2 ? 'guardar' : 'reservar') : R.estr === 'calls' ? 'calls' : 'compra'} ${recT(t1.qC)} t ${recLegLbl(R.compra.c, R.compra.p)}`;
  const lineas = [
    `RECOMENDACIÓN · ${s.lbl} · Señal ${recClaseLbl(s.puntaje.clase)} ${s.puntaje.total}`,
    `${s.T.lbl} ${fv(s.actual)} · P${s.pctl} · prom. histórico ${fv(s.histMean)} · prom. campaña ${fv(s.avgCamp)}`,
    `Estructura: ${estrLbl}`,
    tramo1,
    `Entradas: ${R.tramos.map(t => fv(t.r)).join(' / ')} · Objetivos: ${R.niveles.slice(0, 3).map(n => fv(n.r)).join(' / ')} · ${R.niveles[3].k}: ${fv(R.niveles[3].r)}`,
    `Cerrar o rolar antes del ${u.fl}`,
    '', 'Por qué:', ...u.porQue.map(x => '· ' + txt(x)), '', 'Riesgos:', ...u.riesgos.map(x => '· ' + txt(x)), '',
    'Propuesta generada automáticamente. Requiere validación del equipo comercial. No constituye asesoramiento financiero.',
  ];
  const t = lineas.join('\n');
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => alert('Resumen copiado.'), () => prompt('Copiá el resumen:', t));
}

// PDF de la tarjeta con las mismas librerías que Escenarios (html2canvas + jsPDF)
async function recPdf() {
  const card = document.getElementById('rc-tarjeta'), s = recState.senal;
  if (!card || !s) return;
  const btn = document.getElementById('rc-btn-pdf'), txt = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Generando PDF…'; }
  try {
    await escPdfLibs();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const cv = await html2canvas(card, { scale: 2, backgroundColor: '#ffffff', logging: false });
    const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), mg = 24, pie = 26;
    const w = pw - 2 * mg, k = w / cv.width, util = ph - mg - pie;
    for (let desde = 0, pag = 0; desde < cv.height; pag++) {
      if (pag) pdf.addPage();
      const alto = Math.min(cv.height - desde, Math.floor(util / k));
      const trozo = document.createElement('canvas');
      trozo.width = cv.width; trozo.height = alto;
      trozo.getContext('2d').drawImage(cv, 0, desde, cv.width, alto, 0, 0, cv.width, alto);
      pdf.addImage(trozo.toDataURL('image/jpeg', 0.92), 'JPEG', mg, mg, w, alto * k);
      desde += alto;
    }
    const n = pdf.getNumberOfPages(), fecha = new Date().toLocaleDateString('es-AR');
    for (let i = 1; i <= n; i++) {
      pdf.setPage(i);
      pdf.setDrawColor(215, 155, 35); pdf.setLineWidth(0.6); pdf.line(mg, ph - 20, pw - mg, ph - 20);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(139, 138, 131);
      pdf.text(`Espartina S.A. · Recomendación de operación · ${fecha} · propuesta, requiere validación del equipo comercial`, mg, ph - 10);
      pdf.text(`${i} / ${n}`, pw - mg, ph - 10, { align: 'right' });
    }
    const f = new Date(), dos = v => String(v).padStart(2, '0');
    pdf.save(`Recomendacion ${s.c1} ${s.pos1}${s.pos2 ? '-' + s.pos2 : ''} ${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}.pdf`);
  } catch (e) {
    alert('No pude generar el PDF: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = txt; }
  }
}

// ═══════════════════════════════════════════════════
// ENGANCHE CON SPREADS
// ═══════════════════════════════════════════════════

// Antes era una pestaña propia: si quedó guardada como último módulo abierto, se abre Spreads
function toggleRecomendaciones() { toggleSpreads(); }

// Fuentes que Spreads no carga (garantías y posición comercial): se piden al entrar al módulo
async function recSpCargarFuentes() {
  const tareas = [recCargarConfig()];
  if (typeof escLeerVinculado === 'function') tareas.push(escLeerVinculado(false).catch(() => {}));
  await Promise.all(tareas);
  if (spreadMode) recSpProgramar();
}

(function recEngancharSpreads() {
  // Cada recálculo de Spreads (selectores, modo, filtro de campañas) vuelve a puntuar el par elegido
  const origCalc = window.spCalcSpread;
  if (typeof origCalc === 'function') window.spCalcSpread = function () {
    const r = origCalc.apply(this, arguments);
    recState.precioId = null;
    recSpProgramar();
    return r;
  };
  const origTog = window.toggleSpreads;
  if (typeof origTog === 'function') window.toggleSpreads = function () {
    const r = origTog.apply(this, arguments);
    recSpCargarFuentes();
    return r;
  };
  // Si llegan precios de A3 con Spreads abierto, se recalcula la tarjeta
  const origFS = window.finishSync;
  if (typeof origFS === 'function') window.finishSync = function () {
    const r = origFS.apply(this, arguments);
    if (spreadMode) recSpProgramar();
    return r;
  };
})();
