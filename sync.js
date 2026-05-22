// ═══════════════════════════════════════════════════
// ─── SYNC: FOB, A3 Sheets & Market Data ───
// ═══════════════════════════════════════════════════

function parseFOBNum(val) {
  if (!val && val !== 0) return 0;
  let s = String(val).trim();
  if (!s || s.toUpperCase() === 'S/C' || s === '-') return 0;
  s = s.replace(/[^0-9,.\-]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  return parseFloat(s) || 0;
}

function normalizarMesFOB(raw) {
  const s = String(raw || '').trim().toUpperCase();
  const m = s.match(/([A-Z]{3})[\s\-]*(20)?(\d{2})/);
  if (!m) return '';
  return m[1] + ' 20' + m[3];
}

function syncFOBFromSheet() {
  const statusEl = document.getElementById('fob-status');
  if (statusEl) statusEl.innerHTML = '⏳ Cargando FOB...';

  const cbName = '_fobCB_' + Date.now();
  const timer = setTimeout(() => {
    delete window[cbName];
    if (script.parentNode) script.remove();
    if (statusEl) statusEl.innerHTML = '⚠️ Timeout — usando valores manuales';
  }, 12000);

  window[cbName] = function(response) {
    clearTimeout(timer);
    delete window[cbName];
    if (script.parentNode) script.remove();
    try {
      if (response.status !== 'ok') throw new Error('status: ' + response.status);
      const table = response.table;

      // Map column labels to indices (case-insensitive)
      const cols = table.cols.map(c => (c.label || '').trim().toLowerCase());
      const idx = name => cols.findIndex(c => c === name.toLowerCase());

      const iPos  = idx('Posicion');
      const iSoja = idx('Soja');
      const iMaiz = idx('Maiz');
      const iTrig = idx('Trigo');
      const iHar  = idx('Harina');
      const iAce  = idx('Aceite');
      const iGir  = idx('AceiteGirasol');
      const iAct  = idx('Actualizado');

      function cv(row, i) {
        if (i < 0 || !row.c || !row.c[i] || row.c[i].v === null) return '';
        return row.c[i].f || String(row.c[i].v);
      }
      function cn(row, i) {
        if (i < 0 || !row.c || !row.c[i] || row.c[i].v === null) return 0;
        const v = row.c[i].v;
        return typeof v === 'number' ? v : parseFOBNum(String(v));
      }

      fobData = {};
      fobActualizado = '';
      for (const row of table.rows) {
        const mes = normalizarMesFOB(cv(row, iPos));
        if (!mes) continue;
        fobData[mes] = {
          soja: cn(row, iSoja), maiz: cn(row, iMaiz),
          trigo: cn(row, iTrig), harina: cn(row, iHar),
          aceite: cn(row, iAce), aceiteGirasol: cn(row, iGir),
        };
        if (!fobActualizado && iAct >= 0) fobActualizado = cv(row, iAct);
      }

      const n = Object.keys(fobData).length;
      if (n === 0) throw new Error('sin filas');
      const primera = Object.keys(fobData)[0];
      const soja0 = fobData[primera].soja;
      if (statusEl) statusEl.innerHTML =
        '✅ FOB al ' + (fobActualizado || 'hoy') + ' — ' + n + ' pos · Soja ' + primera + ': <strong>' + soja0 + '</strong>';
      applyFOBToRetenciones();

    } catch(e) {
      if (statusEl) statusEl.innerHTML = '⚠️ Error FOB: ' + e.message;
      console.warn('FOB JSONP error:', e);
    }
  };

  const script = document.createElement('script');
  script.src = 'https://docs.google.com/spreadsheets/d/1Fmvsn0o2OpTD8BXnqw8sDTG_4Kr9zu_tWvcy7R7Zjjo/gviz/tq?tqx=responseHandler:' + cbName + '&gid=515809769';
  script.onerror = () => {
    clearTimeout(timer);
    delete window[cbName];
    if (statusEl) statusEl.innerHTML = '⚠️ No se pudo conectar con Sheet FOB';
  };
  document.head.appendChild(script);
}

function getFOBForCultivo(cultivo, posicion) {
  // Buscamos el FOB del mes más cercano disponible
  const keyMap = { soja: 'soja', maiz: 'maiz', trigo: 'trigo', girasol: 'aceiteGirasol' };
  const key = keyMap[cultivo] || 'soja';
  
  // Si hay posición específica, intentar matchear
  if (posicion && fobData) {
    // Convertir código A3 (MAY26) a formato Sheet (MAY 2026)
    const m = String(posicion).match(/([A-Z]{3})(\d{2})/);
    if (m) {
      const mesLabel = m[1] + ' 20' + m[2];
      if (fobData[mesLabel] && fobData[mesLabel][key] > 0) {
        return fobData[mesLabel][key];
      }
    }
  }
  
  // Fallback: primera posición disponible
  for (const mes of Object.keys(fobData)) {
    if (fobData[mes][key] > 0) return fobData[mes][key];
  }
  return 0;
}


function applyFOBToRetenciones() {
  if (Object.keys(fobData).length === 0) return;

  const cultivoEl = document.getElementById('ret-cultivo');
  if (!cultivoEl) return;
  const cultivo = cultivoEl.value;
  const keyMap = { soja: 'soja', maiz: 'maiz', trigo: 'trigo', girasol: 'aceiteGirasol' };
  const key = keyMap[cultivo] || 'soja';

  // Convert A3 code (JUL26, MAY26) → Sheet label (JUL 2026, MAY 2026)
  function toLabel(pos) {
    if (!pos) return '';
    const m = String(pos).toUpperCase().match(/([A-Z]{3})(\d{2})/);
    if (m) return m[1] + ' 20' + m[2];
    // Already in label format like "JUL 2026"
    return String(pos).toUpperCase();
  }

  function getRow(pos) {
    const label = toLabel(pos);
    if (fobData[label]) return fobData[label];
    // Fuzzy match: find key that starts with same 3-letter month
    const month = label.substring(0, 3);
    const year  = label.substring(4, 8);
    for (const k of Object.keys(fobData)) {
      if (k.startsWith(month) && k.includes(year)) return fobData[k];
    }
    return null;
  }

  // --- Position 1 ---
  const selPos1 = document.getElementById('ret-posicion');
  const pos1 = selPos1 ? (selPos1.options[selPos1.selectedIndex]?.value || '') : '';
  const row1 = getRow(pos1) || fobData[Object.keys(fobData)[0]];

  if (row1) {
    const fob1 = row1[key] || 0;
    if (fob1 > 0) {
      const el = document.getElementById('ret-fob');
      if (el) el.value = fob1.toFixed(0);
    }
    // Soja crush fields — always update regardless of mode
    if (cultivo === 'soja') {
      const elAce = document.getElementById('ret-crush-fob-aceite');
      const elHar = document.getElementById('ret-crush-fob-harina');
      if (elAce) elAce.value = (row1.aceite > 0 ? row1.aceite : parseFloat(elAce.value) || 0).toFixed(0);
      if (elHar) elHar.value = (row1.harina > 0 ? row1.harina : parseFloat(elHar.value) || 0).toFixed(0);
    }
  }

  // --- Position 2 (maiz/trigo) ---
  const selPos2 = document.getElementById('ret-posicion-2');
  const fobEl2  = document.getElementById('ret-fob-2');
  if (selPos2 && fobEl2) {
    const pos2 = selPos2.options[selPos2.selectedIndex]?.value || '';
    const row2 = getRow(pos2) || row1;
    if (row2) {
      const fob2 = row2[key] || 0;
      if (fob2 > 0) fobEl2.value = fob2.toFixed(0);
    }
  }

  retCalc();
}

function onRetPos2Change() {
  applyFOBToRetenciones();
}

function positionLabel(posCode) {
  const monthCode = posCode.replace(/[0-9]/g, '');
  const year = posCode.replace(/[A-Z]/g, '');
  return (MONTH_LABELS[monthCode] || monthCode) + ' ' + year;
}

function parseContrato(contrato) {
  const m = contrato.match(/^([A-Z]{3})\.[A-Z.]+\/([A-Z0-9]+)(?:\s+(\d+(?:\.\d+)?)\s+([CP]))?$/);
  if (!m) return null;
  const cropCode = m[1];
  const crop = CROP_CODE_MAP[cropCode];
  if (!crop) return null;
  const result = { crop, pos: m[2] };
  if (m[3] && m[4]) {
    result.strike = parseFloat(m[3]);
    result.optType = m[4] === 'C' ? 'call' : 'put';
  }
  return result;
}

function parseSheetCSV(csvText) {
  const parsed = Papa.parse(csvText, { header: false, skipEmptyLines: true });
  const rows = parsed.data;

  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i][0] && rows[i][0].trim().toLowerCase().includes('contrato')) {
      headerIdx = i; break;
    }
  }
  if (headerIdx < 0) throw new Error('No se encontró la fila de encabezados');

  const headers = rows[headerIdx].map(h => (h || '').trim().toLowerCase());
  const col = {
    contrato: 0,
    vto: headers.findIndex(h => h.includes('vencimiento')),
    moneda: headers.findIndex(h => h.includes('moneda')),
    tipo: headers.findIndex(h => h.includes('tipo')),
    putCall: headers.findIndex(h => h.includes('put') && h.includes('call')),
    ajuste: headers.findIndex(h => h.includes('ajuste') || h.includes('valor')),
    volumen: headers.findIndex(h => h.includes('volumen')),
    ia: headers.findIndex(h => h.includes('inter') && h.includes('abierto')),
    varIA: headers.findIndex(h => h.includes('var')),
    fechaDatos: headers.findIndex(h => h.includes('fecha de datos') || h.includes('fecha datos'))
  };

  const futuros = {};
  const opciones = {};
  let fechaDatos = '';

  function parseNum(val) {
    if (!val) return 0;
    let s = val.trim();
    if (s === 'N/A' || s === '-' || s === '') return 0;
    if (s.includes(',') && s.includes('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',') && !s.includes('.')) {
      s = s.replace(',', '.');
    }
    return parseFloat(s) || 0;
  }

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[col.contrato] || !row[col.contrato].trim()) continue;

    const contrato = row[col.contrato].trim();
    const moneda = col.moneda >= 0 ? (row[col.moneda] || '').trim().toUpperCase() : '';
    const tipo = col.tipo >= 0 ? (row[col.tipo] || '').trim() : '';
    const putCallRaw = col.putCall >= 0 ? (row[col.putCall] || '').trim().toUpperCase() : '';
    const ajuste = col.ajuste >= 0 ? parseNum(row[col.ajuste]) : 0;
    const ia = col.ia >= 0 ? parseNum(row[col.ia]) : 0;
    const vtoStr = col.vto >= 0 ? (row[col.vto] || '').trim() : '';
    if (!fechaDatos && col.fechaDatos >= 0 && row[col.fechaDatos]) {
      fechaDatos = (row[col.fechaDatos] || '').trim();
    }

    if (moneda !== 'USD') continue;

    const info = parseContrato(contrato);
    if (!info) continue;

    if (tipo.toLowerCase().includes('futuro')) {
      if (!futuros[info.crop]) futuros[info.crop] = [];
      futuros[info.crop].push({
        pos: info.pos,
        precio: ajuste,
        vto: vtoStr,
        ia: ia,
        contrato: contrato
      });
    } else if (tipo.toLowerCase().includes('opci')) {
      if (!opciones[info.crop]) opciones[info.crop] = {};
      if (!opciones[info.crop][info.pos]) opciones[info.crop][info.pos] = { calls: [], puts: [] };
      const optEntry = { strike: info.strike, prima: ajuste, contrato: contrato };
      if (info.optType === 'call' || putCallRaw === 'CALL') {
        opciones[info.crop][info.pos].calls.push(optEntry);
      } else {
        opciones[info.crop][info.pos].puts.push(optEntry);
      }
    }
  }

  Object.values(opciones).forEach(cropOpts => {
    Object.values(cropOpts).forEach(posOpts => {
      posOpts.calls.sort((a, b) => a.strike - b.strike);
      posOpts.puts.sort((a, b) => a.strike - b.strike);
    });
  });

  return { futuros, opciones, fechaDatos };
}

