// Construye la app de Express de forma aislada (sin arrancar el puerto, Redis ni Postgres),
// para mantener server.js centrado exclusivamente en el ensamblaje y arranque del proceso.
const express = require("express");
const cors = require("cors");
const metrics = require("./metrics");
const apiRoutes = require("./routes");

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(metrics.httpMetricsMiddleware);
  app.use("/api", apiRoutes);

  // Métricas en formato texto de Prometheus (ver metrics.js y monitoring/prometheus.yml).
  app.get("/metrics", async (req, res) => {
    res.set("Content-Type", metrics.register.contentType);
    res.end(await metrics.register.metrics());
  });

  return app;
}

module.exports = { createApp };
