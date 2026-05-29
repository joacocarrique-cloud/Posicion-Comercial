// ═══════════════════════════════════════════════════
// ─── ASISTENTE DE COBERTURAS ───
// ═══════════════════════════════════════════════════

function asstParseCSV(t){const l=t.trim().split('\n');if(l.length<2)return[];const h=l[0].split(',').map(s=>s.trim());return l.slice(1).map(r=>{const v=r.split(',');const o={};h.forEach((k,i)=>{const s=(v[i]||'').trim();o[k]=isNaN(s)||s===''?s:parseFloat(s);});return o;});}

// Black-76
const asstN=x=>0.5*(1+asstErf(x/Math.sqrt(2)));
const asstNpdf=x=>Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI);
function asstErf(x){const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911;const s=x<0?-1:1;x=Math.abs(x);const t=1/(1+p*x);return s*(1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x));}
function asstB76(F,K,T,r,sig,tp='put'){if(T<=0||sig<=0)return Math.max(0,tp==='put'?K-F:F-K);const sq=Math.sqrt(T),d1=(Math.log(F/K)+.5*sig*sig*T)/(sig*sq),d2=d1-sig*sq,dc=Math.exp(-r*T);return tp==='call'?dc*(F*asstN(d1)-K*asstN(d2)):dc*(K*asstN(-d2)-F*asstN(-d1));}
function asstIV(price,F,K,T,r=.05,tp='put'){if(T<=0||price<=0)return NaN;let s=.25;for(let i=0;i<50;i++){const bp=asstB76(F,K,T,r,s,tp),sq=Math.sqrt(T),d1=(Math.log(F/K)+.5*s*s*T)/(s*sq),v=F*Math.exp(-r*T)*asstNpdf(d1)*sq;if(v<1e-10)return NaN;s-=(bp-price)/v;if(s<=.001)s=.001;if(Math.abs(bp-price)<.001)break;}return(s>.01&&s<3)?s:NaN;}
function asstGreeks(F,K,T,r,sig,tp='put'){if(T<=0||sig<=0)return{delta:0,gamma:0,theta:0,vega:0};const sq=Math.sqrt(T),d1=(Math.log(F/K)+.5*sig*sig*T)/(sig*sq),dc=Math.exp(-r*T);return{delta:+(tp==='call'?dc*asstN(d1):-dc*asstN(-d1)).toFixed(4),gamma:+(dc*asstNpdf(d1)/(F*sig*sq)).toFixed(6),theta:+(-F*dc*asstNpdf(d1)*sig/(2*sq)/365).toFixed(4),vega:+(F*dc*asstNpdf(d1)*sq/100).toFixed(4)};}

// MATBA expiry
function asstBizDay(d){if(d.getDay()===0||d.getDay()===6)return false;return!ASST_FER.has(d.toISOString().slice(0,10));}
function asstExpiry(pos){const ms=pos.slice(0,3),yr=2000+parseInt(pos.slice(3)),mn=ASST_MES[ms];if(!mn)return null;let mp=mn-1,yp=yr;if(mp===0){mp=12;yp--;}const ld=new Date(yp,mp,0);let ru=0,d=new Date(ld);while(ru<5){if(asstBizDay(d))ru++;if(ru<5)d.setDate(d.getDate()-1);}d.setDate(d.getDate()-1);while(!asstBizDay(d))d.setDate(d.getDate()-1);return d;}
function asstDays(a,b){return Math.round((b-a)/864e5);}

function toggleAsistente(){ /* No longer separate module */ }

// Sync Asistente from the main builder's current state
function asstSyncFromBuilder() {
  if (!sheetData) return;
  const crop = document.getElementById('mkt-crop-select').value;
  const pos = document.getElementById('mkt-pos-select').value;
  if (!crop || !pos) return;

  // Sync crop selector
  const asstCropSel = document.getElementById('asst-crop');
  if (asstCropSel) {
    asstCropSel.value = crop;
  }

  // Sync position: update dropdown with A3 positions for this crop
  const asstPosSel = document.getElementById('asst-pos');
  if (asstPosSel) {
    const positions = (sheetData.futuros[crop] || []).map(f => f.pos);
    asstPosSel.innerHTML = positions.map(p => `<option value="${p}">${p}</option>`).join('');
    if (positions.includes(pos)) asstPosSel.value = pos;
  }

  // Sync forward price
  const futData = (sheetData.futuros[crop] || []).find(f => f.pos === pos);
  if (futData && futData.precio > 0) {
    document.getElementById('asst-fwd').value = futData.precio;
  }

  // Update vencimiento display
  asstUpdateVto();

  // Auto-fill chain from A3 options data
  const cropOpts = sheetData.opciones[crop];
  if (cropOpts && cropOpts[pos]) {
    const opts = cropOpts[pos];
    // Collect unique strikes
    const strikeMap = {};
    opts.puts.forEach(p => {
      if (!strikeMap[p.strike]) strikeMap[p.strike] = { k: p.strike, pp: 0, pc: 0 };
      strikeMap[p.strike].pp = p.prima;
    });
    opts.calls.forEach(c => {
      if (!strikeMap[c.strike]) strikeMap[c.strike] = { k: c.strike, pp: 0, pc: 0 };
      strikeMap[c.strike].pc = c.prima;
    });
    const sorted = Object.values(strikeMap).sort((a, b) => b.k - a.k);
    if (sorted.length > 0) {
      // Filter: only strikes within 12% of forward, max 8 strikes, prioritize ATM
      const fwdPrice = futData ? futData.precio : sorted[Math.floor(sorted.length/2)].k;
      let filtered = sorted.filter(s => {
        const dist = Math.abs(s.k - fwdPrice) / fwdPrice;
        return dist <= 0.12 && (s.pp > 0 || s.pc > 0);
      });
      // If still too many, keep the 8 closest to ATM
      if (filtered.length > 8) {
        filtered.sort((a, b) => Math.abs(a.k - fwdPrice) - Math.abs(b.k - fwdPrice));
        filtered = filtered.slice(0, 8).sort((a, b) => b.k - a.k);
      }
      asstChainRows = filtered.length > 0 ? filtered : sorted.slice(0, 8);
      asstRenderChain();
      const syncNote = document.getElementById('asst-sync-note');
      if (syncNote) syncNote.innerHTML = `<span style="font-size:11px;color:var(--es-green);">✅ ${asstChainRows.length} strikes cerca del ATM cargados de A3 · ${crop.toUpperCase()} ${pos} · Futuro: ${fwdPrice} u$s</span>`;
    }
  } else {
    // No options available - show note
    if (asstChainRows.length === 0) {
      asstChainRows = [];
      asstRenderChain();
    }
    const syncNote = document.getElementById('asst-sync-note');
    if (syncNote) syncNote.innerHTML = `<span style="font-size:11px;color:var(--amber);">⚠️ A3 no tiene opciones para ${crop.toUpperCase()} ${pos} — cargá strikes manualmente</span>`;
  }
}

// Auto-load Drive data on init
async function asstInit(){
  asstUpdatePos();
  await asstLoadDrive();
}

async function asstLoadDrive(){
  const bar=document.getElementById('asst-sync-bar');
  bar.style.display='block';bar.style.background='#dbeafe';bar.style.borderColor='#2563eb';
  bar.innerHTML='⏳ Sincronizando datos históricos desde Google Drive...';
  const loaders=[
    {key:'vi_percentiles',fn:r=>{ASST_VI_PERC=r.map(x=>({cultivo:x.cultivo,mes:x.mes_cal,p10:x.vi_p10,p25:x.vi_p25,p50:x.vi_p50,p75:x.vi_p75,p90:x.vi_p90,mean:x.vi_mean}));}},
    {key:'skew_historico',fn:r=>{ASST_SKEW=r.map(x=>({cultivo:x.cultivo,bucket:x.bucket,mMin:x.moneyness_min,mMax:x.moneyness_max,viMean:x.vi_mean,viMedian:x.vi_median,viP25:x.vi_p25,viP75:x.vi_p75}));}},
    {key:'serie_vi_diaria',fn:r=>{ASST_SERIE=r;}},
    {key:'vi_vs_hv',fn:r=>{ASST_VIVHV=r;}},
    {key:'futuros_posicion',fn:r=>{ASST_FUTPOS=r;}},
  ];
  let ok=0,errs=[];
  for(const l of loaders){try{const r=await fetch(ASST_DRIVE[l.key]);const t=await r.text();const parsed=Papa.parse(t.trim(),{header:true,dynamicTyping:true,skipEmptyLines:true});l.fn(parsed.data);ok++;}catch(e){errs.push(l.key);}}
  if(errs.length===0){
    bar.style.background='var(--es-green-light)';bar.style.borderColor='var(--es-green)';
    bar.innerHTML=`✅ Datos sincronizados — ${ASST_VI_PERC.length} percentiles, ${ASST_SKEW.length} skew, ${ASST_SERIE.length} días VI, ${ASST_VIVHV.length} VI/HV, ${ASST_FUTPOS.length} futuros/posición`;
  } else {
    bar.style.background='#fff3cd';bar.style.borderColor='#ffc107';
    bar.innerHTML=`⚠️ Error en: ${errs.join(', ')}`;
  }
  asstShowContext();
}
function asstShowContext(){
  const el=document.getElementById('asst-vi-context');if(!el)return;
  const latest={};for(const r of ASST_VIVHV)latest[r.cultivo]=r;
  el.innerHTML=Object.entries(latest).map(([c,r])=>{
    const ratio=r.hv_20d>0?(r.vi_atm/r.hv_20d).toFixed(2):'—';
    const lbl=ratio<0.8?'🟢 Baratas':ratio>1.5?'🔴 Caras':'🟡 Normal';
    return `<span style="margin-right:16px;">${c.toUpperCase()}: VI ${r.vi_atm}% · HV ${r.hv_20d}% · <strong>${lbl}</strong></span>`;
  }).join('');
}

