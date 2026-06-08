// ═══════════════════════════════════════════════════
// ─── GLOBALS: Constants & Shared State ───
// ═══════════════════════════════════════════════════

const COLORS = ['#1A6B3C', '#2563eb', '#d97706', '#7c3aed', '#c43030', '#0d9488'];
const STORAGE_KEY = 'espartina_coberturas_v1';

// ─── Strategy Presets (strikes relative to spot) ───
const PRESETS = [
  { name: 'Put Seco', desc: 'Seguro puro. Máxima protección, sin techo.',
    legs: s => [
      { dir:'buy', type:'put', ratio:1, strike: Math.round(s * 0.98), prima: 6 }
    ]},
  { name: 'Put Spread', desc: 'Protección con franquicia. Menor costo, piso limitado.',
    legs: s => [
      { dir:'buy', type:'put', ratio:1, strike: Math.round(s * 0.98), prima: 6 },
      { dir:'sell', type:'put', ratio:1, strike: Math.round(s * 0.94), prima: 2 }
    ]},
  { name: 'Piso Eficiente', desc: 'Piso alto y barato, sin techo. Buen delta y suba ilimitada.',
    legs: s => [
      { dir:'buy', type:'put', ratio:1, strike: Math.round(s * 0.99), prima: 6 },
      { dir:'sell', type:'put', ratio:1, strike: Math.round(s * 0.88), prima: 2 }
    ]},
  { name: 'Collar', desc: 'Túnel de rentabilidad. Costo ~cero, con techo.',
    legs: s => [
      { dir:'buy', type:'put', ratio:1, strike: Math.round(s * 0.97), prima: 5 },
      { dir:'sell', type:'call', ratio:1, strike: Math.round(s * 1.10), prima: 5 }
    ]},
  { sep: true },
  { name: 'Gaviota', desc: 'Cobertura financiada. Put Spread + venta de Call.',
    legs: s => [
      { dir:'buy', type:'put', ratio:1, strike: Math.round(s * 0.98), prima: 6 },
      { dir:'sell', type:'put', ratio:1, strike: Math.round(s * 0.95), prima: 2.5 },
      { dir:'sell', type:'call', ratio:1, strike: Math.round(s * 1.12), prima: 2 }
    ]},
  { name: 'Futuro + Call', desc: 'Fijación sintética con opcionalidad alcista.',
    legs: s => [
      { dir:'sell', type:'futuro', ratio:1, strike: Math.round(s), prima: 0 },
      { dir:'buy', type:'call', ratio:1, strike: Math.round(s * 1.05), prima: 4 }
    ]},
  { sep: true },
  { name: 'Gaviota Invertida', desc: 'Recompra sintética alcista. Solo sobre ventas previas.',
    legs: s => [
      { dir:'buy', type:'call', ratio:1, strike: Math.round(s * 1.03), prima: 5 },
      { dir:'sell', type:'call', ratio:1, strike: Math.round(s * 1.15), prima: 2 },
      { dir:'sell', type:'put', ratio:1, strike: Math.round(s * 0.92), prima: 3 }
    ]},
  { name: 'Ratio Put Spread 1x2', desc: 'Costo ~cero, riesgo en baja extrema.',
    legs: s => [
      { dir:'buy', type:'put', ratio:1, strike: Math.round(s * 0.98), prima: 6 },
      { dir:'sell', type:'put', ratio:2, strike: Math.round(s * 0.92), prima: 3 }
    ]},
  { name: 'Lanzamiento Cubierto', desc: 'Generación de tasa. Sin protección a la baja.',
    legs: s => [
      { dir:'sell', type:'call', ratio:1, strike: Math.round(s * 1.08), prima: 4 }
    ]},
];

// ─── Google Sheets Config ───
const SHEET_CONFIG = {
  spreadsheetId: '1j-ZrWBO-fCkGUPqWtWRsGgGswMRCm2mnMhsPmX6osLI',
  gid: '527444289',
  publishedCSV: 'https://docs.google.com/spreadsheets/d/1j-ZrWBO-fCkGUPqWtWRsGgGswMRCm2mnMhsPmX6osLI/export?format=csv&gid=527444289',
};

const FOB_SHEET_ID = '1Fmvsn0o2OpTD8BXnqw8sDTG_4Kr9zu_tWvcy7R7Zjjo';
const FOB_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTgEfkB1sib9NvyYkC7LQGqf_zZmnCuB9IDJT_Nx7INHkiuoH7ZYJhTOo7ormKKT0iEEUF6sPbCDW59/pub?gid=515809769&single=true&output=csv';

// ─── Crop/month mappings ───
const CROP_CODE_MAP = {
  'SOJ': 'soja', 'MAI': 'maiz', 'TRI': 'trigo', 'GIR': 'girasol',
  'SOR': 'sorgo', 'CEB': 'cebada', 'SOJA': 'soja', 'MAIZ': 'maiz',
  'TRIGO': 'trigo', 'GIRASOL': 'girasol',
};

