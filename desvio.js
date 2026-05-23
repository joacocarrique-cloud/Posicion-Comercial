/* ═══════════════════════════════════════════════════════
   DESVÍO DE PRECIOS — Módulo Suite Comercial Espartina
   Volatilidad histórica por posición — datos reales de A3
   Usa ASST_FUTPOS (misma fuente que Spreads)
   ═══════════════════════════════════════════════════════ */

// ── State ──
let dvCrop='',dvPos='',dvActiveCamps={},dvSingleMode=null;
let dvOverlayChart=null,dvSingleChart=null,dvSeasonChart=null;
let dvVolCvChart=null,dvVolRealChart=null,dvVolRangoChart=null;

const DV_KEY_POS={soja:['MAY','JUL','NOV'],maiz:['ABR','JUL'],trigo:['DIC','JUL']};
const DV_CAMP_COLORS=['#1a6b3c','#c8a44a','#5b9bd5','#d4844a','#8b7db5','#c06080','#4a9aaa','#9a6aaa','#6aaa7a','#c0504a'];

function dvGetAllPositions(){
  const tree={};
  ASST_FUTPOS.forEach(r=>{
    const crop=r.cultivo,mes=r.mes_label;
    const anio=typeof r.anio_pos==='number'?r.anio_pos:parseInt(r.anio_pos);
    if(!crop||!mes||!anio||anio<2019)return;
    if(!tree[crop])tree[crop]={};
    if(!tree[crop][mes])tree[crop][mes]={};
    if(!tree[crop][mes][anio])tree[crop][mes][anio]=[];
    tree[crop][mes][anio].push({fecha:String(r.fecha).slice(0,10),precio:r.precio,dte:r.dias_vto});
  });
  for(const crop of Object.keys(tree))
    for(const mes of Object.keys(tree[crop]))
      for(const anio of Object.keys(tree[crop][mes]))
        tree[crop][mes][anio].sort((a,b)=>a.fecha.localeCompare(b.fecha));
  return tree;
}

function dvGetCampLabel(anio){
  const prev=(anio-1)%100,cur=anio%100;
  return String(prev).padStart(2,'0')+'/'+String(cur).padStart(2,'0');
}

function dvCalcMetrics(prices){
  if(!prices||!prices.length)return null;
  const vals=prices.map(p=>p.precio);
  const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
  const max=Math.max(...vals),min=Math.min(...vals);
  const stdDev=Math.sqrt(vals.reduce((s,v)=>s+(v-avg)**2,0)/vals.length);
  return{avg,max,min,desvMax:max-avg,desvMin:avg-min,
    desvMaxPct:((max-avg)/avg)*100,desvMinPct:((avg-min)/avg)*100,
    rango:max-min,rangoPct:((max-min)/avg)*100,
    cv:(stdDev/avg)*100,stdDev,count:prices.length};
}

function dvFmt(n,d){return n.toFixed(d===undefined?1:d);}
function dvUSD(n){return '$'+n.toFixed(1);}

function toggleDesvio(){
  const pills=document.querySelectorAll('.mod-pill');
  pills.forEach(p=>p.classList.remove('active'));
  pills.forEach(p=>{if(p.textContent.includes('Desvío'))p.classList.add('active');});
  document.getElementById('workspace').style.display='none';
  if(document.querySelector('.ret-section'))document.querySelector('.ret-section').style.display='none';
  if(document.querySelector('.pase-section'))document.querySelector('.pase-section').style.display='none';
  document.getElementById('spreads-space').style.display='none';
  document.getElementById('theory-space').style.display='none';
  document.getElementById('desvio-space').style.display='block';
  document.getElementById('tabs-container').style.display='none';
  document.getElementById('fob-bar').style.display='none';
  document.getElementById('mkt-bar').style.display='none';
  if(ASST_FUTPOS.length===0){asstLoadDrive().then(()=>{dvRenderOverview();});}
  else{dvRenderOverview();}
}

let dvFilterCrop='todos';

