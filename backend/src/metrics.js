// Métricas Prometheus del backend. Expone /metrics en formato texto de Prometheus, consumible
// tanto por el stack de monitorización opcional (docker-compose.monitoring.yml) como por
// `curl http://localhost/metrics` directamente durante los ejercicios de observabilidad.
const client = require("prom-client");

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "climared_" });

// --- Métricas de ingesta (Redis -> buffer en memoria) ---
const lecturasRecibidas = new client.Counter({
  name: "climared_lecturas_recibidas_total",
  help: "Total de lecturas recibidas desde Redis (pub/sub) desde el arranque del backend",
  registers: [register],
});

const lecturasPorSegundo = new client.Gauge({
  name: "climared_lecturas_por_segundo",
  help: "Lecturas recibidas por segundo, calculado en una ventana móvil de 1 segundo",
  registers: [register],
});

const bufferTamano = new client.Gauge({
  name: "climared_buffer_tamano",
  help: "Número de lecturas actualmente en el buffer en memoria, pendientes de persistir",
  registers: [register],
});

// --- Métricas de persistencia (buffer -> Postgres) ---
const lecturasPersistidas = new client.Counter({
  name: "climared_lecturas_persistidas_total",
  help: "Total de lecturas escritas correctamente en Postgres",
  registers: [register],
});

const lecturasErrorPersistencia = new client.Counter({
  name: "climared_lecturas_error_persistencia_total",
  help: "Total de lecturas descartadas al fallar su persistencia en Postgres (p. ej. estación inexistente)",
  registers: [register],
});

const lecturasPurgadas = new client.Counter({
  name: "climared_lecturas_purgadas_total",
  help: "Total de lecturas eliminadas por el proceso de purga de retención (RETENCION_DIAS)",
  registers: [register],
});

// --- Métricas de conectividad e infraestructura ---
const redisConectado = new client.Gauge({
  name: "climared_redis_conectado",
  help: "1 si el backend tiene conexión activa con Redis, 0 en caso contrario",
  registers: [register],
});

const websocketsConectados = new client.Gauge({
  name: "climared_websockets_conectados",
  help: "Número de clientes del dashboard conectados por WebSocket en este momento",
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: "climared_http_request_duration_seconds",
  help: "Duración de las peticiones HTTP en segundos",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

// Middleware Express que mide la duración de cada petición.
function httpMetricsMiddleware(req, res, next) {
  const end = httpRequestDuration.startTimer({ method: req.method });
  res.on("finish", () => {
    end({
      route: req.route ? req.baseUrl + req.route.path : req.path,
      status_code: res.statusCode,
    });
  });
  next();
}

module.exports = {
  register,
  lecturasRecibidas,
  lecturasPorSegundo,
  bufferTamano,
  lecturasPersistidas,
  lecturasErrorPersistencia,
  lecturasPurgadas,
  redisConectado,
  websocketsConectados,
  httpRequestDuration,
  httpMetricsMiddleware,
};
