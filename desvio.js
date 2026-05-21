/* ═══════════════════════════════════════════════════════
   DESVÍO DE PRECIOS — Módulo Suite Comercial Espartina
   Volatilidad histórica por posición & comparativa entre campañas
   ═══════════════════════════════════════════════════════ */

// ── Sample data generator (replace with real MATBA data) ──
function dvGenDaily(base, vol, startDate, days) {
  const pts = []; let p = base + (Math.random() - 0.5) * vol * 1.5;
  const sd = new Date(startDate);
  for (let i = 0; i < days; i++) {
    const d = new Date(sd); d.setDate(d.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    p += (Math.random() - 0.48) * vol * 0.32;
    p = Math.max(base * 0.82, Math.min(base * 1.22, p));
    pts.push({ fecha: d.toISOString().slice(0, 10), precio: Math.round(p * 10) / 10 });
  }
  return pts;
}

const DV_DATA = {
  Soja: {
    Mayo: {
      '25/26': dvGenDaily(306, 18, '2025-06-02', 230),
      '24/25': dvGenDaily(290, 20, '2024-06-03', 230),
      '23/24': dvGenDaily(340, 25, '2023-06-01', 230),
      '22/23': dvGenDaily(380, 30, '2022-06-01', 230),
      '21/22': dvGenDaily(350, 28, '2021-06-01', 230),
      '20/21': dvGenDaily(310, 22, '2020-06-01', 230),
    },
    Julio: {
      '25/26': dvGenDaily(312, 20, '2025-06-02', 275),
      '24/25': dvGenDaily(298, 18, '2024-06-03', 275),
      '23/24': dvGenDaily(348, 26, '2023-06-01', 275),
      '22/23': dvGenDaily(390, 32, '2022-06-01', 275),
      '21/22': dvGenDaily(360, 28, '2021-06-01', 275),
      '20/21': dvGenDaily(318, 20, '2020-06-01', 275),
    },
    Noviembre: {
      '25/26': dvGenDaily(290, 22, '2025-08-01', 310),
      '24/25': dvGenDaily(278, 18, '2024-08-01', 310),
      '23/24': dvGenDaily(330, 24, '2023-08-01', 310),
      '22/23': dvGenDaily(365, 30, '2022-08-01', 310),
      '21/22': dvGenDaily(340, 26, '2021-08-01', 310),
      '20/21': dvGenDaily(295, 20, '2020-08-01', 310),
    },
  },
  Maíz: {
    Abril: {
      '25/26': dvGenDaily(188, 10, '2025-06-02', 210),
      '24/25': dvGenDaily(175, 12, '2024-06-03', 210),
      '23/24': dvGenDaily(210, 16, '2023-06-01', 210),
      '22/23': dvGenDaily(240, 20, '2022-06-01', 210),
      '21/22': dvGenDaily(220, 18, '2021-06-01', 210),
      '20/21': dvGenDaily(165, 10, '2020-06-01', 210),
    },
    Julio: {
      '25/26': dvGenDaily(195, 12, '2025-06-02', 275),
      '24/25': dvGenDaily(182, 10, '2024-06-03', 275),
      '23/24': dvGenDaily(218, 15, '2023-06-01', 275),
      '22/23': dvGenDaily(248, 22, '2022-06-01', 275),
      '21/22': dvGenDaily(228, 18, '2021-06-01', 275),
      '20/21': dvGenDaily(170, 10, '2020-06-01', 275),
    },
  },
  Trigo: {
    Diciembre: {
      '25/26': dvGenDaily(232, 14, '2025-08-01', 260),
      '24/25': dvGenDaily(218, 12, '2024-08-01', 260),
      '23/24': dvGenDaily(280, 20, '2023-08-01', 260),
      '22/23': dvGenDaily(310, 28, '2022-08-01', 260),
      '21/22': dvGenDaily(260, 18, '2021-08-01', 260),
      '20/21': dvGenDaily(210, 12, '2020-08-01', 260),
    },
    Julio: {
      '25/26': dvGenDaily(240, 15, '2025-06-02', 275),
      '24/25': dvGenDaily(225, 14, '2024-06-03', 275),
      '23/24': dvGenDaily(288, 22, '2023-06-01', 275),
      '22/23': dvGenDaily(320, 30, '2022-06-01', 275),
      '21/22': dvGenDaily(268, 20, '2021-06-01', 275),
      '20/21': dvGenDaily(218, 12, '2020-06-01', 275),
    },
  },
};

const DV_CAMP_COLORS = [
  '#1a6b3c', '#c8a44a', '#5b9bd5', '#d4844a', '#8b7db5', '#c06080',
  '#4a9aaa', '#9a6aaa', '#6aaa7a', '#c0504a'
];

// ── State ──
let dvCrop = '', dvPos = '', dvActiveCamps = {}, dvSingleMode = null;
let dvOverlayChart = null, dvSingleChart = null;

// ── Metrics ──
function dvCalcMetrics(prices) {
  if (!prices || !prices.length) return null;
  const vals = prices.map(p => p.precio);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const max = Math.max(...vals); const min = Math.min(...vals);
  const stdDev = Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length);
  return {
    avg, max, min,
    desvMax: max - avg, desvMin: avg - min,
    desvMaxPct: ((max - avg) / avg) * 100,
    desvMinPct: ((avg - min) / avg) * 100,
    rango: max - min, rangoPct: ((max - min) / avg) * 100,
    cv: (stdDev / avg) * 100, stdDev, count: prices.length,
  };
}

