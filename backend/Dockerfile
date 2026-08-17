# --- Etapa 1: instalación de dependencias de producción ---
# Se separa en una etapa propia para aprovechar la cache de capas de Docker: si solo cambia el
# código fuente (no package.json), esta etapa no se repite en builds sucesivos.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# --- Etapa 2: imagen final de ejecución ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Usuario sin privilegios (nunca ejecutar la app como root en producción).
RUN addgroup -S climared && adduser -S climared -G climared

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

USER climared

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
