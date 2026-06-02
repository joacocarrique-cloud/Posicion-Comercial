// ═══════════════════════════════════════════════════
// ─── VOL & GRIEGAS: Panel integrado en Coberturas ───
// ═══════════════════════════════════════════════════

let vgChartSens = null;
let vgChartDelta = null;
let vgChartTheta = null;
let vgExpanded = true;

function vgGetExpiry() {
  if (!marketPosition) return null;
  return asstExpiry(marketPosition);
}

function vgGetT() {
  const exp = vgGetExpiry();
  if (!exp) return null;
  return asstDays(new Date(), exp) / 365;
}

function vgGetDaysToExpiry() {
  const exp = vgGetExpiry();
  if (!exp) return null;
  return asstDays(new Date(), exp);
}

// Analyze all option legs in active tab strategies
function vgAnalyzePosition() {
  const t = getActiveTab();
  if (!t || !t.strategies.length) return null;
  
  const T = vgGetT();
  const F = t.spot;
  const r = 0.05;
  const crop = t.assetVal;
  const mes = new Date().getMonth() + 1;
  
  const legs = [];
  let hasOptions = false;
  
  t.strategies.forEach(s => {
    s.legs.forEach(l => {
      if (l.type === 'futuro') {
        legs.push({
          stratName: s.name, stratColor: s.color,
          dir: l.dir, type: 'futuro', strike: l.strike, prima: l.prima,
          ratio: l.ratio || 1,
          vi: null, greeks: { delta: l.dir === 'buy' ? 1 : -1, gamma: 0, theta: 0, vega: 0 },
          moneyness: 0, value: 'neutral'
        });
        return;
      }
      
      hasOptions = true;
      if (!T || T <= 0) return;
      
      const vi = asstIV(l.prima, F, l.strike, T, r, l.type);
      if (isNaN(vi)) return;
      
      const viP = vi * 100;
      const g = asstGreeks(F, l.strike, T, r, vi, l.type);
      const mn = (l.strike / F - 1) * 100;
      const mult = l.dir === 'buy' ? 1 : -1;
      const ratio = l.ratio || 1;
      
      // Historical value assessment
      const sk = ASST_SKEW.find(s => s.cultivo === crop && mn >= s.mMin && mn < s.mMax);
      let val = 'neutral';
      if (sk && !isNaN(viP)) {
        if (viP > sk.viP75) val = 'expensive';
        else if (viP < sk.viP25) val = 'cheap';
      }
      
      // Percentile context
      const perc = ASST_VI_PERC.find(v => v.cultivo === crop && v.mes === mes);
      let pctRank = null;
      if (perc) {
        if (viP <= perc.p10) pctRank = 10;
        else if (viP <= perc.p25) pctRank = 25;
        else if (viP <= perc.p50) pctRank = 50;
        else if (viP <= perc.p75) pctRank = 75;
        else if (viP <= perc.p90) pctRank = 90;
        else pctRank = 95;
      }
      
      legs.push({
        stratName: s.name, stratColor: s.color,
        dir: l.dir, type: l.type, strike: l.strike, prima: l.prima,
        ratio, vi: viP, viRaw: vi,
        greeks: {
          delta: g.delta * mult * ratio,
          gamma: g.gamma * mult * ratio,
          theta: g.theta * mult * ratio,
          vega: g.vega * mult * ratio
        },
        greeksRaw: g,
        moneyness: mn, value: val, pctRank, perc, skew: sk
      });
    });
  });
  
  if (legs.length === 0) return null;
  
  // Net Greeks
  const net = { delta: 0, gamma: 0, theta: 0, vega: 0 };
  legs.forEach(l => {
    net.delta += l.greeks.delta;
    net.gamma += l.greeks.gamma;
    net.theta += l.greeks.theta;
    net.vega += l.greeks.vega;
  });
  
  return { legs, net, hasOptions, T, F, r, crop, mes };
}

