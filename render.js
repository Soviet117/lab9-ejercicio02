/*
 * Ejercicio 2 — Dibujo de la intersección en <canvas> (vista cenital).
 */
(function () {
  "use strict";

  const T = (window.Trafico = window.Trafico || {});

  const W = 1120;
  const H = 820;
  const CX = 560;
  const CY = 410;
  const CORE = 95; // media altura/ancho del cruce
  const LANEW = 26; // ancho de un carril (px)
  const CAR_L = 16; // largo del auto
  const CAR_W = 12; // ancho del auto

  T.geom = { W, H, CX, CY, CORE, LANEW, CAR_L, CAR_W };

  function offsetLane(lane, carriles) {
    return (lane - (carriles - 1) / 2) * LANEW;
  }

  // s < 0 : en cola (detrás de la línea de parada); s >= 0 : cruzando
  function posicion(nombre, s, lane, carriles) {
    const off = offsetLane(lane, carriles);
    switch (nombre) {
      case "Norte":
        return { x: CX + off, y: CY - CORE + s, vertical: true };
      case "Sur":
        return { x: CX + off, y: CY + CORE - s, vertical: true };
      case "Este":
        return { x: CX + CORE - s, y: CY + off, vertical: false };
      default: // Oeste
        return { x: CX - CORE + s, y: CY + off, vertical: false };
    }
  }
  T.posicion = posicion;

  function luzColor(estado) {
    if (estado === "verde") return "#3ddc63";
    if (estado === "ambar") return "#ffcc33";
    return "#ff4136";
  }

  function dibujarAuto(ctx, p, color, resaltado) {
    const w = p.vertical ? CAR_W : CAR_L;
    const h = p.vertical ? CAR_L : CAR_W;
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 1.5;
    const x = p.x - w / 2;
    const y = p.y - h / 2;
    const r = 3;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (resaltado) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  T.dibujar = function (ctx, sim) {
    const carriles = sim.op.carriles;
    const band = carriles * LANEW;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#1b1f26";
    ctx.fillRect(0, 0, W, H);

    // --- calles ---
    ctx.fillStyle = "#3a4048";
    ctx.fillRect(CX - band / 2, 0, band, H); // corredor N-S
    ctx.fillRect(0, CY - band / 2, W, band); // corredor E-O

    // líneas de carril (discontinuas)
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([12, 12]);
    for (let i = 1; i < carriles; i++) {
      const off = -band / 2 + i * LANEW;
      ctx.beginPath();
      ctx.moveTo(CX + off, 0);
      ctx.lineTo(CX + off, CY - CORE);
      ctx.moveTo(CX + off, CY + CORE);
      ctx.lineTo(CX + off, H);
      ctx.moveTo(0, CY + off);
      ctx.lineTo(CX - CORE, CY + off);
      ctx.moveTo(CX + CORE, CY + off);
      ctx.lineTo(W, CY + off);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // --- cruce central ---
    ctx.fillStyle = "#2b3038";
    ctx.fillRect(CX - CORE, CY - CORE, 2 * CORE, 2 * CORE);

    // --- líneas de parada ---
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(CX - band / 2, CY - CORE);
    ctx.lineTo(CX + band / 2, CY - CORE);
    ctx.moveTo(CX - band / 2, CY + CORE);
    ctx.lineTo(CX + band / 2, CY + CORE);
    ctx.moveTo(CX - CORE, CY - band / 2);
    ctx.lineTo(CX - CORE, CY + band / 2);
    ctx.moveTo(CX + CORE, CY - band / 2);
    ctx.lineTo(CX + CORE, CY + band / 2);
    ctx.stroke();

    // --- etiquetas de acceso ---
    ctx.fillStyle = "#9aa4b2";
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("NORTE", CX, 16);
    ctx.fillText("SUR", CX, H - 16);
    ctx.save();
    ctx.translate(24, CY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("OESTE", 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(W - 24, CY);
    ctx.rotate(Math.PI / 2);
    ctx.fillText("ESTE", 0, 0);
    ctx.restore();

    // --- autos ---
    for (const a of sim.accesos) {
      const color = T.COLOR_ACCESO[a.nombre] || "#888";
      const largoDisponible = a.nombre === "Norte" || a.nombre === "Sur" ? CY - CORE : CX - CORE;
      const filas = Math.max(1, Math.floor((largoDisponible - 18) / T.SPACING));
      const maxVisible = filas * carriles;

      const visibles = Math.min(a.cola.length, maxVisible);
      for (let i = 0; i < visibles; i++) {
        const v = a.cola[i];
        const p = posicion(a.nombre, -v.dist, v.lane, carriles);
        dibujarAuto(ctx, p, color, false);
      }
      // autos cruzando
      for (const v of a.cruzando) {
        const p = posicion(a.nombre, v.s, v.lane, carriles);
        dibujarAuto(ctx, p, color, true);
      }
      // aviso de cola que no cabe en pantalla: insignia en la entrada de la calzada
      if (a.cola.length > maxVisible) {
        const txt = "+" + (a.cola.length - maxVisible);
        let bx, by;
        if (a.nombre === "Norte") { bx = CX + band / 2 + 20; by = 40; }
        else if (a.nombre === "Sur") { bx = CX - band / 2 - 20; by = H - 40; }
        else if (a.nombre === "Este") { bx = W - 46; by = CY - band / 2 - 20; }
        else { bx = 46; by = CY + band / 2 + 20; }
        ctx.font = "bold 12px system-ui, sans-serif";
        const ancho = (ctx.measureText ? ctx.measureText(txt).width : txt.length * 7) + 16;
        ctx.fillStyle = "rgba(150,25,25,0.92)";
        ctx.fillRect(bx - ancho / 2, by - 11, ancho, 22);
        ctx.strokeStyle = "#ff8a8a";
        ctx.lineWidth = 1;
        ctx.strokeRect(bx - ancho / 2, by - 11, ancho, 22);
        ctx.fillStyle = "#ffe3e3";
        ctx.fillText(txt, bx, by + 0.5);
      }
    }

    // --- semáforos ---
    const luces = [
      { fase: "A", x: CX - band / 2 - 16, y: CY - CORE + 6, txt: "N-S" },
      { fase: "B", x: CX + band / 2 + 16, y: CY + CORE - 6, txt: "E-O" },
      { fase: "B", x: CX + CORE - 6, y: CY - band / 2 - 16, txt: "" },
      { fase: "A", x: CX - CORE + 6, y: CY + band / 2 + 16, txt: "" },
    ];
    for (const L of luces) {
      const estado = sim.luz(L.fase);
      ctx.beginPath();
      ctx.arc(L.x, L.y, 11, 0, Math.PI * 2);
      ctx.fillStyle = luzColor(estado);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#0b0e12";
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.fillText(L.txt, L.x, L.y + 0.5);
    }

    // --- banner de fase (en la esquina, para no tapar el cruce) ---
    let titulo;
    if (sim.enVerde) titulo = "FASE " + sim.faseActual + (sim.faseActual === "A" ? "  (N–S)" : "  (E–O)") + "  ·  VERDE";
    else titulo = "TIEMPO PERDIDO (amarillo / todo rojo)";
    const bw = 350, bh = 34, bx = 16, by = 52;
    ctx.fillStyle = sim.enVerde ? "rgba(20,60,30,0.9)" : "rgba(70,50,10,0.9)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = sim.enVerde ? "#3ddc63" : "#ffcc33";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = "#eef3f8";
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.fillText(titulo + "   (" + sim.restanteFase().toFixed(1) + " s)", bx + bw / 2, by + bh / 2 + 0.5);
  };
})();
