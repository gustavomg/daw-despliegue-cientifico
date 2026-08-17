// Configuración de Socket.IO: retransmite en tiempo real, a todos los clientes del dashboard,
// las lecturas que llegan por el pub/sub de Redis (ver server.js, donde se conectan ambos mundos).
const metrics = require("./metrics");

// Última lectura conocida de cada estación, para poder pintar el dashboard de inmediato al
// conectar un nuevo cliente (sin tener que esperar a la siguiente lectura en vivo).
const ultimasLecturas = new Map(); // estacion_id -> lectura

function setupSockets(io) {
  io.on("connection", (socket) => {
    metrics.websocketsConectados.inc();
    console.log(`[sockets] cliente conectado: ${socket.id}`);

    socket.emit("estado:inicial", { ultimas: Array.from(ultimasLecturas.values()) });

    socket.on("disconnect", () => {
      metrics.websocketsConectados.dec();
      console.log(`[sockets] cliente desconectado: ${socket.id}`);
    });
  });
}

// Se llama desde server.js cada vez que llega una lectura nueva por Redis.
function broadcastLectura(io, lectura) {
  ultimasLecturas.set(lectura.estacion_id, lectura);
  io.emit("lectura:nueva", lectura);
}

module.exports = { setupSockets, broadcastLectura };