// ─── MAIN RENDER ───
function vgRender() {
  const panel = document.getElementById('vg-panel');
  if (!panel) return;
  
  // Only show in coberturas mode
  if (theoryMode || retMode || paseMode || spreadMode) {
    panel.style.display = 'none';
    return;
  }
  
  const pos = vgAnalyzePosition();
  if (!pos || !pos.hasOptions) {
    panel.style.display = 'none';
    return;
  }
  
  panel.style.display = 'block';
  
  if (!marketPosition) {
    document.getElementById('vg-content').innerHTML = `
      <div style="text-align:center;padding:30px;color:var(--text-3);">
        <div style="font-size:24px;margin-bottom:8px;">📡</div>
        <div style="font-size:13px;">Sincronizá A3 y seleccioná un cultivo/posición para calcular las griegas y volatilidades.</div>
      </div>`;
    return;
  }
  
  if (!pos.T || pos.T <= 0) {
    document.getElementById('vg-content').innerHTML = `
      <div style="text-align:center;padding:30px;color:var(--text-3);">
        <div style="font-size:24px;margin-bottom:8px;">⏳</div>
        <div style="font-size:13px;">Posición vencida o sin fecha de vencimiento válida.</div>
      </div>`;
    return;
  }
  
  const days = vgGetDaysToExpiry();
  const exp = vgGetExpiry();
  
  let html = '';
  
  // Header info
  html += `<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap;">
    <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:5px 12px;font-size:11px;font-family:var(--mono);">
      📅 Vto: <strong style="color:var(--es-green);">${exp.getDate().toString().padStart(2,'0')}/${ASST_MNAMES[exp.getMonth()+1]}/${exp.getFullYear()}</strong> · ${days}d
    </div>
    <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:5px 12px;font-size:11px;font-family:var(--mono);">
      📊 ${pos.crop.toUpperCase()} ${marketPosition} · Futuro: <strong>${pos.F}</strong> u$s
    </div>
    ${vgRenderContextBadge(pos)}
  </div>`;
  
  // Greeks summary table
  html += vgRenderGreeksTable(pos);
  
  // VI Thermometer
  html += vgRenderThermometer(pos);
  
  // Charts container
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:16px;box-shadow:var(--shadow);">
      <div style="font-size:12px;font-weight:700;margin-bottom:10px;color:var(--text-2);">Sensibilidad al precio (Delta profile)</div>
      <div style="position:relative;height:220px;"><canvas id="vg-chart-delta"></canvas></div>
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:16px;box-shadow:var(--shadow);">
      <div style="font-size:12px;font-weight:700;margin-bottom:10px;color:var(--text-2);">Decaimiento temporal (Theta)</div>
      <div style="position:relative;height:220px;"><canvas id="vg-chart-theta"></canvas></div>
    </div>
  </div>`;
  
  // Market insight
  html += vgRenderMarketInsight(pos);
  
  document.getElementById('vg-content').innerHTML = html;
  
  // Render charts after DOM update
  setTimeout(() => {
    vgRenderDeltaChart(pos);
    vgRenderThetaChart(pos);
  }, 50);
}

// ─── CONTEXT BADGE ───
function vgRenderContextBadge(pos) {
  const hvD = ASST_VIVHV.filter(x => x.cultivo === pos.crop);
  const lh = hvD.length ? hvD[hvD.length - 1] : null;
  if (!lh || !lh.hv_20d) return '';
  
  const ratio = (lh.vi_atm / lh.hv_20d).toFixed(2);
  let lbl, bg, color;
  if (ratio < 0.8) { lbl = 'Opciones baratas vs HV'; bg = 'var(--es-green-light)'; color = 'var(--es-green)'; }
  else if (ratio > 1.5) { lbl = 'Opciones caras vs HV'; bg = '#fde8e8'; color = 'var(--red)'; }
  else { lbl = 'VI/HV equilibrado'; bg = 'var(--bg-input)'; color = 'var(--text-2)'; }
  
  return `<div style="background:${bg};border:1px solid ${color}30;border-radius:6px;padding:5px 12px;font-size:11px;">
    <span style="color:${color};font-weight:700;">VI/HV: ${ratio}x</span> · ${lbl}
  </div>`;
}

// ─── GREEKS TABLE ───
function vgRenderGreeksTable(pos) {
  // Group legs by strategy
  const stratMap = new Map();
  pos.legs.forEach(l => {
    if (!stratMap.has(l.stratName)) {
      stratMap.set(l.stratName, { color: l.stratColor, legs: [], net: { delta: 0, gamma: 0, theta: 0, vega: 0 } });
    }
    const s = stratMap.get(l.stratName);
    s.legs.push(l);
    s.net.delta += l.greeks.delta;
    s.net.gamma += l.greeks.gamma;
    s.net.theta += l.greeks.theta;
    s.net.vega += l.greeks.vega;
  });

  const thStyle = 'padding:8px;background:var(--es-green-light);border-bottom:2px solid var(--es-green);font-weight:700;color:var(--es-green-dark);font-size:10px;text-transform:uppercase;';
  const hasSkew = ASST_SKEW && ASST_SKEW.length > 0;
  const valorTooltip = hasSkew ? 'VI actual vs percentiles históricos del skew (P25/P75)' : 'Cargar datos históricos para análisis de valor';

  let h = `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:16px;box-shadow:var(--shadow);margin-bottom:16px;overflow-x:auto;">`;
  h += `<div style="font-size:12px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
    <span style="font-size:15px;">📐</span> Griegas de la posición</div>`;

  for (const [stratName, strat] of stratMap) {
    h += `<div style="margin-bottom:14px;">`;
    h += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding:4px 0;">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${strat.color};"></span>
      <span style="font-size:12px;font-weight:700;color:var(--text);">${stratName}</span>
    </div>`;
    h += `<table style="width:100%;border-collapse:collapse;font-size:12px;">`;
    h += `<thead><tr>
      <th style="${thStyle}text-align:left;">Instrumento</th>
      <th style="${thStyle}text-align:center;">Strike</th>
      <th style="${thStyle}text-align:center;">Prima</th>
      <th style="${thStyle}text-align:center;">VI %</th>
      <th style="${thStyle}text-align:center;">Δ Delta</th>
      <th style="${thStyle}text-align:center;">Γ Gamma</th>
      <th style="${thStyle}text-align:center;">Θ Theta</th>
      <th style="${thStyle}text-align:center;">ν Vega</th>
      <th style="${thStyle}text-align:center;" title="${valorTooltip}">Valor <span style="font-size:8px;cursor:help;">ⓘ</span></th>
    </tr></thead><tbody>`;

    strat.legs.forEach(l => {
      const dirLabel = l.dir === 'buy' ? 'C' : 'V';
      const typeLabel = l.type === 'futuro' ? 'FUT' : l.type.toUpperCase();
      const qtyLabel = l.ratio > 1 ? `${l.ratio}×` : '';
      const valBadge = l.value === 'cheap' 
        ? '<span style="font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;background:var(--es-green-light);color:var(--es-green-dark);">BARATO</span>'
        : l.value === 'expensive' 
        ? '<span style="font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;background:#fde8e8;color:var(--red);">CARO</span>'
        : '<span style="font-size:8px;color:var(--text-3);">—</span>';
      
      h += `<tr>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border);font-family:var(--mono);font-weight:600;">
          <span style="color:${l.dir==='buy'?'var(--es-green)':'var(--red)'}">${dirLabel}</span> ${qtyLabel}${typeLabel}
        </td>
        <td style="padding:7px;border-bottom:1px solid var(--border);text-align:center;font-family:var(--mono);font-weight:700;">${l.strike}</td>
        <td style="padding:7px;border-bottom:1px solid var(--border);text-align:center;font-family:var(--mono);">${l.prima.toFixed(1)}</td>
        <td style="padding:7px;border-bottom:1px solid var(--border);text-align:center;font-family:var(--mono);${l.value==='expensive'?'color:var(--red);font-weight:700;':l.value==='cheap'?'color:var(--es-green);font-weight:700;':''}">${l.vi !== null ? l.vi.toFixed(1)+'%' : '—'}</td>
        <td style="padding:7px;border-bottom:1px solid var(--border);text-align:center;font-family:var(--mono);">${l.greeks.delta.toFixed(3)}</td>
        <td style="padding:7px;border-bottom:1px solid var(--border);text-align:center;font-family:var(--mono);">${l.greeks.gamma.toFixed(5)}</td>
        <td style="padding:7px;border-bottom:1px solid var(--border);text-align:center;font-family:var(--mono);color:${l.greeks.theta<0?'var(--red)':'var(--es-green)'};">${l.greeks.theta.toFixed(4)}</td>
        <td style="padding:7px;border-bottom:1px solid var(--border);text-align:center;font-family:var(--mono);">${l.greeks.vega.toFixed(3)}</td>
        <td style="padding:7px;border-bottom:1px solid var(--border);text-align:center;">${valBadge}</td>
      </tr>`;
    });

    // Strategy sub-total row
    if (strat.legs.length > 1) {
      h += `<tr style="background:#f8f9f5;font-weight:600;">
        <td style="padding:6px 8px;font-size:11px;color:var(--text-2);" colspan="4">Subtotal ${stratName}</td>
        <td style="padding:6px;text-align:center;font-family:var(--mono);font-size:11px;">${strat.net.delta.toFixed(3)}</td>
        <td style="padding:6px;text-align:center;font-family:var(--mono);font-size:11px;">${strat.net.gamma.toFixed(5)}</td>
        <td style="padding:6px;text-align:center;font-family:var(--mono);font-size:11px;color:${strat.net.theta<0?'var(--red)':'var(--es-green)'};">${strat.net.theta.toFixed(4)}</td>
        <td style="padding:6px;text-align:center;font-family:var(--mono);font-size:11px;">${strat.net.vega.toFixed(3)}</td>
        <td></td>
      </tr>`;
    }

    h += `</tbody></table></div>`;
  }

  // Net position row (only if multiple strategies)
  if (stratMap.size > 1) {
    h += `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:4px;">`;
    h += `<tr style="background:var(--es-green-light);font-weight:700;">
      <td style="padding:8px;font-size:12px;" colspan="4">POSICIÓN NETA</td>
      <td style="padding:8px;text-align:center;font-family:var(--mono);font-size:13px;">${pos.net.delta.toFixed(3)}</td>
      <td style="padding:8px;text-align:center;font-family:var(--mono);font-size:13px;">${pos.net.gamma.toFixed(5)}</td>
      <td style="padding:8px;text-align:center;font-family:var(--mono);font-size:13px;color:${pos.net.theta<0?'var(--red)':'var(--es-green)'};">${pos.net.theta.toFixed(4)}</td>
      <td style="padding:8px;text-align:center;font-family:var(--mono);font-size:13px;">${pos.net.vega.toFixed(3)}</td>
      <td></td>
    </tr>`;
    h += `</table>`;
  }
  
  // Interpretation
  h += vgRenderGreeksInterpretation(pos);
  
  h += `</div>`;
  return h;
}

