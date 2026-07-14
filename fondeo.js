// ═══════════════════════════════════════════════════
// ─── FONDEO MODULE ───
// Comparador de fuentes de financiamiento cuando NO hay mercadería disponible.
// Pregunta que responde: necesito plata hoy y la devuelvo contra la cosecha,
// ¿qué fuente me deja más u$s netos hoy por tonelada comprometida?
// Independiente de paseCalcStrategies(), que asume que tenés grano para vender hoy.
// ═══════════════════════════════════════════════════

let fondeoSubTab = false;

function fondeoShow() {
  fondeoSubTab = true;
  const est = document.getElementById('pase-main-block');
  const fon = document.getElementById('fondeo-block');
  if (est) est.style.display = 'none';
  if (fon) fon.style.display = 'block';
  document.querySelectorAll('.pase-subtab').forEach(t => t.classList.remove('active'));
  const btn = document.getElementById('pase-subtab-fondeo');
  if (btn) btn.classList.add('active');
  fondeoInitFecha();
  fondeoCalc();
}

function fondeoHide() {
  fondeoSubTab = false;
  const est = document.getElementById('pase-main-block');
  const fon = document.getElementById('fondeo-block');
  if (est) est.style.display = 'block';
  if (fon) fon.style.display = 'none';
  document.querySelectorAll('.pase-subtab').forEach(t => t.classList.remove('active'));
  const btn = document.getElementById('pase-subtab-estrategias');
  if (btn) btn.classList.add('active');
}

function fondeoInitFecha() {
  const f = document.getElementById('fondeo-fecha');
  if (f && !f.value) {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    f.value = d.toISOString().slice(0, 10);
  }
  fondeoUpdateDias();
}

function fondeoUpdateDias() {
  const f = document.getElementById('fondeo-fecha');
  const out = document.getElementById('fondeo-dias');
  if (!f || !out) return 0;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const d = new Date(f.value);
  const dias = Math.round((d - hoy) / 86400000);
  out.textContent = dias > 0 ? dias : '—';
  return dias > 0 ? dias : 0;
}

function fondeoGetInputs() {
  const num = id => parseFloat((document.getElementById(id) || {}).value) || 0;
  return {
    monto:      num('fondeo-monto'),
    dias:       fondeoUpdateDias(),
    precioUSD:  num('fondeo-precio-usd'),
    forwardARS: num('fondeo-forward-ars'),
    tcSpot:     num('fondeo-tc-spot'),
    tcFut:      num('fondeo-tc-fut'),
    rUSD:       num('fondeo-r-usd'),
    rARS:       num('fondeo-r-ars'),
    rCheq:      num('fondeo-r-cheq')
  };
}