async function syncFromSheet() {
  const statusEl = document.getElementById('mkt-status');
  const btnEl = document.getElementById('btn-sync-sheet');
  statusEl.innerHTML = '⏳ Sincronizando con A3 Info...';
  btnEl.disabled = true;

  try {
    const response = await fetch(SHEET_CONFIG.publishedCSV);
    if (!response.ok) throw new Error('fetch failed');
    const csvText = await response.text();
    if (csvText.includes('<!DOCTYPE') || csvText.includes('<html')) throw new Error('not csv');
    sheetData = parseSheetCSV(csvText);
    finishSync(statusEl);
    return;
  } catch(e) {
    console.log('Fetch falló, intentando JSONP...', e.message);
  }

  try {
    await loadViaJSONP();
    finishSync(statusEl);
  } catch(err) {
    statusEl.innerHTML = `❌ ${err.message} — Descargá el sheet como CSV y cargalo con 📂`;
    console.error('JSONP sync error:', err);
  } finally {
    btnEl.disabled = false;
  }
}

function finishSync(statusEl) {
  applySheetData();
  const nFut = Object.values(sheetData.futuros).reduce((s, arr) => s + arr.length, 0);
  const nOpt = Object.values(sheetData.opciones).reduce((s, crop) =>
    s + Object.values(crop).reduce((s2, pos) => s2 + pos.calls.length + pos.puts.length, 0), 0);
  statusEl.innerHTML = `✅ ${sheetData.fechaDatos} — ${nFut} futuros, ${nOpt} opciones`;
  document.getElementById('mkt-bar').classList.add('loaded');
  document.getElementById('btn-sync-sheet').disabled = false;
  asstSyncFromBuilder();
}