// UI helpers
function asstSetMode(n){asstModeNum=n;document.getElementById('asst-mode1').style.borderColor=n===1?'var(--es-green)':'var(--border)';document.getElementById('asst-mode2').style.borderColor=n===2?'var(--es-green)':'var(--border)';document.getElementById('asst-vision-wrap').style.display=n===1?'block':'none';document.getElementById('asst-tol-wrap').style.display=n===1?'':'none';document.getElementById('asst-btn-label').textContent=n===1?'Generar recomendaciones':'Analizar cadena';}
function asstVision(el){document.querySelectorAll('#asst-vision-chips button').forEach(b=>{b.className='btn btn-outline';b.style.background='';b.style.color='';});el.className='btn';el.style.background='var(--es-green)';el.style.color='#fff';asstVisionSel=el.dataset.v;}
function asstUpdatePos(){const c=document.getElementById('asst-crop').value,sel=document.getElementById('asst-pos');sel.innerHTML=(ASST_POS[c]||[]).map(p=>`<option value="${p}">${p}</option>`).join('');document.getElementById('asst-fwd').value=ASST_FWD[c]||300;asstUpdateVto();}
function asstUpdateVto(){const p=document.getElementById('asst-pos').value,exp=asstExpiry(p),dias=exp?asstDays(new Date(),exp):0;document.getElementById('asst-vto-display').innerHTML=exp?`<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:11px;font-family:var(--mono);">📅 Vto: <strong style="color:var(--es-green);">${exp.getDate().toString().padStart(2,'0')}/${ASST_MNAMES[exp.getMonth()+1]}/${exp.getFullYear()}</strong> · ${dias}d</div>`:'';}

function asstRenderChain(){
  const c=document.getElementById('asst-chain-inputs');
  c.innerHTML=`<div style="display:grid;grid-template-columns:80px 90px 90px 40px;gap:6px;margin-bottom:6px;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.3px;"><span>Strike</span><span>Prima Put</span><span>Prima Call</span><span></span></div>`
    +asstChainRows.map((r,i)=>`<div style="display:grid;grid-template-columns:80px 90px 90px 40px;gap:6px;align-items:center;"><input type="number" value="${r.k}" onchange="asstChainRows[${i}].k=+this.value" style="font-family:var(--mono);font-size:13px;padding:6px;border:1px solid var(--border);border-radius:5px;background:var(--bg-input);"><input type="number" step="0.1" value="${r.pp||''}" onchange="asstChainRows[${i}].pp=+this.value" style="font-family:var(--mono);font-size:13px;padding:6px;border:1px solid var(--border);border-radius:5px;background:var(--bg-input);" placeholder="—"><input type="number" step="0.1" value="${r.pc||''}" onchange="asstChainRows[${i}].pc=+this.value" style="font-family:var(--mono);font-size:13px;padding:6px;border:1px solid var(--border);border-radius:5px;background:var(--bg-input);" placeholder="—"><button onclick="asstChainRows.splice(${i},1);asstRenderChain();" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--red);">✕</button></div>`).join('');
}
function asstAddRow(){asstChainRows.push({k:0,pp:'',pc:''});asstRenderChain();}
function asstLoadSample(){const F=parseFloat(document.getElementById('asst-fwd').value)||300;asstChainRows=[{k:Math.round(F*1.08),pp:.5,pc:Math.round(F*.04*10)/10},{k:Math.round(F*1.04),pp:1.2,pc:Math.round(F*.025*10)/10},{k:Math.round(F),pp:Math.round(F*.015*10)/10,pc:Math.round(F*.015*10)/10},{k:Math.round(F*.97),pp:Math.round(F*.01*10)/10,pc:Math.round(F*.05*10)/10},{k:Math.round(F*.93),pp:Math.round(F*.006*10)/10,pc:0},{k:Math.round(F*.88),pp:Math.round(F*.003*10)/10,pc:0}];asstRenderChain();}

function asstGetChain(){const ch=[];asstChainRows.forEach(r=>{if(r.k>0&&r.pp>0)ch.push({strike:r.k,prima:r.pp,type:'put'});if(r.k>0&&r.pc>0)ch.push({strike:r.k,prima:r.pc,type:'call'});});return ch;}

// Analysis
function asstAnalyze(chain,F,T,crop){
  const r=.05,mes=new Date().getMonth()+1;
  const perc=ASST_VI_PERC.find(v=>v.cultivo===crop&&v.mes===mes);
  const out=chain.map(o=>{
    const vi=asstIV(o.prima,F,o.strike,T,r,o.type);if(isNaN(vi))return null;
    const viP=vi*100,g=asstGreeks(F,o.strike,T,r,vi,o.type),mn=(o.strike/F-1)*100;
    const sk=ASST_SKEW.find(s=>s.cultivo===crop&&mn>=s.mMin&&mn<s.mMax);
    const cpd=Math.abs(g.delta)>.01?o.prima/Math.abs(g.delta):Infinity;
    let val='neutral';if(sk&&!isNaN(viP)){if(viP>sk.viP75)val='expensive';else if(viP<sk.viP25)val='cheap';else if(viP<sk.viMedian&&cpd<o.prima*.6)val='cheap';}
    return{...o,vi:viP,greeks:g,moneyness:mn,costPerDelta:cpd,floor:o.type==='put'?o.strike-o.prima:null,value:val};
  }).filter(Boolean);
  // VI plana → serie ilíquida con primas de ajuste modeladas a una sola vol.
  // No hay sonrisa real, así que las señales de valor relativo (barato/caro) no son confiables.
  const vis=out.map(o=>o.vi);
  if(vis.length>1 && (Math.max(...vis)-Math.min(...vis))<0.5){
    out.forEach(o=>{o.value='neutral';o.viFlat=true;});
  }
  return out;
}

