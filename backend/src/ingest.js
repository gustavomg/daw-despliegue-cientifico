// Capa de ingesta: mantiene un buffer en memoria con las lecturas recibidas por Redis y las
// vuelca a Postgres en lotes periódicos, en lugar de hacer un INSERT por cada lectura individual.
//
// Este es el patrón didáctico central de ClimaRed: "ingesta rápida en memoria + persistencia
// batch". Ventaja: Postgres recibe pocas escrituras grandes en vez de muchas escrituras
// pequeñas (mucho más eficiente). Coste: si el proceso se cae entre dos volcados, se pierden las
// lecturas que aún estaban solo en el buffer (patrón "at-most-once", ver Guía de Despliegue,
// sección de diagnóstico de errores).
const db = require("./db");
const metrics = require("./metrics");

let buffer = [];
let recibidasEnVentana = 0; // contador auxiliar para calcular lecturas/segundo

function push(lectura) {
  buffer.push(lectura);
  recibidasEnVentana++;
  metrics.lecturasRecibidas.inc();
  metrics.bufferTamano.set(buffer.length);
}

// Cada segundo, publica en la métrica Gauge cuántas lecturas se recibieron en el último
// segundo y reinicia el contador de la ventana.
function iniciarCalculoTasa() {
  setInterval(() => {
    metrics.lecturasPorSegundo.set(recibidasEnVentana);
    recibidasEnVentana = 0;
  }, 1000);
}

// Vuelca el buffer actual a Postgres. Se intercambia el buffer por uno vacío ANTES de la
// escritura en BD para no bloquear ni perder las lecturas que sigan llegando mientras se persiste.
async function flush() {
  if (buffer.length === 0) return;
  const lote = buffer;
  buffer = [];
  metrics.bufferTamano.set(0);

  try {
    const insertadas = await db.insertarLecturasLote(lote);
    if (insertadas > 0) metrics.lecturasPersistidas.inc(insertadas);
    if (insertadas < lote.length) {
      metrics.lecturasErrorPersistencia.inc(lote.length - insertadas);
    }
  } catch (err) {
    console.error("[ingest] error al persistir el lote de lecturas:", err.message);
    metrics.lecturasErrorPersistencia.inc(lote.length);
  }
}

function iniciarFlushPeriodico(intervaloMs) {
  setInterval(() => {
    flush().catch((err) => console.error("[ingest] fallo inesperado en el flush periódico:", err.message));
  }, intervaloMs);
}

module.exports = {
  push,
  flush,
  iniciarFlushPeriodico,
  iniciarCalculoTasa,
  getBufferTamano: () => buffer.length,
};
