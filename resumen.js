// ═══════════════════════════════════════════════════
// ─── RESUMEN COMERCIAL ───
// Recorre los módulos de la Suite, aplica las reglas de reglas_resumen.js y arma
// un informe: resumen ejecutivo + una sección por módulo. Exporta a PDF y a texto
// (WhatsApp / mail). No recalcula nada propio: usa las mismas funciones y datos
// que cada módulo (A3, Drive histórico, Sheet FOB, Line-Up y las solapas guardadas).
// ═══════════════════════════════════════════════════

let resumenMode = false;
let rsUltimo = null;        // último informe generado (para exportar a texto)
let rsCargando = false;

const RS_CROP = { soja: 'Soja', maiz: 'Maíz', trigo: 'Trigo', girasol: 'Girasol' };
const RS_ICON = { oportunidad: '🟢', alerta: '🟠', info: '⚪' };
const RS_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// ─── Helpers ───
function rsF(n, d = 1) {
  if (n == null || !isFinite(n)) return '—';
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function rsSigno(n, d = 1) { return (n > 0 ? '+' : n < 0 ? '−' : '') + rsF(Math.abs(n), d); }
function rsCrop(c) { return RS_CROP[c] || c; }
function rsYY(anio) { return String(anio % 100).padStart(2, '0'); }

// Un hallazgo del informe
function rsHall(tipo, prioridad, titulo, texto, regla, accion) {
  return { tipo, prioridad, titulo, texto, regla: regla || '', accion: accion || '' };
}

// Precio del futuro (A3) para cultivo + posición
function rsFut(crop, pos) {
  if (!sheetData || !sheetData.futuros[crop]) return null;
  const f = sheetData.futuros[crop].find(x => x.pos === pos && x.precio > 0);
  return f ? f.precio : null;
}

// Prima de mercado (A3) para una opción
function rsPrimaMkt(crop, pos, type, strike) {
  if (!sheetData) return null;
  const byPos = (sheetData.opciones[crop] || {})[pos];
  if (!byPos) return null;
  const o = (type === 'put' ? byPos.puts : byPos.calls).find(x => Math.abs(x.strike - strike) < 1e-9);
  return o && o.prima > 0 ? o.prima : null;
}

function rsDte(pos) {
  if (!pos || typeof asstExpiry !== 'function') return null;
  const e = asstExpiry(pos);
  return e ? asstDays(new Date(), e) : null;
}

// ═══════════════════════════════════════════════════
// 1) MERCADO / ESTADO DE LOS DATOS
// ═══════════════════════════════════════════════════
function rsMercado() {
  const sec = { id: 'mercado', titulo: 'Mercado y datos', hallazgos: [], html: '' };
  if (!sheetData) {
    sec.hallazgos.push(rsHall('alerta', 90, 'Sin datos de A3', 'No hay precios de futuros ni opciones cargados. El resumen queda incompleto.', 'Datos A3 disponibles', 'Sincronizar A3.'));
    return sec;
  }
  const fd = sheetData.fechaDatos || '';
  const m = fd.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (m) {
    const f = new Date(+m[3], +m[2] - 1, +m[1]); const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const dias = Math.round((hoy - f) / 86400000);
    if (dias > RS_REGLAS.diasDatosViejos) {
      sec.hallazgos.push(rsHall('alerta', 85, 'Datos de mercado desactualizados',
        `Los precios de A3 son del ${fd} (${dias} días). Las conclusiones pueden no reflejar el mercado de hoy.`,
        `Antigüedad > ${RS_REGLAS.diasDatosViejos} días`, 'Sincronizar A3 y regenerar el resumen.'));
    }
  }
  // Tabla de futuros cercanos
  let rows = '';
  ['soja', 'maiz', 'trigo', 'girasol'].forEach(c => {
    const list = (sheetData.futuros[c] || []).filter(f => f.precio > 0).slice(0, 4);
    if (!list.length) return;
    rows += `<tr><td class="rs-l">${rsCrop(c)}</td>${list.map(f => `<td>${f.pos}<br><b>${rsF(f.precio)}</b></td>`).join('')}${'<td></td>'.repeat(4 - list.length)}</tr>`;
  });
  sec.html = `<table class="rs-table"><thead><tr><th class="rs-l">Futuros A3 (u$s/tn)</th><th colspan="4">Posiciones más cercanas</th></tr></thead><tbody>${rows}</tbody></table>`;
  return sec;
}

// ═══════════════════════════════════════════════════
// 2) COBERTURAS — todas las solapas
// ═══════════════════════════════════════════════════

// Métricas de una estrategia a un precio de futuro F (independiente de la solapa activa)
function rsStratMetrics(s, F) {
  const MAXP = 1500;
  let minP = Infinity, maxP = -Infinity;
  for (let p = 0; p <= MAXP; p++) { const v = calcPayoff(s, p); if (v < minP) minP = v; if (v > maxP) maxP = v; }
  let cost = 0;
  s.legs.forEach(l => { if (l.type !== 'futuro') cost += (l.dir === 'buy' ? l.prima : -l.prima) * (l.ratio || 1); });
  const shortPuts = s.legs.filter(l => l.type === 'put' && l.dir === 'sell');
  const longPutQ = s.legs.filter(l => l.type === 'put' && l.dir === 'buy').reduce((a, l) => a + (l.ratio || 1), 0);
  const shortPutQ = shortPuts.reduce((a, l) => a + (l.ratio || 1), 0);
  let piso = null, pisoHasta = null;
  if (minP >= F * 0.5) piso = minP;
  else if (shortPuts.length) {
    pisoHasta = Math.min(...shortPuts.map(l => l.strike));
    let loc = Infinity; for (let p = Math.ceil(pisoHasta); p <= MAXP; p++) loc = Math.min(loc, calcPayoff(s, p));
    piso = loc;
  }
  const techo = maxP > MAXP - 100 ? null : maxP;
  const bes = []; let prev = calcPayoff(s, 0);
  for (let p = 1; p <= MAXP; p++) {
    const d = calcPayoff(s, p) - p;
    if ((prev < 0 && d >= 0) || (prev > 0 && d <= 0)) bes.push(d === prev ? p : (p - 1) + prev / (prev - d));
    prev = d;
  }
  return { cost, piso, pisoHasta, techo, be: bes.length === 1 ? bes[0] : null, bes, ratioDescubierto: shortPutQ > longPutQ };
}

// Valor de mercado hoy de la estructura (primas actuales) vs lo pagado/cobrado al armarla
function rsMarkToMarket(s, crop, pos, F) {
  let actual = 0, entrada = 0;
  for (const l of s.legs) {
    const q = (l.ratio || 1) * (l.dir === 'buy' ? 1 : -1);
    if (l.type === 'futuro') { actual += q * (F - l.strike); continue; }
    const pm = rsPrimaMkt(crop, pos, l.type, l.strike);
    if (pm == null) return null;
    actual += q * pm; entrada += q * l.prima;
  }
  return actual - entrada; // u$s/tn
}

function rsCoberturas() {
  const R = RS_REGLAS.coberturas;
  const sec = { id: 'coberturas', titulo: 'Coberturas', hallazgos: [], html: '' };
  const pct = R.escenarioPct / 100;
  let html = '';
  let hayAlguna = false;

  tabs.forEach(t => {
    const strats = (t.strategies || []).filter(s => s.legs && s.legs.length);
    if (!strats.length) return;
    hayAlguna = true;
    const crop = t.assetVal, pos = t.pos || '';
    const F = rsFut(crop, pos) || t.spot;
    const dte = rsDte(pos);
    const sel = strats.slice().sort((a, b) => getStratVol(b) - getStratVol(a)).slice(0, R.maxEstrategiasPorSolapa);
    const etiqueta = `${escHtml(t.name)} · ${rsCrop(crop)} ${pos || ''}`.trim();
    const pDn = F * (1 - pct), pUp = F * (1 + pct);

    // Vencimiento (uno por solapa)
    if (dte != null) {
      if (dte < 0) sec.hallazgos.push(rsHall('alerta', 70, `${etiqueta}: posición vencida`, `La posición ${pos} ya venció. Las estrategias de esta solapa no tienen vigencia.`, 'Días al vencimiento < 0', 'Cerrar la solapa o pasar las estrategias a otra posición.'));
      else if (dte < R.diasVencAlerta) sec.hallazgos.push(rsHall('alerta', 65, `${etiqueta}: vence en ${dte} días`, `Quedan ${dte} días al vencimiento de las opciones de ${pos}; el theta se acelera y el tiempo juega en contra de lo comprado.`, `Días al vencimiento < ${R.diasVencAlerta}`, 'Decidir si se ejerce, se cierra o se rollea a la próxima posición.'));
      else if (dte < R.diasVencAviso) sec.hallazgos.push(rsHall('info', 30, `${etiqueta}: vence en ${dte} días`, `Las opciones de ${pos} entran en la zona de aceleración del theta.`, `Días al vencimiento < ${R.diasVencAviso}`, 'Planificar rolleo / cierre.'));
    }

    const filas = [];
    sel.forEach(s => {
      const m = rsStratMetrics(s, F);
      const vol = getStratVol(s);
      const costPct = F > 0 ? m.cost / F * 100 : 0;
      const nom = escHtml(s.name);
      const mtm = rsMarkToMarket(s, crop, pos, F);
      filas.push({ s, m, vol, mtm, dn: calcPayoff(s, pDn), sp: calcPayoff(s, F), up: calcPayoff(s, pUp) });

      if (s.legs.some(l => l.estimada)) sec.hallazgos.push(rsHall('alerta', 60, `${nom}: primas de referencia`, `Una o más patas no tienen prima en A3; el costo y el piso de "${nom}" son estimados.`, 'Pata sin prima de mercado', 'Revisar el strike o cargar la prima real.'));
      if (m.cost > 0 && costPct > R.costoCaroPct) sec.hallazgos.push(rsHall('alerta', 50, `${nom}: cobertura cara`, `Cuesta u$s ${rsF(m.cost, 2)}/tn (${rsF(costPct)}% del futuro ${rsF(F)}).`, `Prima neta > ${R.costoCaroPct}% del futuro`, 'Evaluar abaratar con put spread o financiar con venta de call.'));
      else if (m.cost > 0 && costPct < R.costoBaratoPct && s.legs.some(l => l.type === 'put' && l.dir === 'buy')) sec.hallazgos.push(rsHall('oportunidad', 35, `${nom}: protección barata`, `Cuesta solo u$s ${rsF(m.cost, 2)}/tn (${rsF(costPct)}% del futuro).`, `Prima neta < ${R.costoBaratoPct}% del futuro`, ''));
      if (m.ratioDescubierto) sec.hallazgos.push(rsHall('alerta', 62, `${nom}: más puts vendidos que comprados`, `Por debajo de ${Math.min(...s.legs.filter(l => l.type === 'put' && l.dir === 'sell').map(l => l.strike))} la pérdida se amplifica.`, 'Puts vendidos > puts comprados', 'Confirmar que el volumen y las garantías lo soportan.'));
      else if (m.pisoHasta != null && m.pisoHasta > F * 0.8) sec.hallazgos.push(rsHall('alerta', 45, `${nom}: protección hasta ${m.pisoHasta}`, `Asegura u$s ${rsF(m.piso)} mientras el futuro no baje de ${m.pisoHasta} (${rsF((1 - m.pisoHasta / F) * 100)}% abajo del actual); más abajo queda descubierta.`, 'Put vendido a menos de 20% del futuro', 'Aceptable si se considera improbable esa baja; si no, subir la franquicia.'));
      else if (m.piso != null && m.pisoHasta == null && (F - m.piso) / F * 100 > R.pisoLejanoPct) sec.hallazgos.push(rsHall('alerta', 40, `${nom}: piso lejano`, `El piso (u$s ${rsF(m.piso)}) está ${rsF((F - m.piso) / F * 100)}% debajo del futuro.`, `Piso > ${R.pisoLejanoPct}% debajo del futuro`, 'Considerar un strike más alto si se busca proteger el margen.'));
      if (m.techo != null && (m.techo - F) / F * 100 < R.techoPegadoPct) sec.hallazgos.push(rsHall('alerta', 50, `${nom}: techo pegado al precio`, `El techo (u$s ${rsF(m.techo)}) está a solo ${rsF((m.techo - F) / F * 100)}% del futuro: resigna casi toda la suba.`, `Techo < ${R.techoPegadoPct}% sobre el futuro`, 'Subir el strike del call vendido o evaluar una estructura sin techo.'));
      if (m.techo != null && typeof asstWeatherNow === 'function' && asstWeatherNow()) sec.hallazgos.push(rsHall('alerta', 40, `${nom}: techo en weather market`, `Estamos en ventana de weather market (${asstWeatherLbl()}); un call vendido puede limitar una suba brusca.`, 'Call vendido en ventana climática', 'Monitorear de cerca el call vendido.'));
      if (mtm != null && Math.abs(mtm) >= 0.5) sec.hallazgos.push(rsHall('info', 20, `${nom}: valor de mercado ${rsSigno(mtm, 2)} u$s/tn`, `Con las primas de hoy, la estructura vale ${rsSigno(mtm, 2)} u$s/tn contra lo pagado al armarla (${rsSigno(mtm * vol, 0)} u$s sobre ${rsF(vol, 0)} tn).`, 'Mark-to-market con primas A3', ''));
    });

    // Qué estrategia conviene en cada escenario
    const mejor = key => {
      let best = { nombre: 'sin cobertura', v: key === 'dn' ? pDn : key === 'sp' ? F : pUp };
      filas.forEach(f => { if (f[key] > best.v + 0.05) best = { nombre: escHtml(f.s.name), v: f[key] }; });
      return best;
    };
    const bDn = mejor('dn'), bSp = mejor('sp'), bUp = mejor('up');
    sec.hallazgos.push(rsHall('info', 45, `${etiqueta}: qué conviene según el escenario`,
      `Futuro ${rsF(F)}. Si baja ${R.escenarioPct}% (${rsF(pDn)}): <b>${bDn.nombre}</b> (${rsF(bDn.v)}). Si queda igual: <b>${bSp.nombre}</b> (${rsF(bSp.v)}). Si sube ${R.escenarioPct}% (${rsF(pUp)}): <b>${bUp.nombre}</b> (${rsF(bUp.v)}).`,
      'Precio neto de venta por escenario', ''));

    html += `<div class="rs-sub">${etiqueta} <span>futuro ${rsF(F)}${dte != null ? ' · vence en ' + dte + ' días' : ''}</span></div>
      <table class="rs-table"><thead><tr><th class="rs-l">Estrategia</th><th>Costo</th><th>Piso</th><th>Techo</th><th>Break-even</th><th>−${R.escenarioPct}%</th><th>Hoy</th><th>+${R.escenarioPct}%</th><th>Vol. (tn)</th><th>Valor hoy</th></tr></thead><tbody>
      ${filas.map(f => `<tr><td class="rs-l" style="color:${f.s.color};font-weight:600">${escHtml(f.s.name)}</td>
        <td>${f.m.cost > 0 ? rsF(f.m.cost, 2) : 'crédito ' + rsF(-f.m.cost, 2)}</td>
        <td>${f.m.piso != null ? rsF(f.m.piso) + (f.m.pisoHasta != null ? `<small> hasta ${f.m.pisoHasta}</small>` : '') : '<span class="rs-neg">sin piso</span>'}</td>
        <td>${f.m.techo != null ? rsF(f.m.techo) : 'sin techo'}</td>
        <td>${f.m.be != null ? rsF(f.m.be) : (f.m.bes.length > 1 ? 'múltiples' : '—')}</td>
        <td>${rsF(f.dn)}</td><td>${rsF(f.sp)}</td><td>${rsF(f.up)}</td>
        <td>${rsF(f.vol, 0)}</td><td>${f.mtm != null ? rsSigno(f.mtm, 2) : '—'}</td></tr>`).join('')}
      </tbody></table>`;
  });

  if (!hayAlguna) sec.hallazgos.push(rsHall('info', 10, 'Sin estrategias cargadas', 'No hay estrategias con patas en ninguna solapa.', '', 'Armar las coberturas en la pestaña Coberturas.'));
  sec.html = html;
  return sec;
}

// ═══════════════════════════════════════════════════
// 3) VOLATILIDAD (VI vs historia y vs realizada)
// ═══════════════════════════════════════════════════
function rsPercVi(vi, p) {
  if (!p) return null;
  const pts = [[0, 0], [10, p.p10], [25, p.p25], [50, p.p50], [75, p.p75], [90, p.p90]];
  if (vi >= p.p90) return 95;
  for (let i = 1; i < pts.length; i++) {
    if (vi <= pts[i][1]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return Math.round(x0 + (x1 - x0) * (y1 > y0 ? (vi - y0) / (y1 - y0) : 0));
    }
  }
  return 95;
}

function rsVol() {
  const R = RS_REGLAS.vol;
  const sec = { id: 'vol', titulo: 'Volatilidad y primas', hallazgos: [], html: '' };
  if (!ASST_VIVHV.length) { sec.hallazgos.push(rsHall('info', 10, 'Sin histórico de volatilidad', 'No se cargaron los datos de VI/HV desde Drive.', '', '')); return sec; }
  const mes = new Date().getMonth() + 1;
  let rows = '';
  ['soja', 'maiz', 'trigo'].forEach(c => {
    const hv = ASST_VIVHV.filter(r => r.cultivo === c);
    const l = hv[hv.length - 1];
    if (!l || !(l.vi_atm > 0)) return;
    const perc = ASST_VI_PERC.find(v => v.cultivo === c && v.mes === mes);
    const pr = rsPercVi(l.vi_atm, perc);
    const ratio = l.hv_20d > 0 ? l.vi_atm / l.hv_20d : null;
    rows += `<tr><td class="rs-l">${rsCrop(c)}</td><td>${rsF(l.vi_atm)}%</td><td>${pr != null ? 'P' + pr : '—'}</td><td>${perc ? rsF(perc.p50) + '%' : '—'}</td><td>${rsF(l.hv_20d)}%</td><td>${ratio ? rsF(ratio, 2) + 'x' : '—'}</td></tr>`;
    const barata = (pr != null && pr <= R.viBarataPercentil) || (ratio != null && ratio < R.viHvBarata);
    const cara = (pr != null && pr >= R.viCaraPercentil) || (ratio != null && ratio > R.viHvCara);
    const datos = `VI ATM ${rsF(l.vi_atm)}%${pr != null ? ' (P' + pr + ' del mes)' : ''}, VI/HV20 ${ratio ? rsF(ratio, 2) + 'x' : '—'}.`;
    if (barata && !cara) sec.hallazgos.push(rsHall('oportunidad', 55, `${rsCrop(c)}: primas baratas`, `${datos} Las opciones cotizan por debajo de lo habitual y/o de lo que se mueve el precio.`, `VI ≤ P${R.viBarataPercentil} o VI/HV < ${R.viHvBarata}`, 'Buen momento para COMPRAR protección (puts, put spreads).'));
    else if (cara && !barata) sec.hallazgos.push(rsHall('oportunidad', 50, `${rsCrop(c)}: primas caras`, `${datos} Las opciones cotizan caras.`, `VI ≥ P${R.viCaraPercentil} o VI/HV > ${R.viHvCara}`, 'Preferir estructuras que VENDEN prima (collar, gaviota, put spread) en lugar del put seco.'));
    else sec.hallazgos.push(rsHall('info', 15, `${rsCrop(c)}: primas en rango normal`, datos, 'VI entre percentiles', ''));
  });
  if (typeof asstWeatherNow === 'function' && asstWeatherNow()) sec.hallazgos.push(rsHall('info', 35, 'Ventana de weather market', `Estamos en ventana de weather market (${asstWeatherLbl()}): la volatilidad tiende a subir.`, 'Calendario climático', 'Evitar vender calls cerca del precio.'));
  sec.html = `<table class="rs-table"><thead><tr><th class="rs-l">Cultivo</th><th>VI ATM</th><th>Percentil (mes)</th><th>Mediana hist.</th><th>HV 20d</th><th>VI/HV</th></tr></thead><tbody>${rows}</tbody></table>`;
  return sec;
}

// ═══════════════════════════════════════════════════
// 4) PASES & TASAS
// ═══════════════════════════════════════════════════
function rsFechaVto(crop, pos) {
  const f = (sheetData && sheetData.futuros[crop] || []).find(x => x.pos === pos);
  return (f && f.vto && paseParseVto(f.vto)) || paseEstimateDate(pos);
}

// Futuros con precio cuyo vencimiento está al menos a N días (descarta la posición que
// está venciendo, que suele tener poco interés abierto y distorsiona pases y paridades).
function rsFutsVigentes(crop) {
  const min = new Date(); min.setDate(min.getDate() + RS_REGLAS.diasMinPosicion);
  const minIso = min.toISOString().slice(0, 10);
  return (sheetData && sheetData.futuros[crop] || []).filter(f => f.precio > 0 && rsFechaVto(crop, f.pos) >= minIso);
}

function rsPases() {
  const R = RS_REGLAS.pases;
  const sec = { id: 'pases', titulo: 'Pases & Tasas', hallazgos: [], html: '' };
  const num = id => { const el = document.getElementById(id); return el ? (parseFloat(el.value) || 0) : 0; };
  const credUSD = num('pase-tasa-credito-usd'), alm = num('pase-almacenaje');

  // A) Carry en dólares: futuro más cercano contra cada posición siguiente (hasta 12 meses)
  let rows = '';
  if (sheetData) {
    ['soja', 'maiz', 'trigo'].forEach(c => {
      const futs = rsFutsVigentes(c);
      if (futs.length < 2) return;
      const p1 = futs[0], d1 = rsFechaVto(c, p1.pos);
      let best = null;
      futs.slice(1).forEach(p2 => {
        const dias = paseDaysBetween(d1, rsFechaVto(c, p2.pos));
        if (dias <= 0 || dias > 370) return;
        const neta = ((p2.precio - p1.precio - alm * dias / 30) / p1.precio) * (365 / dias) * 100;
        rows += `<tr><td class="rs-l">${rsCrop(c)}</td><td>${p1.pos} → ${p2.pos}</td><td>${dias}</td><td>${rsSigno(p2.precio - p1.precio)}</td><td class="${neta >= credUSD ? 'rs-pos' : 'rs-neg'}">${rsF(neta)}%</td></tr>`;
        if (!best || neta > best.neta) best = { p2, dias, neta };
      });
      if (!best) return;
      const dif = best.neta - credUSD;
      if (dif > R.margenPp) sec.hallazgos.push(rsHall('oportunidad', 55, `${rsCrop(c)}: el mercado paga por guardar`,
        `El pase ${p1.pos} → ${best.p2.pos} (${best.dias} días) rinde ${rsF(best.neta)}% TNA neto de almacenaje, contra un crédito u$s de ${rsF(credUSD)}%.`,
        `Tasa neta del pase > crédito u$s + ${R.margenPp} pp`, `Retener y vender ${best.p2.pos} (aunque haya que financiarse en u$s).`));
      else if (dif < -R.margenPp) sec.hallazgos.push(rsHall('oportunidad', 50, `${rsCrop(c)}: no conviene guardar`,
        `El mejor pase (${p1.pos} → ${best.p2.pos}) rinde ${rsF(best.neta)}% TNA neto, menos que el crédito u$s (${rsF(credUSD)}%).`,
        `Tasa neta del pase < crédito u$s − ${R.margenPp} pp`, `Vender cercano (${p1.pos}) y evitar el costo financiero de retener.`));
      else sec.hallazgos.push(rsHall('info', 20, `${rsCrop(c)}: pase en zona neutra`, `El mejor pase (${p1.pos} → ${best.p2.pos}) rinde ${rsF(best.neta)}% TNA neto, similar al crédito u$s (${rsF(credUSD)}%).`, `Diferencia dentro de ±${R.margenPp} pp`, ''));
    });
  }

  // B) Comparador de estrategias de venta: el par configurado en el módulo Pases
  try {
    if (!document.getElementById('pase-p1-price').value && typeof paseUpdatePositions === 'function') paseUpdatePositions();
    const inp = paseGetInputs();
    const pairs = paseBuildPairs(inp);
    if (pairs.length) {
      const pair = pairs[0];
      const calc = paseCalcPair(pair, inp.almacenaje);
      const strats = paseCalcStrategies(pair, inp, calc);
      // Se recomienda la mejor alternativa SIN riesgo cambiario; si la de mayor resultado
      // tiene exposición al TC, se menciona aparte.
      const top = strats[0];
      const best = strats.find(s => !s.riskTC) || top;
      const base = strats.find(s => s.isBase) || strats[strats.length - 1];
      const delta = best.resultUSD - base.resultUSD;
      if (top !== best && top.resultUSD - best.resultUSD >= R.ventajaMinUsd) sec.hallazgos.push(rsHall('info', 30, `${pair.label}: alternativa con riesgo cambiario`,
        `${top.name.replace(/^[①-⑨]\s*/, '')} daría ${rsF(top.resultUSD)} u$s/tn (${rsSigno(top.resultUSD - best.resultUSD, 2)} vs la mejor cubierta), pero sin cobertura de TC.`,
        'Alternativa con exposición cambiaria', 'Solo si se acepta el riesgo de devaluación.'));
      const tcTxt = `TC spot ${rsF(inp.tcSpot, 0)} / futuro ${rsF(inp.tcFut2, 0)} (cargados en Pases)`;
      if (calc.tasaTCimpl > R.devaAtipicaTna || calc.tasaTCimpl < 0) sec.hallazgos.push(rsHall('alerta', 60, 'Pases: revisar tipo de cambio', `La devaluación implícita del TC cargado es ${rsF(calc.tasaTCimpl)}% TNA, un valor atípico. ${tcTxt}.`, `Deva implícita > ${R.devaAtipicaTna}% o negativa`, 'Actualizar TC spot y futuro ROFEX en Pases & Tasas.'));
      if (best.isBase || delta < R.ventajaMinUsd) sec.hallazgos.push(rsHall('oportunidad', 45, `${pair.label}: vender hoy`,
        `Ninguna alternativa mejora a vender ${pair.from.name} hoy y aplicar la caja al costo de capital por más de ${R.ventajaMinUsd} u$s/tn. ${tcTxt}.`,
        'Mejor alternativa vs. vender hoy < ventaja mínima', 'Vender cercano.'));
      else sec.hallazgos.push(rsHall('oportunidad', 52, `${pair.label}: ${best.name.replace(/^[①-⑨]\s*/, '')}`,
        `Es la mejor alternativa: ${rsF(best.resultUSD)} u$s/tn a la fecha de ${pair.to.name}, ${rsSigno(delta, 2)} u$s/tn contra vender hoy.${best.riskTC ? ' ⚠ Tiene exposición cambiaria.' : ''} ${tcTxt}.`,
        `Ranking del comparador de estrategias de venta`, best.desc));
    }
  } catch (e) { console.warn('Resumen/Pases:', e); }

  sec.html = rows ? `<table class="rs-table"><thead><tr><th class="rs-l">Cultivo</th><th>Pase</th><th>Días</th><th>Pase u$s/tn</th><th>TNA neta vs crédito ${rsF(credUSD)}%</th></tr></thead><tbody>${rows}</tbody></table>` : '';
  return sec;
}

// ═══════════════════════════════════════════════════
// 5) FONDEO
// ═══════════════════════════════════════════════════
function rsFondeo() {
  const sec = { id: 'fondeo', titulo: 'Fondeo', hallazgos: [], html: '' };
  if (typeof fondeoGetInputs !== 'function') return sec;
  fondeoInit();
  const inp = fondeoGetInputs();
  if (inp.dias <= 0 || inp.precioUSD <= 0) { sec.hallazgos.push(rsHall('info', 5, 'Fondeo sin datos', 'Falta la fecha de repago o el precio en el módulo Fondeo.', '', '')); return sec; }
  const im = fondeoImplicitas(inp);
  const ops = fondeoCalcOpciones(inp, im);
  const bench = fondeoBenchmark(inp);
  if (!ops.length) return sec;
  const best = ops[0];
  const base = `Para u$s ${rsF(inp.monto, 0)} a ${inp.dias} días (con los datos cargados en Fondeo)`;
  if (bench && bench.usdHoy >= best.usdHoy) sec.hallazgos.push(rsHall('oportunidad', 45, 'Fondeo: conviene vender disponible',
    `${base}, vender el disponible (${rsF(bench.usdHoy)} u$s/tn) rinde más que la mejor vía de crédito (${best.short}, ${rsF(best.usdHoy)} u$s/tn hoy).`,
    'Disponible ≥ mejor financiamiento', 'Vender disponible en lugar de endeudarse.'));
  else sec.hallazgos.push(rsHall('info', 40, `Fondeo: la vía más barata es ${best.short}`,
    `${base}, ${best.name.toLowerCase()} cuesta ${rsF(best.costo)}% TNA en u$s y compromete ${rsF(best.toneladas, 0)} tn.${ops[1] ? ` Le sigue ${ops[1].short} (${rsF(ops[1].costo)}%).` : ''}`,
    'Ranking por u$s netos hoy por tonelada', ''));
  if (typeof fondeoForwardManual !== 'undefined' && fondeoForwardManual && im.gapTC < -1) sec.hallazgos.push(rsHall('alerta', 50, 'Fondeo: forward con dólar castigado',
    `El forward en pesos implica un dólar de ${rsF(im.tcImpl, 0)}, ${rsF(Math.abs(im.gapTC), 0)} pesos por debajo del ROFEX (${rsF(inp.tcFut, 0)}).`,
    'TC implícito del forward < TC futuro', 'Negociar el tipo de cambio del forward antes que la tasa del cheque.'));
  return sec;
}

// ═══════════════════════════════════════════════════
// 6) FAS & RETENCIONES (cronograma y crushing)
// ═══════════════════════════════════════════════════
function rsFobExacto(crop, pos) {
  const key = (typeof FOB_KEY_MAP !== 'undefined') ? FOB_KEY_MAP[crop] : crop;
  const p = parsePosLabel(pos);
  if (!key || !p) return null;
  const row = fobData[RS_MES[p.month - 1].toUpperCase() + ' ' + p.year];
  return row && row[key] > 0 ? { fob: row[key], row } : null;
}

// Posición más cercana (con precio en A3) que también tenga FOB en el Sheet
function rsPosConFob(crop) {
  const futs = sheetData ? rsFutsVigentes(crop) : [];
  for (const f of futs) { const fb = rsFobExacto(crop, f.pos); if (fb) return { pos: f.pos, fut: f.precio, ...fb }; }
  return null;
}

function rsFas() {
  const R = RS_REGLAS.fas;
  const sec = { id: 'fas', titulo: 'FAS & Retenciones', hallazgos: [], html: '' };

  // Próximos escalones del cronograma de retenciones
  const hoy = new Date(), y0 = hoy.getFullYear(), m0 = hoy.getMonth() + 1;
  const lim = y0 * 12 + m0 + R.horizonteRetMeses;
  ['soja', 'maiz', 'trigo', 'girasol'].forEach(c => {
    const sched = RET_SCHEDULE[c] || [];
    const actual = getRetencion(c, y0, m0);
    const prox = sched.find(bp => bp.y * 12 + bp.m > y0 * 12 + m0 && bp.y * 12 + bp.m <= lim && bp.ret !== actual);
    if (!prox) return;
    const fb = rsPosConFob(c);
    const impacto = fb ? fb.fob * (actual - prox.ret) / 100 : null;
    sec.hallazgos.push(rsHall('info', 30, `${rsCrop(c)}: baja la retención en ${RS_MES[prox.m - 1]}-${prox.y}`,
      `Pasa de ${rsF(actual, 2)}% a ${rsF(prox.ret, 2)}%${impacto != null ? `: con el FOB actual (${rsF(fb.fob, 0)}) el FAS teórico sube ~${rsF(impacto)} u$s/tn` : ''}.`,
      'Cronograma de retenciones (RET_SCHEDULE)', 'Considerarlo al elegir la posición de venta: las posiciones posteriores al escalón tienen mejor paridad.'));
  });

  // Crushing vs exportación de poroto (soja)
  const fb = rsPosConFob('soja');
  if (fb && fb.row.aceite > 0 && fb.row.harina > 0) {
    const num = (id, d) => { const el = document.getElementById(id); const v = el ? parseFloat(el.value) : NaN; return isNaN(v) ? d : v; };
    const rs = num('ret-crush-ret-subprod', 22.5) / 100, fobS = num('ret-crush-fobbing-val', 19), ind = num('ret-crush-industria-val', 29);
    const crush = (fb.row.aceite * SOJA_REND_ACEITE + fb.row.harina * SOJA_REND_HARINA) * (1 - rs) + SOJA_REND_CASCARA * SOJA_FOB_CASCARA - fobS - ind;
    const ret = getRetencionForPos('soja', fb.pos);
    const grano = fb.fob * (1 - ret / 100) - RET_DEFAULTS.soja.fobbing;
    const dif = crush - grano;
    if (dif > R.crushVsGranoUsd) sec.hallazgos.push(rsHall('oportunidad', 40, 'Soja: la industria puede pagar más',
      `FAS crushing ${rsF(crush)} vs FAS poroto ${rsF(grano)} (${fb.pos}): la fábrica tiene ${rsF(dif)} u$s/tn más de capacidad de pago.`,
      `FAS crushing > FAS poroto + ${R.crushVsGranoUsd}`, 'Cotizar la soja a fábrica antes que a exportación.'));
    else sec.hallazgos.push(rsHall('info', 15, 'Soja: crushing vs poroto', `FAS crushing ${rsF(crush)} vs FAS poroto ${rsF(grano)} (${fb.pos}): diferencia ${rsSigno(dif)} u$s/tn.`, 'Paridad industria vs exportación', ''));
  }
  return sec;
}

// ═══════════════════════════════════════════════════
// 7) RELACIONES DE PRECIOS (+ FAS teórico vs futuro)
// ═══════════════════════════════════════════════════
function rsIndexFutpos() {
  const idx = {}; let maxF = '';
  ASST_FUTPOS.forEach(r => {
    const f = String(r.fecha).slice(0, 10);
    if (f > maxF) maxF = f;
    const k = r.cultivo + '|' + r.pos;
    (idx[k] = idx[k] || {})[f] = r;
  });
  return { idx, maxF };
}

// Contrato vigente más cercano para cultivo + mes (el que cotizó en la última fecha)
function rsAnclaje(crop, mes, maxF) {
  let best = null;
  ASST_FUTPOS.forEach(r => {
    if (r.cultivo !== crop || r.mes_label !== mes || String(r.fecha).slice(0, 10) !== maxF) return;
    if (!best || r.dias_vto < best.dias_vto) best = r;
  });
  return best;
}

function rsSerieComun(idx, c1, p1, c2, p2, tipo) {
  const a = idx[c1 + '|' + p1], b = idx[c2 + '|' + p2];
  if (!a || !b) return [];
  return Object.keys(a).filter(f => b[f]).sort().map(f => {
    const v = tipo === 'ratio' ? (b[f].precio > 0 ? a[f].precio / b[f].precio : null) : a[f].precio - b[f].precio;
    return { f, v, dte: a[f].dias_vto };
  }).filter(x => x.v != null);
}

function rsRelacion(par, cache) {
  const R = RS_REGLAS.relaciones;
  const { idx, maxF } = cache;
  const anc = rsAnclaje(par.c1, par.m1, maxF);
  if (!anc) return null;
  const a1 = anc.anio_pos, p1 = par.m1 + rsYY(a1), p2 = par.m2 + rsYY(a1 + par.desfase);
  const cur = rsSerieComun(idx, par.c1, p1, par.c2, p2, par.tipo);
  if (!cur.length) return null;
  const last = cur[cur.length - 1];
  const hist = [], campanas = new Set();
  const anios = new Set(ASST_FUTPOS.filter(r => r.cultivo === par.c1 && r.mes_label === par.m1).map(r => r.anio_pos));
  anios.forEach(a => {
    if (a >= a1) return;
    rsSerieComun(idx, par.c1, par.m1 + rsYY(a), par.c2, par.m2 + rsYY(a + par.desfase), par.tipo).forEach(x => { hist.push(x); campanas.add(a); });
  });
  if (hist.length < 5) return null;
  let comp = hist.filter(x => Math.abs(x.dte - last.dte) <= R.ventanaDias);
  const enVentana = comp.length >= R.minPuntosHist;
  if (!enVentana) comp = hist;
  const vals = comp.map(x => x.v);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
  const pct = Math.round(vals.filter(v => v <= last.v).length / vals.length * 100);
  return { par, p1, p2, actual: last.v, fecha: last.f, dte: last.dte, mean, std, z: std > 0 ? (last.v - mean) / std : 0, pct, nCamp: campanas.size, enVentana };
}

function rsRelaciones() {
  const R = RS_REGLAS.relaciones;
  const sec = { id: 'relaciones', titulo: 'Relaciones de precios', hallazgos: [], html: '' };
  let rows = '';
  if (ASST_FUTPOS.length) {
    const cache = rsIndexFutpos();
    R.pares.forEach(par => {
      const r = rsRelacion(par, cache);
      if (!r) return;
      const fmt = v => par.tipo === 'ratio' ? rsF(v, 3) : rsSigno(v);
      rows += `<tr><td class="rs-l">${par.nombre}</td><td>${r.p1} / ${r.p2}</td><td><b>${fmt(r.actual)}</b></td><td>${fmt(r.mean)}</td><td class="${r.pct <= R.percentilBajo || r.pct >= R.percentilAlto ? 'rs-hot' : ''}">P${r.pct}</td><td>${rsSigno(r.z, 1)}σ</td><td>${r.nCamp}</td></tr>`;
      const ctx = `${par.nombre} (${r.p1}/${r.p2}) en ${fmt(r.actual)} contra un promedio histórico de ${fmt(r.mean)} ${r.enVentana ? `a ~${r.dte} días del vencimiento` : ''}: percentil ${r.pct} de ${r.nCamp} campañas.`;
      const regla = `Percentil ≤ P${R.percentilBajo} o ≥ P${R.percentilAlto} vs campañas anteriores`;
      // Carry alto en términos relativos pero todavía negativo: guardar no se paga en sí.
      const altaTxt = (par.carry && r.actual <= 0)
        ? `El carry es alto comparado con otras campañas, pero sigue negativo (${fmt(r.actual)}): guardar se castiga menos que otros años, aunque no suma por sí solo.`
        : par.alta;
      if (r.pct >= R.percentilAlto) sec.hallazgos.push(rsHall('oportunidad', 40 + Math.round((r.pct - R.percentilAlto) / 2), `${par.nombre}: relación alta (P${r.pct})`, ctx, regla, altaTxt));
      else if (r.pct <= R.percentilBajo) sec.hallazgos.push(rsHall('oportunidad', 40 + Math.round((R.percentilBajo - r.pct) / 2), `${par.nombre}: relación baja (P${r.pct})`, ctx, regla, par.baja));
      else sec.hallazgos.push(rsHall('info', 12, `${par.nombre}: en rango normal (P${r.pct})`, ctx, regla, ''));
    });
  }

  // FAS teórico vs futuro
  let rowsFas = '';
  R.fasCultivos.forEach(c => {
    const fb = rsPosConFob(c);
    if (!fb) return;
    const ret = getRetencionForPos(c, fb.pos);
    const fas = fb.fob * (1 - ret / 100) - RET_DEFAULTS[c].fobbing;
    const dif = fb.fut - fas;
    rowsFas += `<tr><td class="rs-l">${rsCrop(c)}</td><td>${fb.pos}</td><td>${rsF(fb.fob, 0)}</td><td>${rsF(ret, 2)}%</td><td>${rsF(fas)}</td><td>${rsF(fb.fut)}</td><td class="${dif >= 0 ? 'rs-pos' : 'rs-neg'}">${rsSigno(dif)}</td></tr>`;
    const txt = `${rsCrop(c)} ${fb.pos}: futuro ${rsF(fb.fut)} vs FAS teórico ${rsF(fas)} (FOB ${rsF(fb.fob, 0)}, retención ${rsF(ret, 2)}%).`;
    const regla = `|Futuro − FAS teórico| > ${RS_REGLAS.fas.spreadUsd} u$s/tn`;
    if (dif > RS_REGLAS.fas.spreadUsd) sec.hallazgos.push(rsHall('oportunidad', 48, `${rsCrop(c)}: el mercado paga sobre paridad (${rsSigno(dif)})`, txt, regla, 'Buen momento para vender / fijar: el precio supera lo que la exportación puede pagar por paridad.'));
    else if (dif < -RS_REGLAS.fas.spreadUsd) sec.hallazgos.push(rsHall('oportunidad', 42, `${rsCrop(c)}: el mercado paga debajo de paridad (${rsSigno(dif)})`, txt, regla, 'La exportación tiene margen: hay espacio para negociar mejor precio; no apurar ventas.'));
    else sec.hallazgos.push(rsHall('info', 12, `${rsCrop(c)}: precio en línea con la paridad`, txt, regla, ''));
  });

  sec.html = (rows ? `<table class="rs-table"><thead><tr><th class="rs-l">Relación</th><th>Posiciones</th><th>Actual</th><th>Prom. hist.</th><th>Percentil</th><th>Desvío</th><th>Campañas</th></tr></thead><tbody>${rows}</tbody></table>` : '')
    + (rowsFas ? `<table class="rs-table" style="margin-top:12px"><thead><tr><th class="rs-l">FAS teórico vs futuro</th><th>Posición</th><th>FOB</th><th>Retención</th><th>FAS teórico</th><th>Futuro</th><th>Diferencia</th></tr></thead><tbody>${rowsFas}</tbody></table>` : '');
  return sec;
}

// ═══════════════════════════════════════════════════
// 8) DESVÍO DE PRECIOS (campaña actual, objetivo / dolor)
// ═══════════════════════════════════════════════════
function rsDesvio() {
  const R = RS_REGLAS.desvio;
  const sec = { id: 'desvio', titulo: 'Desvío de precios', hallazgos: [], html: '' };
  if (!ASST_FUTPOS.length) return sec;
  const { idx, maxF } = rsIndexFutpos();
  let rows = '';
  Object.keys(DV_KEY_POS).forEach(c => DV_KEY_POS[c].forEach(mes => {
    const anc = rsAnclaje(c, mes, maxF);
    if (!anc) return;
    const serie = Object.values(idx[c + '|' + anc.pos] || {}).map(r => r.precio).filter(v => v > 0);
    if (serie.length < 10) return;
    const avg = serie.reduce((s, v) => s + v, 0) / serie.length;
    const last = anc.precio, desv = (last / avg - 1) * 100;
    const refs = dvGetRefs(c, mes);
    const sobreObj = refs.obj != null ? serie.filter(v => v >= refs.obj).length / serie.length * 100 : null;
    rows += `<tr><td class="rs-l">${rsCrop(c)} ${anc.pos}</td><td><b>${rsF(last)}</b></td><td>${rsF(avg)}</td><td class="${desv >= 0 ? 'rs-pos' : 'rs-neg'}">${rsSigno(desv)}%</td><td>${rsF(Math.min(...serie))} – ${rsF(Math.max(...serie))}</td><td>${refs.obj != null ? rsF(refs.obj) : '—'}</td><td>${refs.dol != null ? rsF(refs.dol) : '—'}</td><td>${sobreObj != null ? rsF(sobreObj, 0) + '%' : '—'}</td></tr>`;
    const nom = `${rsCrop(c)} ${anc.pos}`;
    if (refs.obj != null && last >= refs.obj) sec.hallazgos.push(rsHall('oportunidad', 68, `${nom}: alcanzó el Precio Objetivo`, `Cotiza ${rsF(last)}, sobre el objetivo de ${rsF(refs.obj)}. En esta campaña estuvo arriba del objetivo el ${rsF(sobreObj, 0)}% de las ruedas.`, 'Precio ≥ Precio Objetivo', 'Evaluar vender o fijar precio / cubrir con puts.'));
    else if (refs.dol != null && last <= refs.dol) sec.hallazgos.push(rsHall('alerta', 70, `${nom}: debajo del Precio Dolor`, `Cotiza ${rsF(last)}, bajo el precio dolor de ${rsF(refs.dol)}.`, 'Precio ≤ Precio Dolor', 'Revisar la cobertura de esta posición.'));
    else if (desv > R.desvioAltoPct) sec.hallazgos.push(rsHall('oportunidad', 42, `${nom}: ${rsSigno(desv)}% sobre el promedio de la campaña`, `Cotiza ${rsF(last)} contra un promedio de campaña de ${rsF(avg)}.${refs.obj != null ? ` Le falta ${rsF(refs.obj - last)} para el objetivo (${rsF(refs.obj)}).` : ''}`, `Precio > promedio + ${R.desvioAltoPct}%`, 'Zona favorable para escalonar ventas.'));
    else if (desv < -R.desvioBajoPct) sec.hallazgos.push(rsHall('info', 35, `${nom}: ${rsSigno(desv)}% bajo el promedio de la campaña`, `Cotiza ${rsF(last)} contra un promedio de campaña de ${rsF(avg)}.`, `Precio < promedio − ${R.desvioBajoPct}%`, 'Evitar ventas apuradas; si hay que asegurar, preferir puts.'));
    else if (refs.obj != null) sec.hallazgos.push(rsHall('info', 15, `${nom}: a ${rsF(refs.obj - last)} del objetivo`, `Cotiza ${rsF(last)}; objetivo ${rsF(refs.obj)}.`, 'Distancia al Precio Objetivo', ''));
  }));
  sec.html = rows ? `<table class="rs-table"><thead><tr><th class="rs-l">Posición</th><th>Último</th><th>Prom. campaña</th><th>Desvío</th><th>Rango campaña</th><th>Objetivo</th><th>Dolor</th><th>% ruedas ≥ obj.</th></tr></thead><tbody>${rows}</tbody></table>` : '';
  return sec;
}

// ═══════════════════════════════════════════════════
// 9) LINE-UP (presión compradora)
// ═══════════════════════════════════════════════════
function rsLineUp() {
  const R = RS_REGLAS.lineup;
  const sec = { id: 'lineup', titulo: 'Line-Up y demanda', hallazgos: [], html: '' };
  if (typeof luData === 'undefined' || !luData) { sec.hallazgos.push(rsHall('info', 5, 'Sin datos de Line-Up', 'Todavía no se cargaron compras y DJVE (se cargan al abrir la pestaña Line-Up).', '', '')); return sec; }
  R.productos.forEach(p => {
    const camp = luCampDefault(p);
    const co = camp ? luCompras(p, camp) : null;
    if (!co || !(co.djve > 0)) return;
    const cob = co.total / co.djve;
    const falta = co.djve - co.total;
    const nom = `${LU_PRODS[p].nombre} ${camp}`;
    const txt = `La exportación compró ${luMilT(co.total)} contra ${luMilT(co.djve)} de DJVE (${rsF(cob * 100, 0)}% cubierto).`;
    if (cob < R.coberturaAlta) sec.hallazgos.push(rsHall('oportunidad', 50, `${nom}: presión compradora alta`, `${txt} Le faltan ${luMilT(falta)} por originar.`, `Compras / DJVE < ${R.coberturaAlta * 100}%`, 'Buen momento para ofrecer mercadería y negociar precio / condiciones.'));
    else if (cob > R.coberturaBaja) sec.hallazgos.push(rsHall('info', 25, `${nom}: exportación cubierta`, `${txt} Compró ${luMilT(-falta)} más de lo declarado.`, `Compras / DJVE > ${R.coberturaBaja * 100}%`, 'Menos apuro comprador: no esperar mejoras por demanda de corto plazo.'));
    else sec.hallazgos.push(rsHall('info', 15, `${nom}: demanda equilibrada`, txt, 'Compras / DJVE entre 95% y 105%', ''));
  });
  return sec;
}

// ═══════════════════════════════════════════════════
// GENERACIÓN DEL INFORME
// ═══════════════════════════════════════════════════
const RS_ANALIZADORES = [rsMercado, rsCoberturas, rsVol, rsPases, rsFondeo, rsFas, rsRelaciones, rsDesvio, rsLineUp];

function rsGenerar() {
  const secciones = RS_ANALIZADORES.map(fn => {
    try { return fn(); }
    catch (e) {
      console.warn('Resumen:', fn.name, e);
      return { id: fn.name, titulo: fn.name.replace(/^rs/, ''), hallazgos: [rsHall('alerta', 5, 'No se pudo analizar este módulo', String(e.message || e), '', '')], html: '' };
    }
  });
  const todos = [];
  secciones.forEach(s => s.hallazgos.forEach(h => todos.push({ ...h, modulo: s.titulo })));
  const ejecutivo = todos.filter(h => h.tipo !== 'info').sort((a, b) => b.prioridad - a.prioridad).slice(0, RS_REGLAS.topEjecutivo);
  return { fecha: new Date(), fechaDatos: sheetData ? sheetData.fechaDatos : '', secciones, ejecutivo };
}

function rsHallHtml(h, conModulo) {
  return `<div class="rs-hall rs-${h.tipo}">
    <div class="rs-hall-t">${RS_ICON[h.tipo]} ${conModulo ? `<span class="rs-mod">${h.modulo}</span>` : ''}${h.titulo}</div>
    <div class="rs-hall-x">${h.texto}</div>
    ${h.accion ? `<div class="rs-hall-a">→ ${h.accion}</div>` : ''}
    ${h.regla ? `<div class="rs-hall-r">Regla: ${h.regla}</div>` : ''}
  </div>`;
}

function rsRender() {
  const body = document.getElementById('rs-body');
  if (!body) return;
  if (rsCargando) { body.innerHTML = '<div class="rs-card rs-empty">⏳ Cargando datos de A3, histórico de Drive y FOB…</div>'; return; }
  const inf = rsGenerar();
  rsUltimo = inf;
  const hora = inf.fecha.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const cont = t => inf.secciones.reduce((a, s) => a + s.hallazgos.filter(h => h.tipo === t).length, 0);
  body.innerHTML = `
    <div class="rs-meta">Generado ${hora} · Datos A3 al ${inf.fechaDatos || '—'} · ${cont('oportunidad')} oportunidades · ${cont('alerta')} alertas</div>
    <div class="rs-card rs-exec">
      <h3>Resumen ejecutivo</h3>
      ${inf.ejecutivo.length ? inf.ejecutivo.map(h => rsHallHtml(h, true)).join('') : '<div class="rs-empty">Sin oportunidades ni alertas relevantes con los datos actuales.</div>'}
    </div>
    ${inf.secciones.filter(s => s.hallazgos.length || s.html).map(s => `
      <div class="rs-card">
        <h3>${s.titulo}</h3>
        ${s.html ? `<div class="rs-tw">${s.html}</div>` : ''}
        <div class="rs-halls">${s.hallazgos.slice().sort((a, b) => b.prioridad - a.prioridad).map(h => rsHallHtml(h, false)).join('')}</div>
      </div>`).join('')}
    <div class="rs-note">Comentarios generados automáticamente por reglas (archivo <code>reglas_resumen.js</code>) sobre los datos cargados en la Suite. Son una ayuda para la decisión: revisar antes de operar.</div>`;
}

// Texto plano para WhatsApp / mail (negritas con *asteriscos* de WhatsApp)
function rsTexto() {
  const inf = rsUltimo || rsGenerar();
  const limpio = s => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const linea = h => `${RS_ICON[h.tipo]} *${limpio(h.titulo)}*: ${limpio(h.texto)}${h.accion ? ' → ' + limpio(h.accion) : ''}`;
  let t = `*RESUMEN COMERCIAL — Espartina S.A.*\n${inf.fecha.toLocaleDateString('es-AR')} · Datos A3 al ${inf.fechaDatos || '—'}\n\n*Puntos clave*\n`;
  t += inf.ejecutivo.length ? inf.ejecutivo.map(h => `${linea(h)}`).join('\n') : 'Sin oportunidades ni alertas relevantes.';
  inf.secciones.forEach(s => {
    const hs = s.hallazgos.filter(h => h.tipo !== 'info' || h.prioridad >= 30);
    if (!hs.length) return;
    t += `\n\n*${s.titulo.toUpperCase()}*\n` + hs.sort((a, b) => b.prioridad - a.prioridad).map(linea).join('\n');
  });
  return t + '\n\n_Generado por reglas en la Suite Comercial. Revisar antes de operar._';
}

function rsCopiar() {
  const txt = rsTexto();
  const ok = () => { const b = document.getElementById('rs-btn-copiar'); if (b) { b.textContent = '✓ Copiado'; setTimeout(() => b.textContent = '📋 Copiar texto', 1800); } };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(ok, () => rsCopiarFallback(txt, ok));
  else rsCopiarFallback(txt, ok);
}
function rsCopiarFallback(txt, ok) {
  const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); ok(); } catch (e) { alert('No se pudo copiar automáticamente.'); }
  ta.remove();
}