// ─── GREEKS INTERPRETATION ───
function vgRenderGreeksInterpretation(pos) {
  const d = pos.net.delta, g = pos.net.gamma, t = pos.net.theta, v = pos.net.vega;
  const days = vgGetDaysToExpiry();
  
  let items = [];
  
  // Delta interpretation
  if (Math.abs(d) < 0.05) items.push('Delta neutral — la posición no se mueve mucho con el subyacente.');
  else if (d < -0.3) items.push(`Delta ${d.toFixed(2)} — fuerte protección bajista. Por cada u$s que baje el futuro, ganás ~${Math.abs(d).toFixed(2)} u$s.`);
  else if (d < 0) items.push(`Delta ${d.toFixed(2)} — protección moderada a la baja.`);
  else if (d > 0.3) items.push(`Delta ${d.toFixed(2)} — exposición alcista neta. Ganás si sube.`);
  
  // Theta interpretation
  if (t < -0.05) {
    const dailyCost = Math.abs(t).toFixed(2);
    const weeklyCost = (Math.abs(t) * 7).toFixed(2);
    items.push(`Theta ${t.toFixed(3)} — perdés ${dailyCost} u$s/tn por día (${weeklyCost}/semana) por time decay.`);
  } else if (t > 0.02) {
    items.push(`Theta positivo — cobrás ${t.toFixed(3)} u$s/tn por día. El tiempo juega a tu favor.`);
  }
  
  // Vega interpretation  
  if (v > 0.1) items.push(`Vega positivo (${v.toFixed(2)}) — te beneficia una suba de volatilidad. Si entramos en weather market y la VI sube, la posición gana.`);
  else if (v < -0.1) items.push(`Vega negativo (${v.toFixed(2)}) — cuidado si sube la volatilidad. Si hay weather market, la posición pierde por vega.`);
  
  // Time urgency
  if (days && days < 30) items.push(`⚡ ${days} días al vencimiento — theta se acelera. Considerá cerrar o rollear.`);
  else if (days && days < 60) items.push(`⏱️ ${days} días al vencimiento — entrando en zona de aceleración de theta.`);
  
  if (items.length === 0) return '';
  
  return `<div style="margin-top:12px;padding:12px;background:var(--bg-input);border-radius:8px;font-size:12px;line-height:1.7;color:var(--text-2);">
    <div style="font-weight:700;color:var(--text);margin-bottom:4px;">💡 Lectura rápida</div>
    ${items.map(i => `<div style="margin-bottom:2px;">• ${i}</div>`).join('')}
  </div>`;
}

