/* ═══════════════════════════════════════════════════════════════
   INTELIGENCIA DE MERCADO — Módulo Suite Comercial Espartina
   Detecta relaciones y basis anómalos vs distribución histórica
   Fuente: ASST_FUTPOS (misma que Spreads y Desvío)
   ═══════════════════════════════════════════════════════════════ */

// ── Config ──────────────────────────────────────────────────────
const AL_DTE_WINDOW = 15;
const AL_ZSCORE_WARN = 1.5;
const AL_ZSCORE_ALERT = 2.0;
const AL_PCT_WARN_LO = 10;
const AL_PCT_WARN_HI = 90;
const AL_PCT_ALERT_LO = 5;
const AL_PCT_ALERT_HI = 95;
const AL_MIN_HIST_OBS = 8;

// ── Pares a monitorear ──────────────────────────────────────────
const AL_INTRA_PAIRS = [
  { cultivo:'soja',  posA:'MAY', posB:'JUL', label:'Soja May–Jul' },
  { cultivo:'soja',  posA:'MAY', posB:'NOV', label:'Soja May–Nov' },
  { cultivo:'soja',  posA:'JUL', posB:'NOV', label:'Soja Jul–Nov' },
  { cultivo:'maiz',  posA:'ABR', posB:'JUL', label:'Maíz Abr–Jul' },
  { cultivo:'maiz',  posA:'JUL', posB:'DIC', label:'Maíz Jul–Dic' },
  { cultivo:'trigo', posA:'DIC', posB:'JUL', label:'Trigo Dic–Jul' },
];

const AL_INTER_PAIRS = [
  { culA:'maiz', posA:'ABR', culB:'soja', posB:'MAY', label:'Maíz Abr / Soja May' },
  { culA:'maiz', posA:'JUL', culB:'soja', posB:'JUL', label:'Maíz Jul / Soja Jul' },
  { culA:'maiz', posA:'JUL', culB:'soja', posB:'NOV', label:'Maíz Jul / Soja Nov' },
  { culA:'trigo', posA:'DIC', culB:'soja', posB:'MAY', label:'Trigo Dic / Soja May' },
  { culA:'maiz', posA:'ABR', culB:'trigo', posB:'DIC', label:'Maíz Abr / Trigo Dic' },
];

// ── State ───────────────────────────────────────────────────────
let alDetailChart = null;
let alHistChart = null;
let alCurrentAlerts = [];
let alActiveFilter = 'all';
let alDebugLog = [];

// ═══════════════════════════════════════════════════════════════
//  MODULE TOGGLE — same pattern as toggleDesvio()
// ═══════════════════════════════════════════════════════════════

function toggleAlertas(){
  const pills = document.querySelectorAll('.mod-pill');
  pills.forEach(p => p.classList.remove('active'));
  pills.forEach(p => { if(p.textContent.includes('Inteligencia')) p.classList.add('active'); });

  document.getElementById('workspace').style.display = 'none';
  if(document.querySelector('.ret-section')) document.querySelector('.ret-section').style.display = 'none';
  if(document.querySelector('.pase-section')) document.querySelector('.pase-section').style.display = 'none';
  document.getElementById('spreads-space').style.display = 'none';
  document.getElementById('theory-space').style.display = 'none';
  document.getElementById('desvio-space').style.display = 'none';
  document.getElementById('futopc-space').style.display = 'none';
  document.getElementById('alertas-space').style.display = 'block';
  document.getElementById('tabs-container').style.display = 'none';
  document.getElementById('fob-bar').style.display = 'none';
  document.getElementById('mkt-bar').style.display = 'none';

  if(!window.ASST_FUTPOS || ASST_FUTPOS.length === 0){
    const container = document.getElementById('alertas-space');
    container.innerHTML = '<div style="padding:48px;text-align:center;font-family:var(--mono);color:var(--text-3);">⏳ Sincronizando datos históricos de A3...</div>';
    asstLoadDrive().then(() => { alRenderDashboard(); });
  } else {
    alRenderDashboard();
  }
}

// ═══════════════════════════════════════════════════════════════
//  DATA — uses same patterns as spreads.js
// ═══════════════════════════════════════════════════════════════

/**
 * Build {cultivo → mes_label → { anio_pos → [{fecha(str), precio, dte}] }}
 * Mirrors desvio.js dvGetAllPositions() exactly
 */
function alBuildTree(){
  const tree = {};
  if(!window.ASST_FUTPOS || !ASST_FUTPOS.length) return tree;
  ASST_FUTPOS.forEach(r => {
    const crop = r.cultivo, mes = r.mes_label;
    const anio = typeof r.anio_pos === 'number' ? r.anio_pos : parseInt(r.anio_pos);
    if(!crop || !mes || !anio) return;
    if(!tree[crop]) tree[crop] = {};
    if(!tree[crop][mes]) tree[crop][mes] = {};
    if(!tree[crop][mes][anio]) tree[crop][mes][anio] = [];
    tree[crop][mes][anio].push({
      fecha: String(r.fecha).slice(0,10),
      precio: r.precio,
      dte: r.dias_vto,
    });
  });
  // Sort by fecha string (ISO-sortable)
  for(const c in tree)
    for(const m in tree[c])
      for(const a in tree[c][m])
        tree[c][m][a].sort((x,y) => x.fecha.localeCompare(y.fecha));
  return tree;
}