function dvFmt(n, d) { return n.toFixed(d === undefined ? 1 : d); }
function dvUSD(n) { return '$' + n.toFixed(1); }

// ── Toggle module ──
function toggleDesvio() {
  const pills = document.querySelectorAll('.mod-pill');
  pills.forEach(p => p.classList.remove('active'));
  // Find the desvio pill
  pills.forEach(p => { if (p.textContent.includes('Desvío')) p.classList.add('active'); });
  document.getElementById('workspace').style.display = 'none';
  document.querySelector('.ret-section').style.display = 'none';
  document.querySelector('.pase-section').style.display = 'none';
  document.getElementById('spreads-space').style.display = 'none';
  document.getElementById('theory-space').style.display = 'none';
  document.getElementById('desvio-space').style.display = 'block';
  // Hide tabs bar & market bars
  document.getElementById('tabs-container').style.display = 'none';
  document.getElementById('fob-bar').style.display = 'none';
  document.getElementById('mkt-bar').style.display = 'none';
  dvRenderOverview();
}

// ── Render overview cards ──
function dvRenderOverview() {
  const container = document.getElementById('dv-overview-cards');
  if (!container) return;
  container.innerHTML = '';

  for (const crop of Object.keys(DV_DATA)) {
    for (const pos of Object.keys(DV_DATA[crop])) {
      const camps = DV_DATA[crop][pos];
      const latestKey = Object.keys(camps)[0];
      const m = dvCalcMetrics(camps[latestKey]);
      if (!m) continue;

      const avgPct = ((m.avg - m.min) / m.rango) * 100;
      const numCamps = Object.keys(camps).length;

      const card = document.createElement('div');
      card.className = 'dv-overview-card';
      card.onclick = () => { dvCrop = crop; dvPos = pos; dvEnterDetail(); };
      card.innerHTML = `
        <div class="dv-ov-header">
          <div>
            <span class="dv-ov-crop">${crop}</span>
            <span class="dv-ov-pos">${pos}</span>
          </div>
          <span class="dv-ov-camps">${numCamps} campañas</span>
        </div>
        <div class="dv-range-row">
          <span class="dv-range-min">${dvUSD(m.min)}</span>
          <div class="dv-range-bar">
            <div class="dv-range-fill"></div>
            <div class="dv-range-dot" style="left:${avgPct}%"></div>
          </div>
          <span class="dv-range-max">${dvUSD(m.max)}</span>
        </div>
        <div class="dv-ov-metrics">
          <div class="dv-ov-metric">
            <div class="dv-ov-metric-lbl">Promedio</div>
            <div class="dv-ov-metric-val">${dvUSD(m.avg)}</div>
          </div>
          <div class="dv-ov-metric">
            <div class="dv-ov-metric-lbl">Desv+</div>
            <div class="dv-ov-metric-val" style="color:var(--es-green);">+${dvFmt(m.desvMaxPct)}%</div>
          </div>
          <div class="dv-ov-metric">
            <div class="dv-ov-metric-lbl">Desv−</div>
            <div class="dv-ov-metric-val" style="color:var(--red);">−${dvFmt(m.desvMinPct)}%</div>
          </div>
          <div class="dv-ov-metric">
            <div class="dv-ov-metric-lbl">CV</div>
            <div class="dv-ov-metric-val" style="color:var(--es-gold);">${dvFmt(m.cv)}%</div>
          </div>
        </div>
        <div class="dv-ov-footer">Última campaña (${latestKey})</div>
      `;
      container.appendChild(card);
    }
  }
}