function asstGenStrategies(analyzed,F,T,vision,tol,crop,vol){
  const r=.05,mes=new Date().getMonth()+1,weather=mes>=6&&mes<=8;
  const perc=ASST_VI_PERC.find(v=>v.cultivo===crop&&v.mes===mes);
  const puts=analyzed.filter(o=>o.type==='put').sort((a,b)=>b.strike-a.strike);
  const calls=analyzed.filter(o=>o.type==='call').sort((a,b)=>a.strike-b.strike);
  if(!puts.length)return[];
  const strats=[];
  const gk=(F,K,T,r,vi,tp)=>asstGreeks(F,K,T,r,vi/100,tp);
  const netG=(legs)=>{let d=0,g=0,t=0,v=0;legs.forEach(l=>{const m=l.dir==='buy'?1:-1;const gr=gk(F,l.strike,T,r,l.vi,l.type.toLowerCase());d+=gr.delta*m;g+=gr.gamma*m;t+=gr.theta*m;v+=gr.vega*m;});return{delta:+d.toFixed(4),gamma:+g.toFixed(6),theta:+t.toFixed(4),vega:+v.toFixed(4)};};

  // ═══ MONEYNESS FILTERS ═══
  // Puts para comprar: ATM o OTM (strike ≤ futuro +2%)
  // Calls para comprar participación: ATM o OTM (strike ≥ futuro -2%)
  // Calls para vender techo: OTM (strike > futuro +1%) — ya filtrado en collar/gaviota
  const hedgePuts = puts.filter(p => p.strike <= F * 1.02);
  const upsideCalls = calls.filter(c => c.strike >= F * 0.98);

  // VI plana en la cadena (serie ilíquida, primas de ajuste modeladas a una sola vol):
  // el skew no es confiable, así que las reglas de valor relativo no deben puntuar.
  const _vis = analyzed.map(o => o.vi);
  const viFlat = _vis.length > 1 && (Math.max(..._vis) - Math.min(..._vis)) < 0.5;

  // Ventana de suba mínima útil para considerar una estructura "cobertura" y no una
  // venta de futuro disfrazada. Si el techo está pegado al precio de venta, no sirve.
  const MIN_UPSIDE = Math.max(F * 0.03, 5);

  // ─── 1. PUT SECO (best value) ───
  for(const p of hedgePuts.slice(0,3)){
    const g=gk(F,p.strike,T,r,p.vi,'put');
    const cpd=Math.abs(g.delta)>.01?p.prima/Math.abs(g.delta):999;
    strats.push({name:`Put Seco ${p.strike}`,structure:`Compra Put ${p.strike}`,tipo:'put_seco',
      legs:[{dir:'buy',type:'Put',strike:p.strike,prima:p.prima,vi:p.vi}],
      cost:p.prima,floor:p.strike-p.prima,maxProt:'∞',ceiling:null,greeks:g,
      prob:Math.round(Math.abs(g.delta)*100),cpd,
      narrative:`Comprás un seguro de precio con piso en ${(p.strike-p.prima).toFixed(1)} u$s (strike ${p.strike} menos la prima de ${p.prima.toFixed(1)}). Si el mercado sube, participás sin límite. Si baja, estás protegido. El costo es la prima: ${p.prima.toFixed(1)} u$s/tn (${(p.prima/F*100).toFixed(1)}% del futuro). Es la estrategia más simple y segura para un productor.`,
    });
  }

  // ─── 2. PUT SPREADS ───
  for(let i=0;i<hedgePuts.length;i++)for(let j=i+1;j<hedgePuts.length;j++){
    const b=hedgePuts[i],s=hedgePuts[j];if(b.strike-s.strike<5)continue;
    const cost=b.prima-s.prima;const legs=[{dir:'buy',type:'Put',strike:b.strike,prima:b.prima,vi:b.vi},{dir:'sell',type:'Put',strike:s.strike,prima:s.prima,vi:s.vi}];
    const g=netG(legs);const spread=b.strike-s.strike;
    const financ=((s.prima/b.prima)*100).toFixed(0);
    strats.push({name:`Put Spread ${b.strike}/${s.strike}`,structure:`Compra Put ${b.strike} + Venta Put ${s.strike}`,tipo:'put_spread',
      legs,cost,floor:b.strike-cost,maxProt:spread,ceiling:null,greeks:g,
      prob:Math.round(Math.abs(gk(F,b.strike,T,r,b.vi,'put').delta)*100),
      cpd:Math.abs(g.delta)>.01?Math.abs(cost)/Math.abs(g.delta):999,
      narrative:`Comprás protección con piso en ${(b.strike-cost).toFixed(1)} u$s pagando solo ${cost.toFixed(1)} u$s/tn (vs ${b.prima.toFixed(1)} del put seco). La venta del Put ${s.strike} financia el ${financ}% de la prima. La protección máxima es de ${spread} u$s/tn (entre ${b.strike} y ${s.strike}). Por debajo de ${s.strike} quedás sin cobertura. Ideal cuando querés reducir el costo del seguro y considerás improbable una caída por debajo de ${s.strike}.`,
    });
  }

  // ─── 3. COLLARS ───
  if(calls.length) for(const p of hedgePuts.slice(0,3)) for(const c of calls){
    if(c.strike<=F*1.01)continue;
    const cost=p.prima-c.prima;const legs=[{dir:'buy',type:'Put',strike:p.strike,prima:p.prima,vi:p.vi},{dir:'sell',type:'Call',strike:c.strike,prima:c.prima,vi:c.vi}];
    const g=netG(legs);const techo_dist=((c.strike/F-1)*100).toFixed(1);
    strats.push({name:`Collar ${p.strike}/${c.strike}`,structure:`Compra Put ${p.strike} + Venta Call ${c.strike}`,tipo:'collar',
      legs,cost,floor:p.strike-cost,maxProt:'∞',ceiling:c.strike,greeks:g,
      prob:Math.round(Math.abs(gk(F,p.strike,T,r,p.vi,'put').delta)*100),ww:weather,
      cpd:Math.abs(g.delta)>.01?Math.abs(cost)/Math.abs(g.delta):999,
      narrative:`Piso en ${(p.strike-cost).toFixed(1)} u$s con costo ${cost>0?'de '+cost.toFixed(1):'cero (o crédito de '+Math.abs(cost).toFixed(1)+')'} u$s/tn. A cambio, resignás suba por encima de ${c.strike} u$s (+${techo_dist}% sobre el futuro). ${weather?'⚠️ ATENCIÓN: estamos en ventana de weather market (Jun-Ago), la suba puede ser explosiva y el techo te limita. Considerá alternativas sin techo.':''}Ideal si estás conforme con el precio actual y querés protección barata.`,
    });
  }

  // ─── 4. GAVIOTAS (Seagull) — Put + Venta Put bajo + Venta Call ───
  if(calls.length && hedgePuts.length>=2) for(let i=0;i<Math.min(hedgePuts.length,3);i++) for(let j=i+1;j<hedgePuts.length;j++){
    const pb=hedgePuts[i],ps=hedgePuts[j];if(pb.strike-ps.strike<5)continue;
    for(const c of calls.slice(-2)){
      if(c.strike<=F*1.01)continue;
      const cost=pb.prima-ps.prima-c.prima;
      const legs=[{dir:'buy',type:'Put',strike:pb.strike,prima:pb.prima,vi:pb.vi},{dir:'sell',type:'Put',strike:ps.strike,prima:ps.prima,vi:ps.vi},{dir:'sell',type:'Call',strike:c.strike,prima:c.prima,vi:c.vi}];
      const g=netG(legs);const spread=pb.strike-ps.strike;
      strats.push({name:`Gaviota ${pb.strike}/${ps.strike}/${c.strike}`,structure:`Put ${pb.strike} + Vta Put ${ps.strike} + Vta Call ${c.strike}`,tipo:'gaviota',
        legs,cost,floor:pb.strike-cost,maxProt:spread,ceiling:c.strike,greeks:g,
        prob:Math.round(Math.abs(gk(F,pb.strike,T,r,pb.vi,'put').delta)*100),ww:weather,
        cpd:Math.abs(g.delta)>.01?Math.abs(cost)/Math.abs(g.delta):999,
        narrative:`Estructura de 3 patas: piso en ${(pb.strike-cost).toFixed(1)} u$s con protección de ${spread} u$s/tn y techo en ${c.strike}. Costo neto: ${cost>0?cost.toFixed(1)+' u$s':cost<0?'crédito de '+Math.abs(cost).toFixed(1)+' u$s':'cero'}. Combina un Put Spread (${pb.strike}/${ps.strike}) financiado con la venta de Call ${c.strike}. ${weather?'⚠️ Techo en weather market.':''}Ideal cuando querés cobertura barata y estás dispuesto a resignar suba y aceptar franquicia abajo.`,
      });
    }
  }

  // ─── 5. PUT SINTÉTICO: Venta Futuro + Compra Call ───
  // Call DEBE ser ATM u OTM (strike ≥ futuro) para que la participación alcista tenga sentido
  if(upsideCalls.length) for(const c of upsideCalls.slice(0,3)){
    const cost=c.prima;const legs=[{dir:'sell',type:'Futuro',strike:F,prima:0,vi:0},{dir:'buy',type:'Call',strike:c.strike,prima:c.prima,vi:c.vi}];
    const gC=gk(F,c.strike,T,r,c.vi,'call');
    const g={delta:+(-1+gC.delta).toFixed(4),gamma:gC.gamma,theta:gC.theta,vega:gC.vega};
    const pisoSint=F-cost;
    strats.push({name:`Sintético ${c.strike}`,structure:`Venta Futuro ${F.toFixed(0)} + Compra Call ${c.strike}`,tipo:'sintetico',
      legs,cost,floor:pisoSint,maxProt:'∞',ceiling:null,greeks:g,
      prob:Math.round(Math.abs(gC.delta)*100),
      cpd:999,
      narrative:`Vendés el futuro a ${F.toFixed(1)} u$s fijando la venta, y comprás un Call ${c.strike} por ${cost.toFixed(1)} u$s para quedar abierto a la suba desde ${c.strike}. Tu piso es ${pisoSint.toFixed(1)} u$s (precio de venta menos la prima del call). Si el mercado sube por encima de ${c.strike}, participás de la suba. Económicamente equivalente a comprar un Put, pero con la ventaja psicológica de que "ya vendiste". Ideal cuando te gusta el precio actual y querés asegurar la venta pero no perderte una suba.`,
    });
  }

  // ─── 6. VENTA FUTURO + CALL SPREAD ───
  // Ambos calls DEBEN ser ATM u OTM para que el spread dé participación real en suba
  if(upsideCalls.length>=2) for(let i=0;i<Math.min(upsideCalls.length-1,2);i++){
    const cb=upsideCalls[i],cs=upsideCalls[i+1];if(cs.strike-cb.strike<3)continue;
    // El call comprado debe estar EN o ARRIBA del precio de venta del futuro (participar por
    // debajo de donde ya vendiste no participa en nada), y el call vendido (techo) debe dejar
    // una ventana de suba útil sobre el futuro. Si no, es una venta de futuro disfrazada.
    if(cb.strike<F-0.5)continue;
    if(cs.strike<F*1.03)continue;
    const cost=cb.prima-cs.prima;
    const legs=[{dir:'sell',type:'Futuro',strike:F,prima:0,vi:0},{dir:'buy',type:'Call',strike:cb.strike,prima:cb.prima,vi:cb.vi},{dir:'sell',type:'Call',strike:cs.strike,prima:cs.prima,vi:cs.vi}];
    const gCb=gk(F,cb.strike,T,r,cb.vi,'call'),gCs=gk(F,cs.strike,T,r,cs.vi,'call');
    const g={delta:+(-1+gCb.delta-gCs.delta).toFixed(4),gamma:+(gCb.gamma-gCs.gamma).toFixed(6),theta:+(gCb.theta-gCs.theta).toFixed(4),vega:+(gCb.vega-gCs.vega).toFixed(4)};
    strats.push({name:`Sintético + Call Spread`,structure:`Vta Fut ${F.toFixed(0)} + Call Spread ${cb.strike}/${cs.strike}`,tipo:'sintetico_spread',
      legs,cost,floor:F-cost,maxProt:'∞',ceiling:cs.strike,greeks:g,
      prob:Math.round(Math.abs(gCb.delta)*100),
      cpd:999,
      narrative:`Vendés el futuro a ${F.toFixed(1)} u$s y comprás participación acotada en suba entre ${cb.strike} y ${cs.strike} por solo ${cost.toFixed(1)} u$s. Más barato que el put sintético puro pero con techo en ${cs.strike}. Piso: ${(F-cost).toFixed(1)} u$s.`,
    });
  }

  // ═══ SCORING — 7 REGLAS BIBLIOGRÁFICAS ═══
  // CME Self-Study Guide | Hull Options & Derivatives | MATBA-ROFEX Guía
  strats.forEach(s=>{
    const bd={};
    let sc=50;
    const ad=Math.abs(s.greeks.delta);
    const av=s.legs.filter(l=>l.vi>0).reduce((a,l)=>a+l.vi,0)/(s.legs.filter(l=>l.vi>0).length||1);
    const costPct=F>0?(Math.abs(s.cost)/F*100):0;

    // R1: Régimen de volatilidad
    if(perc){
      const rk=av<=perc.p10?10:av<=perc.p25?25:av<=perc.p50?45:av<=perc.p75?70:90;
      s._viRank=rk;
      if(rk<=20){
        if(s.tipo==='put_seco'||s.tipo==='sintetico'){sc+=18;bd.r1=`+18 · R1 Régimen VI: P${rk} (muy barata). Favorecer compra directa. [CME Hedger's Guide Cap.6]`;}
        else{sc+=8;bd.r1=`+8 · R1 Régimen VI: P${rk} (muy barata). Buen momento para comprar opciones. [CME]`;}
      }else if(rk<=40){sc+=10;bd.r1=`+10 · R1 Régimen VI: P${rk} (barata). Primas debajo de mediana. [CME]`;
      }else if(rk<=60){bd.r1=`0 · R1 Régimen VI: P${rk} (normal). Sin ventaja por nivel de VI.`;
      }else if(rk<=80){
        if(s.tipo==='put_seco'){sc-=12;bd.r1=`-12 · R1 Régimen VI: P${rk} (cara). Put seco penalizado — preferir spreads. [Hull Cap.19]`;}
        else{sc+=5;bd.r1=`+5 · R1 Régimen VI: P${rk} (cara). Spreads/collars favorecidos. [Hull Cap.19]`;}
      }else{
        if(s.tipo==='put_seco'){sc-=18;bd.r1=`-18 · R1 Régimen VI: P${rk} (muy cara). Usar Gaviotas o Collars. [Hull + CME]`;}
        else if(s.tipo==='gaviota'||s.tipo==='collar'){sc+=12;bd.r1=`+12 · R1 Régimen VI: P${rk} (muy cara). Estructuras que venden prima favorecidas. [Hull]`;}
        else{sc+=5;bd.r1=`+5 · R1 Régimen VI: P${rk} (muy cara). Spreads reducen exposición. [Hull]`;}
      }
    }

    // R2: Ratio VI/HV
    const hvD=ASST_VIVHV.filter(x=>x.cultivo===crop);const lh=hvD.length?hvD[hvD.length-1]:null;
    if(lh&&lh.hv_20d>0){
      const rt=lh.vi_atm/lh.hv_20d; s._viHvRatio=rt;
      if(rt<0.8){sc+=12;bd.r2=`+12 · R2 VI/HV: ${rt.toFixed(2)}x. Opciones subvaluadas vs volatilidad real. Comprar protección.`;}
      else if(rt<=1.2){bd.r2=`0 · R2 VI/HV: ${rt.toFixed(2)}x. Equilibrio VI vs realizada.`;}
      else if(rt<=1.5){
        if(s.tipo==='put_seco'){sc-=5;bd.r2=`-5 · R2 VI/HV: ${rt.toFixed(2)}x. Opciones levemente caras. Spreads preferibles.`;}
        else{sc+=3;bd.r2=`+3 · R2 VI/HV: ${rt.toFixed(2)}x. Spreads capturan ventaja de VI elevada.`;}
      }else{
        if(s.tipo==='put_seco'){sc-=12;bd.r2=`-12 · R2 VI/HV: ${rt.toFixed(2)}x. Opciones muy caras vs realidad. Put seco penalizado.`;}
        else if(s.tipo==='gaviota'||s.tipo==='collar'){sc+=8;bd.r2=`+8 · R2 VI/HV: ${rt.toFixed(2)}x. Vender prima tiene ventaja estadística.`;}
        else{sc+=5;bd.r2=`+5 · R2 VI/HV: ${rt.toFixed(2)}x. Estructuras que venden prima favorecidas.`;}
      }
    }

    // R3: Estacionalidad agro
    if(weather){
      if(s.ceiling){sc-=20;bd.r3=`-20 · R3 Weather market (Jun-Ago). Venta de call penalizada — suba explosiva posible. [CME Grain Course]`;}
      else if(s.tipo==='put_seco'||s.tipo==='sintetico'){sc+=5;bd.r3=`+5 · R3 Weather market. Sin techo: favorecido. [CME]`;}
    }else if(mes>=9&&mes<=10&&perc&&av<perc.p50){sc+=5;bd.r3=`+5 · R3 Pre-cosecha sudamericana. VI baja — buen momento para comprar.`;}

    // R4: Alineación con visión del productor
    if(vision==='floor'){
      if(s.tipo==='sintetico'){sc+=12;bd.r4=`+12 · R4 Visión "Piso": Sintético fija venta + participación. Máxima certidumbre. [CME Cap.6]`;}
      else if(!s.ceiling){sc+=10;bd.r4=`+10 · R4 Visión "Piso": Sin techo, asegura precio mínimo. [CME Cap.6]`;}
      else{sc-=5;bd.r4=`-5 · R4 Visión "Piso": Techo limita participación.`;}
    }else if(vision==='bullish'){
      if(s.tipo==='sintetico'||s.tipo==='sintetico_spread'){sc+=15;bd.r4=`+15 · R4 Visión "Alcista": Sintético ideal — vendés + participás suba. [CME]`;}
      else if(!s.ceiling){sc+=10;bd.r4=`+10 · R4 Visión "Alcista": Participación ilimitada en suba.`;}
      else{sc-=12;bd.r4=`-12 · R4 Visión "Alcista": Techo en ${s.ceiling} limita participación.`;}
    }else if(vision==='bearish'){
      if(s.maxProt==='∞'){sc+=10;bd.r4=`+10 · R4 Visión "Bajista": Protección ilimitada ante caída.`;}
      else{sc-=5;bd.r4=`-5 · R4 Visión "Bajista": Protección limitada a ${s.maxProt} u$s.`;}
    }else if(vision==='highvol'){
      if(Math.abs(s.greeks.vega)>.15){sc+=12;bd.r4=`+12 · R4 Visión "Alta vol": Vega alto, se beneficia de suba de VI.`;}
      else{sc-=5;bd.r4=`-5 · R4 Visión "Alta vol": Vega bajo — poco beneficio.`;}
    }else if(vision==='neutral'){
      if(s.tipo==='collar'||s.tipo==='gaviota'){sc+=8;bd.r4=`+8 · R4 Visión "Neutral": Rango acotado ideal. [CME]`;}
      else if(s.tipo==='put_spread'){sc+=5;bd.r4=`+5 · R4 Visión "Neutral": Spread cubre rango definido.`;}
    }

    // R5: Eficiencia de strike por skew — solo si la cadena tiene sonrisa real.
    // Con VI plana (serie ilíquida) no hay valor relativo que capturar: no puntúa.
    if(viFlat){
      bd.r5=`0 · R5 Skew: VI plana en la cadena (serie ilíquida, primas de ajuste a una sola vol). Sin señal de valor relativo confiable.`;
    } else {
      let skB=0;
      s.legs.filter(l=>l.dir==='buy'&&l.vi>0).forEach(l=>{const mn=(l.strike/F-1)*100;const sk=ASST_SKEW.find(x=>x.cultivo===crop&&mn>=x.mMin&&mn<x.mMax);if(sk&&l.vi<sk.viP25)skB+=5;});
      s.legs.filter(l=>l.dir==='sell'&&l.vi>0).forEach(l=>{const mn=(l.strike/F-1)*100;const sk=ASST_SKEW.find(x=>x.cultivo===crop&&mn>=x.mMin&&mn<x.mMax);if(sk&&l.vi>sk.viP75)skB+=5;});
      if(skB>0){sc+=skB;bd.r5=`+${skB} · R5 Skew: Strikes con VI favorable vs historia (comprando barato y/o vendiendo caro).`;}
    }

    // R6: Días al vencimiento
    const dte=T*365;
    if(dte>90){
      if(s.tipo==='put_seco'||s.tipo==='sintetico'){sc+=5;bd.r6=`+5 · R6 DTE: ${Math.round(dte)}d. Theta bajo, Vega alto — buen momento para comprar. [Hull Cap.10]`;}
    }else if(dte<30){
      if(s.tipo==='put_seco'){sc-=10;bd.r6=`-10 · R6 DTE: ${Math.round(dte)}d. Theta acelerado — put seco penalizado. [Hull Cap.10]`;}
      else if(s.tipo==='put_spread'||s.tipo==='gaviota'){sc+=5;bd.r6=`+5 · R6 DTE: ${Math.round(dte)}d. Spreads reducen theta. [Hull]`;}
    }

    // R7: Costo como % del futuro
    if(costPct<1&&s.cost>0){sc+=10;bd.r7=`+10 · R7 Prima/Futuro: ${costPct.toFixed(1)}% (<1%). Protección muy barata.`;}
    else if(costPct<=2){sc+=5;bd.r7=`+5 · R7 Prima/Futuro: ${costPct.toFixed(1)}% (1-2%). Costo razonable.`;}
    else if(costPct<=4){bd.r7=`0 · R7 Prima/Futuro: ${costPct.toFixed(1)}% (2-4%). Costo alto.`;}
    else if(costPct>4&&s.cost>0){sc-=8;bd.r7=`-8 · R7 Prima/Futuro: ${costPct.toFixed(1)}% (>4%). Muy caro.`;}
    else if(s.cost<=0){sc+=8;bd.r7=`+8 · R7 Prima/Futuro: Crédito neto o costo cero.`;}

    // Tolerancia y piso
    if(tol==='low'&&s.cost>2){sc-=12;bd.tol=`-12 · Tolerancia: Costo ${s.cost.toFixed(1)} supera límite 2 u$s.`;}
    else if(tol==='low'&&s.cost<=2&&s.cost>0){sc+=3;bd.tol=`+3 · Tolerancia: Dentro del límite.`;}
    if(s.floor&&s.floor>F*.95){sc+=8;bd.piso=`+8 · Piso: ${(s.floor/F*100).toFixed(0)}% del futuro. Protección muy cercana.`;}
    else if(s.floor&&s.floor>F*.9){sc+=4;bd.piso=`+4 · Piso: ${(s.floor/F*100).toFixed(0)}% del futuro. Razonable.`;}
    else if(s.floor&&s.floor<=F*.85){sc-=5;bd.piso=`-5 · Piso: ${(s.floor/F*100).toFixed(0)}% del futuro. Protección débil.`;}

    // R9: Upside retenido — sesgo coberturista. La suba abierta es lo que querés conservar;
    // un techo pegado al precio de venta no es cobertura, es una venta de futuro con pasos de más.
    if(!s.ceiling){
      sc+=8;bd.r9=`+8 · R9 Upside: sin techo, participación total en la suba.`;
    } else {
      const room=s.ceiling-F;
      if(room>=MIN_UPSIDE){const b=Math.min(4,Math.round(room/F*100));sc+=b;bd.r9=`+${b} · R9 Upside: techo a +${(room/F*100).toFixed(0)}% del futuro, deja margen de suba.`;}
      else{sc-=15;bd.r9=`-15 · R9 Upside: techo a +${(room/F*100).toFixed(0)}% — pegado al precio de venta, mata la suba.`;}
    }

    s.score=Math.max(0,Math.min(100,Math.round(sc)));
    s.scoreBreakdown=bd;
  });
  // R8 (filtro duro): descartar estructuras con techo pegado al precio de venta —
  // ventana de suba inútil = venta de futuro disfrazada. Si no sobrevive ninguna, se
  // mantiene la lista original para no dejar al usuario sin recomendaciones.
  const useful=strats.filter(s=>!s.ceiling||(s.ceiling-F)>=MIN_UPSIDE);
  const finalStrats=useful.length?useful:strats;
  finalStrats.sort((a,b)=>b.score-a.score);return finalStrats.slice(0,4);
}

