// ═══════════════════════════════════════════════════
// ─── ASESOR COMERCIAL IA ───
// ═══════════════════════════════════════════════════

const ASESOR_SYSTEM_BASE = `Sos el Asesor Comercial IA de Espartina S.A., una empresa agropecuaria argentina con ~148.000 hectáreas distribuidas en 14 zonas. Tu rol es analizar el mercado de commodities agrícolas y ayudar al equipo comercial a entender por qué los precios podrían subir o bajar.

## IDENTIDAD Y TONO
- Directo, preciso, sin vueltas. Usás lenguaje del agro argentino.
- Terminología natural: basis, FAS, retenciones, MATBA-ROFEX, posición, DTE, futuro, pase, etc.
- No das recomendaciones de compra/venta ni de estrategias de cobertura específicas.
- Tu función exclusiva es análisis de mercado: fundamentos, macro, clima, posicionamiento.
- Si no tenés datos suficientes para una parte del análisis, lo indicás como "❓ Sin datos disponibles" — NUNCA suponés ni inventás datos o precios.

## CULTIVOS PRINCIPALES
Trigo, soja, maíz, girasol (prioritarios). También cebada, pisingallo y subproductos (aceite, harina, pellets).

## ESTRUCTURA DE RESPUESTA OBLIGATORIA
Para cualquier pregunta de análisis de mercado, siempre respondés con este orden:

### 1. SÍNTESIS
2-3 párrafos explicando los factores más relevantes para la pregunta puntual. Indicás la dirección de cada factor clave: alcista 📈, bajista 📉 o neutro ➡️. Jerarquizás por peso en el momento actual.

### 2. CHECKLIST DE FACTORES
Tabla markdown con todas las capas relevantes:

| Factor | Dirección | Detalle |
|---|---|---|
| Nombre del factor | 📈/📉/➡️/❓ | Explicación con dato si disponible |

Usás ❓ cuando no hay datos disponibles o la búsqueda no devolvió información confiable.

### 3. FUENTES
Lista numerada con las fuentes consultadas y sus URLs para verificación.

## CAPAS DE ANÁLISIS

**OFERTA/DEMANDA GLOBAL**
- Área sembrada y estimaciones de producción: USDA/WASDE, Bolsa de Cereales de Buenos Aires (BCBA), Bolsa de Comercio de Rosario (BCR), CONAB Brasil
- Stocks mundiales y ratio stocks/uso por campaña
- Exportaciones semanales USDA (Export Sales)
- Competencia de origen: Brasil y EEUU para soja/maíz, Mar Negro/UE para trigo, girasol ucraniano
- Crush margin soja: relación poroto / aceite de soja / harina de soja

**MACRO Y POLÍTICA ARGENTINA**
- Tipo de cambio: dólar oficial, dólar blend, brecha, expectativas de devaluación
- Retenciones vigentes por cultivo y posibles cambios normativos
- Política de exportaciones: ROE, cupos, restricciones
- Situación fiscal/monetaria argentina en relación al agro y al precio FAS

**POLÍTICA GLOBAL Y COMERCIO**
- Política agrícola USA: Farm Bill, mandatos de biocombustibles (RFS), subsidios
- China: demanda, aranceles, política de compras al exterior, relación diplomática con EEUU y Argentina
- India: demanda de aceites vegetales, aranceles importación
- Subsidios agrícolas en otros orígenes (UE, Rusia)
- Acuerdos comerciales y disputas arancelarias relevantes

**ENERGÍA**
- Petróleo WTI y Brent: impacto en biodiesel (soja, girasol) y etanol (maíz)
- Mandatos de corte biocombustibles: Argentina (% mezcla gasoil/nafta) y Brasil (B15/E27+)
- Gas natural y su impacto en costo de fertilizantes nitrogenados (urea, UAN)
- DAP y MAP: precios internacionales de fertilizantes fosfatados

**CLIMA**
- ENSO actual: Niña/Niño/Neutro y su impacto proyectado en Sudamérica y Corn Belt USA
- Condición de cultivos USDA: weekly crop progress (% good/excellent)
- Sequías o excesos hídricos en zonas productoras clave: Pampa húmeda, NOA, Brasil centro-oeste, Iowa/Illinois
- Pronósticos de corto (15 días) y mediano plazo (30-90 días): NOAA, SMN Argentina
- Índice Palmer de Sequía (PDSI) para zonas críticas

**POSICIONAMIENTO Y TÉCNICO**
- COT Report CFTC: posición neta de fondos no comerciales en CBOT (soja, maíz, trigo)
- Niveles técnicos relevantes: soportes/resistencias en CBOT y MATBA-ROFEX
- Estacionalidad histórica de precios para el momento del año (ej: presión cosecha Brasil feb-abr, ventana exportadora argentina)
- Open interest y volumen en posiciones clave MATBA

**LOGÍSTICA Y BASIS**
- Fletes marítimos: Baltic Dry Index (BDI), rutas Sudamérica-China
- Congestión portuaria: puertos argentinos (Rosario/Up-River), Santos Brasil, puertos del Golfo USA
- Basis Rosario vs Chicago para soja y maíz
- Costos logísticos internos Argentina: fletes camión, disponibilidad, restricciones por lluvias

## REGLAS DURAS
1. Nunca inventás datos ni precios. Si no encontrás un dato, lo marcás ❓.
2. Siempre citás la fuente de cada dato relevante con URL cuando sea posible.
3. No das recomendaciones de qué hacer comercialmente (comprar/vender/cubrir).
4. Si la pregunta está fuera de tu ámbito (agro/commodities/macro relacionada), lo aclarás.
5. Respondés siempre en español argentino, tono directo.
6. En el checklist, incluís TODAS las capas aunque no tengas datos (marcás ❓).`;

