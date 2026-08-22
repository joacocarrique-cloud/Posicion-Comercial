// ═══════════════════════════════════════════════════
// ─── FONDEO ───
// Necesito caja hoy: ¿la saco endeudándome contra la cosecha, o vendiendo el grano
// que ya tengo? Compara las fuentes de financiamiento entre sí y contra el benchmark
// de costo cero: vender el disponible hoy al TC spot (sin deuda ni tasa).
// Métrica común: u$s netos hoy por tonelada comprometida. Regla de oro: financiarse
// sólo conviene si el costo del crédito es menor que el carry del mercado.
// Independiente de paseCalcStrategies(), que asume que tenés grano para vender hoy.
// ═══════════════════════════════════════════════════

let fondeoForwardManual = false;   // false = forward derivado de MATBA × TC futuro

// ─── Helpers ───
const fondeoNum = id => {
  const el = document.getElementById(id);
  if (!el) return 0;
  const raw = String(el.value).replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  return parseFloat(raw) || 0;
};
const fondeoMiles = n => Math.round(n).toLocaleString('es-AR');
const fondeoDec = (n, d = 1) => n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });

// ─── Navegación ───
function fondeoShow() {
  const main = document.getElementById('pase-main-block');
  const fon = document.getElementById('fondeo-block');
  if (main) main.style.display = 'none';
  if (fon) fon.style.display = 'block';
  document.querySelectorAll('.pase-subtab').forEach(t => t.classList.remove('active'));
  const btn = document.getElementById('pase-subtab-fondeo');
  if (btn) btn.classList.add('active');
  fondeoInit();
  fondeoCalc();
}

function fondeoHide() {
  const main = document.getElementById('pase-main-block');
  const fon = document.getElementById('fondeo-block');
  if (main) main.style.display = 'block';
  if (fon) fon.style.display = 'none';
  document.querySelectorAll('.pase-subtab').forEach(t => t.classList.remove('active'));
  const btn = document.getElementById('pase-subtab-estrategias');
  if (btn) btn.classList.add('active');
}

function fondeoInit() {
  const f = document.getElementById('fondeo-fecha');
  if (f && !f.value) {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    f.value = d.toISOString().slice(0, 10);
  }
  const m = document.getElementById('fondeo-monto');
  if (m && m.value) m.value = fondeoMiles(fondeoNum('fondeo-monto'));
  const fw = document.getElementById('fondeo-forward-ars');
  if (fw && !fondeoForwardManual) { fw.readOnly = true; fw.classList.add('is-auto'); }
}

// ─── Monto: separador de miles mientras escribís ───
function fondeoMontoInput(el) {
  const pos = el.selectionStart;
  const antes = el.value.length;
  const v = fondeoNum('fondeo-monto');
  el.value = v > 0 ? fondeoMiles(v) : '';
  const desp = el.value.length;
  const nueva = Math.max(0, pos + (desp - antes));
  el.setSelectionRange(nueva, nueva);
  fondeoCalc();
}

function fondeoForwardInput(el) {
  const pos = el.selectionStart;
  const antes = el.value.length;
  const v = fondeoNum('fondeo-forward-ars');
  el.value = v > 0 ? fondeoMiles(v) : '';
  const desp = el.value.length;
  const nueva = Math.max(0, pos + (desp - antes));
  el.setSelectionRange(nueva, nueva);
  fondeoCalc();
}

// ─── Forward: derivado o manual ───
function fondeoToggleForward(chk) {
  fondeoForwardManual = chk.checked;
  const inp = document.getElementById('fondeo-forward-ars');
  if (inp) {
    inp.readOnly = !fondeoForwardManual;
    inp.classList.toggle('is-auto', !fondeoForwardManual);
    if (fondeoForwardManual) inp.focus();
  }
  fondeoCalc();
}

