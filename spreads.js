// ═══════════════════════════════════════════════════
// ─── SPREADS, BASIS & RELACIONES ───
// ═══════════════════════════════════════════════════

function toggleSpreads(){
  spreadMode=true;theoryMode=false;retMode=false;paseMode=false;asstMode=false;
  if(typeof futOpcMode!=='undefined') futOpcMode=false;
  if(typeof desvioMode!=='undefined') desvioMode=false;
  document.getElementById('workspace').style.display='none';
  document.getElementById('theory-space').style.display='none';
  document.getElementById('ret-space').style.display='none';
  document.getElementById('pase-space').style.display='none';
  if(document.getElementById('desvio-space')) document.getElementById('desvio-space').style.display='none';
  if(document.getElementById('alertas-space')) document.getElementById('alertas-space').style.display='none';
  if(document.getElementById('futopc-space')) document.getElementById('futopc-space').style.display='none';
  document.getElementById('spreads-space').style.display='block';
  document.getElementById('mkt-bar').style.display='none';
  document.getElementById('fob-bar').style.display='none';
  renderTabs();renderModules();
  if(ASST_FUTPOS.length===0){asstLoadDrive().then(()=>{spInit();});}else{spInit();}
}

if(typeof spExcludedCampaigns==='undefined') spExcludedCampaigns=new Set();
function spInit(){spBuildYearChips();spUpdatePos1();spUpdatePos2();}

function spSetMode(m){
  spMode=m;
  document.getElementById('sp-mode-basis').className=m==='basis'?'btn':'btn btn-outline';
  document.getElementById('sp-mode-basis').style.background=m==='basis'?'var(--es-green)':'';
  document.getElementById('sp-mode-basis').style.color=m==='basis'?'#fff':'';
  document.getElementById('sp-mode-ratio').className=m==='ratio'?'btn':'btn btn-outline';
  document.getElementById('sp-mode-ratio').style.background=m==='ratio'?'var(--es-green)':'';
  document.getElementById('sp-mode-ratio').style.color=m==='ratio'?'#fff':'';
  spCalcSpread();
}

function spGetPositions(crop){
  const seen=new Set(),positions=[];
  const mOrder={ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,OCT:10,NOV:11,DIC:12};
  ASST_FUTPOS.filter(r=>r.cultivo===crop).forEach(r=>{if(!seen.has(r.pos)){seen.add(r.pos);positions.push(r.pos);}});
  positions.sort((a,b)=>{const ya=parseInt(a.slice(3)),yb=parseInt(b.slice(3));if(ya!==yb)return ya-yb;return(mOrder[a.slice(0,3)]||0)-(mOrder[b.slice(0,3)]||0);});
  return positions;
}

function spUpdatePos1(){
  const crop=document.getElementById('sp-crop1').value;
  const sel=document.getElementById('sp-pos1');
  const positions=spGetPositions(crop);
  sel.innerHTML=positions.map(p=>`<option value="${p}">${p}</option>`).join('');
  if(positions.length>=2)sel.selectedIndex=positions.length-2;
  spCalcSpread();
}
function spUpdatePos2(){
  const crop=document.getElementById('sp-crop2').value;
  const sel=document.getElementById('sp-pos2');
  const positions=spGetPositions(crop);
  sel.innerHTML=positions.map(p=>`<option value="${p}">${p}</option>`).join('');
  if(positions.length>=1)sel.selectedIndex=positions.length-1;
  spCalcSpread();
}

function spBuildYearChips(){
  const years=new Set();
  ASST_FUTPOS.forEach(r=>{const y=typeof r.anio_pos==='number'?r.anio_pos:parseInt(r.anio_pos);if(y>2018)years.add(y);});
  const sorted=[...years].sort();
  document.getElementById('sp-year-chips').innerHTML=sorted.map(y=>{
    const excl=spExcludedYears.has(y);
    return `<span onclick="spToggleYear(${y})" style="font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer;font-family:var(--mono);border:1px solid ${excl?'var(--red)':'var(--es-green)'};background:${excl?'#fde8e8':'var(--es-green-light)'};color:${excl?'var(--red)':'var(--es-green)'};${excl?'text-decoration:line-through;opacity:.6;':''}">${y}</span>`;
  }).join('');
}
function spToggleYear(y){
  if(spExcludedYears.has(y))spExcludedYears.delete(y);else spExcludedYears.add(y);
  spBuildYearChips();spCalcSpread();
}