const ASESOR_SUGGESTIONS = [
  "¿Por qué podría bajar la soja en los próximos 60 días?",
  "¿Cómo impacta el petróleo en el precio del girasol?",
  "Análisis de fundamentos del maíz para la campaña actual",
  "¿Qué está haciendo China con sus compras de soja?",
  "¿Cómo está el clima en Brasil y qué implica para la cosecha?",
  "¿Qué dice el COT Report sobre la posición de los fondos en trigo?",
];

// ─── Estado ───
let asesorModel = "claude-sonnet-4-20250514";
let asesorHistory = []; // [{role, content}]
let asesorLoading = false;

// ─── Inicialización ───
function asesorInit() {
  // Renderizar sugerencias
  const sg = document.getElementById("asesor-suggestions");
  if (!sg) return;
  sg.innerHTML = ASESOR_SUGGESTIONS.map(s =>
    `<button class="asesor-suggestion" onclick="asesorUseSuggestion(this)">${s}</button>`
  ).join("");
}

// ─── Obtener contexto del módulo activo ───
function asesorGetContext() {
  const lines = [];

  // Cultivo y posición activos en Coberturas
  try {
    const cropEl = document.getElementById("mkt-crop-select");
    const posEl = document.getElementById("mkt-pos-select");
    const spotEl = document.getElementById("spot");
    if (cropEl && cropEl.value) {
      const cropNames = { soja: "Soja", maiz: "Maíz", trigo: "Trigo", girasol: "Girasol" };
      lines.push(`Cultivo activo en suite: ${cropNames[cropEl.value] || cropEl.value}`);
    }
    if (posEl && posEl.value) lines.push(`Posición activa: ${posEl.value}`);
    if (spotEl && spotEl.value) lines.push(`Precio spot cargado: u$s ${spotEl.value}/tn`);
  } catch(e) {}

  // FAS teórico si está visible
  try {
    const fasEl = document.getElementById("fic-fas-teorico");
    if (fasEl && fasEl.textContent && fasEl.textContent !== "—") {
      lines.push(`FAS teórico (CTP) actual: ${fasEl.textContent} u$s/tn`);
    }
  } catch(e) {}

  // Retenciones si el módulo tiene datos
  try {
    const retFob = document.getElementById("ret-fob");
    const retPct = document.getElementById("ret-pct");
    const retCultivo = document.getElementById("ret-cultivo");
    if (retFob && retFob.value && retPct && retPct.value) {
      const cn = { soja: "Soja", maiz: "Maíz", trigo: "Trigo", girasol: "Girasol" };
      const cult = retCultivo ? (cn[retCultivo.value] || retCultivo.value) : "";
      lines.push(`Retención cargada en suite (${cult}): ${retPct.value}% · FOB índice: u$s ${retFob.value}/tn`);
    }
  } catch(e) {}

  // Pase: TC spot
  try {
    const tcSpot = document.getElementById("pase-tc-spot");
    if (tcSpot && tcSpot.value) lines.push(`Tipo de cambio spot en suite: ARS ${tcSpot.value}/USD`);
  } catch(e) {}

  if (lines.length === 0) return null;
  return lines.join("\n");
}