function loadViaJSONP() {
  return new Promise((resolve, reject) => {
    const cbName = '_sheetCB_' + Date.now();
    window[cbName] = function(response) {
      try {
        delete window[cbName];
        script.remove();
        if (response.status !== 'ok') throw new Error('Google respondió: ' + response.status);
        sheetData = parseGvizResponse(response.table);
        resolve();
      } catch(e) { reject(e); }
    };

    const script = document.createElement('script');
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_CONFIG.spreadsheetId}/gviz/tq?tqx=responseHandler:${cbName}&gid=${SHEET_CONFIG.gid}`;
    script.onerror = () => { delete window[cbName]; script.remove(); reject(new Error('No se pudo conectar con Google Sheets')); };
    const timer = setTimeout(() => { delete window[cbName]; script.remove(); reject(new Error('Timeout conectando con Google Sheets')); }, 10000);
    const origCb = window[cbName];
    window[cbName] = function(r) { clearTimeout(timer); origCb(r); };
    document.head.appendChild(script);
  });
}

function parseGvizResponse(table) {
  const cols = table.cols.map(c => (c.label || '').trim().toLowerCase());
  const colIdx = {
    contrato: cols.findIndex(c => c.includes('contrato')),
    vto: cols.findIndex(c => c.includes('vencimiento')),
    moneda: cols.findIndex(c => c.includes('moneda')),
    tipo: cols.findIndex(c => c.includes('tipo')),
    putCall: cols.findIndex(c => c.includes('put') && c.includes('call')),
    ajuste: cols.findIndex(c => c.includes('ajuste') || c.includes('valor')),
    ia: cols.findIndex(c => c.includes('inter') && c.includes('abierto')),
    fechaDatos: cols.findIndex(c => c.includes('fecha') && c.includes('dato'))
  };

  if (colIdx.contrato < 0) colIdx.contrato = 0;

  const futuros = {};
  const opciones = {};
  let fechaDatos = '';

  function cellVal(row, idx) {
    if (idx < 0 || !row.c || !row.c[idx]) return '';
    const cell = row.c[idx];
    if (cell.v === null || cell.v === undefined) return '';
    return cell.f || String(cell.v);
  }
  function cellNum(row, idx) {
    if (idx < 0 || !row.c || !row.c[idx]) return 0;
    const cell = row.c[idx];
    if (cell.v === null || cell.v === undefined) return 0;
    if (typeof cell.v === 'number') return cell.v;
    let s = String(cell.v).trim();
    if (s === 'N/A' || s === '-' || s === '') return 0;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    return parseFloat(s) || 0;
  }

  for (const row of table.rows) {
    const contrato = cellVal(row, colIdx.contrato).trim();
    if (!contrato) continue;

    const moneda = cellVal(row, colIdx.moneda).toUpperCase();
    const tipo = cellVal(row, colIdx.tipo);
    const putCallRaw = cellVal(row, colIdx.putCall).toUpperCase();
    const ajuste = cellNum(row, colIdx.ajuste);
    const ia = cellNum(row, colIdx.ia);
    const vtoStr = cellVal(row, colIdx.vto);
    if (!fechaDatos && colIdx.fechaDatos >= 0) {
      const fd = cellVal(row, colIdx.fechaDatos);
      if (fd) fechaDatos = fd;
    }

    if (moneda !== 'USD') continue;

    const info = parseContrato(contrato);
    if (!info) continue;

    if (tipo.toLowerCase().includes('futuro')) {
      if (!futuros[info.crop]) futuros[info.crop] = [];
      futuros[info.crop].push({ pos: info.pos, precio: ajuste, vto: vtoStr, ia, contrato });
    } else if (tipo.toLowerCase().includes('opci')) {
      if (!opciones[info.crop]) opciones[info.crop] = {};
      if (!opciones[info.crop][info.pos]) opciones[info.crop][info.pos] = { calls: [], puts: [] };
      const optEntry = { strike: info.strike, prima: ajuste, contrato };
      if (info.optType === 'call' || putCallRaw === 'CALL') {
        opciones[info.crop][info.pos].calls.push(optEntry);
      } else {
        opciones[info.crop][info.pos].puts.push(optEntry);
      }
    }
  }

  Object.values(opciones).forEach(cropOpts => {
    Object.values(cropOpts).forEach(posOpts => {
      posOpts.calls.sort((a, b) => a.strike - b.strike);
      posOpts.puts.sort((a, b) => a.strike - b.strike);
    });
  });

  return { futuros, opciones, fechaDatos };
}

function applySheetData() {
  if (!sheetData) return;

  const cropSel = document.getElementById('mkt-crop-select');
  const crops = Object.keys(sheetData.futuros).filter(c => ALLOWED_CROPS.has(c));
  const cropLabels = { soja: 'Soja', maiz: 'Maíz', trigo: 'Trigo', girasol: 'Girasol' };
  cropSel.innerHTML = crops.map(c => `<option value="${c}">${cropLabels[c] || c}</option>`).join('');

  const activeAsset = getActiveTab().assetVal;
  if (crops.includes(activeAsset)) cropSel.value = activeAsset;

  rebuildMarketDataCompat();
  updateMarketPositions();
  updateAssetSelectSpots();

  if (retMode) retChangeCultivo();
  if (paseMode) { paseUpdatePositions(); paseCalc(); }
}

function updateMarketPositions() {
  if (!sheetData) return;
  const crop = document.getElementById('mkt-crop-select').value;
  if (!crop) return;

  const posSel = document.getElementById('mkt-pos-select');
  const positions = (sheetData.futuros[crop] || []).map(f => f.pos);
  posSel.innerHTML = positions.map(p => `<option value="${p}">${positionLabel(p)}</option>`).join('');

  const firstWithPrice = (sheetData.futuros[crop] || []).find(f => f.precio > 0);
  if (firstWithPrice) posSel.value = firstWithPrice.pos;

  marketPosition = posSel.value;
  applyMarketData();
}

function changeMarketCrop() {
  rebuildMarketDataCompat();
  updateMarketPositions();
  asstSyncFromBuilder();
}

function updateAssetSelectSpots() {
  if (!sheetData) return;
  const t = getActiveTab();
  const crop = t.assetVal;
  const futList = sheetData.futuros[crop];
  if (futList && futList.length > 0) {
    const first = futList.find(f => f.precio > 0) || futList[0];
    if (first && first.precio > 0) {
      t.spot = first.precio;
      t.min = Math.floor(t.spot * 0.80 / 5) * 5;
      t.max = Math.ceil(t.spot * 1.20 / 5) * 5;
      syncTopBar();
    }
  }
}

function rebuildMarketDataCompat() {
  if (!sheetData) return;
  const crop = document.getElementById('mkt-crop-select').value;
  if (!crop) return;

  const futuros = (sheetData.futuros[crop] || []).map(f => ({
    posicion: f.pos,
    ajuste: f.precio,
    vencimiento: f.vto
  }));

  const puts = [];
  const calls = [];
  const cropOpciones = sheetData.opciones[crop] || {};
  Object.keys(cropOpciones).forEach(pos => {
    const posOpts = cropOpciones[pos];
    posOpts.puts.forEach(p => puts.push({ posicion: pos, strike: p.strike, prima: p.prima }));
    posOpts.calls.forEach(c => calls.push({ posicion: pos, strike: c.strike, prima: c.prima }));
  });

  marketData = {
    metadata: { fecha_datos: sheetData.fechaDatos, fuente: 'Google Sheet A3 Info' },
    futuros,
    opciones: { puts, calls }
  };
}

function getSheetPositions(crop) {
  if (!sheetData || !sheetData.futuros[crop]) return null;
  return sheetData.futuros[crop]
    .filter(f => f.precio > 0)
    .map(f => ({
      val: f.pos.toLowerCase(),
      label: positionLabel(f.pos),
      posCode: f.pos,
      precio: f.precio
    }));
}

// ═══════════════════════════════════════════════════

function loadMarketJSON() {
  document.getElementById('mkt-file-input').click();
}

function handleMarketFile(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const text = e.target.result;
      const isCSV = file.name.endsWith('.csv') || !text.trim().startsWith('{');
      
      if (isCSV) {
        sheetData = parseSheetCSV(text);
        applySheetData();
        const nFut = Object.values(sheetData.futuros).reduce((s, arr) => s + arr.length, 0);
        const nOpt = Object.values(sheetData.opciones).reduce((s, crop) =>
          s + Object.values(crop).reduce((s2, pos) => s2 + pos.calls.length + pos.puts.length, 0), 0);
        document.getElementById('mkt-status').innerHTML = `✅ ${sheetData.fechaDatos} — ${nFut} futuros, ${nOpt} opciones (CSV)`;
        document.getElementById('mkt-bar').classList.add('loaded');
        asstSyncFromBuilder();
        return;
      }

      marketData = JSON.parse(text);
      const posSet = new Set();
      marketData.futuros.forEach(f => posSet.add(f.posicion));
      marketData.opciones.puts.forEach(p => posSet.add(p.posicion));
      marketData.opciones.calls.forEach(c => posSet.add(c.posicion));

      const cropSel = document.getElementById('mkt-crop-select');
      cropSel.innerHTML = '<option value="soja">Soja (JSON)</option>';

      const sel = document.getElementById('mkt-pos-select');
      sel.innerHTML = '';
      const posiciones = Array.from(posSet).sort();
      posiciones.forEach(pos => {
        const opt = document.createElement('option');
        opt.value = pos;
        opt.textContent = positionLabel(pos);
        sel.appendChild(opt);
      });
      if (posiciones.includes('JUL26')) sel.value = 'JUL26';
      marketPosition = sel.value;
      applyMarketData();

      document.getElementById('mkt-bar').classList.add('loaded');
      document.getElementById('mkt-status').innerHTML = `✅ ${marketData.metadata.fecha_datos} — ${marketData.futuros.length} futuros, ${marketData.opciones.puts.length + marketData.opciones.calls.length} opciones (JSON)`;
      asstSyncFromBuilder();
    } catch(err) {
      alert('Error leyendo el archivo: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function changeMarketPosition() {
  marketPosition = document.getElementById('mkt-pos-select').value;
  applyMarketData();
  asstSyncFromBuilder();
}

function onRetPosicionChange() {
  // When position changes in retenciones, update FOB from sheet then recalc
  applyFOBToRetenciones();
}

function applyMarketData() {
  if (!marketData || !marketPosition) return;
  const futuro = marketData.futuros.find(f => f.posicion === marketPosition);
  if (futuro && futuro.ajuste) {
    const t = getActiveTab();
    t.spot = futuro.ajuste;
    document.getElementById('spot').value = futuro.ajuste;
  }
  renderAll();
}