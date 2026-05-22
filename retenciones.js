// ═══════════════════════════════════════════════════
// ─── RETENCIONES & FAS Calculator ───
// ═══════════════════════════════════════════════════

function retChangeCultivo() {
  const cultivo = document.getElementById('ret-cultivo').value;
  const d = RET_DEFAULTS[cultivo];
  document.getElementById('ret-fob').value = d.fob;
  document.getElementById('ret-pct').value = d.ret;
  document.getElementById('ret-fobbing').value = d.fobbing;
  document.getElementById('ret-fas-obj').value = d.fasObj;
  
  let positions = getSheetPositions(cultivo);
  if (!positions || positions.length === 0) {
    positions = d.positions.length > 0 ? d.positions : [{ val: 'sin_datos', label: '⚠ Sincronizar A3' }];
  }

  const sel1 = document.getElementById('ret-posicion');
  sel1.innerHTML = positions.map(p => `<option value="${p.val}" ${p.precio ? `data-precio="${p.precio}"` : ''}>${p.label}</option>`).join('');

  const hasPos2 = (cultivo === 'maiz' || cultivo === 'trigo');
  document.getElementById('field-pos-2').style.display = hasPos2 ? 'block' : 'none';
  document.getElementById('field-fas-2').style.display = hasPos2 ? 'block' : 'none';

  if (hasPos2) {
    const sel2 = document.getElementById('ret-posicion-2');
    sel2.innerHTML = positions.map(p => `<option value="${p.val}" ${p.precio ? `data-precio="${p.precio}"` : ''}>${p.label}</option>`).join('');
    if (positions.length > 1) sel2.selectedIndex = 1;
    document.getElementById('ret-fob-2').value = d.fob2;
    document.getElementById('ret-fas-obj-2').value = d.fasObj2;
  }

  // Apply FOB from sheet AFTER positions are populated
  applyFOBToRetenciones();
}

function retCascBar(name, val, pct, bg, textColor) {
  const w = Math.max(pct, 3);
  return `<div class="ret-bw"><div class="ret-br"><span class="ret-bn">${name}</span><span class="ret-bv" style="color:${val < 0 ? 'var(--red)' : 'var(--text)'}">${val.toFixed(2)}</span></div><div class="ret-bar" style="width:${w}%; background:${bg}; color:${textColor};">${pct.toFixed(1)}%</div></div>`;
}