/**
 * Get latest data point for a cultivo + mes (across all anio_pos)
 */
function alGetLatest(tree, cultivo, mes){
  const branch = tree[cultivo] && tree[cultivo][mes];
  if(!branch) return null;
  let best = null;
  for(const anio in branch){
    const arr = branch[anio];
    if(!arr.length) continue;
    const last = arr[arr.length - 1];
    if(!best || last.fecha > best.fecha){
      best = { fecha:last.fecha, precio:last.precio, dte:last.dte, anio:parseInt(anio) };
    }
  }
  return best;
}

/**
 * Build intra-cultivo spread series (same pattern as spreads.js spCalcSpread)
 * Returns [{value, anio, dte, fecha}]
 * targetDTE: if not null, filter to ±AL_DTE_WINDOW. If null, return all.
 */
function alBuildIntraSeries(tree, cultivo, posA, posB, targetDTE){
  const branchA = tree[cultivo] && tree[cultivo][posA];
  const branchB = tree[cultivo] && tree[cultivo][posB];
  if(!branchA || !branchB) return [];

  const results = [];
  const yearsA = Object.keys(branchA);

  for(const yA of yearsA){
    // For same-cultivo, look for matching year in posB
    // Try same year, then +1, -1 (handles cross-year positions like Trigo DIC vs JUL)
    for(const yBOff of [0, 1, -1]){
      const yB = String(parseInt(yA) + yBOff);
      if(!branchB[yB]) continue;

      // Index posB by fecha
      const bByDate = {};
      branchB[yB].forEach(r => { bByDate[r.fecha] = r; });

      let matched = 0;
      for(const a of branchA[yA]){
        const b = bByDate[a.fecha];
        if(!b || !b.precio || !a.precio) continue;

        const dte = a.dte;
        // Apply DTE filter only if targetDTE specified AND dte is available
        if(targetDTE !== null && dte != null && !isNaN(dte)){
          if(Math.abs(dte - targetDTE) > AL_DTE_WINDOW) continue;
        }

        results.push({
          value: a.precio - b.precio,
          anio: parseInt(yA),
          dte: dte,
          fecha: a.fecha,
        });
        matched++;
      }
      if(matched > 0) break; // Found the right year mapping
    }
  }
  return results;
}

/**
 * Build inter-cultivo ratio series
 * ratio = priceA / priceB
 */