// ─── Renderizar barra de contexto ───
function asesorRenderContextBar() {
  const bar = document.getElementById("asesor-context-bar");
  if (!bar) return;
  const ctx = asesorGetContext();
  if (!ctx) {
    bar.style.display = "none";
    return;
  }
  const chips = ctx.split("\n").map(line => {
    const [label, ...rest] = line.split(": ");
    return `<span class="asesor-ctx-chip"><span class="asesor-ctx-label">${label}</span><span class="asesor-ctx-val">${rest.join(": ")}</span></span>`;
  }).join("");
  bar.innerHTML = `<span style="font-size:11px;font-weight:700;color:var(--text-3);letter-spacing:.05em;text-transform:uppercase;margin-right:8px;">Contexto suite</span>${chips}`;
  bar.style.display = "flex";
}

// ─── Construir system prompt con contexto ───
function asesorBuildSystemPrompt() {
  const ctx = asesorGetContext();
  if (!ctx) return ASESOR_SYSTEM_BASE;
  return ASESOR_SYSTEM_BASE + `\n\n## CONTEXTO ACTUAL DE LA SUITE\nEl usuario tiene cargados estos datos en la suite al momento de consultar. Usalos como referencia si son relevantes:\n${ctx}`;
}

// ─── Selector de modelo ───
function asesorSetModel(btn) {
  asesorModel = btn.dataset.model;
  document.querySelectorAll(".asesor-model-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

// ─── Toggle módulo ───
function toggleAsesorIA() {
  // Delegar el ocultado de otros espacios a las funciones nativas si existen,
  // o hacerlo manualmente como fallback
  const spaces = ["workspace","theory-space","ret-space","pase-space",
    "spreads-space","desvio-space","alertas-space","futopc-space"];
  spaces.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  document.querySelectorAll(".mod-pill").forEach(p => p.classList.remove("active"));
  const pill = document.getElementById("pill-asesor-ia");
  if (pill) pill.classList.add("active");

  const sp = document.getElementById("asesor-ia-space");
  if (sp) sp.style.display = "flex";

  // Ocultar tabs-bar (no aplica para este módulo)
  const tabsBar = document.getElementById("tabs-container");
  if (tabsBar) tabsBar.style.display = "none";

  // Ocultar barras de mercado que no aplican aquí
  const fobBar = document.getElementById("fob-bar");
  if (fobBar) fobBar.style.display = "none";
  const mktBar = document.getElementById("mkt-bar");
  if (mktBar) mktBar.style.display = "none";

  asesorRenderContextBar();
  setTimeout(() => {
    const input = document.getElementById("asesor-input");
    if (input) input.focus();
  }, 100);
}

// ─── Restaurar barras al salir del Asesor IA ───
// Se inyecta en los pills nativos al cargar
function asesorRestoreUI() {
  const tabsBar = document.getElementById("tabs-container");
  if (tabsBar) tabsBar.style.display = "";
  const fobBar = document.getElementById("fob-bar");
  if (fobBar) fobBar.style.display = "";
  const mktBar = document.getElementById("mkt-bar");
  if (mktBar) mktBar.style.display = "";
  const sp = document.getElementById("asesor-ia-space");
  if (sp) sp.style.display = "none";
}

// ─── Sugerencia ───
function asesorUseSuggestion(btn) {
  const input = document.getElementById("asesor-input");
  if (input) {
    input.value = btn.textContent;
    asesorAutoResize(input);
    input.focus();
  }
}

// ─── Auto-resize textarea ───
function asesorAutoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 140) + "px";
  const sendBtn = document.getElementById("asesor-send-btn");
  if (sendBtn) sendBtn.disabled = !el.value.trim() || asesorLoading;
}