// Rendering
function asstRenderInsights(analyzed,crop,F){
  const mes=new Date().getMonth()+1,perc=ASST_VI_PERC.find(v=>v.cultivo===crop&&v.mes===mes);
  const avgVi=analyzed.reduce((a,o)=>a+o.vi,0)/analyzed.length;
  const rank=perc?(avgVi<=perc.p10?5:avgVi<=perc.p25?20:avgVi<=perc.p50?40:avgVi<=perc.p75?65:85):50;
  const weather=mes>=6&&mes<=8;
  const puts=analyzed.filter(o=>o.type==='put').sort((a,b)=>a.costPerDelta-b.costPerDelta);
  let h=`<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:18px;box-shadow:var(--shadow);margin-bottom:16px;"><div style="font-size:14px;font-weight:700;margin-bottom:12px;">🧠 Análisis del Motor</div>`;
  h+=`<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);font-size:12px;"><div style="width:28px;height:28px;border-radius:7px;background:#dbeafe;display:flex;align-items:center;justify-content:center;flex-shrink:0;">📈</div><div><div style="font-weight:700;font-size:12px;">VI ATM: ${avgVi.toFixed(1)}% — Percentil ${rank}</div><div style="color:var(--text-2);line-height:1.5;">Mediana histórica: <strong>${perc?perc.p50:'—'}%</strong>. ${rank<30?'Primas <strong>baratas</strong> — buen momento para comprar protección.':rank>70?'Primas <strong>caras</strong> — considerar spreads.':'Primas en rango normal.'}</div></div></div>`;
  const lh=ASST_VIVHV.filter(r=>r.cultivo===crop);const lastHV=lh.length?lh[lh.length-1]:null;
  if(lastHV&&lastHV.hv_20d>0){const ratio=(lastHV.vi_atm/lastHV.hv_20d).toFixed(2);h+=`<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);font-size:12px;"><div style="width:28px;height:28px;border-radius:7px;background:var(--es-green-light);display:flex;align-items:center;justify-content:center;flex-shrink:0;">⚖️</div><div><div style="font-weight:700;">Ratio VI/HV: ${ratio}</div><div style="color:var(--text-2);">El mercado pricea ${ratio}x la volatilidad real. ${ratio<.8?'Opciones <strong>baratas</strong> vs movimiento — comprar.':ratio>1.5?'Opciones <strong>caras</strong> vs movimiento — spreads.':'Rango normal.'}</div></div></div>`;}
  if(puts[0]){h+=`<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);font-size:12px;"><div style="width:28px;height:28px;border-radius:7px;background:#ede9fe;display:flex;align-items:center;justify-content:center;flex-shrink:0;">📊</div><div><div style="font-weight:700;">Strike más eficiente: Put ${puts[0].strike}</div><div style="color:var(--text-2);">Costo/delta: <strong>${puts[0].costPerDelta.toFixed(2)} u$s/Δ</strong>${puts[0].value==='cheap'?' — <strong>barato</strong> vs historia':''}</div></div></div>`;}
  if(weather){h+=`<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;font-size:12px;"><div style="width:28px;height:28px;border-radius:7px;background:var(--es-gold-light);display:flex;align-items:center;justify-content:center;flex-shrink:0;">🌦️</div><div><div style="font-weight:700;">Weather market activo (Jun-Ago)</div><div style="color:var(--text-2);">Vender calls conlleva riesgo elevado. Estructuras sin techo son preferibles.</div></div></div>`;}
  return h+'</div>';
}

