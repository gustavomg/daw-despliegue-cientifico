// Envoltorio mínimo sobre el cliente de Socket.IO (cargado desde CDN en index.html).
// Nginx hace de proxy inverso de /socket.io/ hacia el backend (ver nginx/nginx.conf), así que
// nos conectamos sin indicar host: se usa el mismo origen que sirve la página.
const Sockets = (() => {
  let socket = null;

  function conectar({ onConectar, onDesconectar, onEstadoInicial, onLecturaNueva }) {
    socket = io({ path: "/socket.io" });

    socket.on("connect", () => onConectar && onConectar());
    socket.on("disconnect", () => onDesconectar && onDesconectar());
    socket.on("estado:inicial", (payload) => onEstadoInicial && onEstadoInicial(payload));
    socket.on("lectura:nueva", (lectura) => onLecturaNueva && onLecturaNueva(lectura));

    return socket;
  }

  return { conectar };
})();
