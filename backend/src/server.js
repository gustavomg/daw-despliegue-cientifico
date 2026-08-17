// Punto de entrada del backend de ClimaRed. Ensambla: app Express (app.js) + Socket.IO
// (sockets.js) + suscripción a Redis (redisClient.js) + ingesta/persistencia por lotes
// (ingest.js) + purga de retención (db.js).
//
// Flujo completo: sensor-sim publica en Redis -> este proceso se suscribe al canal, empuja
// cada lectura al buffer en memoria (ingest.push) y la retransmite al instante por WebSocket
// (sockets.broadcastLectura) -> periódicamente, el buffer se vuelca a Postgres en lote.
const http = require("http");
const { Server } = require("socket.io");

const config = require("./config");
const db = require("./db");
const metrics = require("./metrics");
const ingest = require("./ingest");
const { setupSockets, broadcastLectura } = require("./sockets");
const { crearClienteRedis, conectarConReintentos } = require("./redisClient");
const { createApp } = require("./app");

async function main() {
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });
  setupSockets(io);

  // Verificación de Postgres. En Docker, depends_on con condition: service_healthy ya garantiza
  // que "db" está listo antes de arrancar este contenedor; esta comprobación añade una segunda
  // red de seguridad (y es imprescindible al ejecutar el backend en local sin Compose).
  await db.ping();
  console.log("[server] conexión con Postgres verificada.");

  // Suscripción a Redis: aquí se cierra el circuito ingesta -> tiempo real -> persistencia.
  const redisSub = crearClienteRedis();
  await conectarConReintentos(redisSub);
  await redisSub.subscribe(config.redis.canal, (mensaje) => {
    let lectura;
    try {
      lectura = JSON.parse(mensaje);
    } catch (err) {
      console.warn("[server] mensaje de Redis descartado (JSON inválido):", err.message);
      return;
    }
    ingest.push(lectura);
    broadcastLectura(io, lectura);
  });
  console.log(`[server] suscrito al canal Redis "${config.redis.canal}".`);

  ingest.iniciarCalculoTasa();
  ingest.iniciarFlushPeriodico(config.batchIntervalMs);
  console.log(`[server] persistencia por lotes cada ${config.batchIntervalMs} ms.`);

  // Purga de retención: se ejecuta una vez al arrancar y luego periódicamente.
  const ejecutarPurga = async () => {
    try {
      const borradas = await db.purgarAntiguas(config.retencionDias);
      if (borradas > 0) {
        console.log(
          `[server] purga de retención: ${borradas} lecturas con más de ${config.retencionDias} días eliminadas.`
        );
      }
      metrics.lecturasPurgadas.inc(borradas);
    } catch (err) {
      console.error("[server] error durante la purga de retención:", err.message);
    }
  };
  await ejecutarPurga();
  setInterval(ejecutarPurga, config.purgaIntervaloMs);
  console.log(
    `[server] retención configurada a ${config.retencionDias} días (purga cada ${config.purgaIntervaloMs} ms).`
  );

  server.listen(config.port, () => {
    console.log(`[server] API + WebSocket escuchando en el puerto ${config.port} (entorno: ${config.nodeEnv})`);
  });

  const shutdown = async (signal) => {
    console.log(`[server] recibida señal ${signal}, cerrando ordenadamente...`);
    await ingest.flush(); // último volcado antes de salir, para minimizar pérdida de datos
    await redisSub.quit().catch(() => {});
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[server] error fatal en el arranque:", err);
  process.exit(1);
});