function asstRenderCard(s,idx){
  const best=idx===0,clr=s.score>=80?'var(--es-green)':s.score>=60?'#2563eb':'#d97706';
  const vol=parseFloat(document.getElementById('asst-vol').value)||5000;
  const F=parseFloat(document.getElementById('asst-fwd').value)||300;
  const crop=document.getElementById('asst-crop').value;
  
  let h=`<div style="background:var(--bg-card);border:${best?'2px solid var(--es-green)':'1px solid var(--border)'};border-radius:14px;overflow:hidden;box-shadow:var(--shadow);position:relative;">`;
  if(best)h+=`<div style="background:var(--es-green);color:#fff;text-align:center;font-size:10px;font-weight:700;padding:4px;letter-spacing:1px;">★ RECOMENDADA</div>`;
  h+=`<div style="padding:16px 16px 0;"><div style="font-size:15px;font-weight:700;">${s.name}</div><div style="font-size:11px;color:var(--text-3);font-family:var(--mono);">${s.structure}</div></div>`;
  h+=`<div style="display:flex;align-items:center;gap:8px;margin:10px 16px;padding:8px 12px;background:var(--bg-input);border-radius:8px;"><span style="font-size:10px;font-weight:700;color:var(--text-3);">SCORE</span><div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;"><div style="height:100%;width:${s.score}%;background:${clr};border-radius:3px;"></div></div><span style="font-size:14px;font-weight:700;font-family:var(--mono);color:${clr};">${s.score}</span></div>`;
  
  // Legs
  h+=`<div style="padding:0 16px;margin-bottom:10px;">`;s.legs.forEach(l=>{h+=`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:12px;border-bottom:1px solid var(--border);"><span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;background:${l.dir==='buy'?'#dbeafe':'#fde8e8'};color:${l.dir==='buy'?'#2563eb':'var(--red)'};">${l.dir==='buy'?'COMPRA':'VENTA'}</span><span style="font-weight:600;">${l.type} ${l.strike}</span><span style="font-family:var(--mono);font-size:11px;color:var(--text-2);margin-left:auto;">${l.prima.toFixed(1)} u$s · VI ${l.vi.toFixed(1)}%</span></div>`;});h+=`</div>`;
  
  // Greeks
  h+=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin:0 16px 12px;background:var(--border);border-radius:8px;overflow:hidden;">`;
  [{s:'Δ',v:s.greeks.delta},{s:'Γ',v:s.greeks.gamma},{s:'Θ',v:s.greeks.theta},{s:'ν',v:s.greeks.vega}].forEach(g=>{h+=`<div style="background:var(--bg-input);padding:7px;text-align:center;"><span style="font-size:10px;color:var(--text-3);font-weight:700;display:block;">${g.s}</span><span style="font-size:13px;font-weight:700;font-family:var(--mono);color:${g.v<0?'var(--red)':g.v>0?'var(--green)':'var(--text)'};">${g.v>0?'+':''}${g.v}</span></div>`;});
  h+=`</div>`;
  
  // Metrics
  h+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border-top:1px solid var(--border);">`;
  h+=`<div style="background:var(--bg-card);padding:10px 14px;"><div style="font-size:9px;color:var(--text-3);font-weight:700;text-transform:uppercase;">Costo neto</div><div style="font-size:15px;font-weight:700;font-family:var(--mono);color:${s.cost>0?'var(--red)':'var(--green)'};">${s.cost>0?'-':'+'} ${Math.abs(s.cost).toFixed(1)} u$s/tn</div><div style="font-size:10px;color:var(--text-3);">$${(Math.abs(s.cost)*vol).toLocaleString()} en ${vol.toLocaleString()} tn</div></div>`;
  h+=`<div style="background:var(--bg-card);padding:10px 14px;"><div style="font-size:9px;color:var(--text-3);font-weight:700;text-transform:uppercase;">Piso</div><div style="font-size:15px;font-weight:700;font-family:var(--mono);color:var(--green);">${s.floor?s.floor.toFixed(1):'—'} u$s</div><div style="font-size:10px;color:var(--text-3);">${s.floor?((1-s.floor/F)*100).toFixed(1)+'% debajo del futuro':''}</div></div>`;
  h+=`<div style="background:var(--bg-card);padding:10px 14px;"><div style="font-size:9px;color:var(--text-3);font-weight:700;text-transform:uppercase;">${s.ceiling?'Techo':'Prot. máx.'}</div><div style="font-size:15px;font-weight:700;font-family:var(--mono);">${s.ceiling?s.ceiling+' u$s':s.maxProt==='∞'?'∞':s.maxProt+' u$s/tn'}</div></div>`;
  h+=`<div style="background:var(--bg-card);padding:10px 14px;"><div style="font-size:9px;color:var(--text-3);font-weight:700;text-transform:uppercase;">Prob. ejercicio</div><div style="font-size:15px;font-weight:700;font-family:var(--mono);">${s.prob}%</div></div></div>`;
  
  if(s.ww)h+=`<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:6px 10px;margin:8px 16px;font-size:11px;">⚠️ <strong>Penalizado:</strong> Venta de Call en weather market.</div>`;
  
  // ─── NARRATIVE EXPLANATION ───
  h+=`<div style="padding:14px 16px;border-top:1px solid var(--border);font-size:12px;line-height:1.7;color:var(--text-2);">`;
  h+=`<div style="font-weight:700;color:var(--text);margin-bottom:6px;">📝 ¿Por qué esta estrategia?</div>`;
  
  // Build narrative based on strategy type
  if(s.legs.length===1 && s.legs[0].dir==='buy' && s.legs[0].type==='Put'){
    // Put seco
    const l=s.legs[0];
    h+=`<p style="margin:0 0 8px;">El <strong>Put Seco</strong> es la cobertura más simple: comprás un seguro de precio en ${l.strike} u$s. Si ${crop} cae por debajo de ${l.strike}, la opción te compensa dólar a dólar. Si sube, no perdés nada salvo la prima pagada (${l.prima.toFixed(1)} u$s/tn).</p>`;
    h+=`<p style="margin:0 0 8px;"><strong>Ventaja:</strong> Protección ilimitada hacia abajo y participación total en subas. No tenés techo. Si viene un weather market y ${crop} sube a ${Math.round(F*1.15)}, capturás toda esa suba.</p>`;
    h+=`<p style="margin:0 0 8px;"><strong>Desventaja:</strong> Es la opción más cara en prima (${l.prima.toFixed(1)} u$s/tn = ${(l.prima/F*100).toFixed(1)}% del futuro). Además, theta de ${s.greeks.theta} significa que perdés ${Math.abs(s.greeks.theta).toFixed(2)} u$s por día solo por el paso del tiempo.</p>`;
    h+=`<p style="margin:0;"><strong>Ideal si:</strong> Estás muy convencido de que puede haber una baja importante pero no querés resignar nada de suba. La VI está en ${l.vi.toFixed(1)}% — ${l.vi<15?'históricamente baja, buen momento para comprar':'en rango normal'}.</p>`;
  } else if(s.legs.length===2 && s.legs[0].dir==='buy' && s.legs[1].dir==='sell' && s.legs[0].type==='Put' && s.legs[1].type==='Put'){
    // Put spread
    const buyLeg=s.legs[0], sellLeg=s.legs[1];
    const spread=buyLeg.strike-sellLeg.strike;
    h+=`<p style="margin:0 0 8px;">El <strong>Put Spread</strong> combina la compra de un Put en ${buyLeg.strike} con la venta de un Put más bajo en ${sellLeg.strike}. La prima que cobrás por la venta (${sellLeg.prima.toFixed(1)} u$s) reduce el costo del Put comprado (${buyLeg.prima.toFixed(1)} u$s), dejando un costo neto de solo ${s.cost.toFixed(1)} u$s/tn.</p>`;
    h+=`<p style="margin:0 0 8px;"><strong>Protección:</strong> Te cubre entre ${buyLeg.strike} y ${sellLeg.strike} (un rango de ${spread} u$s). Si ${crop} cae a ${sellLeg.strike} o menos, tu ganancia máxima por la cobertura es ${(spread-s.cost).toFixed(1)} u$s/tn. Por debajo de ${sellLeg.strike} dejás de ganar — es tu "franquicia".</p>`;
    h+=`<p style="margin:0 0 8px;"><strong>Ventaja:</strong> Costo ${(s.cost/buyLeg.prima*100).toFixed(0)}% menor que el Put Seco. Sin techo en la suba. Theta reducido (${s.greeks.theta}) porque la venta del Put te compensa parte del time decay.</p>`;
    h+=`<p style="margin:0;"><strong>Desventaja:</strong> La protección tiene límite (${spread} u$s). Si ${crop} se desploma ${Math.round(spread+10)} u$s, solo te cubre ${spread}. Ideal si esperás una baja moderada, no un crash.</p>`;
  } else if(s.tipo==='gaviota'){
    const putB=s.legs.find(l=>l.dir==='buy'&&l.type==='Put'), putS=s.legs.find(l=>l.dir==='sell'&&l.type==='Put'), callS=s.legs.find(l=>l.dir==='sell'&&l.type==='Call');
    const spread=putB.strike-putS.strike;
    h+=`<p style="margin:0 0 8px;">La <strong>Gaviota (Seagull)</strong> es una estructura de 3 patas que combina un Put Spread (${putB.strike}/${putS.strike}) con la venta de un Call en ${callS.strike}. La prima del Call vendido (${callS.prima.toFixed(1)} u$s) financia gran parte del spread, dejando un costo de ${Math.abs(s.cost).toFixed(1)} u$s/tn${s.cost<=0?' (o directamente un crédito neto)':''}.</p>`;
    h+=`<p style="margin:0 0 8px;"><strong>Protección:</strong> Cubrís entre ${putB.strike} y ${putS.strike} (${spread} u$s de rango). Por debajo de ${putS.strike} quedás descubierto. Por encima de ${callS.strike} estás obligado a vender.</p>`;
    h+=`<p style="margin:0 0 8px;"><strong>Ventaja:</strong> Costo muy bajo o cero. Ideal para productores que quieren protección básica sin poner plata.</p>`;
    h+=`<p style="margin:0;"><strong>Desventaja:</strong> Tiene franquicia abajo Y techo arriba. Es la estrategia más "acotada" — te protege en un rango pero te expone en los extremos.${s.ww?' ⚠️ El techo en weather market es riesgoso.':''}</p>`;
  } else if(s.tipo==='sintetico'){
    const callLeg=s.legs.find(l=>l.type==='Call');
    h+=`<p style="margin:0 0 8px;">El <strong>Put Sintético</strong> es la estrategia ideal cuando "te gusta el precio pero querés quedar abierto". Vendés el futuro a ${F.toFixed(1)} u$s (fijás la venta) y comprás un Call ${callLeg.strike} por ${callLeg.prima.toFixed(1)} u$s para participar si sube.</p>`;
    h+=`<p style="margin:0 0 8px;"><strong>Protección:</strong> Tu piso es ${s.floor.toFixed(1)} u$s (futuro vendido - prima del call). Si ${crop} baja a 200, vos ya vendiste a ${F.toFixed(0)}. Si sube a ${Math.round(F*1.15)}, el call te permite capturar la suba desde ${callLeg.strike}.</p>`;
    h+=`<p style="margin:0 0 8px;"><strong>Ventaja:</strong> Ya tenés la venta hecha (certidumbre). La participación en suba no tiene techo. Psicológicamente es muy cómodo: "vendí, y si sube, participo".</p>`;
    h+=`<p style="margin:0;"><strong>vs Put Seco:</strong> Económicamente son equivalentes, pero el sintético te da la ventaja de que "ya cobrás" la venta del futuro. Es más una diferencia de flujo de caja y tranquilidad que de resultado final.</p>`;
  } else if(s.tipo==='sintetico_spread'){
    const cbs=s.legs.filter(l=>l.type==='Call');
    h+=`<p style="margin:0 0 8px;">Variante más barata del Put Sintético: vendés el futuro a ${F.toFixed(1)} y comprás un <strong>Call Spread</strong> (${cbs[0]?.strike}/${cbs[1]?.strike}) para participar de la suba en un rango acotado. Costo: ${s.cost.toFixed(1)} u$s/tn.</p>`;
    h+=`<p style="margin:0 0 8px;"><strong>Ventaja:</strong> Más barato que el sintético puro porque la venta del call alto te financia parte de la prima.</p>`;
    h+=`<p style="margin:0;"><strong>Desventaja:</strong> Participás de la suba solo hasta ${cbs[1]?.strike || '—'} u$s. Por encima de ese precio, no ganás más.</p>`;
  } else if(s.ceiling){
    // Collar genérico
    const putLeg=s.legs.find(l=>l.type==='Put'), callLeg=s.legs.find(l=>l.type==='Call');
    h+=`<p style="margin:0 0 8px;">El <strong>Collar</strong> combina un Put comprado en ${putLeg.strike} (protección de baja) con un Call vendido en ${callLeg.strike} (financia el Put pero limita la suba). El costo neto es ${Math.abs(s.cost).toFixed(1)} u$s/tn — ${s.cost<=0?'te genera un crédito neto':'casi costo cero'}.</p>`;
    h+=`<p style="margin:0 0 8px;"><strong>Protección:</strong> Si ${crop} cae debajo de ${putLeg.strike}, el Put te compensa. Si sube por encima de ${callLeg.strike}, estás obligado a vender a ese precio — es tu techo.</p>`;
    h+=`<p style="margin:0 0 8px;"><strong>Ventaja:</strong> Costo mínimo o nulo. Te permite asegurar un piso sin poner plata.</p>`;
    h+=`<p style="margin:0 0 8px;"><strong>Desventaja:</strong> Resignás toda la suba por encima de ${callLeg.strike} u$s.${s.ww?' <strong>IMPORTANTE:</strong> Estamos en ventana de weather market (Jun-Ago). Históricamente la volatilidad sube fuerte por el clima en EE.UU., y vender un Call en este contexto implica riesgo de quedarte afuera de subas explosivas. El score fue penalizado por esto.':''}</p>`;
    h+=`<p style="margin:0;"><strong>Ideal si:</strong> Estás seguro de que ${crop} no va a subir mucho más y querés protección gratis. NO ideal si pensás que puede haber weather market.</p>`;
  }
  
  // Score breakdown
  h+=`<details style="margin-top:10px;"><summary style="cursor:pointer;font-size:11px;font-weight:700;color:var(--es-green);">📊 Desglose del Score (${s.score}/100)</summary>`;
  h+=`<div style="margin-top:8px;font-size:11px;font-family:var(--mono);">`;
  h+=`<div>Base: 50</div>`;
  const ad=Math.abs(s.greeks.delta);
  if(ad>0.01) h+=`<div>Eficiencia delta/costo: ${s.cost>0?'+'+Math.min(20,Math.round(ad/s.cost*5)):'+15'}</div>`;
  if(s.cost<=2) h+=`<div>Costo bajo (≤2 u$s): +10</div>`;
  else if(s.cost<=6) h+=`<div>Costo moderado: +5</div>`;
  else h+=`<div>Costo alto: -5</div>`;
  
  const perc=ASST_VI_PERC.find(v=>v.cultivo===crop&&v.mes===new Date().getMonth()+1);
  if(perc){const av=s.legs.reduce((a,l)=>a+l.vi,0)/s.legs.length;const rk=av<=perc.p10?5:av<=perc.p25?20:av<=perc.p50?40:av<=perc.p75?65:85;h+=`<div>VI percentil ${rk} ${rk<30?'(barata, +15)':rk>70?'(cara, -10)':'(normal, +0)'}</div>`;}
  
  const hv=ASST_VIVHV.filter(r=>r.cultivo===crop);const lh=hv.length?hv[hv.length-1]:null;
  if(lh&&lh.hv_20d>0){const rt=lh.vi_atm/lh.hv_20d;if(rt>1.5&&s.legs.length===1)h+=`<div>Ratio VI/HV ${rt.toFixed(2)} + put seco: -10</div>`;if(rt>1.5&&s.legs.length>1)h+=`<div>Ratio VI/HV ${rt.toFixed(2)} + spread: +5</div>`;if(rt<0.8)h+=`<div>VI barata vs HV: +10</div>`;}
  
  if(asstVisionSel==='floor'&&!s.ceiling) h+=`<div>Visión "Quiero piso" sin techo: +10</div>`;
  if(asstVisionSel==='bullish'&&!s.ceiling) h+=`<div>Visión "Alcista" sin techo: +15</div>`;
  if(s.ww) h+=`<div style="color:var(--red);">Venta call en weather market: -20</div>`;
  if(s.floor&&s.floor>F*.9) h+=`<div>Piso cercano al futuro: +5</div>`;
  h+=`<div style="font-weight:700;margin-top:4px;border-top:1px solid var(--border);padding-top:4px;">Total: ${s.score}</div>`;
  h+=`</div></details>`;
  
  h+=`</div>`;
  return h+'</div>';
}