function dvRenderOverview(){
  const container=document.getElementById('dv-overview-cards');
  if(!container)return;
  container.innerHTML='';
  const tree=dvGetAllPositions();
  const syncNote=document.getElementById('dv-sync-note');
  if(syncNote)syncNote.textContent=ASST_FUTPOS.length+' registros cargados';

  // Build key items (posiciones principales)
  const keyItems=[];
  for(const crop of Object.keys(DV_KEY_POS)){
    DV_KEY_POS[crop].forEach(mes=>{
      if(!tree[crop]||!tree[crop][mes])return;
      const campaigns=tree[crop][mes];
      const campKeys=Object.keys(campaigns).sort((a,b)=>b-a);
      if(!campKeys.length)return;
      const allPrices=campKeys.flatMap(k=>campaigns[k]);
      const m=dvCalcMetrics(allPrices);
      if(m)keyItems.push({crop,mes,campaigns,campKeys,latestKey:campKeys[0],m,isKey:true});
    });
  }
  // Build other items
  const otherItems=[];
  for(const crop of Object.keys(tree)){
    for(const mes of Object.keys(tree[crop])){
      if(keyItems.find(it=>it.crop===crop&&it.mes===mes))continue;
      const campaigns=tree[crop][mes];
      const campKeys=Object.keys(campaigns).sort((a,b)=>b-a);
      if(!campKeys.length)continue;
      const allPrices=campKeys.flatMap(k=>campaigns[k]);
      const m=dvCalcMetrics(allPrices);
      if(m)otherItems.push({crop,mes,campaigns,campKeys,latestKey:campKeys[0],m,isKey:false});
    }
  }
  otherItems.sort((a,b)=>b.m.cv-a.m.cv);

  if(!keyItems.length&&!otherItems.length){
    container.innerHTML='<div style="padding:20px;color:var(--text-3);font-size:13px;">No hay datos cargados. Sincronizá A3 primero desde la barra de mercado.</div>';
    return;
  }

  // ── Filter chips ──
  const allCrops=['todos',...new Set([...keyItems,...otherItems].map(i=>i.crop))];
  const cropLabels={todos:'Todos',soja:'Soja',trigo:'Trigo',maiz:'Maíz',girasol:'Girasol',cebada:'Cebada',sorgo:'Sorgo'};
  const filterBar=document.createElement('div');
  filterBar.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;';
  allCrops.forEach(c=>{
    const btn=document.createElement('button');
    const label=cropLabels[c]||(c.charAt(0).toUpperCase()+c.slice(1));
    const isActive=dvFilterCrop===c;
    btn.textContent=label;
    btn.className='dv-chip'+(isActive?' active':'');
    btn.style.cssText=isActive
      ?'border-color:var(--es-green);color:var(--es-green);background:var(--es-green-bg,rgba(45,107,74,0.08));font-size:12px;padding:4px 12px;cursor:pointer;'
      :'font-size:12px;padding:4px 12px;cursor:pointer;';
    btn.onclick=()=>{dvFilterCrop=c;dvRenderOverview();};
    filterBar.appendChild(btn);
  });
  container.appendChild(filterBar);

  // ── Filter logic ──
  const filterFn=item=>dvFilterCrop==='todos'||item.crop===dvFilterCrop;
  const filteredKey=keyItems.filter(filterFn);
  const filteredOther=otherItems.filter(filterFn);

  // ── Render key positions ──
  if(filteredKey.length){
    const sectionLabel=document.createElement('div');
    sectionLabel.style.cssText='font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-3);margin-bottom:8px;padding-left:2px;';
    sectionLabel.textContent='Posiciones principales';
    container.appendChild(sectionLabel);
    filteredKey.forEach(item=>container.appendChild(dvBuildCard(item)));
  }

  // ── Render other positions ──
  if(filteredOther.length){
    const sep=document.createElement('div');
    sep.style.cssText='font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-3);margin:20px 0 8px 2px;padding-top:16px;border-top:1px solid var(--border,#dde0d5);';
    sep.textContent='Otras posiciones';
    container.appendChild(sep);
    filteredOther.forEach(item=>container.appendChild(dvBuildCard(item)));
  }
}

function dvBuildCard(item){
  const m=item.m;
  const avgPct=m.rango>0?((m.avg-m.min)/m.rango)*100:50;
  const cropLabel=item.crop.charAt(0).toUpperCase()+item.crop.slice(1);
  const card=document.createElement('div');
  card.className='dv-overview-card';
  card.onclick=()=>{dvCrop=item.crop;dvPos=item.mes;dvEnterDetail();};
  card.innerHTML=`
    <div class="dv-ov-header"><div><span class="dv-ov-crop">${cropLabel}</span><span class="dv-ov-pos">${item.mes}</span></div><span class="dv-ov-camps">${item.campKeys.length} campañas</span></div>
    <div class="dv-range-row"><span class="dv-range-min">${dvUSD(m.min)}</span><div class="dv-range-bar"><div class="dv-range-fill"></div><div class="dv-range-dot" style="left:${avgPct}%"></div></div><span class="dv-range-max">${dvUSD(m.max)}</span></div>
    <div class="dv-ov-metrics">
      <div class="dv-ov-metric"><div class="dv-ov-metric-lbl">Promedio</div><div class="dv-ov-metric-val">${dvUSD(m.avg)}</div></div>
      <div class="dv-ov-metric"><div class="dv-ov-metric-lbl">Desv+</div><div class="dv-ov-metric-val" style="color:var(--es-green);">+${dvFmt(m.desvMaxPct)}%</div></div>
      <div class="dv-ov-metric"><div class="dv-ov-metric-lbl">Desv−</div><div class="dv-ov-metric-val" style="color:var(--red);">−${dvFmt(m.desvMinPct)}%</div></div>
      <div class="dv-ov-metric"><div class="dv-ov-metric-lbl">CV</div><div class="dv-ov-metric-val" style="color:var(--es-gold);">${dvFmt(m.cv)}%</div></div>
    </div>
    <div class="dv-ov-footer">Última campaña (${dvGetCampLabel(parseInt(item.latestKey))})</div>`;
  return card;
}

function dvEnterDetail(){
  document.getElementById('dv-overview').style.display='none';
  document.getElementById('dv-detail').style.display='block';
  const tree=dvGetAllPositions();
  const cropSel=document.getElementById('dv-crop-sel');
  cropSel.innerHTML=Object.keys(tree).map(c=>`<option value="${c}" ${c===dvCrop?'selected':''}>${c.charAt(0).toUpperCase()+c.slice(1)}</option>`).join('');
  dvUpdatePosSel();
  const campaigns=tree[dvCrop]?.[dvPos]||{};
  const campKeys=Object.keys(campaigns).sort((a,b)=>b-a);
  dvActiveCamps={};campKeys.forEach(k=>dvActiveCamps[k]=true);
  dvSingleMode=null;
  dvRenderCampChips();dvRenderModeButtons();dvRenderTable();dvRenderChart();dvRenderVolPanel();
}

