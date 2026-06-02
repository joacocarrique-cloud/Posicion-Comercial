// ═══════════════════════════════════════════════════
// ─── COBERTURAS: Strategy Builder, Payoff, Charts ───
// ═══════════════════════════════════════════════════

function lookupPrima(type, strike) {
  if (!marketData || !marketPosition) return null;
  const list = type === 'put' ? marketData.opciones.puts : marketData.opciones.calls;
  const match = list.find(o => o.posicion === marketPosition && o.strike === strike);
  return match ? match.prima : null;
}

function autoFillPrima(stratId, legIdx) {
  const t = getActiveTab();
  const leg = t.strategies.find(x => x.id === stratId).legs[legIdx];
  if (leg.type === 'futuro') { leg.prima = 0; renderAll(); return; }
  const prima = lookupPrima(leg.type, leg.strike);
  if (prima !== null) {
    leg.prima = prima;
    renderAll();
  } else {
    alert(`No se encontró prima para ${leg.type.toUpperCase()} strike ${leg.strike} en ${marketPosition}`);
  }
}

function autoFillAllPrimas() {
  if (!marketData) { alert('Primero sincroná con A3 (botón "Sincronizar A3") o cargá un archivo JSON'); return; }
  const t = getActiveTab();
  let filled = 0;
  t.strategies.forEach(s => {
    s.legs.forEach(l => {
      if (l.type === 'futuro') return;
      const prima = lookupPrima(l.type, l.strike);
      if (prima !== null) { l.prima = prima; filled++; }
    });
  });
  renderAll();
  document.getElementById('mkt-status').innerHTML = `✅ ${filled} primas actualizadas con datos de ${marketData.metadata.fecha_datos}`;
}

function getActiveTab() { return tabs[activeTabIdx]; }

function getAvailableStrikes(optType) {
  if (!sheetData) return [];
  const crop = document.getElementById('mkt-crop-select').value || getActiveTab().assetVal;
  const pos = marketPosition || document.getElementById('mkt-pos-select').value;
  if (!crop || !pos) return [];
  const cropOpts = sheetData.opciones[crop];
  if (!cropOpts || !cropOpts[pos]) return [];
  const list = optType === 'call' ? cropOpts[pos].calls : cropOpts[pos].puts;
  return list.map(o => ({ strike: o.strike, prima: o.prima }));
}

function renderStrikeField(stratId, legIdx, leg) {
  if (leg.type === 'futuro') {
    return `<input class="w-num" type="number" step="0.1" title="Strike" value="${leg.strike}" oninput="updateLegInput(${stratId}, ${legIdx}, 'strike', this.value)">`;
  }
  const strikes = getAvailableStrikes(leg.type);
  if (strikes.length === 0) {
    return `<input class="w-num" type="number" step="0.1" title="Strike" value="${leg.strike}" oninput="updateLegInput(${stratId}, ${legIdx}, 'strike', this.value)">`;
  }
  const options = strikes.map(s => 
    `<option value="${s.strike}" ${s.strike === leg.strike ? 'selected' : ''}>${s.strike}</option>`
  ).join('');
  const currentInList = strikes.some(s => s.strike === leg.strike);
  const extraOpt = currentInList ? '' : `<option value="${leg.strike}" selected>${leg.strike} ✎</option>`;
  return `<select class="w-num" onchange="onStrikeSelect(${stratId}, ${legIdx}, this.value)" title="Strike">${extraOpt}${options}</select>`;
}

function onStrikeSelect(stratId, legIdx, value) {
  const t = getActiveTab();
  const leg = t.strategies.find(x => x.id === stratId).legs[legIdx];
  leg.strike = parseFloat(value) || 0;
  const prima = lookupPrima(leg.type, leg.strike);
  if (prima !== null) leg.prima = prima;
  renderAll();
}

function togglePresetMenu() {
  const menu = document.getElementById('preset-menu');
  const isOpen = menu.classList.contains('open');
  menu.classList.toggle('open');
  if (!isOpen) {
    renderPresetMenu();
    setTimeout(() => {
      document.addEventListener('click', closePresetOnOutside, { once: true });
    }, 0);
  }
}

function closePresetOnOutside(e) {
  const menu = document.getElementById('preset-menu');
  const wrapper = menu.closest('.preset-wrapper');
  if (!wrapper.contains(e.target)) {
    menu.classList.remove('open');
  }
}

