// ═══════════════════════════════════════════════════
// ─── REGLAS DEL RESUMEN ───
// Umbrales y pares que usa el módulo 🧭 Resumen (resumen.js) para generar los
// comentarios. Se pueden ajustar acá sin tocar la lógica.
//
// Cada hallazgo del resumen tiene un tipo:
//   'oportunidad' 🟢 · 'alerta' 🟠 · 'info' ⚪
// y una prioridad (0–100) que decide qué entra en el resumen ejecutivo.
// ═══════════════════════════════════════════════════

const RS_REGLAS = {

  // Cantidad de puntos en el resumen ejecutivo
  topEjecutivo: 5,

  // Datos de mercado con más de N días se marcan como desactualizados
  diasDatosViejos: 2,

  // Pases y paridades arrancan desde la primera posición que vence en ≥ N días
  // (la que está venciendo tiene poco interés abierto y distorsiona las tasas).
  diasMinPosicion: 15,

  // ─── Mercado y datos ───
  // Las posiciones son las POSICIONES_CLAVE de globals.js
  mercado: {
    diasGrafico: 30,              // ventana del mini gráfico y de la variación
    variacionDestacadaPct: 5,     // |variación 30 días| ≥ 5% → comentario
  },

  // ─── Coberturas: estrategias cargadas en el módulo Coberturas ───
  coberturas: {
    maxEstrategiasPorSolapa: 4,   // se toman las de mayor volumen
    escenarioPct: 15,             // escenarios de baja / suba para comparar estrategias (±%)
    costoCaroPct: 3.0,            // prima neta > 3% del futuro → cara
    costoBaratoPct: 1.0,          // prima neta < 1% del futuro → barata
    pisoLejanoPct: 10,            // piso más de 10% debajo del futuro → protección lejana
    techoPegadoPct: 5,            // techo a menos de 5% del futuro → resigna casi toda la suba
    diasVencAlerta: 30,           // menos de 30 días al vencimiento → decidir rolleo / cierre
    diasVencAviso: 60,
  },

  // ─── Volatilidad ───
  vol: {
    viBarataPercentil: 25,        // VI ATM ≤ P25 del mes → primas baratas
    viCaraPercentil: 75,          // VI ATM ≥ P75 → primas caras
    viHvBarata: 0.8,              // VI/HV20 < 0,8 → opciones baratas vs movimiento real
    viHvCara: 1.5,                // VI/HV20 > 1,5 → opciones caras
  },

  // ─── Pases: ¿el mercado está en carry? ───
  // Se compara el disponible de hoy (A3) contra cada futuro. Posición cercana más cara que
  // el disponible = CARRY (paga guardar); más barata = INVERSO; dentro de ±carryMinUsd = PLANO.
  pases: {
    carryMinUsd: 2,               // u$s/tn de diferencia para considerar carry / inverso
    horizonteDias: 400,           // posiciones a considerar (hasta ~13 meses)
  },

  // ─── FAS teórico vs mercado ───
  fas: {
    // Las posiciones son las POSICIONES_CLAVE de globals.js (próximo contrato vigente de cada mes)
    spreadUsd: 5,                // |futuro − FAS teórico| > 5 u$s/tn → comentario destacado
    crushVsGranoUsd: 10,          // FAS crushing supera al de poroto por > 10 u$s/tn
    horizonteRetMeses: 6,         // avisar escalones de retención dentro de los próximos 6 meses
  },

  // ─── Relaciones de precios ───
  relaciones: {
    percentilBajo: 20,            // ≤ P20 de campañas anteriores → relación baja
    percentilAlto: 80,            // ≥ P80 → relación alta
    ventanaDias: 20,              // se compara contra otras campañas a ±20 días del mismo punto
    minPuntosHist: 15,            // si hay menos puntos comparables, se usa toda la historia
    // tipo 'ratio' = precio1 / precio2 · tipo 'spread' = precio1 − precio2 · carry: true = spread de almacenaje
    // desfase = año de la posición 2 − año de la posición 1
    // Relaciones entre productos: siempre SOJA en el numerador (soja / maíz, soja / trigo).
    pares: [
      { id: 'soja_maiz',  nombre: 'Soja MAY / Maíz ABR',  tipo: 'ratio',  c1: 'soja',  m1: 'MAY', c2: 'maiz',  m2: 'ABR', desfase: 0,
        alta: 'La soja está cara en relación al maíz: priorizar ventas / coberturas de soja.',
        baja: 'El maíz está caro en relación a la soja: priorizar ventas / coberturas de maíz.' },
      { id: 'soja_trigo', nombre: 'Soja MAY / Trigo DIC', tipo: 'ratio',  c1: 'soja',  m1: 'MAY', c2: 'trigo', m2: 'DIC', desfase: -1,
        alta: 'La soja está cara en relación al trigo: priorizar ventas / coberturas de soja.',
        baja: 'El trigo está caro en relación a la soja: priorizar ventas / coberturas de trigo.' },
      { id: 'soja_vieja_nueva', nombre: 'Soja NOV − MAY (vieja vs nueva)', tipo: 'spread', c1: 'soja', m1: 'NOV', c2: 'soja', m2: 'MAY', desfase: 1,
        alta: 'Prima alta de la vieja cosecha: conviene vender el stock disponible antes que la nueva.',
        baja: 'La vieja cosecha paga poco sobre la nueva: no hay premio por vender stock ya.' },
      { id: 'maiz_abr_jul', nombre: 'Maíz ABR − JUL', tipo: 'spread', c1: 'maiz', m1: 'ABR', c2: 'maiz', m2: 'JUL', desfase: 0,
        alta: 'ABR paga mucho más que JUL: favorece vender / fijar en cosecha (ABR) antes que diferido.',
        baja: 'La diferencia ABR − JUL está baja: JUL paga relativamente bien comparado con otros años, favorece vender / fijar JUL.' },
      { id: 'trigo_carry', nombre: 'Trigo MAR − DIC (carry)', tipo: 'spread', carry: true, c1: 'trigo', m1: 'MAR', c2: 'trigo', m2: 'DIC', desfase: -1,
        alta: 'El mercado paga bien por guardar trigo de DIC a MAR: favorece retener / vender diferido.',
        baja: 'El carry DIC→MAR es bajo: no paga guardar, favorece vender en cosecha.' },
    ],
  },

  // ─── Desvío de precios ───
  desvio: {
    desvioAltoPct: 5,             // precio actual > 5% sobre el promedio de la campaña
    desvioBajoPct: 5,             // precio actual > 5% debajo del promedio de la campaña
  },

  // ─── Line-Up ───
  lineup: {
    productos: ['soja', 'maiz', 'trigo'],
    coberturaAlta: 0.95,          // compras / DJVE < 95% → presión compradora alta
    coberturaBaja: 1.05,          // > 105% → exportación cubierta
  },
};