function asstRenderChainTable(analyzed,F){
  const mx=Math.max(...analyzed.map(o=>o.vi));
  let h=`<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:16px;box-shadow:var(--shadow);margin-bottom:16px;overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr>`;
  ['Strike','Prima','Tipo','VI %','','Delta','Gamma','Theta','Vega','u$s/Δ','Piso','Valor'].forEach(t=>{h+=`<th style="padding:7px 8px;background:var(--es-green-light);border-bottom:2px solid var(--es-green);font-weight:600;color:var(--es-green-dark);font-size:10px;text-transform:uppercase;text-align:center;">${t}</th>`;});
  h+=`</tr></thead><tbody>`;
  analyzed.sort((a,b)=>b.strike-a.strike);
  analyzed.forEach(o=>{const hl=o.value==='cheap';h+=`<tr style="${hl?'background:var(--es-green-light);font-weight:600;':''}"><td style="padding:6px 8px;border-bottom:1px solid var(--border);font-family:var(--mono);font-weight:700;background:var(--bg-input);text-align:center;">${o.strike}${hl?' ★':''}</td><td style="padding:6px;border-bottom:1px solid var(--border);font-family:var(--mono);text-align:center;">${o.prima.toFixed(1)}</td><td style="padding:6px;border-bottom:1px solid var(--border);text-align:center;">${o.type.toUpperCase()}</td><td style="padding:6px;border-bottom:1px solid var(--border);font-family:var(--mono);text-align:center;${o.value==='expensive'?'color:var(--red);font-weight:700;':o.value==='cheap'?'color:var(--es-green);font-weight:700;':''}">${o.vi.toFixed(1)}%</td><td style="padding:6px;border-bottom:1px solid var(--border);"><div style="display:inline-block;height:12px;width:${Math.round(o.vi/mx*60)}px;background:${o.value==='expensive'?'var(--red)':o.value==='cheap'?'var(--es-green)':'#3b82f6'};border-radius:3px;"></div></td><td style="padding:6px;border-bottom:1px solid var(--border);font-family:var(--mono);text-align:center;">${o.greeks.delta}</td><td style="padding:6px;border-bottom:1px solid var(--border);font-family:var(--mono);text-align:center;">${o.greeks.gamma}</td><td style="padding:6px;border-bottom:1px solid var(--border);font-family:var(--mono);text-align:center;color:var(--red);">${o.greeks.theta}</td><td style="padding:6px;border-bottom:1px solid var(--border);font-family:var(--mono);text-align:center;">${o.greeks.vega}</td><td style="padding:6px;border-bottom:1px solid var(--border);font-family:var(--mono);text-align:center;${hl?'color:var(--es-green);font-weight:700;':''}">${o.costPerDelta<100?o.costPerDelta.toFixed(2):'—'}</td><td style="padding:6px;border-bottom:1px solid var(--border);font-family:var(--mono);text-align:center;font-weight:700;color:var(--green);">${o.floor?o.floor.toFixed(1):'—'}</td><td style="padding:6px;border-bottom:1px solid var(--border);text-align:center;">${o.value==='cheap'?'<span style="font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;background:var(--es-green-light);color:var(--es-green-dark);">BARATO</span>':o.value==='expensive'?'<span style="font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;background:#fde8e8;color:var(--red);">CARO</span>':''}</td></tr>`;});
  return h+'</tbody></table></div>';
}

