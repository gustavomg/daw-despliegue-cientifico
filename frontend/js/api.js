// Pequeña capa de acceso a la API REST. Las rutas son relativas ("/api/...") porque en
// producción Nginx sirve este frontend estático Y hace de proxy inverso hacia el backend en el
// mismo origen (ver nginx/nginx.conf) -> no hay problemas de CORS ni hay que hardcodear
// hosts/puertos en el frontend.
const Api = (() => {
  async function getEstaciones() {
    const res = await fetch("/api/estaciones");
    if (!res.ok) throw new Error(`Error ${res.status} al listar estaciones`);
    const data = await res.json();
    return data.estaciones;
  }

  async function getLecturas(estacionId, limit = 50) {
    const url = `/api/lecturas?estacion_id=${encodeURIComponent(estacionId)}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error ${res.status} al consultar lecturas`);
    const data = await res.json();
    return data.lecturas;
  }

  return { getEstaciones, getLecturas };
})();