function renderPresetMenu() {
  const menu = document.getElementById('preset-menu');
  menu.innerHTML = PRESETS.map((p, i) => {
    if (p.sep) return '<div class="preset-divider"></div>';
    return `<button class="preset-item" onclick="loadPreset(${i})">
      <span class="pi-name">${p.name}</span>
      <span class="pi-desc">${p.desc}</span>
    </button>`;
  }).join('');
}

function loadPreset(idx) {
  const t = getActiveTab();
  const preset = PRESETS[idx];
  if (!preset || preset.sep) return;

  const legs = preset.legs(t.spot);
  
  if (marketData && marketPosition) {
    legs.forEach(l => {
      if (l.type === 'futuro') { l.prima = 0; return; }
      const mktPrima = lookupPrima(l.type, l.strike);
      if (mktPrima !== null) l.prima = mktPrima;
    });
  }

  const color = COLORS[(t.stratCounter - 1) % COLORS.length];
  t.strategies.push({
    id: t.stratCounter,
    name: preset.name,
    color,
    legs
  });
  t.stratCounter++;

  document.getElementById('preset-menu').classList.remove('open');
  renderAll();
}

function renderTabs() {
  const container = document.getElementById('tabs-container');
  const alSpace = document.getElementById('alertas-space');
  const inOtherModule = theoryMode || retMode || paseMode || spreadMode
    || (typeof desvioMode !== 'undefined' && desvioMode)
    || (typeof futOpcMode !== 'undefined' && futOpcMode)
    || (alSpace && alSpace.style.display === 'block');
  if (inOtherModule) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';
  let html = '';
  tabs.forEach((t, idx) => {
    const isActive = (idx === activeTabIdx) ? 'active' : '';
    html += `<button class="tab-btn ${isActive}" onclick="switchTab(${idx})">
               ${t.name}
               ${tabs.length > 1 ? `<span style="font-size:10px; margin-left:4px; opacity:0.6" onclick="event.stopPropagation(); deleteTab(${idx})">✕</span>` : ''}
             </button>`;
  });
  html += `<button class="tab-add" onclick="addNewTab()">+ Nueva cobertura</button>`;
  container.innerHTML = html;
}

function renderModules() {
  const pills = document.querySelectorAll('.mod-pill');
  pills.forEach(p => p.classList.remove('active'));
  // Índices alineados al orden de las pills en index.html:
  // 0 Coberturas · 1 FAS&Ret · 2 Pases · 3 Spreads · 4 Desvío · 5 Inteligencia · 6 Fut&Opc · 7 Manual
  let idx = 0;
  if (retMode)     idx = 1;
  if (paseMode)    idx = 2;
  if (spreadMode)  idx = 3;
  if (typeof desvioMode !== 'undefined' && desvioMode) idx = 4;
  const alSpace = document.getElementById('alertas-space');
  if (alSpace && alSpace.style.display === 'block') idx = 5;
  if (typeof futOpcMode !== 'undefined' && futOpcMode)  idx = 6;
  if (theoryMode)  idx = 7;
  if (pills[idx]) pills[idx].classList.add('active');
}

function switchToWorkspace() {
  theoryMode = false; retMode = false; paseMode = false; asstMode = false; spreadMode = false;
  if (typeof futOpcMode !== 'undefined') futOpcMode = false;
  if (typeof desvioMode !== 'undefined') desvioMode = false;
  document.getElementById('workspace').style.display = 'block';
  document.getElementById('theory-space').style.display = 'none';
  document.getElementById('ret-space').style.display = 'none';
  document.getElementById('pase-space').style.display = 'none';
  document.getElementById('spreads-space').style.display = 'none';
  if (document.getElementById('desvio-space')) document.getElementById('desvio-space').style.display = 'none';
  if (document.getElementById('alertas-space')) document.getElementById('alertas-space').style.display = 'none';
  if (document.getElementById('futopc-space')) document.getElementById('futopc-space').style.display = 'none';
  document.getElementById('mkt-bar').style.display = 'flex';
  document.getElementById('fob-bar').style.display = 'flex';
  document.getElementById('tabs-container').style.display = 'flex';
  document.getElementById('btn-update-primas').style.display = '';
  syncTopBar();
  renderAll();
}

