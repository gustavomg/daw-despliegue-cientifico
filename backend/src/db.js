// Acceso a PostgreSQL: estaciones, lecturas históricas, inserción por lotes y purga de retención.
// El esquema de tablas NO se crea aquí: lo crea backend/sql/init.sql al arrancar el contenedor
// "db" por primera vez (ver docker-compose.yml). Este módulo asume que las tablas ya existen.
const { Pool } = require("pg");
const config = require("./config");

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      max: 10,
      idleTimeoutMillis: 30000,
    });
    pool.on("error", (err) => {
      console.error("[db] error inesperado en el pool de Postgres:", err.message);
    });
  }
  return pool;
}

// Comprobación mínima de salud, usada por GET /api/health y por el arranque del servidor.
async function ping() {
  await getPool().query("SELECT 1");
}

async function getEstaciones() {
  const { rows } = await getPool().query(
    "SELECT id, nombre, lat, lon FROM estaciones ORDER BY id"
  );
  return rows;
}

// Inserta un lote de lecturas en una única sentencia (rápido). Si el lote completo falla
// (por ejemplo, porque alguna lectura referencia una estacion_id que no existe: violación de
// clave foránea), se reintenta lectura a lectura para no perder el lote entero por un solo
// registro problemático. Devuelve el número de filas realmente insertadas.
async function insertarLecturasLote(lecturas) {
  if (!lecturas || lecturas.length === 0) return 0;
  const p = getPool();

  try {
    const columnas = 6;
    const valores = [];
    const placeholders = lecturas
      .map((l, i) => {
        const base = i * columnas;
        valores.push(l.estacion_id, l.timestamp, l.temperatura, l.humedad, l.co2, l.presion);
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6})`;
      })
      .join(",");
    const sql = `INSERT INTO lecturas (estacion_id, "timestamp", temperatura, humedad, co2, presion)
                 VALUES ${placeholders}`;
    const res = await p.query(sql, valores);
    return res.rowCount;
  } catch (err) {
    console.warn(
      `[db] el insert en bloque de ${lecturas.length} lecturas falló (${err.message}); ` +
        "reintentando lectura a lectura para conservar las válidas."
    );
    let insertadas = 0;
    for (const l of lecturas) {
      try {
        await p.query(
          `INSERT INTO lecturas (estacion_id, "timestamp", temperatura, humedad, co2, presion)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [l.estacion_id, l.timestamp, l.temperatura, l.humedad, l.co2, l.presion]
        );
        insertadas++;
      } catch (rowErr) {
        console.warn(
          `[db] lectura descartada (estacion_id=${l.estacion_id}): ${rowErr.message}`
        );
      }
    }
    return insertadas;
  }
}

// Consulta histórica con filtros opcionales por estación y rango de fechas.
async function getLecturas({ estacionId, desde, hasta, limit }) {
  const condiciones = [];
  const valores = [];

  if (estacionId) {
    valores.push(estacionId);
    condiciones.push(`estacion_id = $${valores.length}`);
  }
  if (desde) {
    valores.push(desde);
    condiciones.push(`"timestamp" >= $${valores.length}`);
  }
  if (hasta) {
    valores.push(hasta);
    condiciones.push(`"timestamp" <= $${valores.length}`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  valores.push(limit);

  const sql = `
    SELECT id, estacion_id, "timestamp", temperatura, humedad, co2, presion
    FROM lecturas
    ${where}
    ORDER BY "timestamp" DESC
    LIMIT $${valores.length}
  `;
  const { rows } = await getPool().query(sql, valores);
  return rows;
}

// Purga lecturas con más de "retencionDias" días de antigüedad. Devuelve el número de filas
// eliminadas (usado para la métrica climared_lecturas_purgadas_total).
async function purgarAntiguas(retencionDias) {
  const { rowCount } = await getPool().query(
    `DELETE FROM lecturas WHERE "timestamp" < now() - make_interval(days => $1::int)`,
    [retencionDias]
  );
  return rowCount;
}

module.exports = {
  getPool,
  ping,
  getEstaciones,
  insertarLecturasLote,
  getLecturas,
  purgarAntiguas,
};