// Carga lo que falte (A3, Drive, FOB, Line-Up) y después genera
async function rsActualizar(forzar) {
  rsCargando = true; rsRender();
  const tareas = [];
  if (forzar || !sheetData) tareas.push(syncFromSheet());
  if (forzar || !ASST_FUTPOS.length) tareas.push(asstLoadDrive());
  if (forzar || !Object.keys(fobData).length) tareas.push(syncFOBFromSheet());
  if (typeof luData !== 'undefined' && (forzar || !luData) && typeof luCargar === 'function') tareas.push(luCargar(false));
  await Promise.allSettled(tareas);
  rsCargando = false;
  if (resumenMode) rsRender();
}

// ─── Contenedor y navegación ───
(function rsCrearEspacio() {
  const sp = document.getElementById('resumen-space');
  if (!sp) return;
  sp.innerHTML = `
    <div class="rs-head">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:28px;">🧭</span>
        <div>
          <div class="rs-title">Resumen Comercial</div>
          <div class="rs-subt">Lectura automática de todos los módulos: qué conviene hacer en coberturas, pases, relaciones de precios y comercialización.</div>
        </div>
      </div>
      <div class="rs-actions">
        <button class="btn btn-outline" onclick="rsActualizar(true)">🔄 Actualizar datos</button>
        <button class="btn btn-outline" id="rs-btn-copiar" onclick="rsCopiar()">📋 Copiar texto</button>
        <button class="btn" onclick="exportarPDF()">🖨 PDF</button>
      </div>
    </div>
    <div id="rs-body"></div>`;
})();