function toggleTheory() {
  theoryMode = true; retMode = false; paseMode = false; asstMode = false; spreadMode = false;
  if (typeof futOpcMode !== 'undefined') futOpcMode = false;
  document.getElementById('workspace').style.display = 'none';
  document.getElementById('theory-space').style.display = 'block';
  document.getElementById('ret-space').style.display = 'none';
  document.getElementById('pase-space').style.display = 'none';
  document.getElementById('spreads-space').style.display = 'none';
  if (document.getElementById('futopc-space')) document.getElementById('futopc-space').style.display = 'none';
  document.getElementById('mkt-bar').style.display = 'none';
  renderTabs();
  renderModules();
}

function toggleRetenciones() {
  retMode = true; theoryMode = false; paseMode = false; asstMode = false; spreadMode = false;
  if (typeof futOpcMode !== 'undefined') futOpcMode = false;
  document.getElementById('workspace').style.display = 'none';
  document.getElementById('theory-space').style.display = 'none';
  document.getElementById('ret-space').style.display = 'block';
  document.getElementById('pase-space').style.display = 'none';
  document.getElementById('spreads-space').style.display = 'none';
  if (document.getElementById('futopc-space')) document.getElementById('futopc-space').style.display = 'none';
  document.getElementById('mkt-bar').style.display = 'flex';
  document.getElementById('btn-update-primas').style.display = 'none';
  renderTabs();
  renderModules();
  retChangeCultivo();
  // Sync FOB from sheet when entering retenciones module
  if (Object.keys(fobData).length === 0) syncFOBFromSheet();
}

function switchTab(idx) {
  theoryMode = false; retMode = false; paseMode = false; asstMode = false; spreadMode = false;
  if (typeof futOpcMode !== 'undefined') futOpcMode = false;
  if (typeof desvioMode !== 'undefined') desvioMode = false;
  document.getElementById('workspace').style.display = 'block';
  document.getElementById('theory-space').style.display = 'none';
  document.getElementById('ret-space').style.display = 'none';
  document.getElementById('pase-space').style.display = 'none';
  document.getElementById('spreads-space').style.display = 'none';
  if (document.getElementById('desvio-space')) document.getElementById('desvio-space').style.display = 'none';
  if (document.getElementById('alertas-space')) document.getElementById('alertas-space').style.display = 'none';
  if (document.getElementById('futopc-space')) document.getElementById('futopc-space').style.display = 'none';
  document.getElementById('mkt-bar').style.display = 'flex';
  document.getElementById('fob-bar').style.display = 'flex';
  document.getElementById('tabs-container').style.display = 'flex';
  document.getElementById('btn-update-primas').style.display = '';
  activeTabIdx = idx;
  syncTopBar();
  renderAll();
  renderModules();
}

function addNewTab() {
  const defaults = { soja: 340, maiz: 195, trigo: 215, girasol: 340 };
  const crop = 'soja';
  let spot = defaults[crop];
  // If A3 data is loaded, use real price
  if (sheetData && sheetData.futuros[crop]) {
    const fut = sheetData.futuros[crop].find(f => f.precio > 0);
    if (fut) spot = fut.precio;
  }
  const min = Math.floor(spot * 0.80 / 5) * 5;
  const max = Math.ceil(spot * 1.20 / 5) * 5;
  tabs.push({
    id: tabCounter++, name: 'Estrategia de Coberturas',
    assetVal: crop, spot, min, max,
    stratCounter: 2,
    strategies: [{ id: 1, name: 'Estrategia 1', color: COLORS[0], legs: [{ dir: 'buy', type: 'put', ratio: 1, strike: Math.round(spot * 0.97), prima: 3 }] }]
  });
  switchTab(tabs.length - 1);
}

function deleteTab(idx) {
  if (tabs.length === 1) return;
  tabs.splice(idx, 1);
  if (activeTabIdx >= tabs.length) activeTabIdx = tabs.length - 1;
  if (!theoryMode && !retMode && !paseMode) switchTab(activeTabIdx);
}

function updateTabName(val) { getActiveTab().name = val || 'Sin título'; renderTabs(); }

