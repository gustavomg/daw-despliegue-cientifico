// Rutas REST de la API de ClimaRed.
const express = require("express");
const db = require("./db");
const config = require("./config");

const router = express.Router();

// Sonda de salud (usada por el HEALTHCHECK de Docker y por el ejercicio de verificación).
router.get("/health", async (req, res) => {
  let dbOk = true;
  try {
    await db.ping();
  } catch (err) {
    dbOk = false;
  }
  const status = dbOk ? "ok" : "degradado";
  res.status(dbOk ? 200 : 503).json({
    status,
    uptime: process.uptime(),
    env: config.nodeEnv,
    db: dbOk ? "ok" : "error",
  });
});

// Lista de estaciones ambientales registradas.
router.get("/estaciones", async (req, res) => {
  try {
    const estaciones = await db.getEstaciones();
    res.json({ estaciones });
  } catch (err) {
    console.error("[routes] error al listar estaciones:", err.message);
    res.status(500).json({ error: "Error al consultar las estaciones" });
  }
});

// Consulta histórica de lecturas, con filtros opcionales.
// GET /api/lecturas?estacion_id=1&desde=2026-08-01T00:00:00Z&hasta=2026-08-02T00:00:00Z&limit=500
router.get("/lecturas", async (req, res) => {
  const { estacion_id: estacionIdRaw, desde, hasta } = req.query;
  const estacionId = estacionIdRaw ? parseInt(estacionIdRaw, 10) : null;

  if (estacionIdRaw && Number.isNaN(estacionId)) {
    return res.status(400).json({ error: "estacion_id debe ser numérico" });
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 500, 5000);

  try {
    const lecturas = await db.getLecturas({ estacionId, desde: desde || null, hasta: hasta || null, limit });
    res.json({ lecturas });
  } catch (err) {
    console.error("[routes] error al consultar lecturas:", err.message);
    res.status(500).json({ error: "Error al consultar las lecturas" });
  }
});

module.exports = router;
