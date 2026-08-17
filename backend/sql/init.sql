-- Esquema inicial de ClimaRed: estaciones ambientales y sus lecturas + semilla de datos de ejemplo.
--
-- Este script lo ejecuta automáticamente la imagen oficial de Postgres la PRIMERA vez que se crea
-- el volumen de datos (mecanismo estándar de /docker-entrypoint-initdb.d/, ver docker-compose.yml,
-- servicio "db"). Si el volumen "db_data" ya existe, este script NO se vuelve a ejecutar.
-- Para forzar su reejecución (por ejemplo, tras cambiar el esquema): docker compose down -v

-- Estaciones ambientales físicas/simuladas.
CREATE TABLE IF NOT EXISTS estaciones (
    id     SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    lat    DOUBLE PRECISION NOT NULL,
    lon    DOUBLE PRECISION NOT NULL
);

-- Lecturas de sensores. "timestamp" se entrecomilla porque coincide con una palabra clave SQL.
CREATE TABLE IF NOT EXISTS lecturas (
    id          BIGSERIAL PRIMARY KEY,
    estacion_id INTEGER NOT NULL REFERENCES estaciones(id),
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
    temperatura DOUBLE PRECISION,
    humedad     DOUBLE PRECISION,
    co2         DOUBLE PRECISION,
    presion     DOUBLE PRECISION
);

-- Índice compuesto: las consultas históricas del backend (GET /api/lecturas) siempre filtran
-- por estación y ordenan/acotan por rango de tiempo.
CREATE INDEX IF NOT EXISTS idx_lecturas_estacion_timestamp
    ON lecturas (estacion_id, "timestamp");

-- Semilla: 5 estaciones ambientales de ejemplo repartidas por España.
-- IMPORTANTE (ver ejercicios de la Guía de Despliegue): la variable NUM_ESTACIONES de
-- sensor-sim debe coincidir con el número de filas sembradas aquí. Si se aumenta
-- NUM_ESTACIONES por encima de 5 sin añadir más estaciones, el backend descartará (con un
-- aviso en el log) las lecturas de estaciones inexistentes al violar la clave foránea.
INSERT INTO estaciones (nombre, lat, lon) VALUES
    ('Madrid - Parque del Retiro',  40.4152, -3.6844),
    ('Barcelona - Collserola',      41.4225,  2.1206),
    ('Sevilla - Aljarafe',          37.3475, -6.0539),
    ('Valencia - Albufera',         39.3260, -0.3556),
    ('Bilbao - Monte Artxanda',     43.2740, -2.9280)
ON CONFLICT DO NOTHING;
