// ═══════════════════════════════════════════════════
// ─── SPREADS, BASIS & RELACIONES ───
// ═══════════════════════════════════════════════════

function toggleSpreads(){
  spreadMode=true;theoryMode=false;retMode=false;paseMode=false;asstMode=false; spreadMode=true;
  document.getElementById('workspace').style.display='none';
  document.getElementById('theory-space').style.display='none';
  document.getElementById('ret-space').style.display='none';
  document.getElementById('pase-space').style.display='none';
  document.getElementById('spreads-space').style.display='block';
  document.getElementById('mkt-bar').style.display='none';
  renderTabs();renderModules();
  if(ASST_FUTPOS.length===0){asstLoadDrive().then(()=>{spInit();});}else{spInit();}
}

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

function spCalcSpread(){
  const crop1=document.getElementById('sp-crop1').value;
  const crop2=document.getElementById('sp-crop2').value;
  const pos1=document.getElementById('sp-pos1').value;
  const pos2=document.getElementById('sp-pos2').value;
  if(!pos1||!pos2){document.getElementById('sp-stats').innerHTML='<div style="grid-column:span 5;color:var(--text-3);font-size:12px;">Seleccioná posiciones.</div>';return;}
  if(crop1===crop2&&pos1===pos2){document.getElementById('sp-stats').innerHTML='<div style="grid-column:span 5;color:var(--text-3);font-size:12px;">Seleccioná dos posiciones diferentes.</div>';return;}

  // Build price maps
  const d1={},d2={};
  ASST_FUTPOS.filter(r=>r.cultivo===crop1&&r.pos===pos1).forEach(r=>{const dk=String(r.fecha).slice(0,10);d1[dk]=r;});
  ASST_FUTPOS.filter(r=>r.cultivo===crop2&&r.pos===pos2).forEach(r=>{const dk=String(r.fecha).slice(0,10);d2[dk]=r;});

  const dates=Object.keys(d1).filter(d=>d in d2).sort();
  if(dates.length<3){document.getElementById('sp-stats').innerHTML='<div style="grid-column:span 5;color:var(--text-3);font-size:12px;">No hay datos comunes entre estas posiciones.</div>';return;}

  const series=dates.map(d=>{
    const p1=d1[d].precio,p2=d2[d].precio;
    return{fecha:d,p1,p2,basis:p1-p2,ratio:p2>0?p1/p2:null,dte1:d1[d].dias_vto,dte2:d2[d].dias_vto,year:parseInt(d.slice(0,4))};
  });

  // Apply year filter
  const filtered=series.filter(s=>!spExcludedYears.has(s.year));
  const vals=filtered.map(s=>spMode==='basis'?s.basis:s.ratio).filter(v=>v!==null);
  if(vals.length<3){document.getElementById('sp-stats').innerHTML='<div style="grid-column:span 5;color:var(--text-3);font-size:12px;">Datos insuficientes después del filtro.</div>';return;}

  const current=vals[vals.length-1];
  const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
  const min=Math.min(...vals);const max=Math.max(...vals);
  const std=Math.sqrt(vals.reduce((a,v)=>a+(v-avg)**2,0)/vals.length);
  const percentile=Math.round(vals.filter(v=>v<=current).length/vals.length*100);
  const fmt=v=>spMode==='basis'?v.toFixed(1):v.toFixed(4);
  const diffVsAvg=current-avg;
  const diffPct=avg!==0?((current/avg-1)*100).toFixed(1):'—';
  const lbl1=`${crop1.charAt(0).toUpperCase()+crop1.slice(1)} ${pos1}`;
  const lbl2=`${crop2.charAt(0).toUpperCase()+crop2.slice(1)} ${pos2}`;

  // Y axis
  const yMinInput=document.getElementById('sp-ymin').value;
  const yMaxInput=document.getElementById('sp-ymax').value;
  const padding=(max-min)*0.1||1;
  const yMin=yMinInput!==''?parseFloat(yMinInput):Math.floor((min-padding)*10)/10;
  const yMax=yMaxInput!==''?parseFloat(yMaxInput):Math.ceil((max+padding)*10)/10;

  // Stats
  document.getElementById('sp-stats').innerHTML=`
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:9px;font-weight:700;color:var(--text-3);text-transform:uppercase;">Actual</div>
      <div style="font-size:20px;font-weight:700;font-family:var(--mono);">${fmt(current)}</div>
      <div style="font-size:10px;color:var(--text-3);">${lbl1} vs ${lbl2}</div>
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:9px;font-weight:700;color:var(--text-3);text-transform:uppercase;">Promedio</div>
      <div style="font-size:20px;font-weight:700;font-family:var(--mono);">${fmt(avg)}</div>
      <div style="font-size:10px;color:${diffVsAvg>0?'var(--green)':'var(--red)'};">${diffVsAvg>0?'+':''}${fmt(diffVsAvg)} (${diffPct}%)</div>
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:9px;font-weight:700;color:var(--text-3);text-transform:uppercase;">Percentil</div>
      <div style="font-size:20px;font-weight:700;font-family:var(--mono);color:${percentile>70?'var(--green)':percentile<30?'var(--red)':'var(--text)'};">P${percentile}</div>
      <div style="font-size:10px;color:var(--text-3);">${percentile>70?'Alto vs historia':percentile<30?'Bajo vs historia':'Rango normal'}</div>
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:9px;font-weight:700;color:var(--text-3);text-transform:uppercase;">Rango</div>
      <div style="font-size:13px;font-weight:700;font-family:var(--mono);">${fmt(min)} / ${fmt(max)}</div>
      <div style="font-size:10px;color:var(--text-3);">Mín / Máx</div>
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:9px;font-weight:700;color:var(--text-3);text-transform:uppercase;">Desvío</div>
      <div style="font-size:13px;font-weight:700;font-family:var(--mono);">${fmt(std)}</div>
      <div style="font-size:10px;color:var(--text-3);">${Math.abs(current-avg)>std*1.5?'⚠️ Fuera de 1.5σ':'Dentro de 1σ'}</div>
    </div>`;

  // ─── Chart 1: Serie actual (solo este par) ───
  if(spChartCurrent){spChartCurrent.destroy();}
  const ctxC=document.getElementById('sp-chart-current').getContext('2d');
  spChartCurrent=new Chart(ctxC,{type:'line',data:{
    labels:filtered.map(s=>s.fecha),
    datasets:[
      {label:spMode==='basis'?'Basis':'Relación',data:filtered.map(s=>spMode==='basis'?s.basis:s.ratio),borderColor:'#1A6B3C',backgroundColor:'rgba(26,107,60,.06)',fill:true,borderWidth:1.5,pointRadius:0,tension:0.3},
      {label:'Promedio',data:filtered.map(()=>avg),borderColor:'#d97706',borderWidth:1,borderDash:[5,5],pointRadius:0}
    ]
  },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{font:{size:9},boxWidth:12}},tooltip:{mode:'index',intersect:false}},
    scales:{x:{ticks:{maxTicksToRender:8,font:{size:9}},grid:{display:false}},y:{min:yMin,max:yMax,ticks:{font:{size:10,family:'JetBrains Mono'}}}}}});

  // ─── Chart 2: Estacionalidad por DTE ───
  const mes1=pos1.slice(0,3),mes2=pos2.slice(0,3);
  // Calculate the year offset of the current pair to only match equivalent campaigns
  // e.g. ABR27-MAY27 → offset 0; NOV26-MAY27 → offset +1
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
  if(spChartSeason){spChartSeason.destroy();}
  const ctxS=document.getElementById('sp-chart-season').getContext('2d');
  const dsColors=['#1A6B3C','#2563eb','#d97706','#7c3aed','#c43030','#0d9488','#6b7280','#ec4899'];
  const currentKey=`${pos1}-${pos2}`;
  const sKeys=Object.keys(seasonData).sort((a,b)=>a===currentKey?-1:b===currentKey?1:0);
  const sDatasets=[];let ci=0;
  for(const key of sKeys.slice(0,8)){
    const pts=seasonData[key].sort((a,b)=>b.dte-a.dte);
    const isCurr=key===currentKey;
    sDatasets.push({label:key,data:pts.map(p=>({x:p.dte,y:p.val})),borderColor:dsColors[ci%dsColors.length],borderWidth:isCurr?2.5:1,pointRadius:isCurr?2:0,tension:0.3,borderDash:isCurr?[]:[3,3]});ci++;
  }
  spChartSeason=new Chart(ctxS,{type:'scatter',data:{datasets:sDatasets},options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:true,labels:{font:{size:8},boxWidth:10}},tooltip:{mode:'nearest'}},
    scales:{x:{title:{display:true,text:'Días al vencimiento',font:{size:10}},reverse:true,ticks:{font:{size:9}}},
      y:{min:yMin,max:yMax,title:{display:true,text:spMode==='basis'?'Basis (u$s)':'Relación',font:{size:10}},ticks:{font:{size:9,family:'JetBrains Mono'}}}}}});

  // ─── Chart 3: Distribución ───
  if(spChartDist){spChartDist.destroy();}
  const nBins=20;
  const binWidth=(max-min)/nBins||1;
  const bins=Array(nBins).fill(0);
  const binLabels=[];
  for(let i=0;i<nBins;i++){const lo=min+i*binWidth;binLabels.push(fmt(lo));vals.forEach(v=>{if(v>=lo&&v<lo+binWidth)bins[i]++;});}
  const currentBin=Math.min(Math.floor((current-min)/binWidth),nBins-1);
  const barColors=bins.map((_,i)=>i===currentBin?'#1A6B3C':'#85B7EB');

  const ctxD=document.getElementById('sp-chart-dist').getContext('2d');
  spChartDist=new Chart(ctxD,{type:'bar',data:{labels:binLabels,datasets:[{data:bins,backgroundColor:barColors,borderRadius:2}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{title:(items)=>{const i=items[0].dataIndex;return `Rango: ${fmt(min+i*binWidth)} a ${fmt(min+(i+1)*binWidth)}`;},label:(item)=>`${item.raw} observaciones`}}},
      scales:{x:{ticks:{maxTicksToRender:10,font:{size:9,family:'JetBrains Mono'}},grid:{display:false}},y:{ticks:{font:{size:9}},grid:{color:'rgba(0,0,0,.05)'}}}}});

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
