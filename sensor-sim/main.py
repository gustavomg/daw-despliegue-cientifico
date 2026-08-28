#!/usr/bin/env python3
"""sensor-sim: generador de lecturas ambientales simuladas para ClimaRed.

Responsabilidad única: generar lecturas para NUM_ESTACIONES estaciones cada INTERVALO_MS
milisegundos y publicarlas en un canal Redis (pub/sub). No escribe nada en Postgres ni conoce
el backend: solo habla con Redis. El backend es quien se suscribe, retransmite por WebSocket
y persiste en lotes (ver backend/src/server.js).

Diseñado para fallar RÁPIDO y con un mensaje claro si no puede resolver/conectar con Redis,
en lugar de colgarse en silencio: es la pieza usada en el ejercicio de diagnóstico de red.
"""
import json
import math
import os
import random
import sys
import time
from datetime import datetime, timezone

import redis


def leer_entero(nombre_var, valor_por_defecto):
    """Lee una variable de entorno como entero, con valor por defecto si falta o no es válida."""
    valor = os.environ.get(nombre_var)
    if valor is None or valor == "":
        return valor_por_defecto
    try:
        return int(valor)
    except ValueError:
        print(
            f"[sensor-sim] AVISO: {nombre_var}='{valor}' no es un entero válido, "
            f"usando el valor por defecto {valor_por_defecto}.",
            file=sys.stderr,
        )
        return valor_por_defecto


REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = leer_entero("REDIS_PORT", 6379)
CANAL = os.environ.get("REDIS_CHANNEL", "climared:lecturas")
NUM_ESTACIONES = leer_entero("NUM_ESTACIONES", 5)
INTERVALO_MS = leer_entero("INTERVALO_MS", 3000)


def conectar_redis():
    """Conecta con Redis y falla RÁPIDO con un mensaje claro si no es posible.

    Este comportamiento es intencionado: en el ejercicio de diagnóstico de red del módulo,
    el alumnado debe ver un error explícito y accionable (no un cuelgue silencioso) cuando
    REDIS_HOST está mal configurado, cuando el contenedor "redis" está parado, o cuando ambos
    servicios no comparten red.
    """
    cliente = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        socket_connect_timeout=5,
        socket_timeout=5,
    )
    try:
        cliente.ping()
    except redis.exceptions.RedisError as err:
        print(
            f"[sensor-sim] ERROR FATAL: no se puede conectar con Redis en "
            f"'{REDIS_HOST}:{REDIS_PORT}'.",
            file=sys.stderr,
        )
        print(f"[sensor-sim] Causa: {err}", file=sys.stderr)
        print(
            "[sensor-sim] Pasos de diagnóstico sugeridos:\n"
            "  1) docker compose ps                         -> ¿el servicio 'redis' está 'healthy'?\n"
            "  2) docker compose logs sensor-sim             -> revisa este mismo mensaje de error\n"
            "  3) docker network ls                         -> el nombre real lleva delante el del proyecto\n"
            "     docker network inspect <nombre_completo>  -> ¿ambos contenedores están en la red?\n"
            "  4) Revisa REDIS_HOST en docker-compose.yml/.env -> debe ser el nombre del servicio "
            "('redis'), no 'localhost' ni una IP fija.",
            file=sys.stderr,
        )
        sys.exit(1)
    return cliente


def generar_lectura(estacion_id, tick):
    """Genera una lectura simulada con variación diaria (ciclo seno) y ruido aleatorio,
    con un desplazamiento distinto por estación para que no todas midan lo mismo."""
    horas_transcurridas = (tick * INTERVALO_MS / 1000) / 3600
    ciclo_diario = math.sin((horas_transcurridas / 24) * 2 * math.pi)

    base_temperatura = 18 + estacion_id * 0.7
    temperatura = round(base_temperatura + ciclo_diario * 6 + random.uniform(-1.2, 1.2), 2)

    humedad = 55 - ciclo_diario * 15 + random.uniform(-5, 5) + estacion_id
    humedad = round(max(10.0, min(100.0, humedad)), 2)

    hora_del_dia = tick % 24
    pico_trafico = 5 if 8 <= hora_del_dia <= 20 else 0
    co2 = round(410 + random.uniform(-20, 60) + pico_trafico, 1)

    presion = round(1013 + math.sin(tick / 50) * 8 + random.uniform(-1, 1), 1)

    return {
        "estacion_id": estacion_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "temperatura": temperatura,
        "humedad": humedad,
        "co2": co2,
        "presion": presion,
    }


def main():
    print(
        f"[sensor-sim] iniciando: NUM_ESTACIONES={NUM_ESTACIONES}, INTERVALO_MS={INTERVALO_MS}, "
        f"redis={REDIS_HOST}:{REDIS_PORT}, canal='{CANAL}'"
    )
    cliente = conectar_redis()
    print("[sensor-sim] conexión con Redis establecida correctamente. Publicando lecturas...")

    tick = 0
    try:
        while True:
            for estacion_id in range(1, NUM_ESTACIONES + 1):
                lectura = generar_lectura(estacion_id, tick)
                try:
                    cliente.publish(CANAL, json.dumps(lectura))
                except redis.exceptions.RedisError as err:
                    # Redis se cayó DESPUÉS de conectar con éxito (p. ej. se paró a mitad de
                    # ejecución): se registra el error y se sigue intentando en el próximo tick
                    # (patrón "at-most-once": estas lecturas concretas se pierden, no se reintentan).
                    print(f"[sensor-sim] error al publicar en Redis: {err}", file=sys.stderr)
            tick += 1
            time.sleep(INTERVALO_MS / 1000)
    except KeyboardInterrupt:
        print("[sensor-sim] interrumpido, cerrando de forma ordenada.")


if __name__ == "__main__":
    main()