// ─── VI THERMOMETER ───
function vgRenderThermometer(pos) {
  const optLegs = pos.legs.filter(l => l.vi !== null && l.perc);
  if (optLegs.length === 0) return '';
  
  let h = `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:16px;box-shadow:var(--shadow);margin-bottom:16px;">`;
  h += `<div style="font-size:12px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
    <span style="font-size:15px;">🌡️</span> VI actual vs historia — ¿las primas están caras o baratas?</div>`;
  
  h += `<div style="display:grid;grid-template-columns:repeat(${Math.min(optLegs.length, 4)}, 1fr);gap:14px;">`;
  
  optLegs.forEach(l => {
    const p = l.perc;
    const vi = l.vi;
    // Position on 0-100 scale based on percentiles
    let pct;
    if (vi <= p.p10) pct = (vi / p.p10) * 10;
    else if (vi <= p.p25) pct = 10 + ((vi - p.p10) / (p.p25 - p.p10)) * 15;
    else if (vi <= p.p50) pct = 25 + ((vi - p.p25) / (p.p50 - p.p25)) * 25;
    else if (vi <= p.p75) pct = 50 + ((vi - p.p50) / (p.p75 - p.p50)) * 25;
    else if (vi <= p.p90) pct = 75 + ((vi - p.p75) / (p.p90 - p.p75)) * 15;
    else pct = 90 + Math.min(10, ((vi - p.p90) / (p.p90 * 0.3)) * 10);
    pct = Math.max(2, Math.min(98, pct));
    
    const label = pct < 20 ? 'MUY BARATA' : pct < 35 ? 'BARATA' : pct < 65 ? 'NORMAL' : pct < 80 ? 'CARA' : 'MUY CARA';
    const labelColor = pct < 35 ? 'var(--es-green)' : pct < 65 ? 'var(--text-3)' : 'var(--red)';
    // Clamp VI% label position so it doesn't overflow the edges
    const viLabelLeft = Math.max(8, Math.min(92, pct));
    
    h += `<div style="background:var(--bg-input);border-radius:8px;padding:14px 14px 10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-size:11px;font-weight:600;"><span style="color:${l.dir==='buy'?'var(--es-green)':'var(--red)'}">${l.dir==='buy'?'C':'V'}</span> ${l.type.toUpperCase()} ${l.strike}</span>
        <span style="font-size:10px;font-family:var(--mono);font-weight:700;color:${labelColor};letter-spacing:0.5px;white-space:nowrap;margin-left:12px;">${label}</span>
      </div>
      <div style="position:relative;height:18px;background:linear-gradient(90deg, #22c55e 0%, #22c55e 20%, #3b82f6 35%, #eab308 60%, #ef4444 85%, #dc2626 100%);border-radius:9px;margin-bottom:6px;">
        <div style="position:absolute;top:-2px;left:${pct}%;transform:translateX(-50%);width:4px;height:22px;background:var(--text);border-radius:2px;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>
      </div>
      <div style="position:relative;height:14px;margin-bottom:6px;">
        <div style="position:absolute;left:${viLabelLeft}%;transform:translateX(-50%);font-size:10px;font-weight:700;font-family:var(--mono);color:var(--text);white-space:nowrap;">${vi.toFixed(1)}%</div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;font-family:var(--mono);color:var(--text-3);">
        <span>P10: ${p.p10.toFixed(1)}</span>
        <span>P25: ${p.p25.toFixed(1)}</span>
        <span>P50: ${p.p50.toFixed(1)}</span>
        <span>P75: ${p.p75.toFixed(1)}</span>
        <span>P90: ${p.p90.toFixed(1)}</span>
      </div>
    </div>`;
  });
  
  h += `</div></div>`;
  return h;
}