function fondeoSyncForward() {
  const inp = document.getElementById('fondeo-forward-ars');
  if (!inp) return 0;
  if (!fondeoForwardManual) {
    const derivado = fondeoNum('fondeo-precio-usd') * fondeoNum('fondeo-tc-fut');
    inp.value = derivado > 0 ? fondeoMiles(derivado) : '';
    return derivado;
  }
  return fondeoNum('fondeo-forward-ars');
}

function fondeoDias() {
  const f = document.getElementById('fondeo-fecha');
  if (!f || !f.value) return 0;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const d = new Date(f.value + 'T00:00:00');
  const dias = Math.round((d - hoy) / 86400000);
  return dias > 0 ? dias : 0;
}

function fondeoGetInputs() {
  return {
    monto:      fondeoNum('fondeo-monto'),
    dias:       fondeoDias(),
    precioUSD:  fondeoNum('fondeo-precio-usd'),
    forwardARS: fondeoSyncForward(),
    tcSpot:     fondeoNum('fondeo-tc-spot'),
    tcFut:      fondeoNum('fondeo-tc-fut'),
    rUSD:       fondeoNum('fondeo-r-usd'),
    rARS:       fondeoNum('fondeo-r-ars'),
    rCheq:      fondeoNum('fondeo-r-cheq'),
    disp:       fondeoNum('fondeo-disp'),
    dispCur:    (document.getElementById('fondeo-disp-cur') || {}).value || 'usd'
  };
}

// ─── Benchmark: vender el grano disponible hoy al TC spot ───
// No es una fuente de financiamiento: es la vara de costo cero (sin deuda ni tasa)
// contra la que se mide si conviene endeudarse. Devuelve null si no hay disponible cargado.
function fondeoBenchmark(inp) {
  if (inp.disp <= 0) return null;
  const usdHoy = inp.dispCur === 'ars'
    ? (inp.tcSpot > 0 ? inp.disp / inp.tcSpot : 0)
    : inp.disp;
  if (usdHoy <= 0) return null;
  const a = 365 / (inp.dias || 1);
  // Carry del mercado = costo de oportunidad de vender ya, anualizado (futuro vs. disponible)
  const carry = inp.precioUSD > 0 ? ((inp.precioUSD / usdHoy) - 1) * a * 100 : 0;
  const desc = inp.dispCur === 'ars'
    ? `Vendés hoy a $${fondeoMiles(inp.disp)}/tn (≈ ${fondeoDec(usdHoy)} u$s al spot). Sin deuda ni tasa.`
    : `Vendés hoy a ${fondeoDec(inp.disp)} u$s/tn al spot. Cerrado: sin deuda ni obligación futura.`;
  return {
    key: 'disp', short: 'Vender disponible', benchmark: true,
    name: 'Venta de disponible hoy',
    desc, usdHoy, carry,
    toneladas: usdHoy > 0 ? inp.monto / usdHoy : 0,
    detail: `Entran ${fondeoDec(usdHoy)} u$s/tn netos hoy, sin tasa ni deuda y sin obligación de entrega futura. Sobre un futuro MATBA de ${fondeoDec(inp.precioUSD)} u$s/tn, resignás un carry de ${fondeoDec(carry)}% TNA por vender ya en vez de esperar. Regla: financiarse sólo conviene si el crédito cuesta menos que ese carry.`
  };
}

// ─── Tasas implícitas ───
function fondeoImplicitas(inp) {
  const a = 365 / (inp.dias || 1);
  const deva = (inp.tcSpot > 0 && inp.tcFut > 0)
    ? ((inp.tcFut / inp.tcSpot) - 1) * a * 100 : 0;
  const tcImpl = inp.precioUSD > 0 ? inp.forwardARS / inp.precioUSD : 0;
  const tasaFwd = (inp.precioUSD > 0 && inp.tcSpot > 0)
    ? ((inp.forwardARS / (inp.precioUSD * inp.tcSpot)) - 1) * a * 100 : 0;
  return { deva, tcImpl, tasaFwd, gapTC: tcImpl - inp.tcFut, gapTasa: tasaFwd - deva };
}