function asstRenderBestCombo(analyzed,F,T,crop){
  const puts=analyzed.filter(o=>o.type==='put').sort((a,b)=>b.strike-a.strike);
  const calls=analyzed.filter(o=>o.type==='call').sort((a,b)=>a.strike-b.strike);
  if(puts.length<2) return '';
  
  // Find best put by cost/delta efficiency
  const bestPut=puts.reduce((best,p)=>p.costPerDelta<(best?best.costPerDelta:Infinity)?p:best,null);
  
  // Find best spread: maximize (floor quality × cost efficiency)
  let bestSpread=null, bestSpreadScore=-Infinity;
  for(let i=0;i<puts.length;i++) for(let j=i+1;j<puts.length;j++){
    const b=puts[i],s=puts[j];if(b.strike-s.strike<5)continue;
    const cost=b.prima-s.prima;if(cost<=0)continue;
    const floor=b.strike-cost;
    const floorQuality=floor/F; // closer to 1 = better
    const costEff=cost>0?(b.strike-s.strike)/cost:0; // protection per dollar
    const score=floorQuality*50+costEff*10;
    if(score>bestSpreadScore){bestSpreadScore=score;bestSpread={buy:b,sell:s,cost,floor,spread:b.strike-s.strike,costEff};}
  }
  
  // Find alternatives near best put that might be better
  const nearPuts=puts.filter(p=>Math.abs(p.strike-bestPut.strike)<=10 && p.strike!==bestPut.strike);
  
  let h=`<div style="background:var(--es-green-light);border:2px solid var(--es-green);border-radius:12px;padding:20px;margin-bottom:20px;">`;
  h+=`<div style="font-size:16px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:8px;">🎯 Mejor Combinación Detectada</div>`;
  
  // Best individual put
  h+=`<div style="background:#fff;border-radius:8px;padding:14px;margin-bottom:12px;">`;
  h+=`<div style="font-weight:700;font-size:13px;margin-bottom:6px;">Mejor Put individual: <span style="color:var(--es-green);">Put ${bestPut.strike}</span></div>`;
  h+=`<div style="font-size:12px;color:var(--text-2);line-height:1.7;">`;
  h+=`Costo por punto de delta: <strong>${bestPut.costPerDelta.toFixed(2)} u$s/Δ</strong> (el más eficiente de la cadena). `;
  h+=`VI: ${bestPut.vi.toFixed(1)}% — ${bestPut.value==='cheap'?'<strong style="color:var(--es-green);">BARATA</strong> vs historia (debajo del percentil 25 del skew)':bestPut.value==='expensive'?'<strong style="color:var(--red);">CARA</strong> vs historia':'en rango normal'}. `;
  h+=`Piso: ${(bestPut.strike-bestPut.prima).toFixed(1)} u$s. `;
  if(nearPuts.length>0){
    const alt=nearPuts[0];
    const diffPrima=alt.prima-bestPut.prima;
    const diffStrike=alt.strike-bestPut.strike;
    h+=`<br><br><strong>Comparación:</strong> El Put ${alt.strike} cuesta ${diffPrima>0?diffPrima.toFixed(1)+' u$s más':Math.abs(diffPrima).toFixed(1)+' u$s menos'} (${alt.prima.toFixed(1)} vs ${bestPut.prima.toFixed(1)}) pero te da ${diffStrike>0?diffStrike+' u$s más':Math.abs(diffStrike)+' u$s menos'} de piso. `;
    if(diffStrike>0 && diffPrima>0){
      const marginalCost=diffPrima/diffStrike;
      h+=`Costo marginal de ${diffStrike} u$s extra de piso: ${diffPrima.toFixed(1)} u$s (${marginalCost.toFixed(2)} u$s por punto). ${marginalCost<0.5?'<strong>Buen negocio</strong> — vale la pena subir de strike.':'Caro por el extra de protección.'}`;
    }
  }
  h+=`</div></div>`;
  
  // Best spread
  if(bestSpread){
    h+=`<div style="background:#fff;border-radius:8px;padding:14px;">`;
    h+=`<div style="font-weight:700;font-size:13px;margin-bottom:6px;">Mejor Put Spread: <span style="color:var(--es-green);">Put ${bestSpread.buy.strike}/${bestSpread.sell.strike}</span></div>`;
    h+=`<div style="font-size:12px;color:var(--text-2);line-height:1.7;">`;
    h+=`Costo neto: <strong>${bestSpread.cost.toFixed(1)} u$s/tn</strong> (la venta del Put ${bestSpread.sell.strike} a ${bestSpread.sell.prima.toFixed(1)} u$s financia el <strong>${((bestSpread.sell.prima/bestSpread.buy.prima)*100).toFixed(0)}%</strong> de la prima del Put ${bestSpread.buy.strike}). `;
    h+=`Piso efectivo: <strong>${bestSpread.floor.toFixed(1)} u$s</strong> con protección de ${bestSpread.spread} u$s/tn. `;
    h+=`Ratio protección/costo: ${bestSpread.costEff.toFixed(1)}x — por cada u$s de prima, conseguís ${bestSpread.costEff.toFixed(1)} u$s de cobertura. `;
    
    // Compare put seco vs spread
    const putSecoFloor=bestPut.strike-bestPut.prima;
    const spreadFloor=bestSpread.floor;
    h+=`<br><br><strong>vs Put Seco ${bestPut.strike}:</strong> El spread te da un piso de ${spreadFloor.toFixed(1)} u$s (${spreadFloor>putSecoFloor?'mejor':'peor'} que el ${putSecoFloor.toFixed(1)} del put seco) por ${bestSpread.cost.toFixed(1)} u$s en vez de ${bestPut.prima.toFixed(1)} u$s — <strong>ahorrás ${(bestPut.prima-bestSpread.cost).toFixed(1)} u$s/tn</strong> (${((1-bestSpread.cost/bestPut.prima)*100).toFixed(0)}% menos).`;
    h+=`</div></div>`;
  }
  
  h+=`</div>`;
  return h;
}