// ─── DELTA PROFILE CHART ───
function vgRenderDeltaChart(pos) {
  const canvas = document.getElementById('vg-chart-delta');
  if (!canvas) return;
  if (vgChartDelta) vgChartDelta.destroy();
  
  const { F, T, r, legs } = pos;
  const range = [];
  const step = Math.max(1, Math.round(F * 0.4 / 50));
  for (let p = Math.round(F * 0.7); p <= Math.round(F * 1.3); p += step) range.push(p);
  
  // Calculate net delta at each price point
  const netDeltas = range.map(price => {
    let netD = 0;
    legs.forEach(l => {
      if (l.type === 'futuro') {
        netD += l.dir === 'buy' ? 1 : -1;
        return;
      }
      if (!l.viRaw || !T || T <= 0) return;
      const ratio = l.ratio || 1;
      const mult = l.dir === 'buy' ? 1 : -1;
      const g = asstGreeks(price, l.strike, T, r, l.viRaw, l.type);
      netD += g.delta * mult * ratio;
    });
    return +netD.toFixed(4);
  });
  
  // Also show individual strategy deltas if multiple strategies
  const stratDatasets = [];
  const t = getActiveTab();
  if (t.strategies.length > 1) {
    t.strategies.forEach(s => {
      const sLegs = legs.filter(l => l.stratName === s.name);
      if (sLegs.length === 0) return;
      const deltas = range.map(price => {
        let d = 0;
        sLegs.forEach(l => {
          if (l.type === 'futuro') { d += l.dir === 'buy' ? 1 : -1; return; }
          if (!l.viRaw || !T || T <= 0) return;
          const g = asstGreeks(price, l.strike, T, r, l.viRaw, l.type);
          d += g.delta * (l.dir === 'buy' ? 1 : -1) * (l.ratio || 1);
        });
        return +d.toFixed(4);
      });
      stratDatasets.push({
        label: s.name,
        data: deltas,
        borderColor: s.color + '80',
        borderWidth: 1.5,
        borderDash: [4, 3],
        pointRadius: 0,
        tension: 0.3
      });
    });
  }
  
  vgChartDelta = new Chart(canvas, {
    type: 'line',
    data: {
      labels: range,
      datasets: [
        ...stratDatasets,
        {
          label: 'Delta Neto',
          data: netDeltas,
          borderColor: '#1A6B3C',
          backgroundColor: 'rgba(26,107,60,0.08)',
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.3,
          fill: true
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 0 },
      plugins: {
        tooltip: { mode: 'index', intersect: false },
        legend: { display: stratDatasets.length > 0, labels: { font: { family: 'Montserrat', size: 10 }, usePointStyle: true } }
      },
      scales: {
        x: {
          title: { display: true, text: 'Precio del Futuro (u$s)', font: { family: 'Montserrat', size: 10, weight: '600' }, color: '#505845' },
          grid: { color: 'rgba(0,0,0,.04)' },
          ticks: { font: { family: 'JetBrains Mono', size: 9 }, color: '#7e8574', maxTicksLimit: 10 }
        },
        y: {
          title: { display: true, text: 'Delta', font: { family: 'Montserrat', size: 10, weight: '600' }, color: '#505845' },
          grid: { color: 'rgba(0,0,0,.04)' },
          ticks: { font: { family: 'JetBrains Mono', size: 9 }, color: '#7e8574' }
        }
      }
    }
  });
}

// ─── THETA DECAY CHART ───
function vgRenderThetaChart(pos) {
  const canvas = document.getElementById('vg-chart-theta');
  if (!canvas) return;
  if (vgChartTheta) vgChartTheta.destroy();
  
  const { F, T, r, legs } = pos;
  const totalDays = vgGetDaysToExpiry();
  if (!totalDays || totalDays <= 0) return;
  
  // Generate time series: position value at different days to expiry
  const dayPoints = [];
  const stepD = Math.max(1, Math.floor(totalDays / 40));
  for (let d = totalDays; d >= 1; d -= stepD) dayPoints.push(d);
  if (dayPoints[dayPoints.length - 1] !== 1) dayPoints.push(1);
  dayPoints.reverse();
  
  // Calculate position value (total premium value) at each time point
  const posValues = dayPoints.map(d => {
    const tYr = d / 365;
    let val = 0;
    legs.forEach(l => {
      if (l.type === 'futuro' || !l.viRaw || l.viRaw <= 0) return;
      const mult = l.dir === 'buy' ? 1 : -1;
      const ratio = l.ratio || 1;
      const price = asstB76(F, l.strike, tYr, r, l.viRaw, l.type);
      val += price * mult * ratio;
    });
    return +val.toFixed(2);
  });
  
  // Also calculate daily theta at each point
  const thetaValues = dayPoints.map(d => {
    const tYr = d / 365;
    let th = 0;
    legs.forEach(l => {
      if (l.type === 'futuro' || !l.viRaw || l.viRaw <= 0) return;
      const mult = l.dir === 'buy' ? 1 : -1;
      const ratio = l.ratio || 1;
      const g = asstGreeks(F, l.strike, tYr, r, l.viRaw, l.type);
      th += g.theta * mult * ratio;
    });
    return +th.toFixed(4);
  });
  
  vgChartTheta = new Chart(canvas, {
    type: 'line',
    data: {
      labels: dayPoints.map(d => d + 'd'),
      datasets: [
        {
          label: 'Valor temporal (u$s/tn)',
          data: posValues,
          borderColor: '#1A6B3C',
          backgroundColor: 'rgba(26,107,60,0.06)',
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.3,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: 'Theta diario (u$s/tn)',
          data: thetaValues,
          borderColor: '#c43030',
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 0 },
      plugins: {
        tooltip: { mode: 'index', intersect: false },
        legend: { labels: { font: { family: 'Montserrat', size: 10 }, usePointStyle: true, pointStyle: 'line' } }
      },
      scales: {
        x: {
          title: { display: true, text: 'Días al vencimiento', font: { family: 'Montserrat', size: 10, weight: '600' }, color: '#505845' },
          grid: { color: 'rgba(0,0,0,.04)' },
          ticks: { font: { family: 'JetBrains Mono', size: 9 }, color: '#7e8574', maxTicksLimit: 10 }
        },
        y: {
          position: 'left',
          title: { display: true, text: 'Valor (u$s)', font: { family: 'Montserrat', size: 10, weight: '600' }, color: '#1A6B3C' },
          grid: { color: 'rgba(0,0,0,.04)' },
          ticks: { font: { family: 'JetBrains Mono', size: 9 }, color: '#1A6B3C' }
        },
        y1: {
          position: 'right',
          title: { display: true, text: 'Theta (u$s/día)', font: { family: 'Montserrat', size: 10, weight: '600' }, color: '#c43030' },
          grid: { drawOnChartArea: false },
          ticks: { font: { family: 'JetBrains Mono', size: 9 }, color: '#c43030' }
        }
      }
    }
  });
}

// ─── MARKET INSIGHT ───
function vgRenderMarketInsight(pos) {
  const { crop, mes, legs } = pos;
  const perc = ASST_VI_PERC.find(v => v.cultivo === crop && v.mes === mes);
  const hvD = ASST_VIVHV.filter(x => x.cultivo === crop);
  const lh = hvD.length ? hvD[hvD.length - 1] : null;
  const weather = mes >= 6 && mes <= 8;
  
  let insights = [];
  
  // VI regime
  const optLegs = legs.filter(l => l.vi !== null);
  if (perc && optLegs.length > 0) {
    const avgVI = optLegs.reduce((a, l) => a + l.vi, 0) / optLegs.length;
    if (avgVI <= perc.p25) {
      insights.push({ icon: '🟢', text: `VI promedio (${avgVI.toFixed(1)}%) debajo del P25 histórico (${perc.p25.toFixed(1)}%). Las primas están baratas — buen momento para comprar protección.`, type: 'good' });
    } else if (avgVI >= perc.p75) {
      insights.push({ icon: '🔴', text: `VI promedio (${avgVI.toFixed(1)}%) por encima del P75 histórico (${perc.p75.toFixed(1)}%). Las primas están caras — considerar spreads o collars para abaratar.`, type: 'warn' });
    } else {
      insights.push({ icon: '🟡', text: `VI promedio (${avgVI.toFixed(1)}%) en rango normal (P25: ${perc.p25.toFixed(1)}, P75: ${perc.p75.toFixed(1)}).`, type: 'neutral' });
    }
  }
  
  // VI/HV
  if (lh && lh.hv_20d > 0) {
    const ratio = lh.vi_atm / lh.hv_20d;
    if (ratio < 0.8) {
      insights.push({ icon: '📊', text: `Ratio VI/HV: ${ratio.toFixed(2)}x — opciones subvaluadas vs volatilidad realizada. Estadísticamente favorable comprar primas.`, type: 'good' });
    } else if (ratio > 1.5) {
      insights.push({ icon: '📊', text: `Ratio VI/HV: ${ratio.toFixed(2)}x — opciones sobrevaluadas. Vender prima (spreads, collars) tiene ventaja estadística.`, type: 'warn' });
    }
  }
  
  // Weather market
  if (weather) {
    const hasSoldCalls = legs.some(l => l.dir === 'sell' && l.type === 'call');
    if (hasSoldCalls) {
      insights.push({ icon: '⚠️', text: `Weather market activo (Jun-Ago). Tenés calls vendidos — riesgo de suba explosiva por clima en EE.UU. Monitoreá de cerca.`, type: 'warn' });
    } else {
      insights.push({ icon: '🌤️', text: `Estamos en ventana de weather market (Jun-Ago). La VI tiende a subir — tu posición con vega positivo se beneficiaría.`, type: 'good' });
    }
  }
  
  // Skew value opportunities
  const cheapLegs = optLegs.filter(l => l.value === 'cheap');
  const expensiveLegs = optLegs.filter(l => l.value === 'expensive');
  if (cheapLegs.length > 0) {
    insights.push({ icon: '✅', text: `${cheapLegs.map(l => `${l.type.toUpperCase()} ${l.strike}`).join(', ')} — ${cheapLegs.length === 1 ? 'está' : 'están'} por debajo del P25 del skew histórico. Buen valor relativo.`, type: 'good' });
  }
  if (expensiveLegs.length > 0) {
    insights.push({ icon: '💰', text: `${expensiveLegs.map(l => `${l.type.toUpperCase()} ${l.strike}`).join(', ')} — ${expensiveLegs.length === 1 ? 'está' : 'están'} por encima del P75 del skew. Prima cara históricamente.`, type: 'warn' });
  }
  
  if (insights.length === 0) return '';
  
  let h = `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:16px;box-shadow:var(--shadow);">`;
  h += `<div style="font-size:12px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
    <span style="font-size:15px;">📡</span> Contexto de mercado</div>`;
  
  insights.forEach(ins => {
    const bg = ins.type === 'good' ? 'var(--es-green-light)' : ins.type === 'warn' ? '#fff3cd' : 'var(--bg-input)';
    const border = ins.type === 'good' ? 'var(--es-green)' : ins.type === 'warn' ? '#ffc107' : 'var(--border)';
    h += `<div style="padding:10px 14px;background:${bg};border-left:3px solid ${border};border-radius:0 6px 6px 0;margin-bottom:8px;font-size:12px;line-height:1.6;">
      ${ins.icon} ${ins.text}
    </div>`;
  });
  
  h += `</div>`;
  return h;
}

function vgToggle() {
  vgExpanded = !vgExpanded;
  const content = document.getElementById('vg-content');
  const arrow = document.getElementById('vg-toggle-arrow');
  if (content) content.style.display = vgExpanded ? 'block' : 'none';
  if (arrow) arrow.textContent = vgExpanded ? '▾' : '▸';
  if (vgExpanded) vgRender();
}