function alBuildInterSeries(tree, culA, posA, culB, posB, targetDTE){
  const branchA = tree[culA] && tree[culA][posA];
  const branchB = tree[culB] && tree[culB][posB];
  if(!branchA || !branchB) return [];

  const results = [];
  const yearsA = Object.keys(branchA);

  for(const yA of yearsA){
    for(const yBOff of [0, -1, 1]){
      const yB = String(parseInt(yA) + yBOff);
      if(!branchB[yB]) continue;

      const bByDate = {};
      branchB[yB].forEach(r => { bByDate[r.fecha] = r; });

      let matched = 0;
      for(const a of branchA[yA]){
        const b = bByDate[a.fecha];
        if(!b || !b.precio || b.precio === 0 || !a.precio) continue;

        const dte = a.dte;
        if(targetDTE !== null && dte != null && !isNaN(dte)){
          if(Math.abs(dte - targetDTE) > AL_DTE_WINDOW) continue;
        }

        results.push({
          value: a.precio / b.precio,
          anio: parseInt(yA),
          dte: dte,
          fecha: a.fecha,
        });
        matched++;
      }
      if(matched > 0) break;
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════
//  STATISTICS
// ═══════════════════════════════════════════════════════════════

function alStats(values){
  if(!values.length) return null;
  const n = values.length;
  const sorted = [...values].sort((a,b) => a - b);
  const mean = values.reduce((s,v) => s + v, 0) / n;
  const std = Math.sqrt(values.reduce((s,v) => s + (v - mean)**2, 0) / n);
  const median = n%2===0 ? (sorted[n/2-1]+sorted[n/2])/2 : sorted[Math.floor(n/2)];
  return {
    mean, std, median, n,
    min: sorted[0], max: sorted[n-1],
    p5:  sorted[Math.max(0, Math.floor(n*0.05))],
    p10: sorted[Math.max(0, Math.floor(n*0.10))],
    p25: sorted[Math.max(0, Math.floor(n*0.25))],
    p75: sorted[Math.min(n-1, Math.floor(n*0.75))],
    p90: sorted[Math.min(n-1, Math.floor(n*0.90))],
    p95: sorted[Math.min(n-1, Math.floor(n*0.95))],
  };
}

function alPercentile(sortedArr, value){
  let count = 0;
  for(const v of sortedArr){ if(v <= value) count++; else break; }
  return (count / sortedArr.length) * 100;
}

function alZScore(value, mean, std){
  return std === 0 ? 0 : (value - mean) / std;
}

// ═══════════════════════════════════════════════════════════════
//  ALERT ENGINE
// ═══════════════════════════════════════════════════════════════

function alRunEngine(){
  const tree = alBuildTree();
  alDebugLog = [];
  if(!Object.keys(tree).length){
    alDebugLog.push('Tree vacío — ASST_FUTPOS sin datos parseables');
    return [];
  }
  alDebugLog.push('Cultivos en tree: ' + Object.keys(tree).join(', '));

  const alerts = [];

  // ── Intra-cultivo spreads ──
  for(const pair of AL_INTRA_PAIRS){
    const latestA = alGetLatest(tree, pair.cultivo, pair.posA);
    const latestB = alGetLatest(tree, pair.cultivo, pair.posB);
    if(!latestA || !latestB){
      alDebugLog.push(`${pair.label}: sin datos (A=${!!latestA}, B=${!!latestB})`);
      continue;
    }

    // Check dates are reasonably close
    if(latestA.fecha !== latestB.fecha){
      // Allow up to 5 days difference
      const dA = new Date(latestA.fecha), dB = new Date(latestB.fecha);
      if(Math.abs(dA - dB) / 86400000 > 5){
        alDebugLog.push(`${pair.label}: fechas lejanas (${latestA.fecha} vs ${latestB.fecha})`);
        continue;
      }
    }

    const currentSpread = latestA.precio - latestB.precio;
    const currentDTE = latestA.dte;
    const currentYear = latestA.anio;

    // Build distribution: use DTE filter if available, otherwise use all data
    const hasDTE = currentDTE != null && !isNaN(currentDTE);
    let hist = alBuildIntraSeries(tree, pair.cultivo, pair.posA, pair.posB, hasDTE ? currentDTE : null)
      .filter(r => r.anio !== currentYear);

    // If DTE filter gave too few results, fallback to all data
    if(hist.length < AL_MIN_HIST_OBS && hasDTE){
      hist = alBuildIntraSeries(tree, pair.cultivo, pair.posA, pair.posB, null)
        .filter(r => r.anio !== currentYear);
    }

    if(hist.length < AL_MIN_HIST_OBS){
      alDebugLog.push(`${pair.label}: solo ${hist.length} obs históricas (min ${AL_MIN_HIST_OBS})`);
      continue;
    }

    const values = hist.map(r => r.value);
    const stats = alStats(values);
    const sorted = [...values].sort((a,b) => a - b);
    const pct = alPercentile(sorted, currentSpread);
    const z = alZScore(currentSpread, stats.mean, stats.std);
    let severity = 'normal';
    if(pct <= AL_PCT_ALERT_LO || pct >= AL_PCT_ALERT_HI || Math.abs(z) >= AL_ZSCORE_ALERT) severity = 'alert';
    else if(pct <= AL_PCT_WARN_LO || pct >= AL_PCT_WARN_HI || Math.abs(z) >= AL_ZSCORE_WARN) severity = 'warn';

    // Full series for charts (no DTE filter)
    const fullHist = alBuildIntraSeries(tree, pair.cultivo, pair.posA, pair.posB, null);

    alerts.push({
      type:'intra', label:pair.label, metricLabel:'Spread (USD/tn)',
      cultA:pair.cultivo, posA:pair.posA, cultB:pair.cultivo, posB:pair.posB,
      currentValue:currentSpread, currentDTE:hasDTE ? currentDTE : null, currentYear,
      priceA:latestA.precio, priceB:latestB.precio,
      stats, pct, z, severity,
      hist: fullHist.filter(r => r.anio !== currentYear),
      current: fullHist.filter(r => r.anio === currentYear),
      histAtDTE: hist,
    });
    alDebugLog.push(`${pair.label}: OK — ${hist.length} obs, P${pct.toFixed(0)}, z${z.toFixed(2)} → ${severity}`);
  }

  // ── Inter-cultivo ratios ──
  for(const pair of AL_INTER_PAIRS){
    const latestA = alGetLatest(tree, pair.culA, pair.posA);
    const latestB = alGetLatest(tree, pair.culB, pair.posB);
    if(!latestA || !latestB || latestB.precio === 0){
      alDebugLog.push(`${pair.label}: sin datos (A=${!!latestA}, B=${!!latestB})`);
      continue;
    }

    if(latestA.fecha !== latestB.fecha){
      const dA = new Date(latestA.fecha), dB = new Date(latestB.fecha);
      if(Math.abs(dA - dB) / 86400000 > 5){
        alDebugLog.push(`${pair.label}: fechas lejanas (${latestA.fecha} vs ${latestB.fecha})`);
        continue;
      }
    }

    const currentRatio = latestA.precio / latestB.precio;
    const currentDTE = latestA.dte;
    const currentYear = latestA.anio;
    const hasDTE = currentDTE != null && !isNaN(currentDTE);

    let hist = alBuildInterSeries(tree, pair.culA, pair.posA, pair.culB, pair.posB, hasDTE ? currentDTE : null)
      .filter(r => r.anio !== currentYear);

    if(hist.length < AL_MIN_HIST_OBS && hasDTE){
      hist = alBuildInterSeries(tree, pair.culA, pair.posA, pair.culB, pair.posB, null)
        .filter(r => r.anio !== currentYear);
    }

    if(hist.length < AL_MIN_HIST_OBS){
      alDebugLog.push(`${pair.label}: solo ${hist.length} obs históricas (min ${AL_MIN_HIST_OBS})`);
      continue;
    }

    const values = hist.map(r => r.value);
    const stats = alStats(values);
    const sorted = [...values].sort((a,b) => a - b);
    const pct = alPercentile(sorted, currentRatio);
    const z = alZScore(currentRatio, stats.mean, stats.std);
    let severity = 'normal';
    if(pct <= AL_PCT_ALERT_LO || pct >= AL_PCT_ALERT_HI || Math.abs(z) >= AL_ZSCORE_ALERT) severity = 'alert';
    else if(pct <= AL_PCT_WARN_LO || pct >= AL_PCT_WARN_HI || Math.abs(z) >= AL_ZSCORE_WARN) severity = 'warn';

    const fullHist = alBuildInterSeries(tree, pair.culA, pair.posA, pair.culB, pair.posB, null);

    alerts.push({
      type:'inter', label:pair.label, metricLabel:'Ratio',
      cultA:pair.culA, posA:pair.posA, cultB:pair.culB, posB:pair.posB,
      currentValue:currentRatio, currentDTE:hasDTE ? currentDTE : null, currentYear,
      priceA:latestA.precio, priceB:latestB.precio,
      stats, pct, z, severity,
      hist: fullHist.filter(r => r.anio !== currentYear),
      current: fullHist.filter(r => r.anio === currentYear),
      histAtDTE: hist,
    });
    alDebugLog.push(`${pair.label}: OK — ${hist.length} obs, P${pct.toFixed(0)}, z${z.toFixed(2)} → ${severity}`);
  }

  const sevOrder = {alert:0, warn:1, normal:2};
  alerts.sort((a,b) => sevOrder[a.severity] - sevOrder[b.severity] || Math.abs(b.z) - Math.abs(a.z));
  return alerts;
}

// ═══════════════════════════════════════════════════════════════
//  UI RENDERING
// ═══════════════════════════════════════════════════════════════

function alRenderDashboard(){
  const container = document.getElementById('alertas-space');
  if(!container) return;
  const alerts = alRunEngine();
  alCurrentAlerts = alerts;
  alActiveFilter = 'all';

  const alertCount = alerts.filter(a => a.severity==='alert').length;
  const warnCount = alerts.filter(a => a.severity==='warn').length;
  const normalCount = alerts.filter(a => a.severity==='normal').length;

  // Debug info for console
  console.log('[Inteligencia] Debug log:', alDebugLog);
  console.log('[Inteligencia] Alerts found:', alerts.length);

  container.innerHTML = `
    <div style="padding:4px 0;">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:28px;">🧠</span>
          <div>
            <div style="font-size:18px;font-weight:700;color:var(--text);">Inteligencia de Mercado</div>
            <div style="font-size:12px;color:var(--text-2);">Anomalías en spreads y relaciones vs historia al mismo DTE (±${AL_DTE_WINDOW}d)</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span id="al-sync-note" style="font-size:11px;color:var(--text-3);font-family:var(--mono);"></span>
          <div style="display:flex;gap:6px;">
            ${alertCount > 0 ? `<span style="background:#c43030;color:#fff;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">${alertCount} alerta${alertCount>1?'s':''}</span>` : ''}
            ${warnCount > 0 ? `<span style="background:#e67e22;color:#fff;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">${warnCount} atención</span>` : ''}
            <span style="background:#27ae60;color:#fff;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">${normalCount} normal${normalCount!==1?'es':''}</span>
          </div>
        </div>
      </div>

      <!-- Filter tabs -->
      <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;">
        <button onclick="alFilter('all')" class="al-tab" data-f="all"
          style="padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:var(--es-green);color:#fff;font-size:12px;font-weight:600;cursor:pointer;">
          Todos (${alerts.length})
        </button>
        ${alertCount > 0 ? `<button onclick="alFilter('alert')" class="al-tab" data-f="alert"
          style="padding:6px 14px;border-radius:6px;border:1px solid #c43030;background:transparent;color:#c43030;font-size:12px;font-weight:600;cursor:pointer;">
          🔴 Alertas (${alertCount})
        </button>` : ''}
        ${warnCount > 0 ? `<button onclick="alFilter('warn')" class="al-tab" data-f="warn"
          style="padding:6px 14px;border-radius:6px;border:1px solid #e67e22;background:transparent;color:#e67e22;font-size:12px;font-weight:600;cursor:pointer;">
          🟡 Atención (${warnCount})
        </button>` : ''}
        <button onclick="alFilter('intra')" class="al-tab" data-f="intra"
          style="padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text-2);font-size:12px;font-weight:600;cursor:pointer;">
          Intra-cultivo
        </button>
        <button onclick="alFilter('inter')" class="al-tab" data-f="inter"
          style="padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text-2);font-size:12px;font-weight:600;cursor:pointer;">
          Inter-cultivo
        </button>
      </div>

      <!-- Alert Cards Grid -->
      <div id="al-cards-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;margin-bottom:24px;">
        ${alerts.length === 0
          ? `<div style="grid-column:1/-1;padding:30px;text-align:left;color:var(--text-3);font-size:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;">
               <div style="font-weight:700;margin-bottom:8px;font-size:14px;color:var(--text);">🔍 Sin resultados</div>
               <div style="margin-bottom:6px;">El motor evaluó ${AL_INTRA_PAIRS.length + AL_INTER_PAIRS.length} pares pero ninguno generó alertas.</div>
               <div style="font-family:var(--mono);font-size:11px;background:var(--bg);padding:10px;border-radius:6px;max-height:200px;overflow-y:auto;white-space:pre-wrap;">${alDebugLog.join('\n')}</div>
             </div>`
          : alerts.map((a,i) => alRenderCard(a,i)).join('')}
      </div>

      <!-- Detail Panel -->
      <div id="al-detail-panel" style="display:none;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:20px;box-shadow:var(--shadow);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div id="al-detail-title" style="font-size:16px;font-weight:700;color:var(--text);"></div>
          <button onclick="alCloseDetail()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text-3);padding:4px 8px;">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:8px;">Estacionalidad por DTE</div>
            <div style="position:relative;height:280px;"><canvas id="al-chart-seasonal"></canvas></div>
          </div>
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:8px;">Distribución histórica</div>
            <div style="position:relative;height:280px;"><canvas id="al-chart-hist"></canvas></div>
          </div>
        </div>
        <div id="al-detail-stats" style="margin-top:16px;"></div>
      </div>
    </div>`;

  // Sync note
  const syncEl = document.getElementById('al-sync-note');
  if(syncEl && ASST_FUTPOS.length){
    syncEl.textContent = ASST_FUTPOS.length.toLocaleString() + ' registros · A3';
  }

  // Render sparklines after DOM paint
  requestAnimationFrame(() => {
    alerts.forEach((a,i) => {
      const canvas = document.getElementById('al-spark-'+i);
      if(canvas) alRenderSparkline(canvas, a);
    });
  });
}

// ═══════════════════════════════════════════════════════════════
//  CARD
// ═══════════════════════════════════════════════════════════════

function alRenderCard(alert, index){
  const sev = {
    alert:  { bg:'#fdf0ef', border:'#c43030', icon:'🔴', text:'#c43030' },
    warn:   { bg:'#fef7ed', border:'#e67e22', icon:'🟡', text:'#e67e22' },
    normal: { bg:'#eef7f0', border:'#27ae60', icon:'🟢', text:'#27ae60' },
  }[alert.severity];

  const isR = alert.type === 'inter';
  const valFmt = isR ? alert.currentValue.toFixed(3) : (alert.currentValue >= 0 ? '+' : '') + alert.currentValue.toFixed(1);
  const meanFmt = isR ? alert.stats.mean.toFixed(3) : (alert.stats.mean >= 0 ? '+' : '') + alert.stats.mean.toFixed(1);
  const unit = isR ? '' : ' USD/tn';
  const dir = alert.currentValue > alert.stats.mean ? '↑' : '↓';
  const diffPct = alert.stats.mean !== 0
    ? (((alert.currentValue - alert.stats.mean) / Math.abs(alert.stats.mean)) * 100).toFixed(1) : '—';

  return `
    <div class="al-card" data-sev="${alert.severity}" data-tp="${alert.type}"
         onclick="alShowDetail(${index})"
         style="background:${sev.bg};border:1px solid ${sev.border}33;border-left:4px solid ${sev.border};
                border-radius:8px;padding:14px 16px;cursor:pointer;transition:all .15s ease;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text);">${sev.icon} ${alert.label}</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:2px;">
            ${isR ? 'Ratio' : 'Spread'} · ${alert.currentDTE != null ? 'DTE '+alert.currentDTE : 'Sin DTE'} · ${alert.stats.n} obs
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:${sev.text};">${valFmt}</div>
          <div style="font-size:10px;color:var(--text-3);">${alert.metricLabel}</div>
        </div>
      </div>
      <canvas id="al-spark-${index}" height="40" style="width:100%;margin-bottom:8px;"></canvas>
      <div style="display:flex;gap:12px;font-size:11px;font-family:var(--mono);color:var(--text-2);">
        <span title="Promedio histórico">μ ${meanFmt}${unit}</span>
        <span title="Desvío" style="color:${sev.text};font-weight:600;">${dir} ${diffPct}%</span>
        <span title="Percentil">P${alert.pct.toFixed(0)}</span>
        <span title="Z-score">z${alert.z >= 0 ? '+' : ''}${alert.z.toFixed(2)}</span>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
//  SPARKLINE
// ═══════════════════════════════════════════════════════════════

function alRenderSparkline(canvas, alert){
  const ctx = canvas.getContext('2d');
  const w = canvas.parentElement.clientWidth - 32;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = 80;
  canvas.style.width = w + 'px';
  canvas.style.height = '40px';
  ctx.scale(dpr, dpr * 40 / 80);

  // Plot current year by DTE if available, else by index
  const currentPts = alert.current.filter(r => r.dte != null && !isNaN(r.dte)).sort((a,b) => b.dte - a.dte);
  const useDTE = currentPts.length >= 2;
  const plotPts = useDTE ? currentPts : alert.current.slice(-60); // fallback: last 60 data points by date

  if(plotPts.length < 2) return;

  const vals = plotPts.map(r => r.value);
  const minV = Math.min(...vals, alert.stats.p10);
  const maxV = Math.max(...vals, alert.stats.p90);
  const range = maxV - minV || 1;
  const pad = 4, plotW = w - pad*2, plotH = 40 - pad*2;

  let toX;
  if(useDTE){
    const dteMin = plotPts[plotPts.length-1].dte;
    const dteMax = plotPts[0].dte;
    const dteRange = dteMax - dteMin || 1;
    toX = (_, idx) => pad + (1 - (plotPts[idx].dte - dteMin) / dteRange) * plotW;
  } else {
    toX = (_, idx) => pad + (idx / (plotPts.length - 1)) * plotW;
  }
  const toY = v => pad + (1 - (v - minV) / range) * plotH;

  // P25-P75 band
  ctx.fillStyle = 'rgba(26,107,60,0.08)';
  ctx.fillRect(pad, toY(alert.stats.p75), plotW, toY(alert.stats.p25) - toY(alert.stats.p75));

  // Mean line
  ctx.strokeStyle = 'rgba(26,107,60,0.3)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3,3]);
  ctx.beginPath();
  ctx.moveTo(pad, toY(alert.stats.mean));
  ctx.lineTo(pad + plotW, toY(alert.stats.mean));
  ctx.stroke();
  ctx.setLineDash([]);

  // Series
  const sevCol = {alert:'#c43030', warn:'#e67e22', normal:'#1a6b3c'};
  ctx.strokeStyle = sevCol[alert.severity];
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  plotPts.forEach((p,i) => {
    const x = toX(p,i), y = toY(p.value);
    i === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  });
  ctx.stroke();

  // Last dot
  ctx.fillStyle = sevCol[alert.severity];
  ctx.beginPath();
  ctx.arc(toX(plotPts[plotPts.length-1], plotPts.length-1), toY(plotPts[plotPts.length-1].value), 3, 0, Math.PI*2);
  ctx.fill();
}

// ═══════════════════════════════════════════════════════════════
//  FILTERS
// ═══════════════════════════════════════════════════════════════

function alFilter(type){
  alActiveFilter = type;
  document.querySelectorAll('.al-tab').forEach(t => {
    const active = t.dataset.f === type;
    t.style.background = active ? 'var(--es-green)' : 'transparent';
    t.style.color = active ? '#fff' : 'var(--text-2)';
    t.style.borderColor = active ? 'var(--es-green)' : 'var(--border)';
  });
  document.querySelectorAll('.al-card').forEach(card => {
    const s = card.dataset.sev, tp = card.dataset.tp;
    let show = true;
    if(type === 'alert') show = s === 'alert';
    else if(type === 'warn') show = s === 'warn';
    else if(type === 'intra') show = tp === 'intra';
    else if(type === 'inter') show = tp === 'inter';
    card.style.display = show ? '' : 'none';
  });
}

// ═══════════════════════════════════════════════════════════════
//  DETAIL PANEL
// ═══════════════════════════════════════════════════════════════

function alShowDetail(index){
  const alert = alCurrentAlerts[index];
  if(!alert) return;
  const panel = document.getElementById('al-detail-panel');
  panel.style.display = 'block';
  panel.scrollIntoView({behavior:'smooth', block:'start'});

  const isR = alert.type === 'inter';
  const fmt = v => isR ? v.toFixed(3) : v.toFixed(1);
  const sevCol = {alert:'#c43030', warn:'#e67e22', normal:'#1a6b3c'};

  document.getElementById('al-detail-title').innerHTML = `
    ${alert.label} — ${isR ? 'Ratio' : 'Spread'}
    <span style="font-size:12px;font-weight:400;color:var(--text-3);margin-left:8px;">
      Actual: <strong style="color:${sevCol[alert.severity]}">${fmt(alert.currentValue)}</strong>
      · Prom: ${fmt(alert.stats.mean)} · P${alert.pct.toFixed(0)} · z${alert.z >= 0 ? '+' : ''}${alert.z.toFixed(2)}
    </span>`;

  alRenderSeasonalChart(alert);
  alRenderHistogramChart(alert);
  alRenderDetailStats(alert);
}

function alCloseDetail(){
  document.getElementById('al-detail-panel').style.display = 'none';
  if(alDetailChart){ alDetailChart.destroy(); alDetailChart = null; }
  if(alHistChart){ alHistChart.destroy(); alHistChart = null; }
}

// ═══════════════════════════════════════════════════════════════
//  SEASONAL CHART
// ═══════════════════════════════════════════════════════════════

function alRenderSeasonalChart(alert){
  if(alDetailChart) alDetailChart.destroy();
  const ctx = document.getElementById('al-chart-seasonal').getContext('2d');
  const isR = alert.type === 'inter';

  // Check if DTE data exists
  const hasDTEData = alert.hist.some(r => r.dte != null && !isNaN(r.dte));

  const yearGroups = {};
  alert.hist.forEach(r => {
    if(hasDTEData && (r.dte == null || isNaN(r.dte))) return;
    if(!yearGroups[r.anio]) yearGroups[r.anio] = [];
    yearGroups[r.anio].push(r);
  });

  const datasets = [];

  // Historical years
  Object.keys(yearGroups).sort().forEach(yr => {
    const pts = hasDTEData
      ? yearGroups[yr].sort((a,b) => b.dte - a.dte).map(p => ({x:p.dte, y:p.value}))
      : yearGroups[yr].map((p,i) => ({x:i, y:p.value}));
    datasets.push({
      label: yr, data: pts,
      borderColor: '#bdc3b788', borderWidth: 1,
      pointRadius: 0, tension: 0.3, order: 2,
    });
  });

  // Current year
  const currentFiltered = hasDTEData
    ? alert.current.filter(r => r.dte != null && !isNaN(r.dte))
    : alert.current;
  const currentPts = hasDTEData
    ? currentFiltered.sort((a,b) => b.dte - a.dte).map(p => ({x:p.dte, y:p.value}))
    : currentFiltered.map((p,i) => ({x:i, y:p.value}));

  if(currentPts.length){
    const sevCol = {alert:'#c43030', warn:'#e67e22', normal:'#1a6b3c'};
    datasets.push({
      label: alert.currentYear + ' (actual)', data: currentPts,
      borderColor: sevCol[alert.severity], borderWidth: 2.5,
      pointRadius: 0, pointHoverRadius: 4, tension: 0.3, order: 0,
    });
  }

  // Mean line
  datasets.push({
    label: 'Promedio ('+alert.stats.n+' obs)',
    data: hasDTEData
      ? [{x:400,y:alert.stats.mean},{x:0,y:alert.stats.mean}]
      : [{x:0,y:alert.stats.mean},{x:300,y:alert.stats.mean}],
    borderColor: '#1a6b3c55', borderWidth: 1.5, borderDash: [6,4], pointRadius: 0, order: 1,
  });

  alDetailChart = new Chart(ctx, {
    type: 'line', data: {datasets},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: {mode:'nearest', intersect:false},
      plugins: {
        legend: {display:false},
        tooltip: {
          callbacks: {
            title: items => hasDTEData ? 'DTE ' + items[0].raw.x : 'Punto ' + items[0].raw.x,
            label: item => item.dataset.label + ': ' + (isR ? item.raw.y.toFixed(3) : item.raw.y.toFixed(1)),
          },
        },
      },
      scales: {
        x: {
          type:'linear', reverse:hasDTEData,
          title: {display:true, text:hasDTEData ? 'Días al vencimiento' : 'Observación', font:{size:11}},
          ticks: {font:{size:9}, color:'var(--text-3)'},
          grid: {color:'#dde0d522'},
        },
        y: {
          title: {display:true, text:alert.metricLabel, font:{size:11}},
          ticks: {
            font:{size:10}, color:'var(--text-3)',
            callback: v => isR ? v.toFixed(2) : v.toFixed(0),
          },
          grid: {color:'#dde0d544'},
        },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════
//  HISTOGRAM
// ═══════════════════════════════════════════════════════════════

function alRenderHistogramChart(alert){
  if(alHistChart) alHistChart.destroy();
  const ctx = document.getElementById('al-chart-hist').getContext('2d');
  const isR = alert.type === 'inter';
  const values = alert.histAtDTE.map(r => r.value);

  if(values.length < 3){
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#7e8574';
    ctx.fillText('Datos insuficientes', 10, 130);
    return;
  }

  const min = Math.min(...values), max = Math.max(...values);
  const nBins = Math.min(20, Math.max(8, Math.ceil(Math.sqrt(values.length))));
  const binWidth = (max - min) / nBins || 1;
  const bins = Array(nBins).fill(0);
  const binLabels = [];

  for(let i = 0; i < nBins; i++){
    binLabels.push(isR ? (min + i*binWidth).toFixed(3) : (min + i*binWidth).toFixed(1));
  }
  values.forEach(v => {
    let idx = Math.floor((v - min) / binWidth);
    if(idx >= nBins) idx = nBins - 1;
    if(idx < 0) idx = 0;
    bins[idx]++;
  });

  const currentBin = Math.min(Math.max(Math.floor((alert.currentValue - min) / binWidth), 0), nBins - 1);
  const bgColors = bins.map((_,i) => i === currentBin ? '#c43030ee' : '#1a6b3c44');

  alHistChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: binLabels, datasets: [{data:bins, backgroundColor:bgColors, borderRadius:3}] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {display:false},
        tooltip: {
          callbacks: {
            title: items => { const i = items[0].dataIndex; const lo = min+i*binWidth; return lo.toFixed(isR?3:1)+' – '+(lo+binWidth).toFixed(isR?3:1); },
            label: item => item.raw + ' obs',
          },
        },
      },
      scales: {
        x: {ticks:{font:{size:8},color:'var(--text-3)',maxRotation:45}, grid:{display:false}},
        y: {ticks:{font:{size:10},color:'var(--text-3)',stepSize:1}, grid:{color:'#dde0d533'}},
      },
    },
    plugins: [{
      id: 'alCurrentLine',
      afterDraw(chart){
        const {ctx:c, chartArea:ca, scales:sc} = chart;
        const xPos = sc.x.left + ((alert.currentValue - min) / (max - min)) * (sc.x.right - sc.x.left);
        if(xPos >= ca.left && xPos <= ca.right){
          c.save(); c.strokeStyle='#c43030'; c.lineWidth=2; c.setLineDash([5,3]);
          c.beginPath(); c.moveTo(xPos,ca.top); c.lineTo(xPos,ca.bottom); c.stroke();
          c.fillStyle='#c43030'; c.font='bold 10px sans-serif'; c.textAlign='center';
          c.fillText('HOY',xPos,ca.top-4); c.restore();
        }
      },
    }],
  });
}

// ═══════════════════════════════════════════════════════════════
//  DETAIL STATS
// ═══════════════════════════════════════════════════════════════

function alRenderDetailStats(alert){
  const s = alert.stats;
  const isR = alert.type === 'inter';
  const fmt = v => isR ? v.toFixed(3) : v.toFixed(1);
  const sevCol = {alert:'#c43030', warn:'#e67e22', normal:'#1a6b3c'};
  const sevBg = {alert:'#fdf0ef', warn:'#fef7ed', normal:'#eef7f0'};

  document.getElementById('al-detail-stats').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;font-family:var(--mono);font-size:11px;">
      <div style="background:var(--bg);padding:10px;border-radius:6px;">
        <div style="color:var(--text-3);margin-bottom:4px;">Actual</div>
        <div style="font-size:16px;font-weight:700;color:var(--text);">${fmt(alert.currentValue)}</div>
        <div style="color:var(--text-3);font-size:10px;">${alert.posA} ${isR?'/':'−'} ${alert.posB}</div>
      </div>
      <div style="background:var(--bg);padding:10px;border-radius:6px;">
        <div style="color:var(--text-3);margin-bottom:4px;">Promedio</div>
        <div style="font-size:16px;font-weight:700;">${fmt(s.mean)}</div>
        <div style="color:var(--text-3);font-size:10px;">σ ${fmt(s.std)}</div>
      </div>
      <div style="background:var(--bg);padding:10px;border-radius:6px;">
        <div style="color:var(--text-3);margin-bottom:4px;">Rango P10–P90</div>
        <div style="font-size:14px;font-weight:600;">${fmt(s.p10)} — ${fmt(s.p90)}</div>
        <div style="color:var(--text-3);font-size:10px;">Min ${fmt(s.min)} / Max ${fmt(s.max)}</div>
      </div>
      <div style="background:var(--bg);padding:10px;border-radius:6px;">
        <div style="color:var(--text-3);margin-bottom:4px;">Percentil</div>
        <div style="font-size:16px;font-weight:700;color:${sevCol[alert.severity]};">P${alert.pct.toFixed(0)}</div>
        <div style="color:var(--text-3);font-size:10px;">z: ${alert.z >= 0?'+':''}${alert.z.toFixed(2)}</div>
      </div>
      <div style="background:var(--bg);padding:10px;border-radius:6px;">
        <div style="color:var(--text-3);margin-bottom:4px;">DTE</div>
        <div style="font-size:16px;font-weight:700;">${alert.currentDTE != null ? alert.currentDTE : '—'}</div>
        <div style="color:var(--text-3);font-size:10px;">${alert.currentDTE != null ? 'ventana ±'+AL_DTE_WINDOW+'d' : 'sin filtro DTE'}</div>
      </div>
      <div style="background:var(--bg);padding:10px;border-radius:6px;">
        <div style="color:var(--text-3);margin-bottom:4px;">Observaciones</div>
        <div style="font-size:16px;font-weight:700;">${s.n}</div>
        <div style="color:var(--text-3);font-size:10px;">históricas</div>
      </div>
    </div>
    <div style="margin-top:12px;padding:12px;background:${sevBg[alert.severity]};border-radius:8px;font-size:12px;color:var(--text);line-height:1.6;">
      <strong>${alert.severity==='alert'?'⚠️ Alerta':alert.severity==='warn'?'👁 Atención':'✅ Normal'}:</strong>
      ${alInsight(alert)}
    </div>
    <div style="margin-top:10px;display:flex;gap:16px;font-size:11px;color:var(--text-3);">
      <span>${alert.cultA}/${alert.posA}: <strong style="color:var(--text);">${alert.priceA.toFixed(1)}</strong> USD/tn</span>
      <span>${(alert.cultB||alert.cultA)}/${alert.posB}: <strong style="color:var(--text);">${alert.priceB.toFixed(1)}</strong> USD/tn</span>
    </div>`;
}

function alInsight(a){
  const isR = a.type==='inter';
  const fmt = v => isR ? v.toFixed(3) : v.toFixed(1);
  const unit = isR ? '' : ' USD/tn';
  const diff = a.currentValue - a.stats.mean;
  const dir = diff > 0 ? 'por encima' : 'por debajo';

  if(a.severity==='alert')
    return `El ${isR?'ratio':'spread'} <strong>${a.label}</strong> está en <strong>${fmt(a.currentValue)}${unit}</strong>, ${dir} del promedio histórico (${fmt(a.stats.mean)}${unit}). Desvío de <strong>${fmt(Math.abs(diff))}${unit}</strong> (z=${a.z.toFixed(2)}). Percentil <strong>${a.pct.toFixed(0)}</strong> — fuera del rango P5–P95. Posible oportunidad de arbitraje o señal de dislocación.`;
  if(a.severity==='warn')
    return `El ${isR?'ratio':'spread'} <strong>${a.label}</strong> en ${fmt(a.currentValue)}${unit}, ${dir} del promedio (${fmt(a.stats.mean)}${unit}). Percentil ${a.pct.toFixed(0)} — zona de atención. Monitorear evolución.`;
  return `El ${isR?'ratio':'spread'} <strong>${a.label}</strong> en ${fmt(a.currentValue)}${unit}, alineado con el promedio histórico (${fmt(a.stats.mean)}${unit}). Sin anomalía detectada.`;
}

// ═══════════════════════════════════════════════════════════════
//  AUTO-PATCH: Hide alertas when other modules activate
// ═══════════════════════════════════════════════════════════════

(function(){
  const hide = () => { const el = document.getElementById('alertas-space'); if(el) el.style.display = 'none'; };
  const patch = fn => {
    const orig = window[fn];
    if(typeof orig === 'function'){
      window[fn] = function(){ hide(); return orig.apply(this, arguments); };
    }
  };
  window.addEventListener('load', () => {
    ['switchToWorkspace','toggleRetenciones','togglePases','toggleSpreads','toggleTheory','toggleDesvio','toggleFutOpc'].forEach(patch);
  });
})();