// ─── Alternativas ───
function fondeoCalcOpciones(inp, im) {
  const f = inp.dias / 365;
  const a = 365 / inp.dias;
  const ops = [];
  const costoTNA = usdHoy => (usdHoy > 0 && inp.precioUSD > 0)
    ? ((inp.precioUSD / usdHoy) - 1) * a * 100 : 0;

  // A — Crédito USD + venta futuro MATBA
  if (inp.rUSD > 0 && inp.precioUSD > 0) {
    const usdHoy = inp.precioUSD / (1 + (inp.rUSD / 100) * f);
    ops.push({
      key: 'usd', short: 'Crédito USD',
      name: 'Crédito USD + venta futuro MATBA',
      desc: `Tomás u$s al ${fondeoDec(inp.rUSD)}% TNA y fijás precio vendiendo a ${fondeoDec(inp.precioUSD)} u$s/tn.`,
      usdHoy, costo: costoTNA(usdHoy),
      detail: `Cobrás ${fondeoDec(inp.precioUSD)} u$s/tn en ${inp.dias} días y devolvés capital + ${fondeoDec(inp.rUSD * f)}% de interés. Valor de esa tonelada hoy: ${fondeoDec(usdHoy)} u$s. Sin descalce: te endeudás y cobrás en la misma moneda, así que el costo es la tasa y nada más.`
    });
  }

  // B — Crédito ARS + venta futuro MATBA + dólar futuro (TC cubierto)
  if (inp.rARS > 0 && inp.precioUSD > 0 && inp.tcFut > 0 && inp.tcSpot > 0) {
    const pesosFut = inp.precioUSD * inp.tcFut;
    const pesosHoy = pesosFut / (1 + (inp.rARS / 100) * f);
    const usdHoy = pesosHoy / inp.tcSpot;
    const spread = im.deva - inp.rARS;
    ops.push({
      key: 'ars', short: 'Crédito ARS',
      name: 'Crédito ARS + venta futuro + dólar futuro',
      desc: `Tomás $ al ${fondeoDec(inp.rARS)}% TNA, fijás precio en MATBA y cubrís el TC en ROFEX a ${fondeoMiles(inp.tcFut)}.`,
      usdHoy, costo: costoTNA(usdHoy),
      detail: `Tasa ARS ${fondeoDec(inp.rARS)}% vs. deva implícita ${fondeoDec(im.deva)}% → spread ${spread >= 0 ? '+' : ''}${fondeoDec(spread)}pp ${spread >= 0 ? 'a favor del peso' : 'en contra del peso'}. Cobrás $${fondeoMiles(pesosFut)}/tn en ${inp.dias} días; descontado al ${fondeoDec(inp.rARS)}% son $${fondeoMiles(pesosHoy)} hoy (≈ ${fondeoDec(usdHoy)} u$s al spot). Si no cubrieras el TC, el breakeven cae exactamente en ${fondeoMiles(inp.tcFut)}: por debajo de ese dólar ganás por no cubrir, por encima perdés. El futuro se compra el mismo día que tomás el crédito, no después.`
    });
  }

  // C — Venta futura en pesos + descuento de cheques
  if (inp.rCheq > 0 && inp.forwardARS > 0 && inp.tcSpot > 0) {
    const pesosHoy = inp.forwardARS / (1 + (inp.rCheq / 100) * f);
    const usdHoy = pesosHoy / inp.tcSpot;
    ops.push({
      key: 'cheq', short: 'Cheques',
      name: 'Venta futura en pesos + descuento de cheques',
      desc: `Vendés forward a $${fondeoMiles(inp.forwardARS)}/tn y descontás el cheque al ${fondeoDec(inp.rCheq)}% TNA.`,
      usdHoy, costo: costoTNA(usdHoy),
      detail: `Cheque de $${fondeoMiles(inp.forwardARS)}/tn a ${inp.dias} días, descontado al ${fondeoDec(inp.rCheq)}%: cobrás $${fondeoMiles(pesosHoy)} hoy (≈ ${fondeoDec(usdHoy)} u$s al spot). El forward te reconoce una tasa implícita en pesos de ${fondeoDec(im.tasaFwd)}% TNA contra una deva implícita de ${fondeoDec(im.deva)}%: ${im.gapTasa >= 0 ? 'te está pagando por encima de la curva de dólar' : 'te está pagando ' + fondeoDec(Math.abs(im.gapTasa)) + 'pp por debajo de la curva de dólar, y eso no aparece en la tasa de descuento del cheque'}.`
    });
  }

  ops.forEach(o => { o.toneladas = o.usdHoy > 0 ? inp.monto / o.usdHoy : 0; });
  ops.sort((x, y) => y.usdHoy - x.usdHoy);
  if (ops.length) { const best = ops[0].usdHoy; ops.forEach(o => o.delta = o.usdHoy - best); }
  return ops;
}

