// ═══════════════════════════════════════════════════
// ─── PASES & TASAS MODULE ───
// ═══════════════════════════════════════════════════

function togglePases() {
  paseMode = true; theoryMode = false; retMode = false; asstMode = false; spreadMode = false;
  document.getElementById('workspace').style.display = 'none';
  document.getElementById('theory-space').style.display = 'none';
  document.getElementById('ret-space').style.display = 'none';
  document.getElementById('pase-space').style.display = 'block';
  document.getElementById('spreads-space').style.display = 'none';
  document.getElementById('mkt-bar').style.display = 'flex';
  document.getElementById('btn-update-primas').style.display = 'none';
  renderTabs();
  renderModules();
  paseUpdatePositions();
  paseCalc();
}

function paseSetGrain(grain, event) {
  paseGrain = grain;
  document.querySelectorAll('.pase-chip').forEach(c => c.classList.remove('active'));
  event.target.classList.add('active');
  paseUpdatePositions();
  paseCalc();
}

function paseEstimateDate(posCode) {
  const MONTH_MAP = {
    'ENE':'01','FEB':'02','MAR':'03','ABR':'04','MAY':'05','JUN':'06',
    'JUL':'07','AGO':'08','SEP':'09','OCT':'10','NOV':'11','DIC':'12','DIS':'12'
  };
  const monthCode = posCode.replace(/[0-9]/g, '');
  const yearCode = posCode.replace(/[A-Z]/g, '');
  const mm = MONTH_MAP[monthCode];
  if (!mm || !yearCode) return '';
  const yyyy = yearCode.length === 2 ? '20' + yearCode : yearCode;
  const lastDay = new Date(parseInt(yyyy), parseInt(mm), 0).getDate();
  return `${yyyy}-${mm}-${lastDay}`;
}

function paseParseVto(vtoStr) {
  if (!vtoStr) return '';
  const m1 = vtoStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(vtoStr)) return vtoStr;
  return '';
}

function paseUpdatePositions() {
  const positions = getSheetPositions(paseGrain);
  const selIds = ['pase-p1-sel', 'pase-p2-sel', 'pase-p3-sel'];
  
  selIds.forEach(id => {
    const sel = document.getElementById(id);
    const prevVal = sel.value;
    
    // Opción Disponible (spot de hoy) — siempre presente, precio manual
    const dispOpt = '<option value="DISP" data-precio="">Disponible (spot hoy)</option>';
    
    if (!positions || positions.length === 0) {
      sel.innerHTML = dispOpt + '<option value="">⚠ Sincronizar A3</option>';
      if (prevVal && Array.from(sel.options).some(o => o.value === prevVal)) {
        sel.value = prevVal;
      }
      return;
    }
    
    sel.innerHTML = dispOpt + positions.map(p => 
      `<option value="${p.posCode}" data-precio="${p.precio || ''}">${p.label}${p.precio ? ' — ' + p.precio.toFixed(1) + ' u$s' : ''}</option>`
    ).join('');
    
    if (prevVal && Array.from(sel.options).some(o => o.value === prevVal)) {
      sel.value = prevVal;
    }
  });
  
  if (positions && positions.length >= 2) {
    const sel1 = document.getElementById('pase-p1-sel');
    const sel2 = document.getElementById('pase-p2-sel');
    const sel3 = document.getElementById('pase-p3-sel');
    
    // +1 en los índices porque la opción "Disponible" ocupa el índice 0.
    // Así los defaults siguen apuntando a los futuros reales (igual que antes).
    if (!document.getElementById('pase-p1-price').value) {
      sel1.selectedIndex = 1;
      paseOnPosChange(1);
    }
    if (!document.getElementById('pase-p2-price').value) {
      sel2.selectedIndex = Math.min(2, positions.length);
      paseOnPosChange(2);
    }
    if (!document.getElementById('pase-p3-price').value && positions.length >= 3) {
      sel3.selectedIndex = Math.min(3, positions.length);
      paseOnPosChange(3);
    }
  }
}

function paseOnPosChange(posNum) {
  const sel = document.getElementById('pase-p' + posNum + '-sel');
  const priceInput = document.getElementById('pase-p' + posNum + '-price');
  const dateInput = document.getElementById('pase-p' + posNum + '-date');
  
  if (!sel.value) return;
  
  // ─── Disponible (spot): fecha = hoy, precio cargado a mano ───
  if (sel.value === 'DISP') {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
    priceInput.value = '';   // limpio para que cargues el disponible real
    priceInput.focus();
    paseCalc();
    return;
  }
  
  const opt = sel.selectedOptions[0];
  const precio = parseFloat(opt.dataset.precio);
  if (precio > 0) {
    priceInput.value = precio;
  }
  
  const posCode = sel.value;
  if (sheetData && sheetData.futuros[paseGrain]) {
    const futuro = sheetData.futuros[paseGrain].find(f => f.pos === posCode);
    if (futuro && futuro.vto) {
      const parsed = paseParseVto(futuro.vto);
      if (parsed) { dateInput.value = parsed; }
      else { dateInput.value = paseEstimateDate(posCode); }
    } else {
      dateInput.value = paseEstimateDate(posCode);
    }
  } else {
    dateInput.value = paseEstimateDate(posCode);
  }
  
  paseCalc();
}