function syncTopBar() {
  const t = getActiveTab();
  const cropSel = document.getElementById('mkt-crop-select');
  if (cropSel && cropSel.querySelector(`option[value="${t.assetVal}"]`)) {
    cropSel.value = t.assetVal;
  }
  document.getElementById('spot').value = t.spot;
  document.getElementById('chart-min').value = t.min;
  document.getElementById('chart-max').value = t.max;
  document.getElementById('tab-name-input').value = t.name;
  renderTabs();
  if (retData.fasCTP !== null) {
    const retCultivo = retData.cultivo;
    const tabCultivo = t.assetVal;
    if (retCultivo === tabCultivo || (retCultivo === 'soja' && tabCultivo === 'soja')) {
      updateFASInfoBar();
    }
  }
}

function onCultChange() {
  const crop = document.getElementById('mkt-crop-select').value;
  const t = getActiveTab();
  t.assetVal = crop;

  if (sheetData) {
    // A3 data loaded — use real data
    changeMarketCrop();
    const pos = marketPosition;
    const fut = (sheetData.futuros[crop] || []).find(f => f.pos === pos && f.precio > 0)
             || (sheetData.futuros[crop] || []).find(f => f.precio > 0);
    if (fut) {
      t.spot = fut.precio;
      t.min = Math.floor(t.spot * 0.80 / 5) * 5;
      t.max = Math.ceil(t.spot * 1.20 / 5) * 5;
    }
  } else {
    // No A3 data — use defaults
    const defaults = { soja: 340, maiz: 195, trigo: 215, girasol: 340 };
    t.spot = defaults[crop] || 300;
    t.min = Math.floor(t.spot * 0.80 / 5) * 5;
    t.max = Math.ceil(t.spot * 1.20 / 5) * 5;
  }
  syncTopBar();
  renderAll();
}

function onPosChange() {
  changeMarketPosition();
  const t = getActiveTab();
  const crop = document.getElementById('mkt-crop-select').value;
  const pos = marketPosition;
  if (sheetData && crop && pos) {
    const fut = (sheetData.futuros[crop] || []).find(f => f.pos === pos && f.precio > 0);
    if (fut) {
      t.spot = fut.precio;
      t.min = Math.floor(t.spot * 0.80 / 5) * 5;
      t.max = Math.ceil(t.spot * 1.20 / 5) * 5;
      syncTopBar();
    }
  }
}

function updateGlobalInputs() {
  const t = getActiveTab();
  const newSpot = parseFloat(document.getElementById('spot').value) || 0;
  const spotChanged = Math.abs(newSpot - t.spot) > 0.5;
  t.spot = newSpot;
  
  if (spotChanged && newSpot > 0) {
    // Auto-ajustar rango al nuevo spot (±20%, múltiplo de 5)
    t.min = Math.floor(newSpot * 0.80 / 5) * 5;
    t.max = Math.ceil(newSpot * 1.20 / 5) * 5;
    document.getElementById('chart-min').value = t.min;
    document.getElementById('chart-max').value = t.max;
  } else {
    // Solo actualizó min/max manualmente
    t.min = parseFloat(document.getElementById('chart-min').value) || 0;
    t.max = parseFloat(document.getElementById('chart-max').value) || 0;
  }
  
  clearTimeout(_globalTimer);
  _globalTimer = setTimeout(() => renderAll(), 250);
}

function addStrategy() {
  const t = getActiveTab();
  t.strategies.push({ id: t.stratCounter, name: 'Estrategia ' + t.stratCounter, color: COLORS[(t.stratCounter - 1) % COLORS.length], legs: [] });
  t.stratCounter++; renderAll();
}

function removeStrategy(id) { getActiveTab().strategies = getActiveTab().strategies.filter(s => s.id !== id); renderAll(); }
function addLeg(stratId) { getActiveTab().strategies.find(x => x.id === stratId).legs.push({ dir: 'buy', type: 'put', ratio: 1, strike: getActiveTab().spot, prima: 5 }); renderAll(); }
function removeLeg(stratId, legIdx) { getActiveTab().strategies.find(x => x.id === stratId).legs.splice(legIdx, 1); renderAll(); }

function updateStratName(stratId, val) { getActiveTab().strategies.find(x => x.id === stratId).name = val; renderChart(); renderTable(); renderWinner(); }
function updateLegSelect(stratId, legIdx, field, val) { getActiveTab().strategies.find(x => x.id === stratId).legs[legIdx][field] = val; renderAll(); }