// ── Enter detail mode ──
function dvEnterDetail() {
  document.getElementById('dv-overview').style.display = 'none';
  document.getElementById('dv-detail').style.display = 'block';

  // Populate crop & pos selectors
  const cropSel = document.getElementById('dv-crop-sel');
  const posSel = document.getElementById('dv-pos-sel');
  cropSel.innerHTML = Object.keys(DV_DATA).map(c =>
    `<option value="${c}" ${c === dvCrop ? 'selected' : ''}>${c}</option>`
  ).join('');
  dvUpdatePosSel();

  // Init campaigns
  const camps = Object.keys(DV_DATA[dvCrop][dvPos]);
  dvActiveCamps = {};
  camps.forEach(k => dvActiveCamps[k] = true);
  dvSingleMode = null;

  dvRenderCampChips();
  dvRenderModeButtons();
  dvRenderTable();
  dvRenderChart();
}

function dvUpdatePosSel() {
  const posSel = document.getElementById('dv-pos-sel');
  const positions = Object.keys(DV_DATA[dvCrop] || {});
  posSel.innerHTML = positions.map(p =>
    `<option value="${p}" ${p === dvPos ? 'selected' : ''}>${p}</option>`
  ).join('');
  if (!positions.includes(dvPos) && positions.length) dvPos = positions[0];
}

function dvOnCropChange(val) {
  dvCrop = val;
  dvUpdatePosSel();
  dvPos = document.getElementById('dv-pos-sel').value;
  dvResetAndRender();
}

function dvOnPosChange(val) {
  dvPos = val;
  dvResetAndRender();
}

function dvResetAndRender() {
  const camps = Object.keys(DV_DATA[dvCrop]?.[dvPos] || {});
  dvActiveCamps = {};
  camps.forEach(k => dvActiveCamps[k] = true);
  dvSingleMode = null;
  dvRenderCampChips();
  dvRenderModeButtons();
  dvRenderTable();
  dvRenderChart();
}

function dvBackToOverview() {
  document.getElementById('dv-overview').style.display = 'block';
  document.getElementById('dv-detail').style.display = 'none';
  if (dvOverlayChart) { dvOverlayChart.destroy(); dvOverlayChart = null; }
  if (dvSingleChart) { dvSingleChart.destroy(); dvSingleChart = null; }
}

// ── Campaign chips ──
function dvRenderCampChips() {
  const container = document.getElementById('dv-camp-chips');
  const camps = Object.keys(DV_DATA[dvCrop]?.[dvPos] || {});
  container.innerHTML = camps.map((k, i) => {
    const color = DV_CAMP_COLORS[i % DV_CAMP_COLORS.length];
    const active = dvActiveCamps[k];
    return `<button class="dv-chip ${active ? 'active' : ''}" style="${active ? 'border-color:' + color + ';color:' + color + ';background:' + color + '12;' : ''}" onclick="dvToggleCamp('${k}', ${i})">
      <span class="dv-chip-dot" style="background:${active ? color : 'var(--text-3)'}"></span>${k}
    </button>`;
  }).join('');
}

function dvToggleCamp(k) {
  dvSingleMode = null;
  dvActiveCamps[k] = !dvActiveCamps[k];
  dvRenderCampChips();
  dvRenderModeButtons();
  dvRenderChart();
}