function paseToggleP3() {
  paseP3Active = !paseP3Active;
  const btn = document.getElementById('pase-toggle-p3-btn');
  const fields = document.getElementById('pase-p3-fields');
  const placeholder = document.getElementById('pase-p3-placeholder');
  const card = document.getElementById('pase-pos-3');
  
  if (paseP3Active) {
    btn.textContent = '×';
    fields.style.display = 'block';
    placeholder.style.display = 'none';
    card.classList.remove('disabled');
    document.getElementById('pase-tc-fut3-field').style.display = '';
    if (!document.getElementById('pase-p3-price').value) {
      paseOnPosChange(3);
    }
  } else {
    btn.textContent = '+';
    fields.style.display = 'none';
    placeholder.style.display = 'block';
    document.getElementById('pase-tc-fut3-field').style.display = 'none';
  }
  paseCalc();
}

function pasePosLabel(posNum) {
  const sel = document.getElementById('pase-p' + posNum + '-sel');
  if (sel && sel.value === 'DISP') return 'Disponible';
  if (sel && sel.selectedOptions[0] && sel.value) {
    return sel.selectedOptions[0].textContent.split(' — ')[0].trim();
  }
  return 'Pos ' + posNum;
}

function paseGetInputs() {
  const p1 = {
    name: pasePosLabel(1),
    price: parseFloat(document.getElementById('pase-p1-price').value) || 0,
    date: document.getElementById('pase-p1-date').value
  };
  const p2 = {
    name: pasePosLabel(2),
    price: parseFloat(document.getElementById('pase-p2-price').value) || 0,
    date: document.getElementById('pase-p2-date').value
  };
  const p3 = paseP3Active ? {
    name: pasePosLabel(3),
    price: parseFloat(document.getElementById('pase-p3-price').value) || 0,
    date: document.getElementById('pase-p3-date').value
  } : null;

  const tcSpot = parseFloat(document.getElementById('pase-tc-spot').value) || 0;
  const tcFut2 = parseFloat(document.getElementById('pase-tc-fut2').value) || 0;
  const tcFut3 = paseP3Active ? (parseFloat(document.getElementById('pase-tc-fut3').value) || 0) : 0;
  const caucionUSD = parseFloat(document.getElementById('pase-tasa-caucion-usd').value) || 0;
  const caucionARS = parseFloat(document.getElementById('pase-tasa-caucion-ars').value) || 0;
  const lecap = parseFloat(document.getElementById('pase-tasa-lecap').value) || 0;
  const almacenaje = parseFloat(document.getElementById('pase-almacenaje').value) || 0;
  const creditoUSD = parseFloat(document.getElementById('pase-tasa-credito-usd').value) || 0;
  const creditoARS = parseFloat(document.getElementById('pase-tasa-credito-ars').value) || 0;

  return { p1, p2, p3, tcSpot, tcFut2, tcFut3, caucionUSD, caucionARS, lecap, almacenaje, creditoUSD, creditoARS };
}

