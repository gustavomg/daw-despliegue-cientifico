// Configuración centralizada leída de variables de entorno (patrón 12-factor: config en el
// entorno, no en el código). Así, cambiar el comportamiento del backend (intervalos, retención...)
// solo requiere editar el .env y reiniciar el contenedor, SIN reconstruir la imagen.
require("dotenv").config();

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = {
  port: toInt(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV || "development",

  // Base de datos
  db: {
    host: process.env.PGHOST || "localhost",
    port: toInt(process.env.PGPORT, 5432),
    user: process.env.PGUSER || "climared",
    password: process.env.PGPASSWORD || "climared",
    database: process.env.PGDATABASE || "climared",
  },

  // Redis (buffer pub/sub entre sensor-sim y backend)
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: toInt(process.env.REDIS_PORT, 6379),
    canal: process.env.REDIS_CHANNEL || "climared:lecturas",
  },

  // Retención de datos históricos: las lecturas con más de "retencionDias" días se purgan.
  retencionDias: toInt(process.env.RETENCION_DIAS, 30),

  // Ingesta rápida en memoria + persistencia por lotes (ver ADR en documentación/README):
  // el backend NO escribe en Postgres en cada lectura individual, sino que acumula un buffer
  // en memoria y lo vuelca cada "batchIntervalMs" milisegundos.
  batchIntervalMs: toInt(process.env.BATCH_INTERVAL_MS, 5000),

  // Cada cuánto se ejecuta el proceso de purga de retención.
  purgaIntervaloMs: toInt(process.env.PURGA_INTERVALO_MS, 3600000),
};