// ── Mode buttons ──
function dvRenderModeButtons() {
  document.getElementById('dv-btn-compare').className = 'dv-mode-btn' + (!dvSingleMode ? ' active' : '');
  document.getElementById('dv-btn-single').className = 'dv-mode-btn' + (dvSingleMode ? ' active' : '');

  const singleSel = document.getElementById('dv-single-selector');
  if (dvSingleMode) {
    const camps = Object.keys(DV_DATA[dvCrop]?.[dvPos] || {});
    singleSel.style.display = 'flex';
    singleSel.innerHTML = camps.map((k, i) => {
      const color = DV_CAMP_COLORS[i % DV_CAMP_COLORS.length];
      return `<button class="dv-chip ${dvSingleMode === k ? 'active' : ''}" style="${dvSingleMode === k ? 'border-color:' + color + ';color:' + color + ';background:' + color + '12;' : ''}" onclick="dvSelectSingle('${k}')">${k}</button>`;
    }).join('');
  } else {
    singleSel.style.display = 'none';
  }

  // KPI cards
  const kpiContainer = document.getElementById('dv-kpi-cards');
  if (dvSingleMode) {
    const m = dvCalcMetrics(DV_DATA[dvCrop]?.[dvPos]?.[dvSingleMode]);
    if (m) {
      kpiContainer.style.display = 'grid';
      kpiContainer.innerHTML = [
        { l: 'Promedio', v: dvUSD(m.avg), c: 'var(--text)' },
        { l: 'Máximo', v: dvUSD(m.max), s: '+' + dvFmt(m.desvMaxPct) + '%', c: 'var(--es-green)' },
        { l: 'Mínimo', v: dvUSD(m.min), s: '−' + dvFmt(m.desvMinPct) + '%', c: 'var(--red)' },
        { l: 'Rango', v: dvUSD(m.rango), s: dvFmt(m.rangoPct) + '%', c: 'var(--es-gold)' },
        { l: 'CV', v: dvFmt(m.cv) + '%', s: 'σ ' + dvUSD(m.stdDev), c: 'var(--es-gold)' },
      ].map(kpi => `
        <div class="dv-kpi">
          <div class="dv-kpi-lbl">${kpi.l}</div>
          <div class="dv-kpi-val" style="color:${kpi.c}">${kpi.v}</div>
          ${kpi.s ? '<div class="dv-kpi-sub">' + kpi.s + '</div>' : ''}
        </div>
      `).join('');
    }
  } else {
    kpiContainer.style.display = 'none';
  }
}

function dvSetCompare() {
  dvSingleMode = null;
  dvRenderModeButtons();
  dvRenderChart();
}

function dvSetSingle() {
  const camps = Object.keys(DV_DATA[dvCrop]?.[dvPos] || {});
  const visible = camps.filter(k => dvActiveCamps[k]);
  dvSingleMode = visible[0] || camps[0];
  dvRenderModeButtons();
  dvRenderChart();
}

function dvSelectSingle(k) {
  dvSingleMode = k;
  dvRenderModeButtons();
  dvRenderChart();
}

// ── Table ──
function dvRenderTable() {
  const tbody = document.getElementById('dv-table-body');
  const camps = Object.keys(DV_DATA[dvCrop]?.[dvPos] || {});
  const metrics = camps.map(k => ({ k, m: dvCalcMetrics(DV_DATA[dvCrop][dvPos][k]) })).filter(x => x.m);
  const maxCV = Math.max(...metrics.map(x => x.m.cv), 1);

  tbody.innerHTML = metrics.map(({ k, m }, i) => {
    const color = DV_CAMP_COLORS[i % DV_CAMP_COLORS.length];
    const barW = (m.cv / maxCV) * 85;
    return `<tr onclick="dvSingleMode='${k}';dvRenderModeButtons();dvRenderChart();" style="cursor:pointer;">
      <td style="border-radius:6px 0 0 6px;">
        <span class="dv-chip-dot" style="background:${color};display:inline-block;vertical-align:middle;margin-right:6px;"></span>
        <span style="color:${color};font-weight:700;">${k}</span>
      </td>
      <td style="font-weight:700;">${dvUSD(m.avg)}</td>
      <td style="color:var(--es-green);">${dvUSD(m.max)}</td>
      <td style="color:var(--red);">${dvUSD(m.min)}</td>
      <td style="color:var(--es-green);">+${dvFmt(m.desvMaxPct)}%</td>
      <td style="color:var(--red);">−${dvFmt(m.desvMinPct)}%</td>
      <td style="border-radius:0 6px 6px 0;position:relative;min-width:70px;">
        <div style="position:absolute;left:2px;top:50%;transform:translateY(-50%);height:4px;width:${barW}%;background:${color}33;border-radius:2px;"></div>
        <span style="position:relative;color:${color};font-weight:700;">${dvFmt(m.cv)}%</span>
      </td>
    </tr>`;
  }).join('');
}

