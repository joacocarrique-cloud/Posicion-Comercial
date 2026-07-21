// ═══════════════════════════════════════════════════
// ─── SIMULADOR DE POSICIÓN ESPARTINA ───
//  Precio de venta ponderado de la compañía combinando
//  futuros + opciones (múltiples strikes) contra escenarios
//  de precio de mercado.
//
//  Las primas se toman de la MISMA fuente que el builder de
//  coberturas: lookupPrima(type, strike) sobre marketData /
//  marketPosition (sincronizados con A3). No hay feed propio.
// ═══════════════════════════════════════════════════

let simMode = false;
let simLegs = [];
let simLegSeq = 1;
let simChart = null;

// ─── Toggle (mismo patrón que los demás módulos) ───
function toggleSimulador() {
  simMode = true;
  theoryMode = false; retMode = false; paseMode = false; asstMode = false; spreadMode = false;
  if (typeof desvioMode !== 'undefined') desvioMode = false;
  if (typeof pnlMode !== 'undefined') pnlMode = false;

  // Apagar todos los espacios de otros módulos
  const spaces = ['workspace','theory-space','ret-space','pase-space','spreads-space',
                  'desvio-space','alertas-space','pnl-space'];
  spaces.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  document.getElementById('simulador-space').style.display = 'block';

  // Barras superiores que no aplican a este módulo
  const mkt = document.getElementById('mkt-bar'); if (mkt) mkt.style.display = 'none';
  const fob = document.getElementById('fob-bar'); if (fob) fob.style.display = 'none';
  const tc = document.getElementById('tabs-container'); if (tc) tc.style.display = 'none';
  try { document.getElementById('btn-update-primas').style.display = 'none'; } catch(e){}

  // Marcar pill activa
  document.querySelectorAll('.mod-pill').forEach(p => p.classList.remove('active'));
  const pill = document.getElementById('sim-pill');
  if (pill) pill.classList.add('active');

  if (simLegs.length === 0) {
    simAddLeg({ operacion: 'Venta', instrumento: 'futuro', pct: 40, strike: 192 });
    simAddLeg({ operacion: 'Venta', instrumento: 'call', pct: 20, strike: 196 });
  }
  simRefreshAllPrimas();
  simRenderLegs();
  simRender();
}

