# ClimaRed — Plataforma de datos de sensores ambientales

Proyecto de práctica del módulo **Despliegue de Aplicaciones Web** (Docker/contenedores).

ClimaRed simula una pequeña red de estaciones ambientales científicas (temperatura, humedad,
CO2 y presión atmosférica) que ingieren datos en tiempo real, los muestran en un dashboard web
en vivo y los persisten de forma histórica en una base de datos relacional.

Este proyecto **no es un ejercicio de programación**: el código ya está completo y funciona.
El trabajo del alumnado consiste en **desplegarlo con Docker Compose, experimentar con cambios
de configuración y diagnosticar errores intencionados** (ver la guía en `documentacion/`).

## Arquitectura

```
                     publica cada lectura           se suscribe y retransmite
   ┌─────────────┐   (pub/sub, canal          ┌───────────┐   por WebSocket    ┌───────────┐
   │ sensor-sim  │ ─────────────────────────► │   redis   │ ─────────────────► │  backend  │
   │  (Python)   │   "climared:lecturas")     │  (buffer  │                    │ (Node.js) │
   └─────────────┘                            │ en memoria)│                    └─────┬─────┘
                                               └───────────┘                          │
                                                                     persiste en lotes │  emite en vivo
                                                                     (cada BATCH_      │  (Socket.IO)
                                                                      INTERVAL_MS)     ▼
                                                                    ┌───────────┐   ┌──────────────┐
                                                                    │ postgres  │   │    nginx     │
                                                                    │ (db_data) │   │ (frontend +  │
                                                                    └───────────┘   │  proxy /api, │
                                                                                     │  /socket.io, │
                                                                                     │  /metrics)   │
                                                                                     └──────┬───────┘
                                                                                            │
                                                                                            ▼
                                                                                     Navegador del
                                                                                     alumnado (dashboard)
```

Flujo de datos, en texto:

1. **sensor-sim** genera lecturas simuladas para `NUM_ESTACIONES` estaciones cada
   `INTERVALO_MS` y las publica en el canal Redis `climared:lecturas`.
2. **redis** actúa solo como buffer pub/sub en memoria (no persiste nada en disco).
3. **backend** se suscribe al canal, y por cada lectura recibida:
   - la retransmite al instante por **WebSocket** (Socket.IO) a todos los clientes del dashboard;
   - la acumula en un **buffer en memoria** que se vuelca a **Postgres en lotes** cada
     `BATCH_INTERVAL_MS` (patrón "ingesta rápida en memoria + persistencia batch").
   - periódicamente purga de Postgres las lecturas con más de `RETENCION_DIAS` días.
4. **nginx** sirve el frontend estático y hace de proxy inverso hacia el backend
   (`/api/`, `/socket.io/`, `/metrics`), de modo que el navegador solo habla con un origen.
5. El **frontend** (dashboard) pinta la lista de estaciones, un gráfico en vivo (Chart.js) de la
   estación seleccionada y una tabla de últimas lecturas, todo alimentado por WebSocket.

### ¿Por qué Python para sensor-sim y Node.js para el backend?

Se elige deliberadamente un lenguaje distinto para `sensor-sim` (Python) frente al `backend`
(Node.js) con fines didácticos: demuestra que, gracias a los contenedores, cada servicio es una
caja negra con su propio runtime — el resto del sistema solo necesita saber que "sensor-sim
publica JSON en un canal Redis", no en qué lenguaje está escrito. Además, permite comparar dos
`Dockerfile` distintos (`node:22-alpine` con build multi-stage vs. `python:3.12-alpine` de una
sola etapa) dentro del mismo proyecto.

## Arranque rápido

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

Abre `http://localhost/` (o el puerto configurado en `HTTP_PORT`).

### Con monitorización (Prometheus + Grafana)

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d --build
```

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3002` (usuario `admin`, contraseña `GRAFANA_ADMIN_PASSWORD`)

## Documentación

La guía completa de despliegue, con ejercicios de configuración y de diagnóstico de errores,
está en [`documentacion/Guia_Despliegue_y_Ejercicios_Cientifico.docx`](./documentacion).

## Servicios y puertos

| Servicio     | Imagen / build          | Puerto host        | Rol                                                     |
|--------------|--------------------------|---------------------|----------------------------------------------------------|
| `db`         | `postgres:16-alpine`    | (interno, 5432)    | Almacén histórico de estaciones y lecturas               |
| `redis`      | `redis:7-alpine`        | (interno, 6379)    | Buffer pub/sub entre sensor-sim y backend                 |
| `sensor-sim` | `sensor-sim/Dockerfile` | —                   | Generador de lecturas simuladas (Python)                  |
| `backend`    | `backend/Dockerfile`    | (interno, 3000)    | API REST + WebSocket + ingesta/persistencia (Node.js)     |
| `nginx`      | `nginx/Dockerfile`      | `${HTTP_PORT:-80}` | Frontend estático + proxy inverso                          |
| `prometheus` | `prom/prometheus`       | `9090`              | Scraping de `/metrics` del backend (compose de monitorización) |
| `grafana`    | `grafana/grafana`       | `3002`              | Paneles sobre las métricas de Prometheus (opcional)        |

## Estructura del repositorio

```
PROYECTO_CIENTIFICO/
├── backend/            API REST + Socket.IO + ingesta/persistencia (Node.js)
│   ├── sql/init.sql     Esquema de tablas + semilla de estaciones
│   └── src/              Módulos: config, db, redisClient, ingest, metrics, sockets, routes...
├── sensor-sim/          Generador de lecturas simuladas (Python)
├── nginx/                Imagen Nginx a medida (estático + proxy inverso)
├── frontend/             Dashboard (HTML/CSS/JS + Chart.js + Socket.IO)
├── monitoring/           Configuración de Prometheus (stack opcional)
├── documentacion/        Guía de despliegue y ejercicios (.docx)
├── docker-compose.yml
└── docker-compose.monitoring.yml
```

## API del backend

| Método | Ruta                                              | Descripción                                    |
|--------|----------------------------------------------------|-------------------------------------------------|
| GET    | `/api/estaciones`                                  | Lista de estaciones registradas                  |
| GET    | `/api/lecturas?estacion_id=&desde=&hasta=&limit=`  | Consulta histórica de lecturas desde Postgres    |
| GET    | `/api/health`                                      | Sonda de salud (usada por el HEALTHCHECK Docker) |
| GET    | `/metrics`                                         | Métricas en formato texto Prometheus             |
| WS     | `/socket.io/`                                      | Eventos `estado:inicial` y `lectura:nueva`       |

## Desarrollo local del backend (sin Docker)

```bash
cd backend
npm install
cp .env.example .env   # ajusta PGHOST/REDIS_HOST a "localhost" si Postgres/Redis corren en local
node src/server.js
```