// Cultivos que se muestran en el builder de coberturas (excluye sorgo, cebada, etc.)
const ALLOWED_CROPS = new Set(['soja', 'maiz', 'trigo', 'girasol']);

const MONTH_LABELS = {
  'ENE': 'Enero', 'FEB': 'Febrero', 'MAR': 'Marzo', 'ABR': 'Abril',
  'MAY': 'Mayo', 'JUN': 'Junio', 'JUL': 'Julio', 'AGO': 'Agosto',
  'SEP': 'Septiembre', 'OCT': 'Octubre', 'NOV': 'Noviembre',
  'DIC': 'Diciembre', 'DIS': 'Diciembre'
};

// ─── Default tab template ───
const DEFAULT_TABS = [
  {
    id: 1, name: 'Estrategia de Coberturas',
    assetVal: 'soja', spot: 340, min: 270, max: 410,
    stratCounter: 2,
    strategies: [
      { id: 1, name: 'Estrategia 1', color: COLORS[0], legs: [
        { dir: 'buy', type: 'put', ratio: 1, strike: 295, prima: 5 }
      ]}
    ]
  }
];

// ─── Retenciones defaults ───
const RET_DEFAULTS = {
  soja: { fob: 417, ret: 24, fobbing: 12, fasObj: 323, positions: [] },
  maiz: { fob: 208, ret: 8.5, fobbing: 11, fasObj: 185, fob2: 200, fasObj2: 175, positions: [] },
  trigo: { fob: 234, ret: 5.5, fobbing: 13, fasObj: 216, fob2: 225, fasObj2: 210, positions: [] },
  girasol: { fob: 520, ret: 4.5, fobbing: 14, fasObj: 475, positions: [] }
};

// ─── Retenciones: cronograma por fecha de posición (baja DEx 2026–2028) ───
// Cada cultivo es una lista de quiebres {y, m, ret} = "desde el mes m del año y rige ret%".
// getRetencion(cultivo, año, mes) devuelve la alícuota vigente para esa fecha.
// Fuente: anuncio 21/05/2026 + cronograma Caputo (La Nación / Perfil / Ruralnet).
// ⚠️ Día/mes exacto de cada escalón a confirmar contra el boletín oficial cuando salga la resolución.
const RET_SCHEDULE = {
  // Trigo y cebada: 7,5% → 5,5% inmediato desde junio 2026
  trigo:  [ {y:0,m:0,ret:7.5}, {y:2026,m:6,ret:5.5} ],
  cebada: [ {y:0,m:0,ret:7.5}, {y:2026,m:6,ret:5.5} ],
  // Maíz (y sorgo): baja trimestral desde ene-2027, cierra en 5,5% a fin de 2028
  maiz: [
    {y:0,m:0,ret:8.5},
    {y:2027,m:1,ret:8.25}, {y:2027,m:4,ret:8.0}, {y:2027,m:7,ret:7.75}, {y:2027,m:10,ret:7.5},
    {y:2028,m:1,ret:7.0},  {y:2028,m:4,ret:6.5}, {y:2028,m:7,ret:6.0},  {y:2028,m:10,ret:5.5}
  ],
  // Girasol: baja semestral (marzo / septiembre), de 4,5% a 3% en 2028
  girasol: [
    {y:0,m:0,ret:4.5},
    {y:2027,m:3,ret:4.25}, {y:2027,m:9,ret:4.0},
    {y:2028,m:3,ret:3.5},  {y:2028,m:9,ret:3.0}
  ],
  // Soja (poroto): 0,25 pp/mes en 2027 (24%→21%) y 0,5 pp/mes en 2028 (21%→15%). Se genera abajo.
  soja: []
};

// Genera los 24 quiebres mensuales de soja (ene-2027 a dic-2028)
(function buildSojaSchedule(){
  const s = [{y:0, m:0, ret:24}];
  for (let m = 1; m <= 12; m++) s.push({ y:2027, m, ret:+(24 - 0.25 * m).toFixed(2) }); // 23,75 … 21,00
  for (let m = 1; m <= 12; m++) s.push({ y:2028, m, ret:+(21 - 0.50 * m).toFixed(2) }); // 20,50 … 15,00
  RET_SCHEDULE.soja = s;
})();

// Alícuota vigente para (cultivo, año, mes). null si el cultivo no está en el cronograma.
function getRetencion(cultivo, year, month) {
  const sched = RET_SCHEDULE[(cultivo || '').toLowerCase()];
  if (!sched || !sched.length) return null;
  let val = sched[0].ret;
  for (const bp of sched) {
    if (year > bp.y || (year === bp.y && month >= bp.m)) val = bp.ret;
    else break;
  }
  return val;
}