function dvUpdatePosSel(){
  const tree=dvGetAllPositions();
  const posSel=document.getElementById('dv-pos-sel');
  const positions=Object.keys(tree[dvCrop]||{}).sort();
  posSel.innerHTML=positions.map(p=>`<option value="${p}" ${p===dvPos?'selected':''}>${p}</option>`).join('');
  if(!positions.includes(dvPos)&&positions.length)dvPos=positions[0];
}
function dvOnCropChange(val){dvCrop=val;dvUpdatePosSel();dvPos=document.getElementById('dv-pos-sel').value;dvResetAndRender();}
function dvOnPosChange(val){dvPos=val;dvResetAndRender();}
function dvResetAndRender(){
  const tree=dvGetAllPositions();
  const campaigns=tree[dvCrop]?.[dvPos]||{};
  const campKeys=Object.keys(campaigns).sort((a,b)=>b-a);
  dvActiveCamps={};campKeys.forEach(k=>dvActiveCamps[k]=true);
  dvSingleMode=null;
  dvRenderCampChips();dvRenderModeButtons();dvRenderTable();dvRenderChart();dvRenderVolPanel();
}
function dvBackToOverview(){
  document.getElementById('dv-overview').style.display='block';
  document.getElementById('dv-detail').style.display='none';
  if(dvOverlayChart){dvOverlayChart.destroy();dvOverlayChart=null;}
  if(dvSingleChart){dvSingleChart.destroy();dvSingleChart=null;}
  if(dvSeasonChart){dvSeasonChart.destroy();dvSeasonChart=null;}
  if(dvVolCvChart){dvVolCvChart.destroy();dvVolCvChart=null;}
  if(dvVolRealChart){dvVolRealChart.destroy();dvVolRealChart=null;}
  if(dvVolRangoChart){dvVolRangoChart.destroy();dvVolRangoChart=null;}
}

function dvRenderCampChips(){
  const container=document.getElementById('dv-camp-chips');
  const tree=dvGetAllPositions();
  const campaigns=tree[dvCrop]?.[dvPos]||{};
  const campKeys=Object.keys(campaigns).sort((a,b)=>b-a);
  container.innerHTML=campKeys.map((k,i)=>{
    const color=DV_CAMP_COLORS[i%DV_CAMP_COLORS.length];
    const active=dvActiveCamps[k];
    const label=dvGetCampLabel(parseInt(k));
    return `<button class="dv-chip ${active?'active':''}" style="${active?'border-color:'+color+';color:'+color+';background:'+color+'12;':''}" onclick="dvToggleCamp('${k}')"><span class="dv-chip-dot" style="background:${active?color:'var(--text-3)'}"></span>${label}</button>`;
  }).join('');
}
function dvToggleCamp(k){dvSingleMode=null;dvActiveCamps[k]=!dvActiveCamps[k];dvRenderCampChips();dvRenderModeButtons();dvRenderChart();}

function dvRenderModeButtons(){
  document.getElementById('dv-btn-compare').className='dv-mode-btn'+(!dvSingleMode?' active':'');
  document.getElementById('dv-btn-single').className='dv-mode-btn'+(dvSingleMode?' active':'');
  const tree=dvGetAllPositions();
  const campaigns=tree[dvCrop]?.[dvPos]||{};
  const campKeys=Object.keys(campaigns).sort((a,b)=>b-a);
  const singleSel=document.getElementById('dv-single-selector');
  if(dvSingleMode){
    singleSel.style.display='flex';
    singleSel.innerHTML=campKeys.map((k,i)=>{
      const color=DV_CAMP_COLORS[i%DV_CAMP_COLORS.length];
      const label=dvGetCampLabel(parseInt(k));
      return `<button class="dv-chip ${dvSingleMode===k?'active':''}" style="${dvSingleMode===k?'border-color:'+color+';color:'+color+';background:'+color+'12;':''}" onclick="dvSelectSingle('${k}')">${label}</button>`;
    }).join('');
  }else{singleSel.style.display='none';}
  const kpiContainer=document.getElementById('dv-kpi-cards');
  if(dvSingleMode&&campaigns[dvSingleMode]){
    const m=dvCalcMetrics(campaigns[dvSingleMode]);
    if(m){
      kpiContainer.style.display='grid';
      kpiContainer.innerHTML=[
        {l:'Promedio',v:dvUSD(m.avg),c:'var(--text)'},
        {l:'Máximo',v:dvUSD(m.max),s:'+'+dvFmt(m.desvMaxPct)+'%',c:'var(--es-green)'},
        {l:'Mínimo',v:dvUSD(m.min),s:'−'+dvFmt(m.desvMinPct)+'%',c:'var(--red)'},
        {l:'Rango',v:dvUSD(m.rango),s:dvFmt(m.rangoPct)+'%',c:'var(--es-gold)'},
        {l:'CV',v:dvFmt(m.cv)+'%',s:'σ '+dvUSD(m.stdDev),c:'var(--es-gold)'},
        {l:'Ruedas',v:m.count,c:'var(--text-2)'},
      ].map(kpi=>`<div class="dv-kpi"><div class="dv-kpi-lbl">${kpi.l}</div><div class="dv-kpi-val" style="color:${kpi.c}">${kpi.v}</div>${kpi.s?'<div class="dv-kpi-sub">'+kpi.s+'</div>':''}</div>`).join('');
    }
  }else{kpiContainer.style.display='none';}
}
function dvSetCompare(){dvSingleMode=null;dvRenderModeButtons();dvRenderChart();}
function dvSetSingle(){
  const tree=dvGetAllPositions();
  const campaigns=tree[dvCrop]?.[dvPos]||{};
  const campKeys=Object.keys(campaigns).sort((a,b)=>b-a);
  const visible=campKeys.filter(k=>dvActiveCamps[k]);
  dvSingleMode=visible[0]||campKeys[0];
  dvRenderModeButtons();dvRenderChart();
}
function dvSelectSingle(k){dvSingleMode=k;dvRenderModeButtons();dvRenderChart();}