function updateLegInput(stratId, legIdx, field, val) {
  getActiveTab().strategies.find(x => x.id === stratId).legs[legIdx][field] = parseFloat(val) || 0;
  clearTimeout(_renderTimer);
  _renderTimer = setTimeout(() => {
    const ae = document.activeElement;
    const focusInfo = ae && ae.closest('.leg-row') ? {
      stratId, legIdx, field,
      selStart: ae.selectionStart, selEnd: ae.selectionEnd
    } : null;

    renderAll();

    if (focusInfo) {
      const rows = document.querySelectorAll('.leg-row');
      for (const row of rows) {
        const inputs = row.querySelectorAll('input.w-num');
        for (const inp of inputs) {
          const attr = inp.getAttribute('oninput') || '';
          if (attr.includes(`${focusInfo.stratId}, ${focusInfo.legIdx}, '${focusInfo.field}'`)) {
            inp.focus();
            try { inp.setSelectionRange(focusInfo.selStart, focusInfo.selEnd); } catch(e) {}
            break;
          }
        }
      }
    }
  }, 300);
  renderChart(); renderTable(); renderWinner();
}

function calcPayoff(strat, price) {
  let netPrima = 0; let optionsPayoff = 0;
  strat.legs.forEach(l => {
    let q = l.ratio || 1;
    if (l.type === 'futuro') {
      let intr = price - l.strike;
      if (l.dir === 'buy') optionsPayoff += intr * q; else optionsPayoff -= intr * q;
    } else {
      let intr = l.type === 'put' ? Math.max(l.strike - price, 0) : Math.max(price - l.strike, 0);
      if (l.dir === 'buy') { netPrima += l.prima * q; optionsPayoff += intr * q; }
      else { netPrima -= l.prima * q; optionsPayoff -= intr * q; }
    }
  });
  return price + optionsPayoff - netPrima;
}