// ─── Render ───
function fondeoCalc() {
  const inp = fondeoGetInputs();
  const derEl = document.getElementById('fondeo-derived');
  const kpiEl = document.getElementById('fondeo-kpis');
  const rowEl = document.getElementById('fondeo-rows');
  const altEl = document.getElementById('fondeo-alert');
  if (!rowEl) return;

  const im = fondeoImplicitas(inp);

  if (derEl) {
    const okTasa = im.gapTasa >= -0.05;
    const okTC = im.gapTC >= -1;
    derEl.innerHTML = `
      <div class="fondeo-chip">
        <span class="fondeo-chip-lbl">Plazo</span>
        <span class="fondeo-chip-val">${inp.dias > 0 ? inp.dias : '—'}<em>días</em></span>
      </div>
      <div class="fondeo-chip">
        <span class="fondeo-chip-lbl">Deva implícita ROFEX</span>
        <span class="fondeo-chip-val gold">${fondeoDec(im.deva)}%<em>TNA · umbral del crédito en $</em></span>
      </div>
      <div class="fondeo-chip">
        <span class="fondeo-chip-lbl">TC implícito del forward</span>
        <span class="fondeo-chip-val ${okTC ? 'ok' : 'bad'}">${fondeoMiles(im.tcImpl)}<em>${inp.tcFut > 0 ? (im.gapTC >= 0 ? '+' : '') + fondeoMiles(im.gapTC) + ' vs. ROFEX' : '—'}</em></span>
      </div>
      <div class="fondeo-chip">
        <span class="fondeo-chip-lbl">Tasa implícita del forward</span>
        <span class="fondeo-chip-val ${okTasa ? 'ok' : 'bad'}">${fondeoDec(im.tasaFwd)}%<em>TNA $ · ${im.gapTasa >= 0 ? '+' : ''}${fondeoDec(im.gapTasa)}pp vs. deva</em></span>
      </div>`;
  }

  const vacio = msg => {
    if (kpiEl) kpiEl.innerHTML = '';
    if (altEl) altEl.innerHTML = '';
    rowEl.innerHTML = `<div class="fondeo-empty">⚠ ${msg}</div>`;
  };

  if (inp.dias <= 0) return vacio('Cargá una fecha de repago posterior a hoy');
  if (inp.precioUSD <= 0) return vacio('Cargá el precio del futuro MATBA para comparar');

  const ops = fondeoCalcOpciones(inp, im);
  const bench = fondeoBenchmark(inp);

  // ─── Fila del benchmark (venta de disponible): estilo propio, fuera del ranking ───
  const benchRowHtml = (b, winner) => !b ? '' : `
    <div class="fondeo-row" style="border-style:dashed; border-color:${winner ? 'var(--es-green)' : 'var(--border-2)'}; background:var(--bg-input);${winner ? ' box-shadow:0 0 0 1px var(--es-green) inset;' : ''}">
      <div class="fondeo-row-top">
        <div class="fondeo-row-name">
          <span class="fondeo-rank" style="border-style:dashed; color:${winner ? 'var(--es-green)' : 'var(--es-gold)'};">◇</span>
          <div>
            <div class="fondeo-row-title">${b.name}<span class="fondeo-badge" style="background:${winner ? 'var(--es-green)' : 'var(--es-gold-light)'}; color:${winner ? '#fff' : '#96700e'};">${winner ? 'CONVIENE VENDER' : 'BENCHMARK · SIN DEUDA'}</span></div>
            <div class="fondeo-row-desc">${b.desc}</div>
          </div>
        </div>
        <div class="fondeo-metric">
          <span class="fondeo-metric-val">${fondeoDec(b.usdHoy)}</span>
          <span class="fondeo-metric-lbl">u$s hoy/tn</span>
        </div>
        <div class="fondeo-metric">
          <span class="fondeo-metric-val">${fondeoDec(b.carry)}%</span>
          <span class="fondeo-metric-lbl">carry resignado</span>
        </div>
        <div class="fondeo-metric">
          <span class="fondeo-metric-val">${fondeoMiles(b.toneladas)}</span>
          <span class="fondeo-metric-lbl">tn a vender</span>
        </div>
      </div>
      <div class="fondeo-row-detail">${b.detail}</div>
    </div>`;

  if (!ops.length) {
    // Sin tasas cargadas: si hay disponible, igual mostramos la vara; si no, vacío.
    if (bench) {
      if (kpiEl) kpiEl.innerHTML = '';
      if (altEl) altEl.innerHTML = '';
      rowEl.innerHTML = benchRowHtml(bench, false) +
        `<div class="fondeo-empty" style="margin-top:10px;">Cargá una tasa (crédito USD/ARS o descuento de cheques) para comparar el financiamiento contra vender el disponible.</div>`;
      return;
    }
    return vacio('Cargá al menos una tasa: crédito USD, crédito ARS o descuento de cheques');
  }

  const best = ops[0], second = ops[1];
  const finConviene = !bench || best.usdHoy > bench.usdHoy;

  if (kpiEl) {
    const verdictCard = !bench ? '' : (() => {
      const dif = Math.abs(best.usdHoy - bench.usdHoy);
      const col = finConviene ? 'var(--es-green)' : 'var(--es-gold)';
      return `
      <div class="pase-reading-card" style="border-color:${col};">
        <div class="pase-reading-lbl">Veredicto</div>
        <div class="pase-reading-val" style="color:${col};">${finConviene ? 'Financiarse' : 'Vender disponible'}</div>
        <div class="pase-reading-sub">+${fondeoDec(dif)} u$s/tn vs. ${finConviene ? 'vender hoy' : 'financiarte'} · carry ${fondeoDec(bench.carry)}% ${finConviene ? '>' : '<'} crédito ${fondeoDec(best.costo)}%</div>
      </div>`;
    })();

    const ventajaCard = bench ? '' : `
      <div class="pase-reading-card">
        <div class="pase-reading-lbl">Ventaja vs. 2ª opción</div>
        <div class="pase-reading-val" style="font-family:var(--mono); color:var(--es-green);">${second ? '+' + fondeoDec(best.usdHoy - second.usdHoy) : '—'}</div>
        <div class="pase-reading-sub">${second ? 'u$s/tn contra ' + second.short.toLowerCase() : 'única alternativa cargada'}</div>
      </div>`;

    kpiEl.innerHTML = verdictCard + `
      <div class="pase-reading-card">
        <div class="pase-reading-lbl">Fuente más barata</div>
        <div class="pase-reading-val" style="color:var(--es-green);">${best.short}</div>
        <div class="pase-reading-sub">${fondeoDec(best.costo)}% TNA en u$s · ${fondeoDec(best.usdHoy)} u$s hoy/tn</div>
      </div>` + ventajaCard + `
      <div class="pase-reading-card gold">
        <div class="pase-reading-lbl">Toneladas a comprometer</div>
        <div class="pase-reading-val" style="font-family:var(--mono); color:var(--es-gold);">${fondeoMiles(best.toneladas)}</div>
        <div class="pase-reading-sub">para levantar u$s ${fondeoMiles(inp.monto)} por la mejor vía</div>
      </div>`;
  }

  const opsHtml = ops.map((o, i) => {
    const isBest = i === 0;
    const showBadge = isBest && finConviene;
    const cColor = (best.costo >= 0 && o.costo > best.costo * 1.5) ? 'var(--red)'
      : isBest ? 'var(--es-green)' : 'var(--text-2)';
    return `
    <div class="fondeo-row ${showBadge ? 'best' : ''}">
      <div class="fondeo-row-top">
        <div class="fondeo-row-name">
          <span class="fondeo-rank">${i + 1}</span>
          <div>
            <div class="fondeo-row-title">${o.name}${showBadge ? '<span class="fondeo-badge">MÁS BARATA</span>' : ''}</div>
            <div class="fondeo-row-desc">${o.desc}</div>
          </div>
        </div>
        <div class="fondeo-metric">
          <span class="fondeo-metric-val">${fondeoDec(o.usdHoy)}</span>
          <span class="fondeo-metric-lbl">u$s hoy/tn</span>
          <span class="fondeo-metric-delta ${isBest ? 'ok' : ''}">${isBest ? 'mejor vía' : fondeoDec(o.delta)}</span>
        </div>
        <div class="fondeo-metric">
          <span class="fondeo-metric-val" style="color:${cColor};">${fondeoDec(o.costo)}%</span>
          <span class="fondeo-metric-lbl">costo TNA u$s</span>
        </div>
        <div class="fondeo-metric">
          <span class="fondeo-metric-val">${fondeoMiles(o.toneladas)}</span>
          <span class="fondeo-metric-lbl">tn a comprometer</span>
        </div>
      </div>
      <div class="fondeo-row-detail">${o.detail}</div>
    </div>`;
  }).join('');

  rowEl.innerHTML = opsHtml + benchRowHtml(bench, bench && !finConviene);

  if (altEl) {
    if (inp.forwardARS > 0 && inp.tcFut > 0 && im.gapTC < -1) {
      altEl.innerHTML = `
        <div class="fondeo-warn">
          <div class="fondeo-warn-t">⚠️ El forward en pesos te implica un dólar de ${fondeoMiles(im.tcImpl)}</div>
          <div class="fondeo-warn-b">Sobre un MATBA de ${fondeoDec(inp.precioUSD)} u$s/tn, ese forward equivale a un TC de ${fondeoMiles(im.tcImpl)} contra ${fondeoMiles(inp.tcFut)} de ROFEX: son <strong>${fondeoMiles(Math.abs(im.gapTC))} pesos por tonelada</strong> que el comprador se queda vía tipo de cambio, no vía tasa. Podés estar negociando la tasa de descuento del cheque y perdiendo mucha más plata acá.</div>
        </div>`;
    } else if (!fondeoForwardManual) {
      altEl.innerHTML = `
        <div class="fondeo-info">
          <div class="fondeo-warn-b">El forward está <strong>derivado</strong> de MATBA × TC futuro, así que por construcción no hay castigo cambiario y la comparación aísla las tasas puras. Cuando tengas la cotización real del comprador, tildá <strong>Editar</strong> y cargala: ahí vas a ver si te están poniendo un dólar peor que el de ROFEX.</div>
        </div>`;
    } else {
      altEl.innerHTML = '';
    }
  }
}