function dvRenderTable(){
  const tbody=document.getElementById('dv-table-body');
  const tree=dvGetAllPositions();
  const campaigns=tree[dvCrop]?.[dvPos]||{};
  const campKeys=Object.keys(campaigns).sort((a,b)=>b-a);
  const metrics=campKeys.map(k=>({k,m:dvCalcMetrics(campaigns[k])})).filter(x=>x.m);
  const maxCV=Math.max(...metrics.map(x=>x.m.cv),1);
  tbody.innerHTML=metrics.map(({k,m},i)=>{
    const color=DV_CAMP_COLORS[i%DV_CAMP_COLORS.length];
    const barW=(m.cv/maxCV)*85;
    const label=dvGetCampLabel(parseInt(k));
    return `<tr onclick="dvSingleMode='${k}';dvRenderModeButtons();dvRenderChart();" style="cursor:pointer;">
      <td style="border-radius:6px 0 0 6px;"><span class="dv-chip-dot" style="background:${color};display:inline-block;vertical-align:middle;margin-right:6px;"></span><span style="color:${color};font-weight:700;">${label}</span></td>
      <td style="font-weight:700;">${dvUSD(m.avg)}</td>
      <td style="color:var(--es-green);">${dvUSD(m.max)}</td>
      <td style="color:var(--red);">${dvUSD(m.min)}</td>
      <td style="color:var(--es-green);">+${dvFmt(m.desvMaxPct)}%</td>
      <td style="color:var(--red);">−${dvFmt(m.desvMinPct)}%</td>
      <td style="border-radius:0 6px 6px 0;position:relative;min-width:70px;">
        <div style="position:absolute;left:2px;top:50%;transform:translateY(-50%);height:4px;width:${barW}%;background:${color}33;border-radius:2px;"></div>
        <span style="position:relative;color:${color};font-weight:700;">${dvFmt(m.cv)}%</span></td></tr>`;
  }).join('');
}

function dvRenderChart(){
  const tree=dvGetAllPositions();
  const campaigns=tree[dvCrop]?.[dvPos];
  if(!campaigns)return;
  const cropLabel=dvCrop.charAt(0).toUpperCase()+dvCrop.slice(1);
  document.getElementById('dv-chart-title-text').textContent=cropLabel+' — Posición '+dvPos;
  const seasonWrap=document.getElementById('dv-season-wrap');
  if(dvSingleMode){
    dvRenderSingleChart(campaigns);
    if(seasonWrap)seasonWrap.style.display='none';
    if(dvSeasonChart){dvSeasonChart.destroy();dvSeasonChart=null;}
  }else{
    dvRenderOverlayChart(campaigns);
    if(seasonWrap)seasonWrap.style.display='block';
    dvRenderSeasonChart(campaigns);
  }
}

function dvRenderOverlayChart(campaigns){
  document.getElementById('dv-chart-overlay-wrap').style.display='block';
  document.getElementById('dv-chart-single-wrap').style.display='none';
  document.getElementById('dv-chart-legend').textContent='Evolución por rueda de negociación · Campañas superpuestas';
  if(dvOverlayChart){dvOverlayChart.destroy();dvOverlayChart=null;}
  if(dvSingleChart){dvSingleChart.destroy();dvSingleChart=null;}
  const campKeys=Object.keys(campaigns).sort((a,b)=>b-a);
  const visible=campKeys.filter(k=>dvActiveCamps[k]);
  if(!visible.length)return;
  const maxLen=Math.max(...visible.map(k=>campaigns[k].length));
  const labels=Array.from({length:maxLen},(_,i)=>'D'+i);
  const datasets=[];
  visible.forEach(k=>{
    const ci=campKeys.indexOf(k);
    const color=DV_CAMP_COLORS[ci%DV_CAMP_COLORS.length];
    const isLatest=ci===0;
    datasets.push({label:dvGetCampLabel(parseInt(k)),data:campaigns[k].map(p=>p.precio),borderColor:color,borderWidth:isLatest?2.5:1.5,pointRadius:0,tension:0.3,borderDash:isLatest?[]:[4,2]});
  });
  visible.forEach(k=>{
    const ci=campKeys.indexOf(k);const color=DV_CAMP_COLORS[ci%DV_CAMP_COLORS.length];
    const m=dvCalcMetrics(campaigns[k]);
    if(m)datasets.push({label:'Prom '+dvGetCampLabel(parseInt(k)),data:Array(campaigns[k].length).fill(m.avg),borderColor:color+'55',borderWidth:1,borderDash:[6,6],pointRadius:0,tension:0});
  });
  const ctx=document.getElementById('dv-chart-overlay').getContext('2d');
  dvOverlayChart=new Chart(ctx,{type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{display:true,position:'top',labels:{filter:item=>!item.text.startsWith('Prom'),font:{family:'JetBrains Mono',size:11},boxWidth:16,boxHeight:2,padding:12}},
      tooltip:{backgroundColor:'#fff',titleColor:'#1c2118',bodyColor:'#505845',borderColor:'#dde0d5',borderWidth:1,titleFont:{family:'Montserrat',weight:'700',size:12},bodyFont:{family:'JetBrains Mono',size:11},padding:10,cornerRadius:8,
        callbacks:{label:ctx=>{if(ctx.dataset.label.startsWith('Prom'))return null;return ctx.dataset.label+': $'+ctx.parsed.y.toFixed(1);}}}},
    scales:{x:{ticks:{font:{family:'JetBrains Mono',size:10},color:'#7e8574',maxTicksLimit:12},grid:{color:'#dde0d522'}},
      y:{ticks:{font:{family:'JetBrains Mono',size:10},color:'#7e8574',callback:v=>'$'+v},grid:{color:'#dde0d544'}}}}});
}

