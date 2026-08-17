// Cliente Redis del backend, usado en modo SUSCRIPTOR sobre el canal de lecturas publicado por
// sensor-sim (ver ADR en README: por qué Redis pub/sub como buffer entre ingesta y persistencia).
const { createClient } = require("redis");
const config = require("./config");
const metrics = require("./metrics");

function crearClienteRedis() {
  const client = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
      // Reintenta la conexión con backoff creciente (hasta 5s) en lugar de morir al primer fallo:
      // así el backend tolera que Redis tarde unos segundos más en arrancar.
      reconnectStrategy: (reintentos) => {
        const esperaMs = Math.min(reintentos * 500, 5000);
        console.warn(`[redis] reintentando conexión en ${esperaMs} ms (intento ${reintentos})...`);
        return esperaMs;
      },
    },
  });

  client.on("error", (err) => {
    metrics.redisConectado.set(0);
    console.error("[redis] error de conexión:", err.message);
  });
  client.on("ready", () => {
    metrics.redisConectado.set(1);
    console.log("[redis] cliente listo.");
  });
  client.on("end", () => {
    metrics.redisConectado.set(0);
    console.warn("[redis] conexión cerrada.");
  });

  return client;
}

// Conecta con reintentos explícitos en el arranque (más allá de reconnectStrategy, que solo
// actúa tras una conexión ya establecida y luego perdida). Si tras "maxIntentos" sigue sin
// poder conectar, lanza el error para que el proceso termine con un mensaje claro
// (equivalente en Node al comportamiento "fallar rápido" de sensor-sim en Python).
async function conectarConReintentos(client, maxIntentos = 10) {
  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      await client.connect();
      return;
    } catch (err) {
      console.error(`[redis] intento de conexión ${intento}/${maxIntentos} fallido: ${err.message}`);
      if (intento === maxIntentos) {
        console.error(
          "[redis] ERROR FATAL: no se pudo conectar con Redis tras varios intentos. " +
            "Comprueba que el servicio \"redis\" está arrancado y accesible en la red climared_net " +
            "(docker compose ps, docker network inspect climared_net)."
        );
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * intento));
    }
  }
}

module.exports = { crearClienteRedis, conectarConReintentos };