// ─── Días al vencimiento (a hoy) ───
// Reconstruye la fecha de vto desde el último registro (fecha + dias_vto)
// y recalcula contra la fecha de hoy, no contra la última sync.
function spVtoDate(crop,pos){
  let lastKey='',last=null;
  ASST_FUTPOS.forEach(r=>{
    if(r.cultivo!==crop||r.pos!==pos)return;
    const dk=String(r.fecha).slice(0,10);
    if(dk>lastKey){lastKey=dk;last=r;}
  });
  if(!last)return null;
  const dte=typeof last.dias_vto==='number'?last.dias_vto:parseInt(last.dias_vto);
  if(!isFinite(dte))return null;
  const p=lastKey.split('-').map(Number);
  const v=new Date(p[0],p[1]-1,p[2]);
  v.setDate(v.getDate()+dte);
  return v;
}

function spDteHoy(crop,pos){
  const v=spVtoDate(crop,pos);
  if(!v)return null;
  const hoy=new Date();hoy.setHours(0,0,0,0);
  return{dias:Math.round((v-hoy)/86400000),vto:v};
}

function spFmtFecha(d){
  const M=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${String(d.getDate()).padStart(2,'0')}-${M[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
}

function spRenderDte(crop1,pos1,crop2,pos2){
  const bar=document.getElementById('sp-dte-bar');
  if(!bar)return;
  const a=spDteHoy(crop1,pos1),b=spDteHoy(crop2,pos2);
  if(!a&&!b){bar.innerHTML='';return;}

  const legs=[];
  if(a)legs.push({lbl:`${crop1.toUpperCase()} ${pos1}`,...a});
  if(b)legs.push({lbl:`${crop2.toUpperCase()} ${pos2}`,...b});

  const minD=Math.min(...legs.map(l=>l.dias));

  const chip=l=>{
    const cerca=l.dias===minD&&legs.length>1;
    let col='var(--es-green)',bg='var(--es-green-light)';
    if(l.dias<=15){col='var(--red)';bg='#fde8e8';}
    else if(l.dias<=30){col='#8a6d1f';bg='#fdf6e3';}
    const txt=l.dias<0?`vencida hace ${Math.abs(l.dias)}d`
             :l.dias===0?'vence HOY'
             :`${l.dias} días al vto`;
    return `<span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-family:var(--mono);
      padding:6px 11px;border-radius:8px;border:1px solid ${col};background:${bg};color:${col};
      ${cerca?'font-weight:700;box-shadow:0 0 0 2px rgba(0,0,0,.04);':''}">
      ${cerca?'⏱':'📅'} <strong>${l.lbl}</strong> · ${txt} <span style="opacity:.7;">(${spFmtFecha(l.vto)})</span></span>`;
  };

  let html=legs.map(chip).join('');
  if(legs.length===2){
    const gap=Math.abs(legs[0].dias-legs[1].dias);
    html+=`<span style="font-size:11px;color:var(--text-3);font-family:var(--mono);padding:6px 4px;">
      ↔ ${gap} días entre patas</span>`;
  }
  bar.innerHTML=html;
}

function spCalcSpread(){
  const crop1=document.getElementById('sp-crop1').value;
  const crop2=document.getElementById('sp-crop2').value;
  const pos1=document.getElementById('sp-pos1').value;
  const pos2=document.getElementById('sp-pos2').value;
  spRenderDte(crop1,pos1,crop2,pos2);
  if(!pos1||!pos2){document.getElementById('sp-stats').innerHTML='<div style="grid-column:span 6;color:var(--text-3);font-size:12px;">Seleccioná posiciones.</div>';return;}
  if(crop1===crop2&&pos1===pos2){document.getElementById('sp-stats').innerHTML='<div style="grid-column:span 6;color:var(--text-3);font-size:12px;">Seleccioná dos posiciones diferentes.</div>';return;}

  // Build price maps
  const d1={},d2={};
  ASST_FUTPOS.filter(r=>r.cultivo===crop1&&r.pos===pos1).forEach(r=>{const dk=String(r.fecha).slice(0,10);d1[dk]=r;});
  ASST_FUTPOS.filter(r=>r.cultivo===crop2&&r.pos===pos2).forEach(r=>{const dk=String(r.fecha).slice(0,10);d2[dk]=r;});

  const dates=Object.keys(d1).filter(d=>d in d2).sort();
  if(dates.length<3){document.getElementById('sp-stats').innerHTML='<div style="grid-column:span 6;color:var(--text-3);font-size:12px;">No hay datos comunes entre estas posiciones.</div>';return;}

  const series=dates.map(d=>{
    const p1=d1[d].precio,p2=d2[d].precio;
    return{fecha:d,p1,p2,basis:p1-p2,ratio:p2>0?p1/p2:null,dte1:d1[d].dias_vto,dte2:d2[d].dias_vto,year:parseInt(d.slice(0,4))};
  });

  // Apply year filter
  const filtered=series.filter(s=>!spExcludedYears.has(s.year));
  const vals=filtered.map(s=>spMode==='basis'?s.basis:s.ratio).filter(v=>v!==null);
  if(vals.length<3){document.getElementById('sp-stats').innerHTML='<div style="grid-column:span 6;color:var(--text-3);font-size:12px;">Datos insuficientes después del filtro.</div>';return;}

  // El valor actual es SIEMPRE el último dato de la serie, aunque se excluya su año del análisis.
  const lastS=series[series.length-1];
  const current=spMode==='basis'?lastS.basis:(lastS.ratio!=null?lastS.ratio:vals[vals.length-1]);
  const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
  const min=Math.min(...vals);const max=Math.max(...vals);
  const std=Math.sqrt(vals.reduce((a,v)=>a+(v-avg)**2,0)/vals.length);
  const fmt=v=>spMode==='basis'?v.toFixed(1):v.toFixed(4);
  const diffVsAvg=current-avg;
  const diffPct=avg!==0?((current/avg-1)*100).toFixed(1):'—';
  const lbl1=`${crop1.charAt(0).toUpperCase()+crop1.slice(1)} ${pos1}`;
  const lbl2=`${crop2.charAt(0).toUpperCase()+crop2.slice(1)} ${pos2}`;
  const modeLabel=spMode==='basis'?'Spread':'Relación';
  // Build seasonData early (needed for Prom. Histórico + Chart 2)
  const mes1=pos1.slice(0,3),mes2=pos2.slice(0,3);
  const anioPos1Cur=parseInt(pos1.slice(-2))+2000, anioPos2Cur=parseInt(pos2.slice(-2))+2000;
  const yearOffset=anioPos2Cur-anioPos1Cur;
  const seasonData={};
  ASST_FUTPOS.filter(r=>r.cultivo===crop1&&r.mes_label===mes1).forEach(r1=>{
    if(spExcludedYears.has(r1.anio_pos))return;
    const expectedAnio2=r1.anio_pos+yearOffset;
    if(spExcludedYears.has(expectedAnio2))return;
    const dk=String(r1.fecha).slice(0,10);
    const candidates=ASST_FUTPOS.filter(r=>r.cultivo===crop2&&r.mes_label===mes2&&r.anio_pos===expectedAnio2&&String(r.fecha).slice(0,10)===dk);
    candidates.forEach(r2=>{
      const key=`${r1.pos}-${r2.pos}`;
      const val=spMode==='basis'?r1.precio-r2.precio:r2.precio>0?r1.precio/r2.precio:null;
      if(val===null)return;
      if(!seasonData[key])seasonData[key]=[];
      seasonData[key].push({dte:r1.dias_vto,val});
    });
  });
  const currentKey=`${pos1}-${pos2}`;
  // Prom. Histórico y Percentil: campañas anteriores equivalentes, comparadas en el MISMO
  // momento del ciclo (± ventana de días al vencimiento). Es el mismo criterio que usa el
  // Resumen (reglas_resumen.js → relaciones.ventanaDias), así los dos muestran lo mismo.
  const histKeys=Object.keys(seasonData).filter(k=>k!==currentKey);
  const ventana=(typeof RS_REGLAS!=='undefined'&&RS_REGLAS.relaciones)?RS_REGLAS.relaciones.ventanaDias:20;
  const minPts=(typeof RS_REGLAS!=='undefined'&&RS_REGLAS.relaciones)?RS_REGLAS.relaciones.minPuntosHist:15;
  const curDte=series[series.length-1].dte1;
  const histAll=histKeys.flatMap(k=>seasonData[k]);
  let histWin=histAll.filter(p=>Math.abs(p.dte-curDte)<=ventana);
  const enVentana=histWin.length>=minPts;
  if(!enVentana)histWin=histAll;
  const campAvg=histWin.length?histWin.reduce((a,p)=>a+p.val,0)/histWin.length:avg;
  const diffVsCamp=current-campAvg;
  const diffCampPct=campAvg!==0?((current/campAvg-1)*100).toFixed(1):'—';
  const histVals=histWin.map(p=>p.val);
  const pctBase=histVals.length>=minPts?histVals:vals;
  const pctVsHist=pctBase===histVals;
  const percentile=Math.round(pctBase.filter(v=>v<=current).length/pctBase.length*100);

  // Y axis
  const yMinInput=document.getElementById('sp-ymin').value;
  const yMaxInput=document.getElementById('sp-ymax').value;
  const padding=(max-min)*0.1||1;
  const yMin=yMinInput!==''?parseFloat(yMinInput):Math.floor((min-padding)*10)/10;
  const yMax=yMaxInput!==''?parseFloat(yMaxInput):Math.ceil((max+padding)*10)/10;

  // Stats
  document.getElementById('sp-stats').style.gridTemplateColumns='repeat(auto-fit,minmax(130px,1fr))';
  document.getElementById('sp-stats').innerHTML=`
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;">${modeLabel} Actual</div>
      <div style="font-size:20px;font-weight:700;font-family:var(--mono);">${fmt(current)}</div>
      <div style="font-size:10px;color:var(--text-3);">${lbl1} vs ${lbl2}</div>
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;">Prom. ${modeLabel}</div>
      <div style="font-size:20px;font-weight:700;font-family:var(--mono);">${fmt(avg)}</div>
      <div style="font-size:10px;color:${diffVsAvg>0?'var(--green)':'var(--red)'};">${diffVsAvg>0?'+':''}${fmt(diffVsAvg)} (${diffPct}%)</div>
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;">Prom. Histórico</div>
      <div style="font-size:20px;font-weight:700;font-family:var(--mono);">${fmt(campAvg)}</div>
      <div style="font-size:10px;color:${diffVsCamp>0?'var(--green)':'var(--red)'};">${diffVsCamp>0?'+':''}${fmt(diffVsCamp)} (${diffCampPct}%)</div>
      <div style="font-size:10px;color:var(--text-3);">${enVentana?`a ${curDte}±${ventana} días del vto`:'toda la historia'}</div>
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;">Percentil</div>
      <div style="font-size:20px;font-weight:700;font-family:var(--mono);color:${percentile>70?'var(--green)':percentile<30?'var(--red)':'var(--text)'};">P${percentile}</div>
      <div style="font-size:10px;color:var(--text-3);">${percentile>70?'Alto':percentile<30?'Bajo':'Rango normal'} vs ${pctVsHist?histKeys.length+' campañas previas':'serie actual'}</div>
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;">Rango ${modeLabel}</div>
      <div style="font-size:13px;font-weight:700;font-family:var(--mono);">${fmt(min)} / ${fmt(max)}</div>
      <div style="font-size:10px;color:var(--text-3);">Mín / Máx</div>
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;">Desvío Std</div>
      <div style="font-size:13px;font-weight:700;font-family:var(--mono);">${fmt(std)}</div>
      <div style="font-size:10px;color:var(--text-3);">${Math.abs(current-avg)>std*1.5?'⚠️ Fuera de 1,5σ':'Dentro de 1,5σ'}</div>
    </div>`;

  // ─── Chart 1: Serie actual (solo este par) ───
  if(spChartCurrent){spChartCurrent.destroy();}
  const ctxC=document.getElementById('sp-chart-current').getContext('2d');
  spChartCurrent=new Chart(ctxC,{type:'line',data:{
    labels:filtered.map(s=>s.fecha),
    datasets:[
      {label:spMode==='basis'?'Basis':'Relación',data:filtered.map(s=>spMode==='basis'?s.basis:s.ratio),borderColor:'#1A6B3C',backgroundColor:'rgba(26,107,60,.06)',fill:true,borderWidth:1.5,pointRadius:0,tension:0.3},
      {label:'Promedio',data:filtered.map(()=>avg),borderColor:'#C8A44A',borderWidth:1,borderDash:[5,5],pointRadius:0}
    ]
  },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{font:{size:9},boxWidth:12}},tooltip:{mode:'index',intersect:false}},
    scales:{x:{ticks:{maxTicksLimit:8,font:{size:10}},grid:{display:false}},y:{min:yMin,max:yMax,ticks:{font:{size:10,family:'JetBrains Mono'}}}}}});

  // ─── Chart 2: Estacionalidad por DTE ───
  if(spChartSeason){spChartSeason.destroy();}
  const ctxS=document.getElementById('sp-chart-season').getContext('2d');
  const dsColors=['#1A6B3C','#2563eb','#e85d75','#7c3aed','#c43030','#0d9488','#6b7280','#ec4899'];
  const sKeys=Object.keys(seasonData).sort((a,b)=>a===currentKey?-1:b===currentKey?1:0);
  const sDatasets=[];let ci=0;
  for(const key of sKeys.slice(0,8)){
    const pts=seasonData[key].sort((a,b)=>b.dte-a.dte);
    const isCurr=key===currentKey;
    sDatasets.push({label:key,data:pts.map(p=>({x:p.dte,y:p.val})),showLine:true,
      borderColor:dsColors[ci%dsColors.length],backgroundColor:dsColors[ci%dsColors.length],
      borderWidth:isCurr?2.5:1.5,pointRadius:isCurr?3:2,tension:0.3,
      borderDash:isCurr?[]:[3,3],hidden:!isCurr});ci++;
  }
  // ─── Línea promedio: campañas ANTERIORES (sin la actual, para poder compararla) ───
  const avgByDte={};
  for(const key of sKeys.filter(k=>k!==currentKey)){
    (seasonData[key]||[]).forEach(p=>{
      const dteBin=Math.round(p.dte/5)*5;
      if(!avgByDte[dteBin])avgByDte[dteBin]={sum:0,count:0};
      avgByDte[dteBin].sum+=p.val;avgByDte[dteBin].count++;
    });
  }
  const avgPts=Object.keys(avgByDte).map(d=>({x:parseInt(d),y:avgByDte[d].sum/avgByDte[d].count})).sort((a,b)=>b.x-a.x);
  // Auto Y-axis inicial: Promedio + campaña actual (el resto arranca oculto)
  let sYMin=Infinity,sYMax=-Infinity;
  avgPts.concat((seasonData[currentKey]||[]).map(p=>({y:p.val}))).forEach(p=>{if(p.y<sYMin)sYMin=p.y;if(p.y>sYMax)sYMax=p.y;});
  const sPad=(sYMax-sYMin)*0.1||1;
  const sAxisMin=yMinInput!==''?parseFloat(yMinInput):Math.floor((sYMin-sPad)*10)/10;
  const sAxisMax=yMaxInput!==''?parseFloat(yMaxInput):Math.ceil((sYMax+sPad)*10)/10;
  if(avgPts.length>1){
    sDatasets.push({label:'Promedio',data:avgPts,showLine:true,borderColor:'#C8A44A',borderWidth:2.5,
      pointRadius:0,tension:0.4,borderDash:[6,3],backgroundColor:'rgba(217,119,6,.08)',fill:true});
  }
  function spSeasonRecalcY(chart){
    const yManMin=document.getElementById('sp-ymin').value;
    const yManMax=document.getElementById('sp-ymax').value;
    if(yManMin!==''&&yManMax!==''){
      chart.options.scales.y.min=parseFloat(yManMin);
      chart.options.scales.y.max=parseFloat(yManMax);
      chart.update('none');return;
    }
    let vMin=Infinity,vMax=-Infinity;
    chart.data.datasets.forEach((ds,i)=>{
      if(chart.getDatasetMeta(i).hidden)return;
      (ds.data||[]).forEach(p=>{if(p.y<vMin)vMin=p.y;if(p.y>vMax)vMax=p.y;});
    });
    if(!isFinite(vMin)||!isFinite(vMax))return;
    const pad=(vMax-vMin)*0.1||1;
    chart.options.scales.y.min=Math.floor((vMin-pad)*10)/10;
    chart.options.scales.y.max=Math.ceil((vMax+pad)*10)/10;
    chart.update('none');
  }
  spChartSeason=new Chart(ctxS,{
    type:'scatter',
    data:{datasets:sDatasets},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{
          display:true,
          labels:{font:{size:8},boxWidth:10},
          onClick:function(e,legendItem,legend){
            const index=legendItem.datasetIndex;
            const meta=legend.chart.getDatasetMeta(index);
            meta.hidden=meta.hidden===null?!legend.chart.data.datasets[index].hidden:!meta.hidden;
            spSeasonRecalcY(legend.chart);
          }
        },
        tooltip:{mode:'nearest'}
      },
      scales:{
        x:{title:{display:true,text:'Días al vencimiento',font:{size:10}},reverse:true,ticks:{font:{size:9}}},
        y:{min:sAxisMin,max:sAxisMax,title:{display:true,text:spMode==='basis'?'Basis (u$s)':'Relación',font:{size:10}},ticks:{font:{size:9,family:'JetBrains Mono'}}}
      }
    }
  });

  // ─── Chart 3: Distribución ───
  if(spChartDist){spChartDist.destroy();}
  const nBins=20;
  const binWidth=(max-min)/nBins||1;
  const bins=Array(nBins).fill(0);
  const binLabels=[];
  for(let i=0;i<nBins;i++){const lo=min+i*binWidth;binLabels.push(fmt(lo));vals.forEach(v=>{if(v>=lo&&(v<lo+binWidth||(i===nBins-1&&v<=max)))bins[i]++;});}
  const currentBin=Math.min(Math.floor((current-min)/binWidth),nBins-1);
  const barColors=bins.map((_,i)=>i===currentBin?'#1A6B3C':'#85B7EB');

  const ctxD=document.getElementById('sp-chart-dist').getContext('2d');
  spChartDist=new Chart(ctxD,{type:'bar',data:{labels:binLabels,datasets:[{data:bins,backgroundColor:barColors,borderRadius:2}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{title:(items)=>{const i=items[0].dataIndex;return `Rango: ${fmt(min+i*binWidth)} a ${fmt(min+(i+1)*binWidth)}`;},label:(item)=>`${item.raw} observaciones`}}},
      scales:{x:{ticks:{maxTicksLimit:10,font:{size:10,family:'JetBrains Mono'}},grid:{display:false}},y:{ticks:{font:{size:9}},grid:{color:'rgba(0,0,0,.05)'}}}}});

  // Insight
  const lowLabel=crop1===crop2?`${pos1} barato vs ${pos2}`:`${crop1} barato vs ${crop2}`;
  const highLabel=crop1===crop2?`${pos1} caro vs ${pos2}`:`${crop1} caro vs ${crop2}`;
  document.getElementById('sp-dist-insight').innerHTML=`<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-3);margin-bottom:8px;"><span>← ${lowLabel}</span><span>${highLabel} →</span></div>
    <div style="padding:10px;background:var(--bg-input);border-radius:8px;font-size:12px;color:var(--text-2);line-height:1.6;">
    💡 El valor actual (${fmt(current)}) está en el <strong>percentil ${percentile}</strong>. ${percentile<25?`En el ${100-percentile}% de los días la relación fue más alta — ${lowLabel}.`
    :percentile>75?`Solo en el ${100-percentile}% de los días fue más alto — ${highLabel}.`
    :`Rango normal — cerca del promedio histórico.`}
    ${spExcludedYears.size>0?`<br>Años excluidos: ${[...spExcludedYears].sort().join(', ')}.`:''}</div>`;

  // Table
  const last20=filtered.slice(-20).reverse();
  let tbl=`<table style="width:100%;border-collapse:collapse;font-size:11px;"><thead><tr>
    <th style="padding:5px 8px;border-bottom:2px solid var(--es-green);text-align:left;font-size:10px;">Fecha</th>
    <th style="padding:5px 8px;border-bottom:2px solid var(--es-green);text-align:center;">${lbl1}</th>
    <th style="padding:5px 8px;border-bottom:2px solid var(--es-green);text-align:center;">${lbl2}</th>
    <th style="padding:5px 8px;border-bottom:2px solid var(--es-green);text-align:center;">${spMode==='basis'?'Basis':'Relación'}</th>
    </tr></thead><tbody>`;
  last20.forEach(s=>{const v=spMode==='basis'?s.basis:s.ratio;const color=spMode==='basis'?(v>0?'var(--green)':'var(--red)'):(v>1?'var(--green)':'var(--red)');
    tbl+=`<tr><td style="padding:4px 8px;border-bottom:1px solid var(--border);font-family:var(--mono);">${s.fecha}</td>
      <td style="padding:4px 8px;border-bottom:1px solid var(--border);font-family:var(--mono);text-align:center;">${s.p1.toFixed(1)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid var(--border);font-family:var(--mono);text-align:center;">${s.p2.toFixed(1)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid var(--border);font-family:var(--mono);text-align:center;font-weight:700;color:${color};">${fmt(v)}</td></tr>`;});
  document.getElementById('sp-table').innerHTML=tbl+'</tbody></table>';
}