function dvRenderSingleChart(campaigns){
  document.getElementById('dv-chart-overlay-wrap').style.display='none';
  document.getElementById('dv-chart-single-wrap').style.display='block';
  const campKeys=Object.keys(campaigns).sort((a,b)=>b-a);
  const ci=campKeys.indexOf(dvSingleMode);
  const lineColor=DV_CAMP_COLORS[ci%DV_CAMP_COLORS.length];
  const campLabel=dvGetCampLabel(parseInt(dvSingleMode));
  document.getElementById('dv-chart-legend').innerHTML='Campaña '+campLabel+' · <span style="color:var(--es-green);">▲ Por encima</span> · <span style="color:var(--red);">▼ Por debajo</span>';
  if(dvOverlayChart){dvOverlayChart.destroy();dvOverlayChart=null;}
  if(dvSingleChart){dvSingleChart.destroy();dvSingleChart=null;}
  const prices=campaigns[dvSingleMode];
  if(!prices||!prices.length)return;
  const m=dvCalcMetrics(prices);if(!m)return;
  const labels=prices.map(p=>p.fecha.slice(5));
  const priceData=prices.map(p=>p.precio);
  const avgLine=prices.map(()=>m.avg);
  const aboveData=prices.map(p=>p.precio>=m.avg?p.precio:m.avg);
  const belowData=prices.map(p=>p.precio<m.avg?p.precio:m.avg);
  const ctx=document.getElementById('dv-chart-single').getContext('2d');
  dvSingleChart=new Chart(ctx,{type:'line',data:{labels,datasets:[
    {label:'Sobre promedio',data:aboveData,borderColor:'transparent',backgroundColor:'rgba(26,107,60,0.15)',fill:{target:'+1',above:'rgba(26,107,60,0.15)'},pointRadius:0,tension:0.3,order:3},
    {label:'Promedio',data:avgLine,borderColor:'#c8a44a',borderWidth:1.5,borderDash:[8,4],pointRadius:0,fill:false,order:2},
    {label:'Bajo promedio',data:belowData,borderColor:'transparent',backgroundColor:'rgba(196,48,48,0.12)',fill:{target:'-1',below:'rgba(196,48,48,0.12)'},pointRadius:0,tension:0.3,order:3},
    {label:'Precio',data:priceData,borderColor:lineColor,borderWidth:2,pointRadius:0,tension:0.3,fill:false,order:1}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false},tooltip:{backgroundColor:'#fff',titleColor:'#1c2118',bodyColor:'#505845',borderColor:'#dde0d5',borderWidth:1,
        titleFont:{family:'Montserrat',weight:'700',size:12},bodyFont:{family:'JetBrains Mono',size:11},padding:10,cornerRadius:8,
        callbacks:{title:items=>{const idx=items[0]?.dataIndex;return prices[idx]?.fecha||'';},
          label:ctx=>{if(ctx.dataset.label==='Precio'){const diff=ctx.parsed.y-m.avg;const pct=(diff/m.avg)*100;return['Precio: $'+ctx.parsed.y.toFixed(1),'Promedio: $'+m.avg.toFixed(1),'Desvío: '+(diff>=0?'+':'')+diff.toFixed(1)+' ('+(diff>=0?'+':'')+pct.toFixed(1)+'%)'];}return null;}}}},
      scales:{x:{ticks:{font:{family:'JetBrains Mono',size:9},color:'#7e8574',maxTicksLimit:12},grid:{color:'#dde0d522'}},
        y:{min:m.min-5,max:m.max+5,ticks:{font:{family:'JetBrains Mono',size:10},color:'#7e8574',callback:v=>'$'+v},grid:{color:'#dde0d544'}}}}});
}