function toggleResumen() {
  resumenMode = true;
  theoryMode = false; retMode = false; paseMode = false; asstMode = false; spreadMode = false; desvioMode = false;
  if (typeof lineupMode !== 'undefined') lineupMode = false;
  ['workspace', 'theory-space', 'ret-space', 'pase-space', 'spreads-space', 'desvio-space', 'lineup-space']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  ['tabs-container', 'mkt-bar', 'fob-bar'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  document.getElementById('resumen-space').style.display = 'block';
  rsMarcarPill();
  const falta = !sheetData || !ASST_FUTPOS.length || !Object.keys(fobData).length;
  if (falta) rsActualizar(false); else rsRender();
  if (typeof refrescarBarras === 'function') refrescarBarras();
}

function rsMarcarPill() {
  document.querySelectorAll('.mod-pill').forEach(p => p.classList.toggle('active', p.id === 'pill-resumen'));
}

// Al ir a cualquier otro módulo se oculta el Resumen
(function rsEnvolverNavegacion() {
  ['switchToWorkspace', 'toggleTheory', 'toggleRetenciones', 'togglePases', 'toggleSpreads', 'toggleDesvio', 'toggleLineUp'].forEach(fn => {
    const orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function () {
      resumenMode = false;
      const el = document.getElementById('resumen-space');
      if (el) el.style.display = 'none';
      return orig.apply(this, arguments);
    };
  });
  const origRT = window.renderTabs;
  if (typeof origRT === 'function') window.renderTabs = function () {
    const r = origRT.apply(this, arguments);
    if (resumenMode) { const tc = document.getElementById('tabs-container'); if (tc) tc.style.display = 'none'; }
    return r;
  };
  const origRM = window.renderModules;
  if (typeof origRM === 'function') window.renderModules = function () {
    const r = origRM.apply(this, arguments);
    if (resumenMode) rsMarcarPill();
    return r;
  };
})();