// ─── Handle key ───
function asesorHandleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    asesorSend();
  }
}

// ─── Render mensaje ───
function asesorRenderMessage(role, content, sources) {
  const container = document.getElementById("asesor-messages");
  const welcome = document.getElementById("asesor-welcome");
  if (welcome) welcome.style.display = "none";

  const div = document.createElement("div");
  div.className = `asesor-msg asesor-msg-${role}`;

  const avatar = document.createElement("div");
  avatar.className = `asesor-avatar asesor-avatar-${role}`;
  avatar.textContent = role === "user" ? "E" : "🌾";

  const bubble = document.createElement("div");
  bubble.className = `asesor-bubble asesor-bubble-${role}`;

  if (role === "user") {
    bubble.textContent = content;
  } else {
    bubble.innerHTML = asesorFormatMarkdown(content);
    // Fuentes
    if (sources && sources.length > 0) {
      const srcDiv = document.createElement("div");
      srcDiv.className = "asesor-sources";
      srcDiv.innerHTML = `<div class="asesor-sources-title">Fuentes consultadas</div>` +
        sources.map(s => `<a href="${s.url}" target="_blank" rel="noreferrer" class="asesor-source-link">🔗 ${s.title || s.url}</a>`).join("");
      bubble.appendChild(srcDiv);
    }
  }

  if (role === "user") {
    div.appendChild(bubble);
    div.appendChild(avatar);
  } else {
    div.appendChild(avatar);
    div.appendChild(bubble);
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

// ─── Typing indicator ───
function asesorShowTyping() {
  const container = document.getElementById("asesor-messages");
  const div = document.createElement("div");
  div.className = "asesor-msg asesor-msg-assistant";
  div.id = "asesor-typing";

  const avatar = document.createElement("div");
  avatar.className = "asesor-avatar asesor-avatar-assistant";
  avatar.textContent = "🌾";

  const bubble = document.createElement("div");
  bubble.className = "asesor-bubble asesor-bubble-assistant asesor-typing-bubble";
  bubble.innerHTML = `<div class="asesor-dots"><span></span><span></span><span></span></div><span class="asesor-typing-label">Buscando datos en tiempo real…</span>`;

  div.appendChild(avatar);
  div.appendChild(bubble);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function asesorHideTyping() {
  const el = document.getElementById("asesor-typing");
  if (el) el.remove();
}

// ─── Formatear markdown ───
function asesorFormatMarkdown(text) {
  const lines = text.split("\n");
  let html = "";
  let inTable = false;
  let tableRows = [];

  const flushTable = () => {
    if (tableRows.length < 2) {
      tableRows.forEach(r => { html += `<p>${r}</p>`; });
    } else {
      const headers = tableRows[0].split("|").map(h => h.trim()).filter(Boolean);
      const rows = tableRows.slice(2).map(r => r.split("|").map(c => c.trim()).filter(Boolean));
      html += `<div class="asesor-table-wrap"><table class="asesor-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>`;
      rows.forEach((row, ri) => {
        html += `<tr>${row.map(c => `<td>${c}</td>`).join("")}</tr>`;
      });
      html += `</tbody></table></div>`;
    }
    tableRows = [];
    inTable = false;
  };

  lines.forEach(line => {
    if (line.startsWith("|")) {
      inTable = true;
      tableRows.push(line);
      return;
    }
    if (inTable) flushTable();

    if (line.startsWith("### ")) {
      html += `<div class="asesor-h3">${escHtml(line.slice(4))}</div>`;
    } else if (line.startsWith("## ")) {
      html += `<div class="asesor-h2">${escHtml(line.slice(3))}</div>`;
    } else if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
      html += `<div class="asesor-bold-line">${escHtml(line.slice(2, -2))}</div>`;
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      html += `<div class="asesor-li"><span class="asesor-li-dot">·</span><span>${inlineFormat(line.slice(2))}</span></div>`;
    } else if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\./)[1];
      html += `<div class="asesor-li"><span class="asesor-li-num">${num}.</span><span>${inlineFormat(line.replace(/^\d+\.\s/, ""))}</span></div>`;
    } else if (line.trim() === "") {
      html += `<div class="asesor-spacer"></div>`;
    } else {
      html += `<div class="asesor-p">${inlineFormat(line)}</div>`;
    }
  });

  if (inTable) flushTable();
  return html;
}

function escHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function inlineFormat(text) {
  // Bold
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code class="asesor-code">$1</code>');
  return text;
}

// ─── Llamada a la API ───
async function asesorCallAPI(messages) {
  const WEB_SEARCH_TOOL = { type: "web_search_20250305", name: "web_search" };

  const callOnce = async (msgs) => {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: asesorModel,
        max_tokens: 4096,
        system: asesorBuildSystemPrompt(),
        tools: [WEB_SEARCH_TOOL],
        messages: msgs,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error?.message || `Error API: ${resp.status}`);
    }
    return resp.json();
  };

  let fullText = "";
  const sources = [];
  let iterMsgs = [...messages];
  let maxIter = 6;
  let data = await callOnce(iterMsgs);

  while (data.stop_reason === "tool_use" && maxIter-- > 0) {
    // Extraer texto parcial si hay
    data.content.forEach(b => {
      if (b.type === "text") fullText += b.text;
      if (b.type === "web_search_tool_result") {
        (b.content || []).forEach(r => {
          if (r.type === "web_search_result") sources.push({ url: r.url, title: r.title });
        });
      }
    });

    iterMsgs.push({ role: "assistant", content: data.content });

    const toolResults = data.content
      .filter(b => b.type === "tool_use")
      .map(tb => ({
        type: "tool_result",
        tool_use_id: tb.id,
        content: tb.input?.query ? `Query: ${tb.input.query}` : "executed",
      }));

    iterMsgs.push({ role: "user", content: toolResults });
    data = await callOnce(iterMsgs);
  }

  // Procesar respuesta final
  data.content.forEach(b => {
    if (b.type === "text") fullText += b.text;
    if (b.type === "web_search_tool_result") {
      (b.content || []).forEach(r => {
        if (r.type === "web_search_result") sources.push({ url: r.url, title: r.title });
      });
    }
  });

  // Deduplicar fuentes
  const uniqueSources = sources.filter((s, i, arr) => arr.findIndex(x => x.url === s.url) === i).slice(0, 10);

  return { text: fullText || "Sin respuesta. Intentá de nuevo.", sources: uniqueSources };
}

// ─── Enviar mensaje ───
async function asesorSend() {
  const input = document.getElementById("asesor-input");
  const sendBtn = document.getElementById("asesor-send-btn");
  if (!input) return;

  const text = input.value.trim();
  if (!text || asesorLoading) return;

  asesorLoading = true;
  input.value = "";
  input.style.height = "auto";
  if (sendBtn) sendBtn.disabled = true;

  // Render mensaje usuario
  asesorRenderMessage("user", text, null);

  // Agregar al historial
  asesorHistory.push({ role: "user", content: text });

  // Mostrar typing
  asesorShowTyping();

  try {
    const { text: respText, sources } = await asesorCallAPI(asesorHistory);
    asesorHideTyping();
    asesorHistory.push({ role: "assistant", content: respText });
    asesorRenderMessage("assistant", respText, sources);
  } catch (err) {
    asesorHideTyping();
    asesorRenderError(err.message);
  } finally {
    asesorLoading = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

// ─── Render error ───
function asesorRenderError(msg) {
  const container = document.getElementById("asesor-messages");
  const div = document.createElement("div");
  div.className = "asesor-error";
  div.innerHTML = `⚠️ ${escHtml(msg)}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ─── Auto-init ───
document.addEventListener("DOMContentLoaded", () => {
  asesorInit();
});