// Parsea etiqueta de posición tipo 'MAY27' / 'NOV26' / 'DIS26' → {year, month}
function parsePosLabel(label) {
  const m = String(label || '').trim().toUpperCase().match(/^([A-Z]{3})\s*'?(\d{2})$/);
  if (!m) return null;
  const mes = (m[1] === 'DIS') ? 12 : ASST_MES[m[1]];
  if (!mes) return null;
  return { year: 2000 + parseInt(m[2], 10), month: mes };
}

// Atajo: alícuota para una posición por su etiqueta. Si no parsea, usa la fecha de hoy.
function getRetencionForPos(cultivo, label) {
  const p = parsePosLabel(label);
  const now = new Date();
  return p ? getRetencion(cultivo, p.year, p.month)
           : getRetencion(cultivo, now.getFullYear(), now.getMonth() + 1);
}

// ─── Asistente constants ───
const ASST_DRIVE = {
  vi_percentiles:  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSP5-XpHimq5vLl4TO5vIEpkxNWz6G1IoNoemRTJLiR68Clx-YP5ek3_MrjWYkW-WNvDwhd48mvmqJh/pub?gid=294861492&single=true&output=csv',
  skew_historico:  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSP5-XpHimq5vLl4TO5vIEpkxNWz6G1IoNoemRTJLiR68Clx-YP5ek3_MrjWYkW-WNvDwhd48mvmqJh/pub?gid=1243539227&single=true&output=csv',
  serie_vi_diaria: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSP5-XpHimq5vLl4TO5vIEpkxNWz6G1IoNoemRTJLiR68Clx-YP5ek3_MrjWYkW-WNvDwhd48mvmqJh/pub?gid=1030026531&single=true&output=csv',
  vi_vs_hv:        'https://docs.google.com/spreadsheets/d/e/2PACX-1vSP5-XpHimq5vLl4TO5vIEpkxNWz6G1IoNoemRTJLiR68Clx-YP5ek3_MrjWYkW-WNvDwhd48mvmqJh/pub?gid=2090823289&single=true&output=csv',
  futuros_posicion:'https://docs.google.com/spreadsheets/d/e/2PACX-1vSP5-XpHimq5vLl4TO5vIEpkxNWz6G1IoNoemRTJLiR68Clx-YP5ek3_MrjWYkW-WNvDwhd48mvmqJh/pub?gid=802114309&single=true&output=csv',
};

const ASST_POS = {soja:['JUL26','NOV26','ENE27','MAR27','MAY27','JUL27'],maiz:['JUL26','SEP26','DIC26','ABR27','JUL27'],trigo:['JUL26','SEP26','DIC26','ENE27','MAR27']};
const ASST_FWD = {soja:340,maiz:195,trigo:215};
const ASST_FER = new Set(['2025-01-01','2025-03-03','2025-03-04','2025-03-24','2025-04-02','2025-04-18','2025-05-01','2025-05-25','2025-06-16','2025-06-20','2025-07-09','2025-08-18','2025-10-13','2025-11-24','2025-12-08','2025-12-25','2026-01-01','2026-02-16','2026-02-17','2026-03-23','2026-03-24','2026-04-02','2026-04-03','2026-05-01','2026-05-25','2026-06-15','2026-06-20','2026-07-09','2026-07-10','2026-08-17','2026-10-12','2026-11-23','2026-12-07','2026-12-08','2026-12-25']);
const ASST_MES = {ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,OCT:10,NOV:11,DIC:12};
const ASST_MNAMES = ['','ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

// ═══════════════════════════════════════════════════
// ─── Mutable State (shared across modules) ───
// ═══════════════════════════════════════════════════

let fobData = {};
let fobActualizado = '';
let sheetData = null;
let marketData = null;
let marketPosition = null;

let chart = null;
let theoryMode = false;
let retMode = false;
let paseMode = false;
let asstMode = false;
let spreadMode = false;
let retData = { fasCTP: null, crushFAS: null, fob: null, retPct: null, cultivo: null };

// Tabs state (initialized after storage.js loads)
let tabs, activeTabIdx, tabCounter;

// Coberturas timers
let _saveIndicatorTimer = null;
let _globalTimer = null;
let _renderTimer = null;

// Pases state
let paseP3Active = false;
let paseSelectedPair = 0;
let paseGrain = 'soja';
let paseSelectedCarryPair = 0;

// Asistente state
let ASST_VI_PERC=[], ASST_SKEW=[], ASST_SERIE=[], ASST_VIVHV=[], ASST_FUTPOS=[];
let asstVisionSel='floor', asstModeNum=1, asstChainRows=[];

// Spreads state
let spMode='basis';
let spChartCurrent=null, spChartSeason=null, spChartDist=null;
let spExcludedYears=new Set();