// ── Chart rendering ──
function dvRenderChart() {
  const campaigns = DV_DATA[dvCrop]?.[dvPos];
  if (!campaigns) return;

  if (dvSingleMode) {
    dvRenderSingleChart(campaigns);
  } else {
    dvRenderOverlayChart(campaigns);
  }
}

function dvRenderOverlayChart(campaigns) {
  // Show overlay canvas, hide single
  document.getElementById('dv-chart-overlay-wrap').style.display = 'block';
  document.getElementById('dv-chart-single-wrap').style.display = 'none';
  document.getElementById('dv-chart-legend').textContent = 'Evolución por rueda de negociación · Campañas superpuestas';

  if (dvOverlayChart) { dvOverlayChart.destroy(); dvOverlayChart = null; }
  if (dvSingleChart) { dvSingleChart.destroy(); dvSingleChart = null; }

  const campKeys = Object.keys(campaigns);
  const visible = campKeys.filter(k => dvActiveCamps[k]);
  if (!visible.length) return;

  const maxLen = Math.max(...visible.map(k => campaigns[k].length));
  const labels = Array.from({ length: maxLen }, (_, i) => 'D' + i);

  const datasets = visible.map((k, vi) => {
    const ci = campKeys.indexOf(k);
    const color = DV_CAMP_COLORS[ci % DV_CAMP_COLORS.length];
    const isLatest = ci === 0;
    return {
      label: k,
      data: campaigns[k].map(p => p.precio),
      borderColor: color,
      borderWidth: isLatest ? 2.5 : 1.5,
      pointRadius: 0,
      tension: 0.3,
      borderDash: isLatest ? [] : [4, 2],
    };
  });

  // Add average reference lines
  visible.forEach((k, vi) => {
    const ci = campKeys.indexOf(k);
    const color = DV_CAMP_COLORS[ci % DV_CAMP_COLORS.length];
    const m = dvCalcMetrics(campaigns[k]);
    if (m) {
      datasets.push({
        label: 'Prom ' + k,
        data: Array(campaigns[k].length).fill(m.avg),
        borderColor: color + '55',
        borderWidth: 1,
        borderDash: [6, 6],
        pointRadius: 0,
        tension: 0,
      });
    }
  });

  const ctx = document.getElementById('dv-chart-overlay').getContext('2d');
  dvOverlayChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top',
          labels: {
            filter: item => !item.text.startsWith('Prom'),
            font: { family: 'JetBrains Mono', size: 11 },
            boxWidth: 16, boxHeight: 2, padding: 12,
          }
        },
        tooltip: {
          backgroundColor: '#fff', titleColor: '#1c2118', bodyColor: '#505845',
          borderColor: '#dde0d5', borderWidth: 1,
          titleFont: { family: 'Montserrat', weight: '700', size: 12 },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          padding: 10, cornerRadius: 8,
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label.startsWith('Prom')) return null;
              return ctx.dataset.label + ': $' + ctx.parsed.y.toFixed(1);
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            font: { family: 'JetBrains Mono', size: 10 }, color: '#7e8574',
            maxTicksLimit: 12,
          },
          grid: { color: '#dde0d522' },
        },
        y: {
          ticks: {
            font: { family: 'JetBrains Mono', size: 10 }, color: '#7e8574',
            callback: v => '$' + v,
          },
          grid: { color: '#dde0d544' },
        }
      }
    }
  });
}