// ─── Guard auto-contenido ───
// Los toggles de otros módulos (P&L, Desvío, etc.) viven en archivos propios
// y no saben esconder 'simulador-space'. Este observer lo esconde solo cuando
// cualquier otro -space se vuelve visible, sin tocar esos archivos.
(function simInstallGuard() {
  function attach() {
    const others = ['workspace','theory-space','ret-space','pase-space','spreads-space',
                    'desvio-space','alertas-space','pnl-space'];
    const simSpace = document.getElementById('simulador-space');
    if (!simSpace) { setTimeout(attach, 300); return; }
    const obs = new MutationObserver(() => {
      if (!simMode) return;
      const someoneVisible = others.some(id => {
        const el = document.getElementById(id);
        return el && el.style.display !== 'none' && el.style.display !== '';
      });
      if (someoneVisible) {
        simMode = false;
        simSpace.style.display = 'none';
        const pill = document.getElementById('sim-pill');
        if (pill) pill.classList.remove('active');
      }
    });
    others.forEach(id => {
      const el = document.getElementById(id);
      if (el) obs.observe(el, { attributes: true, attributeFilter: ['style'] });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();

// ─── Cultivo activo del simulador ───
function simGetCrop() {
  const sel = document.getElementById('sim-crop');
  return sel ? sel.value : 'soja';
}

// ─── Prima desde la fuente del builder (misma que coberturas) ───
// lookupPrima(type, strike) vive en coberturas.js y lee marketData/marketPosition.
function simLookupPrima(instrumento, strike) {
  if (instrumento === 'futuro') return null;
  if (typeof lookupPrima !== 'function') return null;
  return lookupPrima(instrumento, strike); // 'call' | 'put'
}

// ─── Modelo de patas ───
function simAddLeg(defaults = {}) {
  simLegs.push(Object.assign({
    id: simLegSeq++,
    operacion: 'Venta',    // Venta | Compra
    instrumento: 'call',   // futuro | call | put
    pct: 20,
    strike: 200,
    prima: null,
    primaManual: false,
  }, defaults));
}

function simRemoveLeg(id) {
  simLegs = simLegs.filter(l => l.id !== id);
  simRenderLegs();
  simRender();
}

function simRefreshAllPrimas() {
  simLegs.forEach(l => {
    if (l.instrumento === 'futuro') { l.prima = null; return; }
    if (l.primaManual) return;
    l.prima = simLookupPrima(l.instrumento, parseFloat(l.strike));
  });
}

function simRenderLegs() {
  const cont = document.getElementById('sim-legs');
  if (!cont) return;
  cont.innerHTML = '';

  simLegs.forEach(leg => {
    const div = document.createElement('div');
    div.className = 'sim-leg';

    let primaTag = '';
    if (leg.instrumento !== 'futuro') {
      if (leg.primaManual) {
        primaTag = `<div class="sim-prima-tag manual">Prima manual: ${leg.prima != null ? leg.prima : '—'}</div>`;
      } else if (leg.prima != null) {
        primaTag = `<div class="sim-prima-tag ok">Prima A3: ${leg.prima}</div>`;
      } else {
        primaTag = `<div class="sim-prima-tag err">Sin dato para ${leg.instrumento.toUpperCase()} ${leg.strike} — sincronizá A3 o cargá manual</div>`;
      }
    }

    div.innerHTML = `
      <button class="sim-del" onclick="simRemoveLeg(${leg.id})" title="Eliminar pata">✕</button>
      <div class="sim-leg-grid">
        <div class="field">
          <label>Operación</label>
          <select onchange="simUpdateLeg(${leg.id},'operacion',this.value)">
            <option value="Venta" ${leg.operacion==='Venta'?'selected':''}>Venta</option>
            <option value="Compra" ${leg.operacion==='Compra'?'selected':''}>Compra</option>
          </select>
        </div>
        <div class="field">
          <label>Instrumento</label>
          <select onchange="simUpdateLeg(${leg.id},'instrumento',this.value)">
            <option value="futuro" ${leg.instrumento==='futuro'?'selected':''}>Futuro</option>
            <option value="call" ${leg.instrumento==='call'?'selected':''}>Call</option>
            <option value="put" ${leg.instrumento==='put'?'selected':''}>Put</option>
          </select>
        </div>
      </div>
      <div class="sim-leg-grid3">
        <div class="field">
          <label>% Volumen</label>
          <input type="number" min="0" max="100" value="${leg.pct}" onchange="simUpdateLeg(${leg.id},'pct',this.value)">
        </div>
        <div class="field">
          <label>${leg.instrumento==='futuro'?'Precio':'Strike'}</label>
          <input type="number" value="${leg.strike}" onchange="simUpdateLeg(${leg.id},'strike',this.value)">
        </div>
        <div class="field">
          <label>Prima</label>
          <input type="number" step="0.1" placeholder="auto"
                 value="${leg.prima != null ? leg.prima : ''}"
                 ${leg.instrumento==='futuro'?'disabled':''}
                 onchange="simUpdateLeg(${leg.id},'primaManualVal',this.value)">
        </div>
      </div>
      ${primaTag}
    `;
    cont.appendChild(div);
  });

  const sum = simLegs.reduce((s,l)=>s+(parseFloat(l.pct)||0),0);
  const sumEl = document.getElementById('sim-sum-pct');
  if (sumEl) sumEl.textContent = sum.toFixed(0) + '% asignado';
  const alertEl = document.getElementById('sim-alert-over');
  if (alertEl) alertEl.style.display = sum > 100 ? 'block' : 'none';
}

function simUpdateLeg(id, field, value) {
  const leg = simLegs.find(l => l.id === id);
  if (!leg) return;

  if (field === 'primaManualVal') {
    if (value === '' || value === null) { leg.primaManual = false; leg.prima = simLookupPrima(leg.instrumento, leg.strike); }
    else { leg.primaManual = true; leg.prima = parseFloat(value); }
  } else if (field === 'pct' || field === 'strike') {
    leg[field] = parseFloat(value) || 0;
    if (field === 'strike' && leg.instrumento !== 'futuro' && !leg.primaManual) {
      leg.prima = simLookupPrima(leg.instrumento, leg.strike);
    }
  } else {
    leg[field] = value;
    if (field === 'instrumento') {
      leg.primaManual = false;
      leg.prima = leg.instrumento === 'futuro' ? null : simLookupPrima(leg.instrumento, leg.strike);
    }
  }
  simRenderLegs();
  simRender();
}

// ─── Cálculo del precio de venta ponderado por escenario ───
// Reutiliza la misma lógica de payoff que calcPayoff() del builder:
//   precio de venta de la tonelada = S + payoff_opción − prima_neta
// ponderado por % de volumen de cada pata + tramo sin cobertura a precio pleno.
function simPrecioVenta(S) {
  const sumPct = simLegs.reduce((s,l)=>s+(parseFloat(l.pct)||0),0);
  const sinCobPct = Math.max(0, 100 - sumPct);

  let total = 0;
  simLegs.forEach(leg => {
    const w = (parseFloat(leg.pct)||0) / 100;
    if (w <= 0) return;
    let px;
    if (leg.instrumento === 'futuro') {
      const intr = S - leg.strike;
      px = (leg.operacion === 'Compra') ? (S + intr) : (S - intr); // Venta futuro fija precio; Compra invierte
    } else {
      const prima = leg.prima != null ? leg.prima : 0;
      const signoPrima = leg.operacion === 'Venta' ? +1 : -1; // cobra (+) / paga (−)
      const intr = leg.instrumento === 'put'
        ? Math.max(leg.strike - S, 0)
        : Math.max(S - leg.strike, 0);
      const payoff = leg.operacion === 'Venta' ? -intr : +intr;
      px = S + payoff + signoPrima * prima;
    }
    total += w * px;
  });
  total += (sinCobPct / 100) * S;
  return total;
}

function simRender() {
  const sumPct = simLegs.reduce((s,l)=>s+(parseFloat(l.pct)||0),0);
  const cubierto = Math.min(sumPct, 100);

  // Centro del rango: usa spot del tab activo si existe, si no promedio de strikes
  let centro;
  try { centro = getActiveTab().spot; } catch(e) { centro = null; }
  if (!centro || isNaN(centro)) {
    const strikes = simLegs.map(l=>parseFloat(l.strike)).filter(x=>!isNaN(x));
    centro = strikes.length ? strikes.reduce((a,b)=>a+b,0)/strikes.length : 200;
  }

  // KPIs
  const set = (id,val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('sim-kpi-cub', cubierto.toFixed(0) + '%');
  set('sim-kpi-sincob', Math.max(0,100-sumPct).toFixed(0) + '%');
  set('sim-kpi-px', 'u$s ' + simPrecioVenta(centro).toFixed(1));

  let primaNeta = 0;
  simLegs.forEach(l => {
    if (l.instrumento === 'futuro') return;
    const p = l.prima != null ? l.prima : 0;
    const sign = l.operacion === 'Venta' ? 1 : -1;
    primaNeta += sign * p * ((parseFloat(l.pct)||0)/100);
  });
  set('sim-kpi-prima', (primaNeta>=0?'+':'') + 'u$s ' + primaNeta.toFixed(2));

  // Rango de escenarios (dominio compartido X = Y para diagonal real de 45°)
  const desde = Math.max(0, Math.round((centro - 50)/2)*2);
  const hasta = Math.round((centro + 50)/2)*2;
  const labels = [], dataMkt = [], dataPos = [];
  for (let s = desde; s <= hasta; s += 2) {
    labels.push(s); dataMkt.push(s); dataPos.push(simPrecioVenta(s));
  }

  const canvas = document.getElementById('sim-chart');
  if (!canvas) return;
  if (simChart) simChart.destroy();
  simChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:'Mercado', data:dataMkt, borderColor:'#b0afa8', borderWidth:2, borderDash:[6,4],
          pointRadius:0, pointHoverRadius:5, pointHoverBackgroundColor:'#b0afa8',
          pointHoverBorderColor:'#fff', pointHoverBorderWidth:2, tension:0 },
        { label:'Precio de Venta Espartina', data:dataPos, borderColor:'#1A6B3C',
          backgroundColor:'rgba(26,107,60,0.06)', borderWidth:2.5, fill:true,
          pointRadius:0, pointHoverRadius:6, pointHoverBackgroundColor:'#1A6B3C',
          pointHoverBorderColor:'#fff', pointHoverBorderWidth:2, tension:0 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 0 },
      interaction: { mode:'index', intersect:false },
      plugins: {
        tooltip: {
          mode:'index', intersect:false,
          callbacks: { label: (c)=>`${c.dataset.label}: u$s ${c.parsed.y.toFixed(1)}` }
        },
        legend: { labels: { font:{family:'Montserrat',size:12}, usePointStyle:true, pointStyle:'line' } }
      },
      scales: {
        x: {
          title: { display:true, text:'Precio a Vencimiento (u$s)', font:{family:'Montserrat',size:12,weight:'600'}, color:'#505845' },
          grid: { color:'rgba(0,0,0,.05)' },
          ticks: { font:{family:'JetBrains Mono',size:10}, color:'#7e8574' }
        },
        y: {
          min: desde, max: hasta,
          title: { display:true, text:'Precio Neto de Venta (u$s)', font:{family:'Montserrat',size:12,weight:'600'}, color:'#505845' },
          grid: { color:'rgba(0,0,0,.05)' },
          ticks: { font:{family:'JetBrains Mono',size:10}, color:'#7e8574' }
        }
      }
    }
  });
}