// Devuelve las alternativas calculadas, ordenadas por u$s netos hoy (desc).
function fondeoCalcOpciones(inp) {
  const f = inp.dias / 365;
  const ops = [];

  const tnaCostoUSD = usdHoy =>
    (usdHoy > 0 && inp.precioUSD > 0)
      ? ((inp.precioUSD / usdHoy) - 1) * (365 / inp.dias) * 100
      : 0;

  // ── A: Crédito USD + venta futuro MATBA (precio fijado, sin descalce) ──
  if (inp.rUSD > 0 && inp.precioUSD > 0) {
    const usdHoy = inp.precioUSD / (1 + (inp.rUSD / 100) * f);
    ops.push({
      key: 'usd',
      name: 'Crédito USD + venta futuro MATBA',
      desc: `Tomás u$s al ${inp.rUSD}% TNA y fijás precio vendiendo ${inp.precioUSD.toFixed(1)} u$s/tn.`,
      usdHoy,
      pesosHoy: usdHoy * inp.tcSpot,
      costoTNA: tnaCostoUSD(usdHoy),
      cat: 'USD',
      detail: `Cobrás ${inp.precioUSD.toFixed(1)} u$s/tn en ${inp.dias}d y devolvés capital + ${(inp.rUSD * f).toFixed(1)}% de interés. ` +
              `Valor de esa tonelada hoy: ${usdHoy.toFixed(1)} u$s. Sin exposición cambiaria: te endeudás y cobrás en la misma moneda.`
    });
  }

  // ── B: Crédito ARS + venta futuro MATBA + compra de dólar futuro (TC cubierto) ──
  if (inp.rARS > 0 && inp.precioUSD > 0 && inp.tcFut > 0 && inp.tcSpot > 0) {
    const pesosFuturo = inp.precioUSD * inp.tcFut;          // lo que cobrás en $ con el TC cubierto
    const pesosHoy    = pesosFuturo / (1 + (inp.rARS / 100) * f);
    const usdHoy      = pesosHoy / inp.tcSpot;
    const devaImpl    = ((inp.tcFut / inp.tcSpot) - 1) * (365 / inp.dias) * 100;
    const spread      = devaImpl - inp.rARS;               // >0 → el peso te sale barato en u$s
    ops.push({
      key: 'ars',
      name: 'Crédito ARS + venta futuro + dólar futuro',
      desc: `Tomás $ al ${inp.rARS}% TNA, fijás precio en MATBA y cubrís el TC comprando ROFEX a ${inp.tcFut.toLocaleString('es')}.`,
      usdHoy,
      pesosHoy,
      costoTNA: tnaCostoUSD(usdHoy),
      cat: 'ARS',
      spread,
      devaImpl,
      beTC: inp.tcFut,
      detail: `Tasa ARS ${inp.rARS.toFixed(1)}% vs. deva implícita ${devaImpl.toFixed(1)}% → spread ${spread >= 0 ? '+' : ''}${spread.toFixed(1)}pp ` +
              `${spread >= 0 ? 'a favor del peso' : 'en contra del peso'}. ` +
              `Cobrás $${Math.round(pesosFuturo).toLocaleString('es')}/tn en ${inp.dias}d; descontado al ${inp.rARS}% son $${Math.round(pesosHoy).toLocaleString('es')} hoy ` +
              `(≈ ${usdHoy.toFixed(1)} u$s al TC spot). Si NO cubrieras el TC, el breakeven cae exactamente en ${inp.tcFut.toLocaleString('es')}: ` +
              `por debajo de ese dólar ganás por no cubrir, por encima perdés.`
    });
  }

  // ── C: Venta futura en pesos + descuento de cheques ──
  if (inp.rCheq > 0 && inp.forwardARS > 0 && inp.tcSpot > 0) {
    const pesosHoy = inp.forwardARS / (1 + (inp.rCheq / 100) * f);
    const usdHoy   = pesosHoy / inp.tcSpot;
    const tcImpl   = inp.precioUSD > 0 ? inp.forwardARS / inp.precioUSD : 0;
    const gapTC    = inp.tcFut > 0 ? tcImpl - inp.tcFut : 0;
    ops.push({
      key: 'cheq',
      name: 'Venta futura en pesos + descuento de cheques',
      desc: `Vendés forward a $${inp.forwardARS.toLocaleString('es')}/tn y descontás el cheque al ${inp.rCheq}% TNA.`,
      usdHoy,
      pesosHoy,
      costoTNA: tnaCostoUSD(usdHoy),
      cat: 'ARS',
      tcImpl,
      gapTC,
      detail: `Cheque de $${inp.forwardARS.toLocaleString('es')}/tn a ${inp.dias}d, descontado al ${inp.rCheq}%: ` +
              `cobrás $${Math.round(pesosHoy).toLocaleString('es')} hoy (≈ ${usdHoy.toFixed(1)} u$s al TC spot). ` +
              (tcImpl > 0
                ? `TC implícito del forward: ${Math.round(tcImpl).toLocaleString('es')}` +
                  (inp.tcFut > 0
                    ? ` vs. ${inp.tcFut.toLocaleString('es')} de ROFEX → ${gapTC >= 0 ? 'está por encima, el TC te juega a favor' : 'está ' + Math.abs(Math.round(gapTC)) + ' pesos por debajo: ahí se te va plata que no ves en la tasa'}.`
                    : '.')
                : '')
    });
  }

  ops.forEach(o => {
    o.toneladas = o.usdHoy > 0 ? inp.monto / o.usdHoy : 0;
  });

  ops.sort((a, b) => b.usdHoy - a.usdHoy);
  if (ops.length) {
    const best = ops[0].usdHoy;
    ops.forEach(o => { o.delta = o.usdHoy - best; });
  }
  return ops;
}