function dvRenderSingleChart(campaigns) {
  document.getElementById('dv-chart-overlay-wrap').style.display = 'none';
  document.getElementById('dv-chart-single-wrap').style.display = 'block';

  const campKeys = Object.keys(campaigns);
  const ci = campKeys.indexOf(dvSingleMode);
  const lineColor = DV_CAMP_COLORS[ci % DV_CAMP_COLORS.length];

  document.getElementById('dv-chart-legend').innerHTML =
    `${dvCrop} ${dvPos} — Campaña ${dvSingleMode} · <span style="color:var(--es-green);">▲ Por encima</span> · <span style="color:var(--red);">▼ Por debajo</span>`;

  if (dvOverlayChart) { dvOverlayChart.destroy(); dvOverlayChart = null; }
  if (dvSingleChart) { dvSingleChart.destroy(); dvSingleChart = null; }

  const prices = campaigns[dvSingleMode];
  if (!prices) return;
  const m = dvCalcMetrics(prices);
  if (!m) return;

  const labels = prices.map(p => p.fecha.slice(5)); // MM-DD
  const priceData = prices.map(p => p.precio);
  const avgLine = prices.map(() => m.avg);

  // Build above/below segments for fill
  const aboveData = prices.map(p => p.precio >= m.avg ? p.precio : m.avg);
  const belowData = prices.map(p => p.precio < m.avg ? p.precio : m.avg);

  const ctx = document.getElementById('dv-chart-single').getContext('2d');
  dvSingleChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        // Above fill area
        {
          label: 'Sobre promedio',
          data: aboveData,
          borderColor: 'transparent',
          backgroundColor: 'rgba(26,107,60,0.15)',
          fill: { target: '+1', above: 'rgba(26,107,60,0.15)' },
          pointRadius: 0,
          tension: 0.3,
          order: 3,
        },
        // Average line (fill target)
        {
          label: 'Promedio',
          data: avgLine,
          borderColor: '#c8a44a',
          borderWidth: 1.5,
          borderDash: [8, 4],
          pointRadius: 0,
          fill: false,
          order: 2,
        },
        // Below fill area
        {
          label: 'Bajo promedio',
          data: belowData,
          borderColor: 'transparent',
          backgroundColor: 'rgba(196,48,48,0.12)',
          fill: { target: '-1', below: 'rgba(196,48,48,0.12)' },
          pointRadius: 0,
          tension: 0.3,
          order: 3,
        },
        // Main price line
        {
          label: 'Precio',
          data: priceData,
          borderColor: lineColor,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: false,
          order: 1,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#fff', titleColor: '#1c2118', bodyColor: '#505845',
          borderColor: '#dde0d5', borderWidth: 1,
          titleFont: { family: 'Montserrat', weight: '700', size: 12 },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          padding: 10, cornerRadius: 8,
          callbacks: {
            title: items => {
              const idx = items[0]?.dataIndex;
              return prices[idx]?.fecha || '';
            },
            label: ctx => {
              if (ctx.dataset.label === 'Precio') {
                const diff = ctx.parsed.y - m.avg;
                const pct = (diff / m.avg) * 100;
                return [
                  'Precio: $' + ctx.parsed.y.toFixed(1),
                  'Promedio: $' + m.avg.toFixed(1),
                  'Desvío: ' + (diff >= 0 ? '+' : '') + diff.toFixed(1) + ' (' + (diff >= 0 ? '+' : '') + pct.toFixed(1) + '%)',
                ];
              }
              return null;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            font: { family: 'JetBrains Mono', size: 9 }, color: '#7e8574',
            maxTicksLimit: 12,
          },
          grid: { color: '#dde0d522' },
        },
        y: {
          min: m.min - 5,
          max: m.max + 5,
          ticks: {
            font: { family: 'JetBrains Mono', size: 10 }, color: '#7e8574',
            callback: v => '$' + v,
          },
          grid: { color: '#dde0d544' },
        }
      }
    }
  });
}

// ── Auto-patch: make existing toggle functions also hide desvio ──
// This avoids editing other JS files
(function() {
  const hide = () => { const el = document.getElementById('desvio-space'); if (el) el.style.display = 'none'; };

  const patch = (fnName) => {
    const orig = window[fnName];
    if (typeof orig === 'function') {
      window[fnName] = function() {
        hide();
        return orig.apply(this, arguments);
      };
    }
  };

  window.addEventListener('load', () => {
    ['switchToWorkspace', 'toggleRetenciones', 'togglePases', 'toggleSpreads', 'toggleTheory'].forEach(patch);
  });
})();