function retCalc() {
  const cultivo = document.getElementById('ret-cultivo').value;
  const fob = parseFloat(document.getElementById('ret-fob').value) || 0;
  const retPct = parseFloat(document.getElementById('ret-pct').value) || 0;
  const ret = retPct / 100;
  const fobbing = parseFloat(document.getElementById('ret-fobbing').value) || 0;
  const fasObj = parseFloat(document.getElementById('ret-fas-obj').value) || 0;
  const sliderVal = parseFloat(document.getElementById('ret-slider').value) || 0;
  
  const isSoja = cultivo === 'soja';
  const hasPos2 = (cultivo === 'maiz' || cultivo === 'trigo');

  const selPos1 = document.getElementById('ret-posicion');
  const pos1Text = selPos1.options[selPos1.selectedIndex]?.text || '';
  document.getElementById('ret-panel-title-1').innerHTML = `Exportación grano ${pos1Text ? ' - ' + pos1Text : ''}`;

  const grid = document.getElementById('ret-panels-grid');
  const crushPanel = document.getElementById('ret-panel-crush');
  const grano2Panel = document.getElementById('ret-panel-grano-2');

  crushPanel.style.display = isSoja ? 'block' : 'none';
  grano2Panel.style.display = hasPos2 ? 'block' : 'none';
  
  grid.className = (isSoja || hasPos2) ? 'ret-panels-grid' : 'ret-panels-grid single-col';

  const fasCTP = fob * (1 - ret) - fobbing;
  const retAmount = fob * ret;

  let granoHTML = '';
  granoHTML += retCascBar('FOB ' + cultivo, fob, 100, 'var(--es-gold-light)', 'var(--es-gold)');
  granoHTML += retCascBar('Retención ' + retPct.toFixed(1) + '%', -retAmount, retPct, '#fde8e8', 'var(--red)');
  granoHTML += retCascBar('Fobbing', -fobbing, fob > 0 ? (fobbing / fob) * 100 : 0, 'var(--bg-input)', 'var(--text-3)');
  document.getElementById('ret-grano-bars').innerHTML = granoHTML;
  document.getElementById('ret-fas-ctp').textContent = fasCTP.toFixed(2);

  const margenGrano = fasCTP - fasObj;
  const mgSign = margenGrano >= 0 ? '+' : '';
  const mgColor = margenGrano >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('ret-grano-margin').innerHTML = `<span class="ret-mg-lbl">Margen export. (vs obj ${fasObj.toFixed(1)})</span><span class="ret-mg-val" style="color:${mgColor}">${mgSign}${margenGrano.toFixed(2)}</span>`;

  const fobNeeded = ret < 1 ? (fasObj + fobbing) / (1 - ret) : 0;
  const retImpl = fob > 0 ? (1 - (fasObj + fobbing) / fob) * 100 : 0;
  document.getElementById('ret-fob-needed').textContent = fobNeeded.toFixed(2);
  document.getElementById('ret-fob-needed-sub').textContent = 'Para pagar FAS obj ' + fasObj.toFixed(1);
  document.getElementById('ret-impl').textContent = retImpl.toFixed(2) + '%';
  const gapPP = retImpl - retPct;
  document.getElementById('ret-impl-sub').textContent = 'Gap: ' + (gapPP >= 0 ? '+' : '') + gapPP.toFixed(2) + ' pp';

  if (hasPos2) {
    const fob2 = parseFloat(document.getElementById('ret-fob-2').value) || 0;
    const fasObj2 = parseFloat(document.getElementById('ret-fas-obj-2').value) || 0;

    document.getElementById('ret-pct-show-2').value = retPct.toFixed(1);
    document.getElementById('ret-fobbing-show-2').value = fobbing.toFixed(1);

    const selPos2 = document.getElementById('ret-posicion-2');
    const pos2Text = selPos2.options[selPos2.selectedIndex]?.text || '';
    document.getElementById('ret-panel-title-2').innerHTML = `Exportación grano - ${pos2Text}`;

    const fasCTP2 = fob2 * (1 - ret) - fobbing;
    const retAmount2 = fob2 * ret;

    let granoHTML2 = '';
    granoHTML2 += retCascBar('FOB ' + cultivo, fob2, 100, 'var(--es-gold-light)', 'var(--es-gold)');
    granoHTML2 += retCascBar('Retención ' + retPct.toFixed(1) + '%', -retAmount2, retPct, '#fde8e8', 'var(--red)');
    granoHTML2 += retCascBar('Fobbing', -fobbing, fob2 > 0 ? (fobbing / fob2) * 100 : 0, 'var(--bg-input)', 'var(--text-3)');
    document.getElementById('ret-grano-bars-2').innerHTML = granoHTML2;
    document.getElementById('ret-fas-ctp-2').textContent = fasCTP2.toFixed(2);

    const margenGrano2 = fasCTP2 - fasObj2;
    const mgSign2 = margenGrano2 >= 0 ? '+' : '';
    const mgColor2 = margenGrano2 >= 0 ? 'var(--green)' : 'var(--red)';
    document.getElementById('ret-grano-margin-2').innerHTML = `<span class="ret-mg-lbl">Margen export. (vs obj ${fasObj2.toFixed(1)})</span><span class="ret-mg-val" style="color:${mgColor2}">${mgSign2}${margenGrano2.toFixed(2)}</span>`;

    const fobNeeded2 = ret < 1 ? (fasObj2 + fobbing) / (1 - ret) : 0;
    const retImpl2 = fob2 > 0 ? (1 - (fasObj2 + fobbing) / fob2) * 100 : 0;
    document.getElementById('ret-fob-needed-2').textContent = fobNeeded2.toFixed(2);
    document.getElementById('ret-fob-needed-sub-2').textContent = 'Para pagar FAS obj ' + fasObj2.toFixed(1);
    document.getElementById('ret-impl-2').textContent = retImpl2.toFixed(2) + '%';
    const gapPP2 = retImpl2 - retPct;
    document.getElementById('ret-impl-sub-2').textContent = 'Gap: ' + (gapPP2 >= 0 ? '+' : '') + gapPP2.toFixed(2) + ' pp';
  }

  let crushFAS = 0;
  if (isSoja) {
    const cFA = parseFloat(document.getElementById('ret-crush-fob-aceite').value) || 0;
    const cCA = parseFloat(document.getElementById('ret-crush-coef-aceite').value) || 0;
    const cFH = parseFloat(document.getElementById('ret-crush-fob-harina').value) || 0;
    const cCH = parseFloat(document.getElementById('ret-crush-coef-harina').value) || 0;
    const cRS = (parseFloat(document.getElementById('ret-crush-ret-subprod').value) || 0) / 100;
    const cFob = parseFloat(document.getElementById('ret-crush-fobbing-val').value) || 0;
    const cInd = parseFloat(document.getElementById('ret-crush-industria-val').value) || 0;

    const acBruto = cFA * cCA;
    const haBruto = cFH * cCH;
    const bruto = acBruto + haBruto;
    const aceite = acBruto * (1 - cRS);
    const harina = haBruto * (1 - cRS);
    crushFAS = aceite + harina - cFob - cInd;

    let crushHTML = '';
    crushHTML += retCascBar('Aceite (' + cFA.toFixed(1) + ' × ' + cCA.toFixed(2) + ')', acBruto, bruto > 0 ? (acBruto / bruto) * 100 : 0, 'var(--es-green-light)', 'var(--es-green-dark)');
    crushHTML += retCascBar('Harina (' + cFH.toFixed(1) + ' × ' + cCH.toFixed(2) + ')', haBruto, bruto > 0 ? (haBruto / bruto) * 100 : 0, 'var(--es-green-light)', 'var(--es-green-dark)');
    crushHTML += retCascBar('Ret subprod ' + (cRS * 100).toFixed(1) + '%', -(bruto * cRS), cRS * 100, '#fde8e8', 'var(--red)');
    crushHTML += retCascBar('Fobbing subprod', -cFob, bruto > 0 ? (cFob / bruto) * 100 : 0, 'var(--bg-input)', 'var(--text-3)');
    crushHTML += retCascBar('Gasto industrialización', -cInd, bruto > 0 ? (cInd / bruto) * 100 : 0, 'var(--bg-input)', 'var(--text-3)');
    document.getElementById('ret-crush-bars').innerHTML = crushHTML;
    document.getElementById('ret-crush-fas').textContent = crushFAS.toFixed(2);

    const margenCrush = crushFAS - fasObj;
    const mcSign = margenCrush >= 0 ? '+' : '';
    const mcColor = margenCrush >= 0 ? 'var(--green)' : 'var(--red)';
    document.getElementById('ret-crush-margin').innerHTML = `<span class="ret-mg-lbl">Margen export. (vs obj ${fasObj.toFixed(1)})</span><span class="ret-mg-val" style="color:${mcColor}">${mcSign}${margenCrush.toFixed(2)}</span>`;
  }

  const reduction = sliderVal / 100;
  document.getElementById('ret-slider-val').textContent = '−' + sliderVal + '%';

  const newRet = ret * (1 - reduction);
  const newFasCTP = fob * (1 - newRet) - fobbing;

  document.getElementById('ret-sc-act-ret').textContent = retPct.toFixed(1) + '%';
  document.getElementById('ret-sc-act-fas').textContent = fasCTP.toFixed(2);
  document.getElementById('ret-sc-new-ret').textContent = (newRet * 100).toFixed(1) + '%';
  document.getElementById('ret-sc-new-fas').textContent = newFasCTP.toFixed(2);

  document.getElementById('ret-sc-act-crush-row').style.display = isSoja ? 'flex' : 'none';
  document.getElementById('ret-sc-new-crush-row').style.display = isSoja ? 'flex' : 'none';

  if (isSoja) {
    const cRS = (parseFloat(document.getElementById('ret-crush-ret-subprod').value) || 0) / 100;
    const cFA = parseFloat(document.getElementById('ret-crush-fob-aceite').value) || 0;
    const cCA = parseFloat(document.getElementById('ret-crush-coef-aceite').value) || 0;
    const cFH = parseFloat(document.getElementById('ret-crush-fob-harina').value) || 0;
    const cCH = parseFloat(document.getElementById('ret-crush-coef-harina').value) || 0;
    const cFob = parseFloat(document.getElementById('ret-crush-fobbing-val').value) || 0;
    const cInd = parseFloat(document.getElementById('ret-crush-industria-val').value) || 0;

    const newCrushRet = cRS * (1 - reduction);
    const acNew = cFA * cCA * (1 - newCrushRet);
    const haNew = cFH * cCH * (1 - newCrushRet);
    const newCrushFAS = acNew + haNew - cFob - cInd;

    document.getElementById('ret-sc-act-crush').textContent = crushFAS.toFixed(2);
    document.getElementById('ret-sc-new-crush').textContent = newCrushFAS.toFixed(2);
  }

  document.getElementById('ret-note-fob').textContent = fob.toFixed(1);
  document.getElementById('ret-note-fas').textContent = fasCTP.toFixed(2);

  retData = { fasCTP, crushFAS, fob, retPct, cultivo, fasObj, fobbing };
  updateFASInfoBar();
}

function updateFASInfoBar() {
  const bar = document.getElementById('fas-info-bar');
  if (!bar) return;
  if (retData.fasCTP === null) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const t = getActiveTab();
  const spot = t.spot;
  document.getElementById('fic-fas-mercado').textContent = spot.toFixed(1) + ' u$s';
  document.getElementById('fic-fas-teorico').textContent = retData.fasCTP.toFixed(1) + ' u$s';
  const spread = spot - retData.fasCTP;
  const sign = spread >= 0 ? '+' : '';
  const el = document.getElementById('fic-spread');
  el.textContent = sign + spread.toFixed(1) + ' u$s/tn';
  el.style.background = spread >= 0 ? 'var(--es-green-light)' : '#fde8e8';
  el.style.color = spread >= 0 ? 'var(--es-green-dark)' : 'var(--red)';
}

// PDF export removed — use Ctrl+P / browser print instead

function retSliderStep(delta) {
  const slider = document.getElementById('ret-slider');
  let val = parseInt(slider.value) + delta;
  val = Math.max(0, Math.min(100, val));
  slider.value = val;
  retCalc();
}

