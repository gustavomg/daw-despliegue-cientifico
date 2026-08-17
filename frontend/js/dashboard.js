// Lógica principal del dashboard: lista de estaciones, gráfico en vivo de la estación
// seleccionada (Chart.js) y tabla de últimas lecturas de todas las estaciones, alimentada
// por WebSocket (Socket.IO) en tiempo real.
(() => {
  const MAX_PUNTOS_GRAFICO = 40;
  const MAX_FILAS_TABLA = 25;

  let estaciones = [];
  let estacionSeleccionada = null;
  let grafico = null;

  const elListaEstaciones = document.getElementById("lista-estaciones");
  const elTituloEstacion = document.getElementById("titulo-estacion");
  const elTablaBody = document.getElementById("tabla-lecturas-body");
  const elStatusDot = document.getElementById("status-dot");
  const elRelojConexion = document.getElementById("reloj-conexion");
  const elValorTemp = document.getElementById("valor-temp");
  const elValorHum = document.getElementById("valor-hum");
  const elValorCo2 = document.getElementById("valor-co2");
  const elValorPresion = document.getElementById("valor-presion");

  function nombreEstacion(id) {
    const est = estaciones.find((e) => e.id === id);
    return est ? est.nombre : `Estación ${id}`;
  }

  function formatearHora(timestamp) {
    return new Date(timestamp).toLocaleTimeString("es-ES");
  }

  function crearGrafico() {
    const ctx = document.getElementById("grafico-lecturas").getContext("2d");
    grafico = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          { label: "Temperatura (°C)", data: [], borderColor: "#ea580c", tension: 0.3, yAxisID: "y" },
          { label: "Humedad (%)", data: [], borderColor: "#0369a1", tension: 0.3, yAxisID: "y1" },
        ],
      },
      options: {
        responsive: true,
        animation: false,
        scales: {
          y: { type: "linear", position: "left", title: { display: true, text: "°C" } },
          y1: { type: "linear", position: "right", title: { display: true, text: "%" }, grid: { drawOnChartArea: false } },
        },
      },
    });
  }

  function actualizarGraficoConHistorico(lecturas) {
    // El backend devuelve las lecturas más recientes primero: se invierte para pintarlas en
    // orden cronológico.
    const ordenadas = [...lecturas].reverse();
    grafico.data.labels = ordenadas.map((l) => formatearHora(l.timestamp));
    grafico.data.datasets[0].data = ordenadas.map((l) => l.temperatura);
    grafico.data.datasets[1].data = ordenadas.map((l) => l.humedad);
    grafico.update();
  }

  function agregarPuntoAlGrafico(lectura) {
    grafico.data.labels.push(formatearHora(lectura.timestamp));
    grafico.data.datasets[0].data.push(lectura.temperatura);
    grafico.data.datasets[1].data.push(lectura.humedad);
    if (grafico.data.labels.length > MAX_PUNTOS_GRAFICO) {
      grafico.data.labels.shift();
      grafico.data.datasets[0].data.shift();
      grafico.data.datasets[1].data.shift();
    }
    grafico.update();
  }

  function actualizarMetricasRapidas(lectura) {
    elValorTemp.textContent = lectura.temperatura?.toFixed?.(1) ?? "--";
    elValorHum.textContent = lectura.humedad?.toFixed?.(1) ?? "--";
    elValorCo2.textContent = lectura.co2?.toFixed?.(0) ?? "--";
    elValorPresion.textContent = lectura.presion?.toFixed?.(1) ?? "--";
  }

  async function seleccionarEstacion(id) {
    estacionSeleccionada = id;
    document.querySelectorAll(".estacion-card").forEach((card) => {
      card.classList.toggle("selected", Number(card.dataset.id) === id);
    });
    elTituloEstacion.textContent = nombreEstacion(id);

    try {
      const historico = await Api.getLecturas(id, MAX_PUNTOS_GRAFICO);
      actualizarGraficoConHistorico(historico);
      if (historico.length > 0) actualizarMetricasRapidas(historico[0]);
    } catch (err) {
      console.error("Error al cargar histórico:", err);
    }
  }

  function renderizarListaEstaciones() {
    elListaEstaciones.innerHTML = "";
    estaciones.forEach((est) => {
      const div = document.createElement("div");
      div.className = "estacion-card";
      div.dataset.id = est.id;
      div.innerHTML = `
        <div class="nombre">${est.nombre}</div>
        <div class="coords">lat ${est.lat.toFixed(3)}, lon ${est.lon.toFixed(3)}</div>
      `;
      div.addEventListener("click", () => seleccionarEstacion(est.id));
      elListaEstaciones.appendChild(div);
    });
  }

  function insertarFilaTabla(lectura) {
    const fila = document.createElement("tr");
    fila.innerHTML = `
      <td>${formatearHora(lectura.timestamp)}</td>
      <td>${nombreEstacion(lectura.estacion_id)}</td>
      <td>${lectura.temperatura?.toFixed?.(1) ?? "--"}</td>
      <td>${lectura.humedad?.toFixed?.(1) ?? "--"}</td>
      <td>${lectura.co2?.toFixed?.(0) ?? "--"}</td>
      <td>${lectura.presion?.toFixed?.(1) ?? "--"}</td>
    `;
    elTablaBody.prepend(fila);
    while (elTablaBody.children.length > MAX_FILAS_TABLA) {
      elTablaBody.removeChild(elTablaBody.lastChild);
    }
  }

  function manejarLecturaNueva(lectura) {
    insertarFilaTabla(lectura);
    if (lectura.estacion_id === estacionSeleccionada) {
      agregarPuntoAlGrafico(lectura);
      actualizarMetricasRapidas(lectura);
    }
  }

  async function iniciar() {
    crearGrafico();

    try {
      estaciones = await Api.getEstaciones();
      renderizarListaEstaciones();
      if (estaciones.length > 0) await seleccionarEstacion(estaciones[0].id);
    } catch (err) {
      elListaEstaciones.textContent = "Error al cargar estaciones. ¿Está el backend disponible?";
      console.error(err);
    }

    Sockets.conectar({
      onConectar: () => {
        elStatusDot.classList.add("ok");
        elRelojConexion.textContent = "Conectado en tiempo real";
      },
      onDesconectar: () => {
        elStatusDot.classList.remove("ok");
        elRelojConexion.textContent = "Desconectado, reintentando...";
      },
      onEstadoInicial: (payload) => {
        (payload.ultimas || []).forEach((lectura) => insertarFilaTabla(lectura));
      },
      onLecturaNueva: manejarLecturaNueva,
    });
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
