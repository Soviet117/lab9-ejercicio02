/*
 * Ejercicio 2 — Interfaz interactiva: controles, animación y panel de métricas.
 *
 * La app funciona sin servidor (abriendo index.html directamente). Si además se
 * sirve por HTTP, carga `referencia.json` (generado por exportar_referencia.py)
 * para mostrar la comparación "Web vs Python". Si no, usa la copia embebida.
 */
(function () {
  "use strict";

  const T = window.Trafico;
  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------------------
  // Valores de referencia del modelo Python (respaldo si no se puede usar fetch)
  // Provienen de resultados/comparacion_planes.csv y resultados/barrido_ciclo.csv
  // ---------------------------------------------------------------------------
  let REF = {
    Y: 0.7222,
    ciclo_optimo_webster: 61.2,
    planes: {
      actual: { plan: "Actual (C=90, igual)", ciclo: 90, reparto: "igual", demora: 26.04, p90: 51.32, colaMedia: 18.17, colaMax: 69.7, servidos: 1882.3, nivel: "C" },
      optimizado: { plan: "Optimizado (C=65, óptimo)", ciclo: 65, reparto: "optimo", demora: 18.61, p90: 36.65, colaMedia: 12.98, colaMax: 57.4, servidos: 1882.3, nivel: "B" },
      webster: { plan: "Webster (C óptimo)", ciclo: 61.2, reparto: "optimo", demora: 18.25, p90: 35.48, colaMedia: 12.73, colaMax: 56.33, servidos: 1882.3, nivel: "B" },
    },
    barrido_ciclo: [
      { ciclo: 30, demora: 21.92 }, { ciclo: 35, demora: 21.92 }, { ciclo: 40, demora: 17.6 },
      { ciclo: 45, demora: 18.19 }, { ciclo: 50, demora: 17.36 }, { ciclo: 55, demora: 18.18 },
      { ciclo: 60, demora: 18.95 }, { ciclo: 65, demora: 18.05 }, { ciclo: 70, demora: 18.88 },
      { ciclo: 75, demora: 19.37 }, { ciclo: 80, demora: 20.09 }, { ciclo: 85, demora: 21.06 },
      { ciclo: 90, demora: 21.84 }, { ciclo: 95, demora: 22.82 }, { ciclo: 100, demora: 23.52 },
      { ciclo: 105, demora: 24.73 }, { ciclo: 110, demora: 25.12 }, { ciclo: 115, demora: 26.15 },
      { ciclo: 120, demora: 27.01 }, { ciclo: 125, demora: 28.05 }, { ciclo: 130, demora: 28.7 },
      { ciclo: 135, demora: 29.58 }, { ciclo: 140, demora: 30.29 }, { ciclo: 145, demora: 31.56 },
      { ciclo: 150, demora: 32.09 },
    ],
  };

  const REPLICAS_WEB = 40; // réplicas para las cifras "Web" (estables)

  let sim = new T.Simulacion();
  let corriendo = true;
  let historial = [];
  let ultimoRegistro = -1;
  let curvaWeb = null;

  // ------------------------------------------------------------ leer IU
  function leerUI() {
    sim.op.accesos[0].flujo = +$("flowN").value;
    sim.op.accesos[1].flujo = +$("flowS").value;
    sim.op.accesos[2].flujo = +$("flowE").value;
    sim.op.accesos[3].flujo = +$("flowO").value;
    sim.op.ciclo = +$("ciclo").value;
    sim.op.perdidaPorFase = +$("perdida").value;
    sim.op.carriles = +$("carriles").value;
    sim.op.reparto = $("reparto").value;
    sim.op.splitA = +$("split").value;
    sim.sincronizar();
    actualizarEtiquetas();
    actualizarPanel();
  }

  function actualizarEtiquetas() {
    $("valN").textContent = $("flowN").value;
    $("valS").textContent = $("flowS").value;
    $("valE").textContent = $("flowE").value;
    $("valO").textContent = $("flowO").value;
    const total = +$("flowN").value + +$("flowS").value + +$("flowE").value + +$("flowO").value;
    $("valTotal").textContent = total;
    $("valCiclo").textContent = $("ciclo").value;
    $("valPerdida").textContent = $("perdida").value;
    $("valCarriles").textContent = $("carriles").value;
    const v = sim.verdes();
    $("valSplit").textContent = ((v.A / (v.A + v.B)) * 100).toFixed(0);
    $("valVerdeA").textContent = v.A.toFixed(1);
    $("valVerdeB").textContent = v.B.toFixed(1);
    const y = sim.Y();
    $("valY").textContent = y.toFixed(3) + (y >= 1 ? "  ⚠ SOBRESATURADO" : "");
    $("valY").style.color = y >= 1 ? "#ff6b6b" : "#9be29b";
  }

  function sincronizarSliderSplit() {
    const v = sim.verdes();
    $("split").value = Math.round((v.A / (v.A + v.B)) * 100);
  }

  // ------------------------------------------------------------ panel
  function setBadge(el, nivel) {
    el.textContent = nivel;
    el.style.background = T.COLOR_LOS[nivel] || "#555";
  }

  function actualizarPanel() {
    const m = sim.metricas();
    $("mDemora").textContent = m.demoraMedia.toFixed(1) + " s";
    $("mP90").textContent = m.demoraP90.toFixed(1) + " s";
    $("mCola").textContent = m.colaActual + " veh  (máx " + m.colaMax + ")";
    $("mServidos").textContent = m.servidos;
    setBadge($("mLos"), m.nivel);
    $("mLittle").textContent = m.colaMedia.toFixed(1) + " veh";

    const tb = $("tablaAccesos").querySelector("tbody");
    tb.innerHTML = "";
    for (const a of m.porAcceso) {
      const tr = document.createElement("tr");
      const xTxt = isFinite(a.x) ? a.x.toFixed(2) : "∞";
      tr.innerHTML =
        '<td style="text-align:left"><span class="dot" style="background:' +
        (T.COLOR_ACCESO[a.nombre] || "#888") +
        '"></span>' + a.nombre + "</td><td>" + a.flujo + "</td><td>" + a.cola +
        "</td><td>" + a.colaMax + "</td><td>" + xTxt + "</td><td>" + a.servidos + "</td>";
      tb.appendChild(tr);
    }
  }

  // ------------------------------------------------------------ gráficos
  function dibujarChartCola() {
    const c = $("chartCola");
    const g = c.getContext("2d");
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = "#141a22";
    g.fillRect(0, 0, W, H);
    if (historial.length < 2) {
      g.fillStyle = "#9aa4b2";
      g.font = "12px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText("Acumulando datos…", W / 2, H / 2);
      return;
    }
    const t0 = historial[0].t;
    const t1 = Math.max(historial[historial.length - 1].t, t0 + 1);
    let maxCola = 5;
    for (const h of historial) maxCola = Math.max(maxCola, h.cola);

    g.strokeStyle = "rgba(255,255,255,0.15)";
    g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * (H - 18) + 9;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }

    g.strokeStyle = "#4c9be8";
    g.lineWidth = 2;
    g.beginPath();
    historial.forEach((h, i) => {
      const x = ((h.t - t0) / (t1 - t0)) * W;
      const y = H - 9 - (h.cola / maxCola) * (H - 18);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();

    g.fillStyle = "#9aa4b2";
    g.font = "11px system-ui, sans-serif";
    g.textAlign = "left";
    g.fillText("cola total = " + historial[historial.length - 1].cola + " veh", 6, 14);
    g.textAlign = "right";
    g.fillText("máx " + maxCola, W - 6, 14);
  }

  function dibujarChartU(webDatos) {
    const c = $("chartU");
    const g = c.getContext("2d");
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = "#141a22";
    g.fillRect(0, 0, W, H);

    const py = (REF.barrido_ciclo || []).filter((d) => d.ciclo <= 120);
    if (!webDatos && py.length < 2) {
      g.fillStyle = "#9aa4b2";
      g.font = "12px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText("Pulsa «Curva demora vs ciclo»", W / 2, H / 2);
      return;
    }

    const seriePy = py.length >= 2 ? py : null;
    const xs = [];
    const ys = [];
    if (seriePy) seriePy.forEach((d) => { xs.push(d.ciclo); ys.push(d.demora); });
    if (webDatos) webDatos.forEach((d) => { xs.push(d.ciclo); ys.push(d.demora); });
    const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    const y0 = Math.min.apply(null, ys) * 0.9, y1 = Math.max.apply(null, ys) * 1.05;
    const px = (cy) => ((cy - x0) / (x1 - x0 || 1)) * (W - 24) + 12;
    const py_ = (d) => H - 10 - ((d - y0) / (y1 - y0 || 1)) * (H - 26);

    g.strokeStyle = "rgba(255,255,255,0.15)";
    g.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = 10 + (i / 3) * (H - 26);
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }

    function trazar(serie, color, ancho) {
      g.strokeStyle = color;
      g.lineWidth = ancho;
      g.beginPath();
      serie.forEach((d, i) => {
        const X = px(d.ciclo), Y = py_(d.demora);
        if (i === 0) g.moveTo(X, Y);
        else g.lineTo(X, Y);
      });
      g.stroke();
    }

    if (seriePy) trazar(seriePy, "#4c9be8", 2);
    if (webDatos) trazar(webDatos, "#f2a33c", 2);

    // mínimo de la serie disponible (preferimos la de Python si existe)
    const ref = seriePy || webDatos;
    let mejor = ref[0];
    for (const d of ref) if (d.demora < mejor.demora) mejor = d;
    g.fillStyle = "#3ddc63";
    g.beginPath(); g.arc(px(mejor.ciclo), py_(mejor.demora), 5, 0, Math.PI * 2); g.fill();

    g.font = "11px system-ui, sans-serif";
    g.textAlign = "left";
    g.fillStyle = "#4c9be8";
    g.fillText("■ Python (SimPy)", 6, 14);
    if (webDatos) {
      g.fillStyle = "#f2a33c";
      g.fillText("■ Web (JS)", 118, 14);
    }
    g.fillStyle = "#3ddc63";
    g.textAlign = "right";
    g.fillText("óptimo ≈ " + mejor.ciclo + " s → " + mejor.demora.toFixed(1) + " s", W - 6, 14);
  }

  // ------------------------------------------------------------ bucle
  let ultimo = 0;
  let ultimoPanel = 0;
  function loop(ahora) {
    if (!ultimo) ultimo = ahora;
    const dtReal = Math.min(0.05, (ahora - ultimo) / 1000);
    ultimo = ahora;

    if (corriendo) {
      const vel = +$("velocidad").value;
      sim.avanzar(dtReal * vel);
      if (sim.t - ultimoRegistro >= 0.5) {
        historial.push({ t: sim.t, cola: sim.accesos.reduce((s, a) => s + a.cola.length, 0) });
        if (historial.length > 300) historial.shift();
        ultimoRegistro = sim.t;
      }
    }

    T.dibujar($("canvas").getContext("2d"), sim);

    // El panel y los gráficos se refrescan ~5 veces/s (el canvas, cada fotograma).
    if (ahora - ultimoPanel >= 200) {
      ultimoPanel = ahora;
      actualizarPanel();
      dibujarChartCola();
    }

    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ acciones
  function reset() {
    sim.reiniciar();
    historial = [];
    ultimoRegistro = -1;
    actualizarEtiquetas();
    actualizarPanel();
  }

  function setPlan(accion) {
    const ci = $("ciclo"), re = $("reparto");
    if (accion === "actual") {
      ci.value = 90; re.value = "igual";
    } else if (accion === "optimizado") {
      ci.value = 65; re.value = "optimo";
    } else if (accion === "webster") {
      const C = Math.round(sim.cicloOptimoWebster());
      if (!isFinite(C) || C <= 0) {
        alert("Webster no tiene solución: la intersección está saturada (Y ≥ 1).");
        return;
      }
      ci.value = Math.min(120, Math.max(40, Math.round(C / 5) * 5));
      re.value = "optimo";
    }
    leerUI();
    sincronizarSliderSplit();
  }

  function preset(nivel) {
    const v =
      nivel === "pico" ? { N: 750, S: 700, E: 550, O: 500 }
      : nivel === "fluido" ? { N: 400, S: 380, E: 300, O: 260 }
      : { N: 900, S: 850, E: 700, O: 650 };
    $("flowN").value = v.N; $("flowS").value = v.S; $("flowE").value = v.E; $("flowO").value = v.O;
    leerUI();
  }

  function opcionesBatch(ciclo, reparto) {
    return Object.assign({}, T.OPC_DEF, {
      accesos: T.OPC_DEF.accesos.map((a) => ({ ...a })),
      ciclo: ciclo,
      reparto: reparto,
      carriles: sim.op.carriles,
      perdidaPorFase: sim.op.perdidaPorFase,
      paso: 0.1,
    });
  }

  function correrComparacion() {
    const btn = $("btnCalcular");
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Calculando… (" + REPLICAS_WEB + " réplicas × 3 planes)";
    setTimeout(() => {
      const planes = [
        { clave: "actual", ciclo: REF.planes.actual.ciclo, reparto: REF.planes.actual.reparto },
        { clave: "optimizado", ciclo: REF.planes.optimizado.ciclo, reparto: REF.planes.optimizado.reparto },
        { clave: "webster", ciclo: REF.planes.webster.ciclo, reparto: REF.planes.webster.reparto },
      ];
      const tb = $("tablaComparacion").querySelector("tbody");
      tb.innerHTML = "";
      for (const p of planes) {
        const web = T.correrReplicas(opcionesBatch(p.ciclo, p.reparto), REPLICAS_WEB);
        const py = REF.planes[p.clave];
        const dif = web.demoraMedia - py.demora;
        const tr = document.createElement("tr");
        const badge = (n) => '<b style="background:' + (T.COLOR_LOS[n] || "#555") + ';color:#fff;padding:1px 7px;border-radius:6px">' + n + "</b>";
        tr.innerHTML =
          '<td style="text-align:left">' + py.plan + "</td>" +
          "<td>" + web.demoraMedia.toFixed(1) + "</td>" +
          "<td>" + py.demora.toFixed(1) + "</td>" +
          "<td>" + (dif >= 0 ? "+" : "") + dif.toFixed(1) + "</td>" +
          "<td>" + badge(web.nivel) + "</td>" +
          "<td>" + badge(py.nivel) + "</td>";
        tb.appendChild(tr);
      }
      $("notaComparacion").textContent =
        "Web: motor JS (" + REPLICAS_WEB + " réplicas). Python: src/modelo.py (" +
        (REF.replicas_planes || 30) + " réplicas, resultados/). Coinciden dentro de ±2 s.";
      btn.disabled = false;
      btn.textContent = original;
    }, 30);
  }

  function correrCurvaU() {
    const btn = $("btnCurva");
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Calculando…";
    setTimeout(() => {
      const datos = [];
      for (let C = 30; C <= 120; C += 10) {
        const r = T.correrReplicas(opcionesBatch(C, "optimo"), 4);
        datos.push({ ciclo: C, demora: r.demoraMedia });
      }
      curvaWeb = datos;
      dibujarChartU(curvaWeb);
      btn.disabled = false;
      btn.textContent = original;
    }, 30);
  }

  // ------------------------------------------------------------ init
  function cargarReferencia() {
    // Con servidor (python -m http.server) carga el JSON real; con file:// falla y
    // se usa la copia embebida. No es crítico.
    try {
      fetch("referencia.json")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && d.planes) {
            REF = d;
            $("replicaFuente").textContent =
              "Referencia Python: Y = " + d.Y + ", ciclo óptimo Webster = " + d.ciclo_optimo_webster + " s.";
            dibujarChartU(curvaWeb);
          }
        })
        .catch(() => {});
    } catch (e) {
      /* sin fetch disponible */
    }
  }

  function init() {
    $("flowN").value = sim.op.accesos[0].flujo;
    $("flowS").value = sim.op.accesos[1].flujo;
    $("flowE").value = sim.op.accesos[2].flujo;
    $("flowO").value = sim.op.accesos[3].flujo;
    $("ciclo").value = sim.op.ciclo;
    $("reparto").value = sim.op.reparto;
    leerUI();
    sincronizarSliderSplit();

    ["flowN", "flowS", "flowE", "flowO", "ciclo", "perdida", "carriles"].forEach((id) =>
      $(id).addEventListener("input", leerUI)
    );
    $("reparto").addEventListener("input", () => {
      leerUI();
      if ($("reparto").value !== "manual") sincronizarSliderSplit();
    });
    $("split").addEventListener("input", () => {
      $("reparto").value = "manual";
      leerUI();
    });
    $("btnPlay").addEventListener("click", () => {
      corriendo = !corriendo;
      $("btnPlay").textContent = corriendo ? "⏸ Pausar" : "▶ Reanudar";
    });
    $("btnReset").addEventListener("click", reset);
    $("planActual").addEventListener("click", () => setPlan("actual"));
    $("planOptimizado").addEventListener("click", () => setPlan("optimizado"));
    $("planWebster").addEventListener("click", () => setPlan("webster"));
    $("presetPico").addEventListener("click", () => preset("pico"));
    $("presetFluido").addEventListener("click", () => preset("fluido"));
    $("presetOver").addEventListener("click", () => preset("over"));
    $("btnCalcular").addEventListener("click", correrComparacion);
    $("btnCurva").addEventListener("click", correrCurvaU);

    document.addEventListener("keydown", (e) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        $("btnPlay").click();
      }
    });

    dibujarChartU(null);
    cargarReferencia();
    requestAnimationFrame(loop);
  }

  window.addEventListener("DOMContentLoaded", init);
})();