function renderStrats() {
  const cont = document.getElementById('strats-container'); cont.innerHTML = '';
  const t = getActiveTab();

  t.strategies.forEach((s) => {
    let minPayoff = Infinity; let maxPayoff = -Infinity;
    for (let p = 0; p <= 1500; p++) {
      let val = calcPayoff(s, p);
      if (val < minPayoff) minPayoff = val; if (val > maxPayoff) maxPayoff = val;
    }

    let cost = 0;
    s.legs.forEach(l => { let q = l.ratio || 1; if (l.type !== 'futuro') cost += (l.dir === 'buy' ? l.prima : -l.prima) * q; });

    let floorText = minPayoff < (t.spot * 0.5) ? '<span class="red-txt">Riesgo a la baja</span>' : `u$s ${minPayoff.toFixed(1)}`;
    let ceilText = maxPayoff > 1400 ? '<span class="green-txt">Ilimitado</span>' : `u$s ${maxPayoff.toFixed(1)}`;

    let bes = []; let prevDiff = calcPayoff(s, 1) - 1;
    for (let p = 2; p <= 800; p++) {
      let diff = calcPayoff(s, p) - p;
      if ((prevDiff < 0 && diff >= 0) || (prevDiff > 0 && diff <= 0)) bes.push(p);
      prevDiff = diff;
    }
    let beText;
    let hasOptions = s.legs.some(l => l.type !== 'futuro');
    if (cost === 0 && hasOptions && bes.length === 0) beText = '0 Costo';
    else if (bes.length === 1) beText = `u$s ${bes[0]}`;
    else if (bes.length > 1) beText = 'Múltiples';
    else beText = '-';

    let costDisplay = '';
    if (cost > 0) costDisplay = `Costo Neto: <span class="red-txt">$${cost.toFixed(1)}</span> <span style="font-size:10px; font-weight:normal; color:var(--text-3)">(${(cost / t.spot * 100).toFixed(1)}%)</span>`;
    else if (cost < 0) costDisplay = `Crédito: <span class="green-txt">$${Math.abs(cost).toFixed(1)}</span>`;
    else costDisplay = `Costo: <span>$0.0</span>`;

    let legsHtml = s.legs.map((l, idx) => {
      const mktPrima = lookupPrima(l.type, l.strike);
      const mktHint = mktPrima !== null ? `title="Mercado: ${mktPrima.toFixed(2)}"` : 'title="Sin datos"';
      const mktBtn = marketData ? `<button class="btn-sm btn-outline" onclick="autoFillPrima(${s.id}, ${idx})" ${mktHint} style="padding:3px 5px;font-size:10px;min-width:24px;">📡</button>` : '';
      return `
      <div class="leg-row">
        <select class="w-dir" onchange="updateLegSelect(${s.id}, ${idx}, 'dir', this.value)"><option value="buy" ${l.dir === 'buy' ? 'selected' : ''}>Compra</option><option value="sell" ${l.dir === 'sell' ? 'selected' : ''}>Venta</option></select>
        <select class="w-type" onchange="updateLegSelect(${s.id}, ${idx}, 'type', this.value)"><option value="put" ${l.type === 'put' ? 'selected' : ''}>Put</option><option value="call" ${l.type === 'call' ? 'selected' : ''}>Call</option><option value="futuro" ${l.type === 'futuro' ? 'selected' : ''}>Futuro</option></select>
        <input class="w-num" type="number" step="0.1" title="Cantidad (Ratio)" value="${l.ratio}" oninput="updateLegInput(${s.id}, ${idx}, 'ratio', this.value)">
        ${renderStrikeField(s.id, idx, l)}
        <input class="w-num" type="number" step="0.1" title="Prima" value="${l.prima}" oninput="updateLegInput(${s.id}, ${idx}, 'prima', this.value)">
        ${mktBtn}
        <button class="btn-sm btn-danger" onclick="removeLeg(${s.id}, ${idx})">✕</button>
      </div>
    `}).join('');

    cont.innerHTML += `
      <div class="strat-card" style="border-left: 4px solid ${s.color}">
        <div class="strat-header"><input type="text" class="strat-name" value="${s.name}" oninput="updateStratName(${s.id}, this.value)" style="color:${s.color}"><button class="btn btn-sm btn-outline" onclick="removeStrategy(${s.id})">Borrar</button></div>
        <div class="legs-container">
          <div style="display:flex;gap:6px;margin-bottom:4px;font-size:10px;color:var(--text-3);padding:0 8px;font-weight:600;letter-spacing:0.3px"><span style="flex:2">Operación</span><span style="flex:2">Instrum.</span><span style="flex:1.5">Cant.</span><span style="flex:1.5">Strike</span><span style="flex:1.5">Prima</span><span style="width:28px"></span></div>
          ${legsHtml}
        </div>
        <div class="strat-footer"><button class="btn btn-sm btn-outline" onclick="addLeg(${s.id})">+ Agregar Pata</button><div class="cost-display">${costDisplay}</div></div>
        <div class="kpi-grid">
          <div class="kpi-card"><div class="k-lbl">Piso Asegurado</div><div class="k-val">${floorText}</div></div>
          <div class="kpi-card"><div class="k-lbl">Techo Máximo</div><div class="k-val">${ceilText}</div></div>
          <div class="kpi-card"><div class="k-lbl">Empate (B.E.)</div><div class="k-val">${beText}</div></div>
        </div>
      </div>
    `;
  });
}

function renderChart() {
  const t = getActiveTab(); const prices = [];
  for (let p = t.min; p <= t.max; p += 2) prices.push(p);

  const datasets = [{
    label: 'Mercado',
    data: prices.map(p => p),
    borderColor: '#b0afa8',
    borderWidth: 2,
    borderDash: [6, 4],
    pointRadius: 0,
    tension: 0
  }];

  t.strategies.forEach(s => {
    datasets.push({
      label: s.name,
      data: prices.map(p => calcPayoff(s, p)),
      borderColor: s.color,
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0
    });
  });

  const spotAnnotation = {
    type: 'line',
    xMin: t.spot, xMax: t.spot,
    borderColor: 'rgba(26,107,60,0.25)',
    borderWidth: 1,
    borderDash: [3, 3],
    label: {
      display: true,
      content: `Spot: ${t.spot.toFixed(1)}`,
      position: 'start',
      font: { size: 10, family: 'Montserrat' },
      backgroundColor: 'rgba(26,107,60,0.08)',
      color: '#1A6B3C'
    }
  };

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('main-chart'), {
    type: 'line',
    data: { labels: prices, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      plugins: {
        tooltip: { mode: 'index', intersect: false },
        legend: { labels: { font: { family: 'Montserrat', size: 12 }, usePointStyle: true, pointStyle: 'line' } }
      },
      scales: {
        x: {
          title: { display: true, text: 'Precio a Vencimiento (u$s)', font: { family: 'Montserrat', size: 12, weight: '600' }, color: '#505845' },
          grid: { color: 'rgba(0,0,0,.05)' },
          ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#7e8574' }
        },
        y: {
          title: { display: true, text: 'Precio Neto de Venta (u$s)', font: { family: 'Montserrat', size: 12, weight: '600' }, color: '#505845' },
          grid: { color: 'rgba(0,0,0,.05)' },
          ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#7e8574' }
        }
      }
    }
  });
}

