# Imagen ligera para el generador de lecturas simuladas. Se usa Python (en vez de Node, como el
# backend) a propósito, con fines didácticos: demuestra que un stack en contenedores puede
# combinar lenguajes distintos sin fricción -cada servicio es una caja negra con su propio
# runtime- y da pie a comparar dos Dockerfiles distintos dentro del mismo proyecto (ver README).
FROM python:3.12-alpine

WORKDIR /app

# Usuario sin privilegios (nunca ejecutar la app como root en producción).
RUN addgroup -S climared && adduser -S climared -G climared

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py ./

USER climared

# Sin HEALTHCHECK: este contenedor no expone ningún puerto/endpoint HTTP, es un proceso
# productor puro. Su salud se observa por logs (docker compose logs sensor-sim) y por el
# estado del contenedor (docker compose ps): si no puede conectar con Redis, termina con
# código de salida distinto de 0 y, con "restart: unless-stopped", entra en bucle de reinicio
# (visible como "Restarting" - útil para el ejercicio de diagnóstico de red).
CMD ["python", "main.py"]