function asstGenerate(){
  const crop=document.getElementById('asst-crop').value,F=parseFloat(document.getElementById('asst-fwd').value)||ASST_FWD[crop];
  const pos=document.getElementById('asst-pos').value,exp=asstExpiry(pos);
  if(!exp){alert('Posición inválida');return;}
  const T=asstDays(new Date(),exp)/365,chain=asstGetChain();
  if(chain.length<2){alert('Ingresá al menos 2 strikes con primas');return;}
  const analyzed=asstAnalyze(chain,F,T,crop);
  if(!analyzed.length){alert('No se pudo calcular VI con estos datos');return;}
  const vol=parseFloat(document.getElementById('asst-vol').value)||5000;
  const tol=document.getElementById('asst-tol').value;

  let html='';
  if(asstModeNum===2){
    html+=asstRenderChainTable(analyzed,F);
    // Best combination analysis
    html+=asstRenderBestCombo(analyzed,F,T,crop);
  }
  html+=asstRenderInsights(analyzed,crop,F);
  const strats=asstGenStrategies(analyzed,F,T,asstVisionSel,tol,crop,vol);
  if(strats.length){
    html+=`<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--text-3);margin-bottom:14px;display:flex;align-items:center;gap:8px;"><span style="width:16px;height:2px;background:var(--es-green);border-radius:1px;"></span>${strats.length} Estrategias Recomendadas — ${crop.charAt(0).toUpperCase()+crop.slice(1)} ${pos} @ ${F} u$s</div>`;
    html+=`<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:20px;">${strats.map((s,i)=>asstRenderCard(s,i)).join('')}</div>`;
  }
  document.getElementById('asst-results').innerHTML=html;
  document.getElementById('asst-results').scrollIntoView({behavior:'smooth',block:'start'});
}

// ═══════════════════════════════════════════════════════════