function fondeoCalc() {
  const inp = fondeoGetInputs();
  const kpisEl = document.getElementById('fondeo-kpis');
  const rowsEl = document.getElementById('fondeo-rows');
  const alertEl = document.getElementById('fondeo-alert');
  if (!rowsEl) return;

  if (inp.dias <= 0 || inp.precioUSD <= 0) {
    if (kpisEl) kpisEl.innerHTML = '';
    if (alertEl) alertEl.innerHTML = '';
    rowsEl.innerHTML = '<div style="text-align:center; color:var(--text-3); padding:24px; font-size:13px;">⚠ Cargá la fecha de repago y el precio del futuro para comparar</div>';
    return;
  }

  const ops = fondeoCalcOpciones(inp);
  if (ops.length === 0) {
    if (kpisEl) kpisEl.innerHTML = '';
    if (alertEl) alertEl.innerHTML = '';
    rowsEl.innerHTML = '<div style="text-align:center; color:var(--text-3); padding:24px; font-size:13px;">⚠ Cargá al menos una tasa (crédito USD, crédito ARS o cheques)</div>';
    return;
  }

  const best = ops[0];
  const second = ops[1];
  const devaImpl = (inp.tcSpot > 0 && inp.tcFut > 0)
    ? ((inp.tcFut / inp.tcSpot) - 1) * (365 / inp.dias) * 100 : 0;

  // ─── KPIs ───
  if (kpisEl) {
    kpisEl.innerHTML = `
      <div class="pase-reading-card">
        <div class="pase-reading-lbl">Fuente más barata</div>
        <div class="pase-reading-val" style="color:var(--green);">${best.cat === 'USD' ? 'Crédito USD' : best.key === 'ars' ? 'Crédito ARS' : 'Cheques'}</div>
        <div class="pase-reading-sub">${best.costoTNA.toFixed(1)}% TNA en u$s — ${best.usdHoy.toFixed(1)} u$s hoy/tn</div>
      </div>
      <div class="pase-reading-card">
        <div class="pase-reading-lbl">Ahorro vs. 2ª opción</div>
        <div class="pase-reading-val" style="font-family:var(--mono); color:var(--green);">${second ? '+' + (best.usdHoy - second.usdHoy).toFixed(1) : '—'}</div>
        <div class="pase-reading-sub">${second ? 'u$s/tn vs. ' + second.name.split(' + ')[0].toLowerCase() : 'única alternativa cargada'}</div>
      </div>
      <div class="pase-reading-card gold">
        <div class="pase-reading-lbl">Deva implícita ROFEX</div>
        <div class="pase-reading-val" style="color:var(--es-gold); font-family:var(--mono);">${devaImpl.toFixed(1)}%</div>
        <div class="pase-reading-sub">TNA — umbral del crédito en pesos</div>
      </div>
    `;
  }

  // ─── Filas ───
  rowsEl.innerHTML = ops.map((o, i) => {
    const isBest = i === 0;
    const costoColor = o.costoTNA <= 0 ? 'var(--green)'
      : (best.costoTNA >= 0 && o.costoTNA > best.costoTNA * 1.5) ? 'var(--red)' : 'var(--text-2)';
    return `
    <div style="border-bottom:1px solid var(--border); ${isBest ? 'border-left:4px solid var(--green); background:#fff;' : ''}">
      <div style="display:grid; grid-template-columns:2fr 1fr 1fr 1fr; gap:12px; align-items:center; padding:14px 16px;">
        <div>
          <div style="font-weight:700; font-size:13px; color:${isBest ? 'var(--text)' : 'var(--text-2)'};">
            ${o.name}
            ${isBest ? '<span style="font-size:9px; background:var(--es-green-light); color:var(--es-green-dark); padding:2px 7px; border-radius:4px; margin-left:6px;">MÁS BARATA</span>' : ''}
          </div>
          <div style="font-size:11px; color:var(--text-3); margin-top:2px;">${o.desc}</div>
        </div>
        <div style="text-align:right;">
          <span style="font-family:var(--mono); font-weight:700; font-size:16px;">${o.usdHoy.toFixed(1)}</span>
          <div style="font-size:10px; color:var(--text-3);">u$s hoy/tn</div>
          ${!isBest ? `<div style="font-size:10px; color:var(--red); font-family:var(--mono);">${o.delta.toFixed(1)}</div>` : ''}
        </div>
        <div style="text-align:right;">
          <span style="font-family:var(--mono); font-weight:700; font-size:14px; color:${costoColor};">${o.costoTNA.toFixed(1)}%</span>
          <div style="font-size:10px; color:var(--text-3);">costo TNA u$s</div>
        </div>
        <div style="text-align:right;">
          <span style="font-family:var(--mono); font-weight:700; font-size:14px;">${Math.round(o.toneladas).toLocaleString('es')}</span>
          <div style="font-size:10px; color:var(--text-3);">tn a comprometer</div>
        </div>
      </div>
      <div style="padding:4px 16px 12px 20px; font-size:11px; color:var(--text-2); line-height:1.6; border-top:1px dashed var(--border); margin:0 16px;">${o.detail}</div>
    </div>`;
  }).join('');

  // ─── Alerta de TC implícito del forward ───
  const cheq = ops.find(o => o.key === 'cheq');
  if (alertEl) {
    if (cheq && cheq.tcImpl > 0 && inp.tcFut > 0 && cheq.gapTC < 0) {
      alertEl.innerHTML = `
        <div style="margin:0 16px 16px; padding:12px 14px; background:#fff3cd; border-left:4px solid #ffc107;">
          <div style="font-size:12px; font-weight:700; color:#856404; margin-bottom:3px;">⚠️ TC implícito de la venta en pesos: ${Math.round(cheq.tcImpl).toLocaleString('es')}</div>
          <div style="font-size:12px; color:#856404; line-height:1.6;">
            El forward de $${inp.forwardARS.toLocaleString('es')}/tn sobre un MATBA de ${inp.precioUSD.toFixed(1)} u$s te implica un dólar de
            ${Math.round(cheq.tcImpl).toLocaleString('es')}, contra ${inp.tcFut.toLocaleString('es')} de ROFEX.
            Son ${Math.abs(Math.round(cheq.gapTC)).toLocaleString('es')} pesos por tonelada que el comprador se queda vía tipo de cambio, no vía tasa.
            Ese es el costo escondido del canal de cheques.
          </div>
        </div>`;
    } else {
      alertEl.innerHTML = '';
    }
  }
}