function renderTable() {
  const t = getActiveTab();
  let scenarios = [
    { name: 'Derrumbe (-30%)', val: t.spot * 0.7 },
    { name: 'Baja Fuerte (-15%)', val: t.spot * 0.85 },
    { name: 'Precio Actual / Spot', val: t.spot },
    { name: 'Suba Moderada (+15%)', val: t.spot * 1.15 },
    { name: 'Rally / Suba Fuerte (+30%)', val: t.spot * 1.3 }
  ];

  t.strategies.forEach(s => {
    s.legs.forEach(l => {
      if (l.type !== 'futuro' && l.strike) {
        if (!scenarios.some(sc => Math.abs(sc.val - l.strike) < 0.5)) {
          scenarios.push({ name: `Strike ${l.type.toUpperCase()} (${l.strike.toFixed(1)})`, val: l.strike });
        }
      }
    });
  });
  scenarios.sort((a, b) => a.val - b.val);

  let thead = `<tr><th>Escenario</th><th>Mercado</th>`;
  t.strategies.forEach(s => { thead += `<th style="color:${s.color}">${s.name}</th>`; }); thead += `</tr>`;

  let tbody = '';
  scenarios.forEach(sc => {
    const isSpot = Math.abs(sc.val - t.spot) < 0.5;
    let row = `<tr${isSpot ? ' style="background:var(--es-green-light)"' : ''}>
      <td style="font-family:var(--font); font-weight:500">${sc.name}</td>
      <td>$${sc.val.toFixed(1)}</td>`;
    t.strategies.forEach(s => {
      let payoff = calcPayoff(s, sc.val); let diff = payoff - sc.val;
      let color = diff > 0.1 ? 'var(--green)' : (diff < -0.1 ? 'var(--red)' : 'var(--text-3)');
      row += `<td>$${payoff.toFixed(1)} <span style="color:${color}; font-size:10px; margin-left:4px; font-weight:600">(${diff > 0.1 ? '+' : ''}$${diff.toFixed(1)})</span></td>`;
    });
    row += `</tr>`; tbody += row;
  });
  document.getElementById('scenario-table').innerHTML = `<thead>${thead}</thead><tbody>${tbody}</tbody>`;
}

function renderWinner() {
  const t = getActiveTab();
  const prices = [];
  for (let p = t.min; p <= t.max; p++) prices.push(p);

  let ranges = [];
  let currentWinner = null;
  let currentColor = '#b0afa8';
  let rangeStart = t.min;

  prices.forEach(p => {
    let bestName = 'Mercado';
    let bestPayoff = p;
    let bestColor = '#b0afa8';

    t.strategies.forEach(s => {
      let payoff = calcPayoff(s, p);
      if (payoff > bestPayoff + 0.05) {
        bestPayoff = payoff;
        bestName = s.name;
        bestColor = s.color;
      }
    });

    if (currentWinner !== bestName) {
      if (currentWinner !== null) ranges.push({ name: currentWinner, start: rangeStart, end: p - 1, color: currentColor });
      currentWinner = bestName;
      currentColor = bestColor;
      rangeStart = p;
    }
  });
  if (currentWinner !== null) ranges.push({ name: currentWinner, start: rangeStart, end: t.max, color: currentColor });

  let html = '';
  ranges.forEach(r => {
    html += `
      <div class="winner-box" style="border-left-color: ${r.color}">
        <div class="winner-range">Si el mercado cierra entre u$s ${r.start.toFixed(1)} y u$s ${r.end.toFixed(1)}</div>
        <div class="winner-name" style="color: ${r.color}">Conviene: ${r.name}</div>
      </div>
    `;
  });

  document.getElementById('winner-container').innerHTML = html;
}