// ── Seasonality chart: deviation % by DTE ──
function dvRenderSeasonChart(campaigns){
  if(dvSeasonChart){dvSeasonChart.destroy();dvSeasonChart=null;}
  const campKeys=Object.keys(campaigns).sort((a,b)=>b-a);
  const visible=campKeys.filter(k=>dvActiveCamps[k]);
  if(!visible.length)return;

  const datasets=[];
  const avgByDte={};

  visible.forEach((k,vi)=>{
    const ci=campKeys.indexOf(k);
    const color=DV_CAMP_COLORS[ci%DV_CAMP_COLORS.length];
    const isLatest=ci===0;
    const label=dvGetCampLabel(parseInt(k));
    const prices=campaigns[k];
    const m=dvCalcMetrics(prices);
    if(!m)return;

    // Build scatter points: x=DTE, y=desvio%
    const pts=prices.filter(p=>p.dte!=null&&p.dte>0).map(p=>({
      x:p.dte,
      y:((p.precio-m.avg)/m.avg)*100
    })).sort((a,b)=>b.x-a.x);

    if(!pts.length)return;

    // Accumulate for average line
    pts.forEach(p=>{
      const bin=Math.round(p.x/5)*5;
      if(!avgByDte[bin])avgByDte[bin]={sum:0,count:0};
      avgByDte[bin].sum+=p.y;
      avgByDte[bin].count++;
    });

    datasets.push({
      label:label,
      data:pts,
      showLine:true,
      borderColor:color,
      backgroundColor:color,
      borderWidth:isLatest?2.5:1.5,
      pointRadius:isLatest?2:1,
      tension:0.3,
      borderDash:isLatest?[]:[3,3],
    });
  });

  // Average line across all campaigns
  const avgPts=Object.keys(avgByDte)
    .map(d=>({x:parseInt(d),y:avgByDte[d].sum/avgByDte[d].count}))
    .sort((a,b)=>b.x-a.x);

  if(avgPts.length>1){
    datasets.push({
      label:'Promedio',
      data:avgPts,
      showLine:true,
      borderColor:'#d97706',
      borderWidth:2.5,
      pointRadius:0,
      tension:0.4,
      borderDash:[6,3],
      backgroundColor:'rgba(217,119,6,.08)',
      fill:true,
    });
  }

  // Y axis range from data
  let yMin=0,yMax=0;
  datasets.forEach(ds=>(ds.data||[]).forEach(p=>{if(p.y<yMin)yMin=p.y;if(p.y>yMax)yMax=p.y;}));
  const yPad=(yMax-yMin)*0.1||2;

  const ctx=document.getElementById('dv-chart-season').getContext('2d');
  dvSeasonChart=new Chart(ctx,{
    type:'scatter',
    data:{datasets},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{mode:'nearest',intersect:false},
      plugins:{
        legend:{display:true,position:'top',labels:{font:{family:'JetBrains Mono',size:10},boxWidth:12,boxHeight:2,padding:10}},
        tooltip:{
          backgroundColor:'#fff',titleColor:'#1c2118',bodyColor:'#505845',
          borderColor:'#dde0d5',borderWidth:1,
          titleFont:{family:'Montserrat',weight:'700',size:12},
          bodyFont:{family:'JetBrains Mono',size:11},
          padding:10,cornerRadius:8,
          callbacks:{
            title:items=>{const p=items[0]?.parsed;return p?'DTE: '+Math.round(p.x)+' días':'';},
            label:ctx=>{
              const v=ctx.parsed.y;
              return ctx.dataset.label+': '+(v>=0?'+':'')+v.toFixed(1)+'%';
            }
          }
        }
      },
      scales:{
        x:{
          title:{display:true,text:'Días al vencimiento',font:{family:'Montserrat',size:11,weight:'600'},color:'#505845'},
          reverse:true,
          ticks:{font:{family:'JetBrains Mono',size:9},color:'#7e8574'},
          grid:{color:'#dde0d522'},
        },
        y:{
          min:Math.floor(yMin-yPad),
          max:Math.ceil(yMax+yPad),
          title:{display:true,text:'Desvío %',font:{family:'Montserrat',size:11,weight:'600'},color:'#505845'},
          ticks:{font:{family:'JetBrains Mono',size:10},color:'#7e8574',callback:v=>(v>=0?'+':'')+v+'%'},
          grid:{color:'#dde0d544'},
        }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════
// PANEL DE VOLATILIDAD — CV + Realizada + Rango por campaña
// ═══════════════════════════════════════════════════════

function dvCalcRealizedVol(prices){
  // Annualized realized volatility from daily log returns
  if(!prices||prices.length<3)return null;
  const sorted=[...prices].sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const logRets=[];
  for(let i=1;i<sorted.length;i++){
    if(sorted[i].precio>0&&sorted[i-1].precio>0){
      logRets.push(Math.log(sorted[i].precio/sorted[i-1].precio));
    }
  }
  if(logRets.length<2)return null;
  const avg=logRets.reduce((a,b)=>a+b,0)/logRets.length;
  const variance=logRets.reduce((s,r)=>s+(r-avg)**2,0)/(logRets.length-1);
  const dailyVol=Math.sqrt(variance);
  const annualVol=dailyVol*Math.sqrt(252);
  return{annualVol:annualVol*100,dailyVol:dailyVol*100,nReturns:logRets.length};
}

function dvRenderVolPanel(){
  const tree=dvGetAllPositions();
  const campaigns=tree[dvCrop]?.[dvPos];
  if(!campaigns)return;
  const campKeys=Object.keys(campaigns).sort();// chronological

  // Ensure container exists
  let wrap=document.getElementById('dv-vol-panel');
  if(!wrap){
    wrap=document.createElement('div');
    wrap.id='dv-vol-panel';
    // Insert after season wrap or at end of detail
    const detail=document.getElementById('dv-detail');
    if(detail)detail.appendChild(wrap);
  }

  // Destroy previous charts
  if(dvVolCvChart){dvVolCvChart.destroy();dvVolCvChart=null;}
  if(dvVolRealChart){dvVolRealChart.destroy();dvVolRealChart=null;}
  if(dvVolRangoChart){dvVolRangoChart.destroy();dvVolRangoChart=null;}

  // Compute per-campaign data
  const labels=[], cvData=[], volData=[], rangoData=[];
  const cvColors=[], volColors=[], rangoColors=[];
  let avgCv=0, avgVol=0, avgRango=0, countCv=0, countVol=0, countRango=0;

  campKeys.forEach(k=>{
    const prices=campaigns[k];
    const label=dvGetCampLabel(parseInt(k));
    const m=dvCalcMetrics(prices);
    const rv=dvCalcRealizedVol(prices);
    labels.push(label);
    if(m){
      cvData.push(m.cv);avgCv+=m.cv;countCv++;
      rangoData.push(m.rangoPct);avgRango+=m.rangoPct;countRango++;
    }else{cvData.push(null);rangoData.push(null);}
    if(rv){volData.push(rv.annualVol);avgVol+=rv.annualVol;countVol++;}
    else{volData.push(null);}
  });

  avgCv=countCv?avgCv/countCv:0;
  avgVol=countVol?avgVol/countVol:0;
  avgRango=countRango?avgRango/countRango:0;

  // Determine which campaigns are "recent" (last 2) for color coding
  const recentIdx=new Set();
  for(let i=campKeys.length-1;i>=Math.max(0,campKeys.length-2);i--)recentIdx.add(i);

  campKeys.forEach((_,i)=>{
    const isRecent=recentIdx.has(i);
    cvColors.push(isRecent?'#1a6b3c':'#1a6b3c88');
    volColors.push(isRecent?'#5b9bd5':'#5b9bd588');
    rangoColors.push(isRecent?'#c8a44a':'#c8a44a88');
  });

  const cropLabel=dvCrop.charAt(0).toUpperCase()+dvCrop.slice(1);

  wrap.innerHTML=`
    <div style="margin-top:32px;padding-top:24px;border-top:1px solid var(--border,#dde0d5);">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
        <span style="font-size:15px;font-weight:700;color:var(--text);font-family:var(--font-head,'Plus Jakarta Sans',sans-serif);">Análisis de Volatilidad</span>
        <span style="font-size:11px;color:var(--text-3);font-family:var(--font-mono,'JetBrains Mono',monospace);">${cropLabel} ${dvPos} · ${campKeys.length} campañas</span>
      </div>
      <p style="font-size:12px;color:var(--text-3);margin:0 0 20px 0;line-height:1.5;">
        Las últimas 2 campañas se resaltan en color sólido. La línea punteada marca el promedio histórico.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div>
          <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:8px;font-family:var(--font-head,'Plus Jakarta Sans',sans-serif);">
            Volatilidad Realizada <span style="font-weight:400;color:var(--text-3);">(anualizada, log returns × √252)</span>
          </div>
          <div style="position:relative;height:220px;"><canvas id="dv-vol-real-chart"></canvas></div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:8px;font-family:var(--font-head,'Plus Jakarta Sans',sans-serif);">
            Coeficiente de Variación <span style="font-weight:400;color:var(--text-3);">(σ/μ por campaña)</span>
          </div>
          <div style="position:relative;height:220px;"><canvas id="dv-vol-cv-chart"></canvas></div>
        </div>
      </div>
      <div style="margin-top:20px;">
        <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:8px;font-family:var(--font-head,'Plus Jakarta Sans',sans-serif);">
          Rango Intra-Campaña <span style="font-weight:400;color:var(--text-3);">((Máx−Mín)/Promedio %)</span>
        </div>
        <div style="position:relative;height:200px;"><canvas id="dv-vol-rango-chart"></canvas></div>
      </div>
      <div id="dv-vol-summary" style="margin-top:16px;"></div>
      <details style="margin-top:20px;border:1px solid var(--border,#dde0d5);border-radius:10px;overflow:hidden;">
        <summary style="padding:12px 18px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-2);font-family:var(--font-head,'Plus Jakarta Sans',sans-serif);background:var(--bg-2,#f5f5f0);user-select:none;">
          ¿Cómo se calcula cada indicador?
        </summary>
        <div style="padding:16px 18px;font-size:12px;color:var(--text-2);line-height:1.7;font-family:var(--font-body,'Plus Jakarta Sans',sans-serif);">
          <div style="margin-bottom:16px;">
            <div style="font-weight:700;color:var(--text);margin-bottom:4px;">📊 Volatilidad Realizada (anualizada)</div>
            <div style="margin-bottom:6px;"><strong>Qué muestra:</strong> Cuánto se movió el precio día a día dentro de cada campaña, expresado como porcentaje anual. Es el indicador más relevante para comparar contra la volatilidad implícita que cotiza en las opciones de MATBA.</div>
            <div><strong>Cómo se calcula:</strong> Para cada par de ruedas consecutivas se calcula el retorno logarítmico: ln(Precio₂/Precio₁). Se toma el desvío estándar de todos esos retornos diarios y se anualiza multiplicando por √252 (ruedas de negociación por año). Una vol realizada de 20% significa que, en promedio, el precio se movió ±20% anual.</div>
          </div>
          <div style="margin-bottom:16px;">
            <div style="font-weight:700;color:var(--text);margin-bottom:4px;">📈 Coeficiente de Variación (CV)</div>
            <div style="margin-bottom:6px;"><strong>Qué muestra:</strong> Qué tan dispersos estuvieron los precios respecto al promedio dentro de cada campaña. A diferencia de la volatilidad realizada, no mide movimientos día a día sino la dispersión total. Un CV bajo indica que el precio se mantuvo estable cerca del promedio; un CV alto indica que hubo mucha variación.</div>
            <div><strong>Cómo se calcula:</strong> Se toma el desvío estándar de todos los precios de la campaña (σ) y se divide por el promedio (μ): CV = σ/μ × 100. Al expresarse como porcentaje del promedio, permite comparar entre cultivos con precios distintos.</div>
          </div>
          <div style="margin-bottom:16px;">
            <div style="font-weight:700;color:var(--text);margin-bottom:4px;">📏 Rango Intra-Campaña</div>
            <div style="margin-bottom:6px;"><strong>Qué muestra:</strong> La amplitud total del precio dentro de una campaña, normalizada por el promedio. Es el indicador más intuitivo: simplemente cuánto separó el máximo del mínimo. Un rango de 15% significa que entre el punto más alto y más bajo de la campaña hubo una diferencia del 15% sobre el promedio.</div>
            <div><strong>Cómo se calcula:</strong> Rango % = (Máximo − Mínimo) / Promedio × 100. A diferencia del CV y la vol realizada, es muy sensible a eventos puntuales: un solo día con un spike empuja el rango aunque el resto de la campaña haya sido tranquila.</div>
          </div>
          <div style="padding-top:12px;border-top:1px solid var(--border,#dde0d5);color:var(--text-3);font-size:11px;line-height:1.6;">
            <strong>Lectura conjunta:</strong> Si la volatilidad realizada y el CV de las últimas campañas están por debajo del promedio histórico, las primas de opciones deberían ser menores. Si además el rango intra-campaña también es bajo, la señal es más fuerte: no fue solo menos movimiento diario, sino que el precio efectivamente se mantuvo en un rango acotado.
          </div>
        </div>
      </details>
    </div>`;

  // ── Chart defaults ──
  const chartFont={family:'JetBrains Mono',size:10};
  const gridColor='#dde0d544';
  const tooltipStyle={backgroundColor:'#fff',titleColor:'#1c2118',bodyColor:'#505845',borderColor:'#dde0d5',borderWidth:1,
    titleFont:{family:'Montserrat',weight:'700',size:12},bodyFont:{family:'JetBrains Mono',size:11},padding:10,cornerRadius:8};

  // ── Realized Vol chart ──
  const ctxVol=document.getElementById('dv-vol-real-chart').getContext('2d');
  dvVolRealChart=new Chart(ctxVol,{type:'bar',data:{labels,datasets:[
    {label:'Vol. Realizada %',data:volData,backgroundColor:volColors,borderRadius:4,barPercentage:0.7},
    {label:'Promedio',data:labels.map(()=>avgVol),type:'line',borderColor:'#5b9bd5',borderWidth:1.5,borderDash:[6,4],pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{display:false},tooltip:{...tooltipStyle,callbacks:{label:ctx=>ctx.dataset.label+': '+dvFmt(ctx.parsed.y)+'%'}}},
    scales:{x:{ticks:{font:chartFont,color:'#7e8574'},grid:{display:false}},
      y:{ticks:{font:chartFont,color:'#7e8574',callback:v=>v+'%'},grid:{color:gridColor},beginAtZero:true}}}});

  // ── CV chart ──
  const ctxCv=document.getElementById('dv-vol-cv-chart').getContext('2d');
  dvVolCvChart=new Chart(ctxCv,{type:'bar',data:{labels,datasets:[
    {label:'CV %',data:cvData,backgroundColor:cvColors,borderRadius:4,barPercentage:0.7},
    {label:'Promedio',data:labels.map(()=>avgCv),type:'line',borderColor:'#1a6b3c',borderWidth:1.5,borderDash:[6,4],pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{display:false},tooltip:{...tooltipStyle,callbacks:{label:ctx=>ctx.dataset.label+': '+dvFmt(ctx.parsed.y)+'%'}}},
    scales:{x:{ticks:{font:chartFont,color:'#7e8574'},grid:{display:false}},
      y:{ticks:{font:chartFont,color:'#7e8574',callback:v=>v+'%'},grid:{color:gridColor},beginAtZero:true}}}});

  // ── Rango chart ──
  const ctxR=document.getElementById('dv-vol-rango-chart').getContext('2d');
  dvVolRangoChart=new Chart(ctxR,{type:'bar',data:{labels,datasets:[
    {label:'Rango %',data:rangoData,backgroundColor:rangoColors,borderRadius:4,barPercentage:0.7},
    {label:'Promedio',data:labels.map(()=>avgRango),type:'line',borderColor:'#c8a44a',borderWidth:1.5,borderDash:[6,4],pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{display:false},tooltip:{...tooltipStyle,callbacks:{label:ctx=>ctx.dataset.label+': '+dvFmt(ctx.parsed.y)+'%'}}},
    scales:{x:{ticks:{font:chartFont,color:'#7e8574'},grid:{display:false}},
      y:{ticks:{font:chartFont,color:'#7e8574',callback:v=>v+'%'},grid:{color:gridColor},beginAtZero:true}}}});

  // ── Summary text ──
  const summary=document.getElementById('dv-vol-summary');
  if(summary&&countVol>=3){
    // Compare last 2 campaigns vs historical average
    const recentVols=volData.slice(-2).filter(v=>v!=null);
    const recentAvg=recentVols.length?recentVols.reduce((a,b)=>a+b,0)/recentVols.length:0;
    const diff=((recentAvg-avgVol)/avgVol)*100;
    const isLower=diff<-10;
    const isHigher=diff>10;
    const emoji=isLower?'📉':isHigher?'📈':'➡️';
    const color=isLower?'var(--es-green)':isHigher?'var(--red)':'var(--text-2)';
    const verdict=isLower
      ?'Las últimas campañas muestran volatilidad significativamente menor al promedio histórico. Esto es consistente con primas de opciones bajas.'
      :isHigher
      ?'Las últimas campañas muestran volatilidad por encima del promedio histórico. Las opciones deberían estar relativamente caras.'
      :'Las últimas campañas muestran volatilidad en línea con el promedio histórico.';
    summary.innerHTML=`
      <div style="background:var(--bg-2,#f5f5f0);border-radius:10px;padding:14px 18px;display:flex;align-items:flex-start;gap:12px;">
        <span style="font-size:20px;">${emoji}</span>
        <div>
          <div style="font-size:12px;font-weight:700;color:${color};margin-bottom:4px;font-family:var(--font-head,'Plus Jakarta Sans',sans-serif);">
            Vol. realizada reciente: ${dvFmt(recentAvg)}% vs promedio histórico: ${dvFmt(avgVol)}% (${diff>=0?'+':''}${dvFmt(diff)}%)
          </div>
          <div style="font-size:12px;color:var(--text-2);line-height:1.5;">${verdict}</div>
        </div>
      </div>`;
  }else if(summary){summary.innerHTML='';}
}

// ── Auto-patch: make existing toggles hide desvio ──
(function(){
  const hide=()=>{const el=document.getElementById('desvio-space');if(el)el.style.display='none';};
  const patch=fn=>{const orig=window[fn];if(typeof orig==='function'){window[fn]=function(){hide();return orig.apply(this,arguments);};}};
  window.addEventListener('load',()=>{['switchToWorkspace','toggleRetenciones','togglePases','toggleSpreads','toggleTheory'].forEach(patch);});
})();