function paseDaysBetween(d1, d2) {
  if (!d1 || !d2) return 0;
  const a = new Date(d1), b = new Date(d2);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function paseBuildPairs(inp) {
  const pairs = [];
  const d12 = paseDaysBetween(inp.p1.date, inp.p2.date);
  if (d12 > 0) {
    pairs.push({
      from: inp.p1, to: inp.p2, days: d12,
      tcFrom: inp.tcSpot, tcTo: inp.tcFut2,
      label: inp.p1.name + ' → ' + inp.p2.name,
      tagFrom: 'p1', tagTo: 'p2'
    });
  }
  if (inp.p3) {
    const d23 = paseDaysBetween(inp.p2.date, inp.p3.date);
    if (d23 > 0) {
      pairs.push({
        from: inp.p2, to: inp.p3, days: d23,
        tcFrom: inp.tcFut2, tcTo: inp.tcFut3,
        label: inp.p2.name + ' → ' + inp.p3.name,
        tagFrom: 'p2', tagTo: 'p3'
      });
    }
    const d13 = paseDaysBetween(inp.p1.date, inp.p3.date);
    if (d13 > 0) {
      pairs.push({
        from: inp.p1, to: inp.p3, days: d13,
        tcFrom: inp.tcSpot, tcTo: inp.tcFut3,
        label: inp.p1.name + ' → ' + inp.p3.name,
        tagFrom: 'p1', tagTo: 'p3'
      });
    }
  }
  return pairs;
}

function paseCalcPair(pair, almacenaje) {
  const paseUSD = pair.to.price - pair.from.price;
  const tasaUSDbruta = pair.from.price > 0 ? ((pair.to.price / pair.from.price) - 1) * (365 / pair.days) * 100 : 0;
  const teaUSDbruta = pair.from.price > 0 ? (Math.pow(pair.to.price / pair.from.price, 365 / pair.days) - 1) * 100 : 0;
  const almTotal = almacenaje * (pair.days / 30);
  const paseNetoUSD = paseUSD - almTotal;
  const tasaUSDneta = pair.from.price > 0 ? (paseNetoUSD / pair.from.price) * (365 / pair.days) * 100 : 0;
  const precioNetoAdj = pair.from.price + paseNetoUSD;
  const teaUSDneta = pair.from.price > 0 ? (Math.pow(precioNetoAdj / pair.from.price, 365 / pair.days) - 1) * 100 : 0;
  
  const arsFrom = pair.from.price * pair.tcFrom;
  const arsTo = pair.to.price * pair.tcTo;
  const paseARS = arsTo - arsFrom;
  const tasaARS = arsFrom > 0 ? ((arsTo / arsFrom) - 1) * (365 / pair.days) * 100 : 0;
  const teaARS = arsFrom > 0 ? (Math.pow(arsTo / arsFrom, 365 / pair.days) - 1) * 100 : 0;
  
  const tasaTCimpl = pair.tcFrom > 0 ? ((pair.tcTo / pair.tcFrom) - 1) * (365 / pair.days) * 100 : 0;

  return { paseUSD, tasaUSDbruta, teaUSDbruta, tasaUSDneta, teaUSDneta, almTotal, paseARS, tasaARS, teaARS, tasaTCimpl, arsFrom, arsTo };
}

function paseCalcStrategies(pair, inp, calc) {
  const days = pair.days;
  const strats = [];

  // ═══ MODO USD: comparaciones en dólares puros ═══

  // BENCHMARK: Vender cercana hoy, cobro USD
  strats.push({
    name: '① Vender hoy (spot)',
    desc: `Vender ${pair.from.name} a ${pair.from.price.toFixed(1)} u$s. Cobro inmediato.`,
    resultUSD: pair.from.price,
    resultARS: pair.from.price * inp.tcSpot,
    riskTC: false,
    riskPrecio: false,
    isBase: true,
    category: 'usd',
    detail: `Precio: ${pair.from.price.toFixed(1)} u$s/tn. Sin costos adicionales. Sin riesgo.`
  });

  // ALT 1: Retener + vender futura (carry puro USD)
  const carryUSD = pair.to.price - pair.from.price;
  const almTotal = inp.almacenaje * (days / 30);
  const carryNeto = carryUSD - almTotal;
  const carryTNA = pair.from.price > 0 ? (carryNeto / pair.from.price) * (365 / days) * 100 : 0;
  strats.push({
    name: '② Retener + vender diferida',
    desc: `Guardar ${days}d, vender ${pair.to.name} a ${pair.to.price.toFixed(1)} u$s.`,
    resultUSD: pair.to.price - almTotal,
    resultARS: (pair.to.price - almTotal) * (pair.tcTo || inp.tcSpot),
    riskTC: false,
    riskPrecio: false, // precio ya fijado por futuro
    category: 'usd',
    detail: `Carry: +${carryUSD.toFixed(1)} u$s. Almacenaje: -${almTotal.toFixed(1)} u$s. Neto: ${carryNeto >= 0 ? '+' : ''}${carryNeto.toFixed(1)} u$s (${carryTNA.toFixed(1)}% TNA).`
  });

  // ALT 2: Vender hoy + caución USD
  if (inp.caucionUSD > 0) {
    const caucionGain = pair.from.price * (inp.caucionUSD / 100) * (days / 365);
    const resultCaucUSD = pair.from.price + caucionGain;
    strats.push({
      name: '③ Vender hoy + caución USD',
      desc: `Vender ${pair.from.name}, colocar USD en caución ${days}d al ${inp.caucionUSD}% TNA.`,
      resultUSD: resultCaucUSD,
      resultARS: resultCaucUSD * (pair.tcTo || inp.tcSpot),
      riskTC: false,
      riskPrecio: false,
      category: 'usd',
      detail: `Inversión: ${pair.from.price.toFixed(1)} u$s. Interés caución: +${caucionGain.toFixed(1)} u$s (${inp.caucionUSD}% TNA × ${days}d). Total: ${resultCaucUSD.toFixed(1)} u$s. ${resultCaucUSD > (pair.to.price - almTotal) ? '→ Conviene más que retener.' : '→ Retener paga mejor carry.'}`
    });
  }

  // ALT 3: Retener + crédito USD (necesito plata hoy)
  if (inp.creditoUSD > 0) {
    const creditoCosto = pair.from.price * (inp.creditoUSD / 100) * (days / 365);
    const resultCredUSD = pair.to.price - almTotal - creditoCosto;
    const spreadVsCarry = carryTNA - inp.creditoUSD;
    strats.push({
      name: '④ Crédito USD + vender diferida',
      desc: `Tomar crédito USD al ${inp.creditoUSD}% TNA, retener, vender ${pair.to.name}.`,
      resultUSD: resultCredUSD,
      resultARS: resultCredUSD * (pair.tcTo || inp.tcSpot),
      riskTC: false,
      riskPrecio: false,
      category: 'usd',
      detail: `Venta futura: ${pair.to.price.toFixed(1)} u$s. Costo crédito: -${creditoCosto.toFixed(1)} u$s. Almacenaje: -${almTotal.toFixed(1)} u$s. Neto: ${resultCredUSD.toFixed(1)} u$s. Spread carry vs crédito: ${spreadVsCarry >= 0 ? '+' : ''}${spreadVsCarry.toFixed(1)}pp. ${spreadVsCarry > 0 ? '→ El carry del mercado paga más que el crédito: conviene retener.' : '→ El crédito es más caro que el carry: conviene vender hoy.'}`
    });
  }

  // ═══ MODO ARS: comparaciones pesificadas ═══

  // ALT 5: Retener + crédito ARS + vender diferida (con cobertura TC)
  if (inp.creditoARS > 0 && pair.tcTo > 0 && inp.tcSpot > 0) {
    const pesosHoy = pair.from.price * inp.tcSpot; // pesos equivalentes que necesito
    const interesARS = pesosHoy * (inp.creditoARS / 100) * (days / 365);
    const cobroFuturoARS = pair.to.price * pair.tcTo; // cobro en ARS con TC futuro cubierto
    const netoARS = cobroFuturoARS - interesARS - (almTotal * pair.tcTo);
    const resultUSD_equiv = netoARS / inp.tcSpot; // equivalente USD al TC de hoy para comparar
    const tasaImplTC = inp.tcSpot > 0 ? ((pair.tcTo / inp.tcSpot) - 1) * (365 / days) * 100 : 0;
    strats.push({
      name: '⑤ Crédito ARS + diferida (TC cubierto)',
      desc: `Crédito ARS ${inp.creditoARS}% TNA. Vender ${pair.to.name} a TC futuro ${pair.tcTo}.`,
      resultUSD: resultUSD_equiv,
      resultARS: netoARS,
      riskTC: false, // TC cubierto con futuro ROFEX
      riskPrecio: false,
      category: 'ars',
      detail: `Crédito: $${pesosHoy.toLocaleString('es')} (equiv. a vender hoy). Interés: -$${interesARS.toLocaleString('es',{maximumFractionDigits:0})} (${inp.creditoARS}% TNA). Cobro futuro: ${pair.to.price.toFixed(1)} × ${pair.tcTo} = $${cobroFuturoARS.toLocaleString('es',{maximumFractionDigits:0})}. Alm: -$${(almTotal * pair.tcTo).toLocaleString('es',{maximumFractionDigits:0})}. Neto: $${netoARS.toLocaleString('es',{maximumFractionDigits:0})} (≈ ${resultUSD_equiv.toFixed(1)} u$s al TC spot). Tasa implícita TC: ${tasaImplTC.toFixed(1)}% TNA.`
    });
  }

  // ALT 6: Caución ARS + retener (con cobertura TC)
  if (inp.caucionARS > 0 && pair.tcTo > 0 && inp.tcSpot > 0) {
    const pesosHoy = pair.from.price * inp.tcSpot;
    const interesARS = pesosHoy * (inp.caucionARS / 100) * (days / 365);
    const cobroFuturoARS = pair.to.price * pair.tcTo;
    const netoARS = cobroFuturoARS - interesARS - (almTotal * pair.tcTo);
    const resultUSD_equiv = netoARS / inp.tcSpot;
    strats.push({
      name: '⑥ Caución ARS + diferida (TC cubierto)',
      desc: `Caución ARS ${inp.caucionARS}% TNA. Vender ${pair.to.name} a TC futuro ${pair.tcTo}.`,
      resultUSD: resultUSD_equiv,
      resultARS: netoARS,
      riskTC: false,
      riskPrecio: false,
      category: 'ars',
      detail: `Caución: $${pesosHoy.toLocaleString('es')} al ${inp.caucionARS}% TNA. Interés: -$${interesARS.toLocaleString('es',{maximumFractionDigits:0})}. Cobro: $${cobroFuturoARS.toLocaleString('es',{maximumFractionDigits:0})}. Neto: $${netoARS.toLocaleString('es',{maximumFractionDigits:0})} (≈ ${resultUSD_equiv.toFixed(1)} u$s).`
    });
  }

  // ALT 7: Vender forward + descontar cheques
  if (inp.lecap > 0 && pair.tcTo > 0 && inp.tcSpot > 0) {
    const cobroFuturoARS = pair.to.price * pair.tcTo;
    const descuento = 1 + (inp.lecap / 100) * (days / 365);
    const pesosHoy = cobroFuturoARS / descuento;
    const usdHoy = pesosHoy / inp.tcSpot;
    const costoDesc = cobroFuturoARS - pesosHoy;
    strats.push({
      name: '⑦ Forward + descuento cheques',
      desc: `Vender forward ${pair.to.name}, descontar cheques al ${inp.lecap}% TNA.`,
      resultUSD: usdHoy,
      resultARS: pesosHoy,
      riskTC: false, // TC fijado en el forward
      riskPrecio: false,
      category: 'ars',
      detail: `Venta forward: ${pair.to.price.toFixed(1)} u$s × TC ${pair.tcTo} = $${cobroFuturoARS.toLocaleString('es',{maximumFractionDigits:0})} en ${days}d. Descuento al ${inp.lecap}% TNA: -$${costoDesc.toLocaleString('es',{maximumFractionDigits:0})}. Cobro hoy: $${pesosHoy.toLocaleString('es',{maximumFractionDigits:0})} (≈ ${usdHoy.toFixed(1)} u$s al TC spot).`
    });
  }

  // ALT 8: Vender hoy ARS + LECAP (carry en pesos, con breakeven de deva)
  if (inp.lecap > 0 && pair.tcTo > 0 && inp.tcSpot > 0) {
    const pesosHoy = pair.from.price * inp.tcSpot;
    const pesosFinal = pesosHoy * (1 + (inp.lecap / 100) * (days / 365));
    const usdAlFinal = pesosFinal / pair.tcTo;
    const beTC = pesosFinal / pair.from.price; // TC al que empata con vender hoy USD
    const beDeva = ((beTC / inp.tcSpot) - 1) * 100;
    strats.push({
      name: '⑧ Vender hoy ARS + LECAP',
      desc: `Vender ${pair.from.name} en ARS, colocar en LECAP/PF ${inp.lecap}% TNA.`,
      resultUSD: usdAlFinal,
      resultARS: pesosFinal,
      riskTC: true, // NO cubierto
      riskPrecio: false,
      category: 'ars_riesgo',
      detail: `Venta: $${pesosHoy.toLocaleString('es',{maximumFractionDigits:0})}. LECAP ${days}d: $${pesosFinal.toLocaleString('es',{maximumFractionDigits:0})}. Al TC futuro ${pair.tcTo}: ≈ ${usdAlFinal.toFixed(1)} u$s. ⚠️ RIESGO TC: si el dólar sube más de ${beDeva.toFixed(0)}% (TC > ${beTC.toFixed(0)}), perdés vs vender en USD. Breakeven: TC ${beTC.toFixed(0)}.`
    });
  }

  // Sort by resultUSD descending
  strats.sort((a, b) => b.resultUSD - a.resultUSD);
  const baseVal = strats.find(s => s.isBase)?.resultUSD || strats[strats.length - 1].resultUSD;
  strats.forEach(s => {
    s.delta = s.resultUSD - baseVal;
    s.deltaARS = s.resultARS - (pair.from.price * inp.tcSpot);
  });

  return strats;
}

function paseCalc() {
  const inp = paseGetInputs();
  const pairs = paseBuildPairs(inp);
  if (pairs.length === 0) {
    const tbody = document.getElementById('pase-matrix-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-3); padding:20px; font-size:13px;">⚠ Completá las fechas de vencimiento para calcular los pases</td></tr>';
    return;
  }

  const tbody = document.getElementById('pase-matrix-body');
  let matrixHTML = '';
  const calcs = [];

  pairs.forEach((pair, i) => {
    const c = paseCalcPair(pair, inp.almacenaje);
    calcs.push({ pair, calc: c, idx: i });
    
    // Comparar contra crédito USD para la tabla principal
    const diffVsCredito = c.tasaUSDneta - inp.creditoUSD;
    const semClass = diffVsCredito >= 0 ? 'win' : 'lose';
    const semSign = diffVsCredito >= 0 ? '+' : '';

    matrixHTML += `<tr>
      <td>
        <span class="pase-pos-tag ${pair.tagFrom}" style="font-size:9px; padding:2px 7px; margin:0;">${pair.tagFrom.toUpperCase()}</span>
        →
        <span class="pase-pos-tag ${pair.tagTo}" style="font-size:9px; padding:2px 7px; margin:0;">${pair.tagTo.toUpperCase()}</span>
        <br><span style="font-size:11px; color:var(--text-3);">${pair.label}</span>
      </td>
      <td style="font-family:var(--mono); font-weight:600;">${pair.days}</td>
      <td style="font-family:var(--mono); font-weight:600; color:${c.paseUSD >= 0 ? 'var(--green)' : 'var(--red)'};">${c.paseUSD >= 0 ? '+' : ''}${c.paseUSD.toFixed(1)}</td>
      <td>
        <span class="pase-type-label">TNA</span>
        <span class="pase-tasa-usd" style="color:var(--green);">${c.tasaUSDbruta.toFixed(1)}%</span>
        <div class="pase-pase-val"><span class="pase-type-label" style="display:inline;">TEA</span> ${c.teaUSDbruta.toFixed(1)}%</div>
      </td>
      <td>
        <span class="pase-type-label">TNA</span>
        <span class="pase-tasa-usd" style="color:${c.tasaUSDneta >= 0 ? 'var(--green)' : 'var(--red)'};">${c.tasaUSDneta.toFixed(1)}%</span>
        <div class="pase-pase-val"><span class="pase-type-label" style="display:inline;">TEA</span> ${c.teaUSDneta.toFixed(1)}%</div>
        <div class="pase-pase-val">Alm: -${c.almTotal.toFixed(1)} u$s</div>
      </td>
      <td>
        <span class="pase-type-label">TNA</span>
        <span class="pase-tasa-usd" style="color:var(--es-gold);">${c.tasaARS.toFixed(1)}%</span>
        <div class="pase-pase-val"><span class="pase-type-label" style="display:inline;">TEA</span> ${c.teaARS.toFixed(1)}%</div>
      </td>
      <td><span class="pase-sem ${semClass}">${semSign}${diffVsCredito.toFixed(1)}pp</span></td>
    </tr>`;
  });
  tbody.innerHTML = matrixHTML;

  const readGrid = document.getElementById('pase-reading-grid');
  let bestUSD = calcs[0], worstUSD = calcs[0], bestARS = calcs[0];
  calcs.forEach(c => {
    if (c.calc.tasaUSDneta > bestUSD.calc.tasaUSDneta) bestUSD = c;
    if (c.calc.tasaUSDneta < worstUSD.calc.tasaUSDneta) worstUSD = c;
    if (c.calc.tasaARS > bestARS.calc.tasaARS) bestARS = c;
  });

  readGrid.innerHTML = `
    <div class="pase-reading-card">
      <div class="pase-reading-lbl">Mejor pase USD</div>
      <div class="pase-reading-val" style="color:var(--green);">${bestUSD.pair.label}</div>
      <div class="pase-reading-sub">TNA ${bestUSD.calc.tasaUSDbruta.toFixed(1)}% bruto — ${bestUSD.calc.tasaUSDneta.toFixed(1)}% neto</div>
    </div>
    <div class="pase-reading-card warn">
      <div class="pase-reading-lbl">Peor pase USD (neto)</div>
      <div class="pase-reading-val" style="color:var(--red);">${worstUSD.pair.label}</div>
      <div class="pase-reading-sub">TNA ${worstUSD.calc.tasaUSDneta.toFixed(1)}% neto${worstUSD.calc.tasaUSDneta < 0 ? ' (almacenaje lo come)' : ''}</div>
    </div>
    <div class="pase-reading-card gold">
      <div class="pase-reading-lbl">Mejor pase ARS</div>
      <div class="pase-reading-val" style="color:var(--es-gold);">${bestARS.pair.label}</div>
      <div class="pase-reading-sub">TNA ${bestARS.calc.tasaARS.toFixed(1)}% — ${bestARS.calc.tasaARS > inp.lecap ? 'supera' : 'no supera'} LECAP por ${Math.abs(bestARS.calc.tasaARS - inp.lecap).toFixed(1)}pp</div>
    </div>
  `;

  if (paseSelectedCarryPair >= pairs.length) paseSelectedCarryPair = 0;
  const carryTabsEl = document.getElementById('pase-carry-tabs');
  carryTabsEl.innerHTML = pairs.map((pair, i) =>
    `<button class="pase-strat-tab ${i === paseSelectedCarryPair ? 'active' : ''}" onclick="paseSelectCarryPair(${i})">${pair.label} (${pair.days}d)</button>`
  ).join('');

  paseRenderCarry(pairs, calcs, inp);

  if (paseSelectedPair >= pairs.length) paseSelectedPair = 0;
  const tabsEl = document.getElementById('pase-strat-tabs');
  tabsEl.innerHTML = pairs.map((pair, i) =>
    `<button class="pase-strat-tab ${i === paseSelectedPair ? 'active' : ''}" onclick="paseSelectPair(${i})">${pair.label} (${pair.days}d)</button>`
  ).join('');

  paseRenderStrategies(pairs, calcs, inp);
}

function paseSelectCarryPair(idx) {
  paseSelectedCarryPair = idx;
  paseCalc();
}

function paseSelectPair(idx) {
  paseSelectedPair = idx;
  paseCalc();
}

function paseRenderCarry(pairs, calcs, inp) {
  const pair = pairs[paseSelectedCarryPair];
  const calc = calcs[paseSelectedCarryPair].calc;
  const days = pair.days;

  const carryNetoUSD = calc.tasaUSDneta - inp.creditoUSD;
  const carryNetoARS = calc.tasaARS - inp.creditoARS;
  
  const cardsEl = document.getElementById('pase-carry-cards');
  cardsEl.innerHTML = `
    <div class="pase-reading-card ${carryNetoUSD >= 0 ? '' : 'warn'}">
      <div class="pase-reading-lbl">Carry Neto USD (TNA)</div>
      <div class="pase-reading-val" style="color:${carryNetoUSD >= 0 ? 'var(--green)' : 'var(--red)'}">${carryNetoUSD >= 0 ? '+' : ''}${carryNetoUSD.toFixed(1)}pp</div>
      <div class="pase-reading-sub">Pase ${calc.tasaUSDneta.toFixed(1)}% vs Crédito USD ${inp.creditoUSD.toFixed(1)}%</div>
    </div>
    <div class="pase-reading-card ${carryNetoARS >= 0 ? '' : 'warn'}">
      <div class="pase-reading-lbl">Carry Neto ARS (TNA)</div>
      <div class="pase-reading-val" style="color:${carryNetoARS >= 0 ? 'var(--green)' : 'var(--red)'}">${carryNetoARS >= 0 ? '+' : ''}${carryNetoARS.toFixed(1)}pp</div>
      <div class="pase-reading-sub">Pase ${calc.tasaARS.toFixed(1)}% vs Crédito ARS ${inp.creditoARS.toFixed(1)}%</div>
    </div>
    <div class="pase-reading-card gold">
      <div class="pase-reading-lbl">Devaluación Implícita</div>
      <div class="pase-reading-val" style="color:var(--es-gold);">${calc.tasaTCimpl.toFixed(1)}%</div>
      <div class="pase-reading-sub">TNA esperada en ROFEX</div>
    </div>
  `;

  const decEl = document.getElementById('pase-carry-decision');
  const conviene = carryNetoUSD > 0 || carryNetoARS > 0;
  
  if (conviene) {
    let text = carryNetoUSD > carryNetoARS 
      ? `Financiate en USD al ${inp.creditoUSD.toFixed(1)}% y ganás ${carryNetoUSD.toFixed(1)}pp de margen.`
      : `Financiate en ARS al ${inp.creditoARS.toFixed(1)}% y ganás ${carryNetoARS.toFixed(1)}pp de margen.`;

    decEl.innerHTML = `<div class="pase-carry-decision hold">
      <div class="pase-carry-dot"></div>
      <div>
        <div class="pase-carry-title">Conviene tomar crédito y retener</div>
        <div class="pase-carry-detail">${text} Pedí prestado, vendé en ${pair.to.name}.</div>
      </div>
    </div>`;
  } else {
    decEl.innerHTML = `<div class="pase-carry-decision sell">
      <div class="pase-carry-dot"></div>
      <div>
        <div class="pase-carry-title">Conviene vender hoy</div>
        <div class="pase-carry-detail">Tanto el crédito en USD como en ARS son más caros que la tasa que paga el mercado por guardar. Vendé ${pair.from.name} hoy y evitá costo financiero.</div>
      </div>
    </div>`;
  }
}

function paseRenderStrategies(pairs, calcs, inp) {
  const pair = pairs[paseSelectedPair];
  const calc = calcs[paseSelectedPair].calc;
  const strats = paseCalcStrategies(pair, inp, calc);

  const best = strats[0];
  const worst = strats[strats.length - 1];
  const spreadMejorPeor = best.resultUSD - worst.resultUSD;
  
  const baseStrat = strats.find(s => s.isBase) || strats[1]; 
  const deltaVsBase = best.resultUSD - baseStrat.resultUSD;

  const summaryEl = document.getElementById('pase-strat-summary');
  
  summaryEl.innerHTML = `
    <div style="background: var(--es-green-light); border: 2px solid var(--es-green); border-radius: 10px; padding: 20px; display: flex; justify-content: space-between; align-items: center; box-shadow: var(--shadow-lg);">
      <div>
        <div style="font-size: 12px; font-weight: 700; color: var(--es-green-dark); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Decisión Óptima Financiera</div>
        <div style="font-size: 22px; font-weight: 700; color: var(--text); margin-bottom: 4px;">${best.name}</div>
        <div style="font-size: 13px; color: var(--text-2);">${best.desc}</div>
        ${best.riskTC ? '<div style="margin-top:6px;background:#fff3cd;border:1px solid #ffc107;border-radius:5px;padding:4px 10px;font-size:11px;">⚠️ Esta alternativa tiene exposición cambiaria</div>' : ''}
      </div>
      <div style="text-align: right; background: #fff; padding: 12px 20px; border-radius: 8px; border: 1px solid rgba(26,107,60,.2);">
        <div style="font-size: 11px; color: var(--text-3); font-weight: 600; margin-bottom: 2px;">VS VENDER HOY</div>
        <div style="font-size: 24px; font-weight: 700; color: ${deltaVsBase >= 0 ? 'var(--green)' : 'var(--red)'}; font-family: var(--mono);">${deltaVsBase >= 0 ? '+' : ''}${deltaVsBase.toFixed(2)} u$s/tn</div>
      </div>
    </div>
  `;

  const rowsEl = document.getElementById('pase-strat-rows');
  rowsEl.innerHTML = strats.map((s, i) => {
    const isBest = i === 0;
    const isBase = s.isBase;
    const diffToBest = best.resultUSD - s.resultUSD;
    
    const catLabel = s.category === 'usd' ? '💵 USD' : s.category === 'ars' ? '🇦🇷 ARS' : '⚠️ ARS riesgo';
    const catColor = s.category === 'usd' ? 'var(--green)' : s.category === 'ars' ? 'var(--blue)' : 'var(--amber)';
    
    const barHtml = isBest 
      ? `<div style="color:var(--green); font-weight:700; font-size:12px;">🏆 Máximo retorno</div>`
      : `<div style="display:flex; align-items:center; gap:8px;">
           <div style="flex:1; height:6px; background:#fde8e8; border-radius:3px; overflow:hidden; display:flex; justify-content:flex-end;">
             <div style="width:${Math.min((diffToBest/(spreadMejorPeor||1))*100, 100)}%; background:var(--red); height:100%;"></div>
           </div>
           <span style="color:var(--red); font-size:11px; font-family:var(--mono); font-weight:600; min-width:45px; text-align:right;">-${diffToBest.toFixed(2)} u$s</span>
         </div>`;

    return `
    <div style="border-bottom: 1px solid var(--border); background: ${isBest ? '#fff' : 'transparent'}; ${isBest ? 'border-left: 4px solid var(--green); border-radius: 0 8px 8px 0;' : ''}">
      <div style="display:grid; grid-template-columns: 2fr 0.5fr 1fr 1.5fr; gap: 12px; align-items: center; padding: 14px 16px;">
        <div>
          <div style="font-weight:700; font-size:13px; color: ${isBest ? 'var(--text)' : 'var(--text-2)'};">${s.name} ${isBase ? '<span style="font-size:9px; background:var(--bg-input); padding:2px 6px; border-radius:4px; margin-left:6px; color:var(--text-3);">BENCHMARK</span>' : ''} ${s.riskTC ? '<span style="font-size:9px; background:#fff3cd; padding:2px 6px; border-radius:4px; margin-left:4px; color:var(--amber);">⚠ TC</span>' : ''}</div>
          <div style="font-size:11px; color:var(--text-3); margin-top:2px;">${s.desc}</div>
        </div>
        <div style="text-align:center;"><span style="font-size:10px; color:${catColor}; font-weight:700;">${catLabel}</span></div>
        <div style="text-align:right;">
          <span style="font-family:var(--mono); font-weight:700; font-size:16px;">${s.resultUSD.toFixed(1)}</span> <span style="font-size:10px; color:var(--text-3);">u$s/tn</span>
          ${s.resultARS > 0 ? '<div style="font-size:10px; color:var(--text-3); font-family:var(--mono);">$' + s.resultARS.toLocaleString('es',{maximumFractionDigits:0}) + '</div>' : ''}
        </div>
        <div>${barHtml}</div>
      </div>
      ${s.detail ? '<div style="padding:4px 16px 12px 20px; font-size:11px; color:var(--text-2); line-height:1.6; border-top:1px dashed var(--border); margin:0 16px;">' + s.detail + '</div>' : ''}
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
