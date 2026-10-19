/*
 * Ejercicio 2 — Motor de simulación de la intersección (versión navegador).
 *
 * Es un PUERTO FIEL de src/modelo.py:
 *   - 4 accesos (N, S, E, O) con llegadas Poisson.
 *   - Semáforo de 2 fases: A = {N, S}, B = {E, O}.
 *   - Verde efectivo por fase + tiempo perdido (amarillo + arranque).
 *   - Descarga a flujo de saturación (1800 veh/h) durante el verde.
 *   - Métricas: demora media, P90, cola, X = v/c y nivel de servicio (HCM).
 *   - Fórmula de Webster (ciclo óptimo) para validar/optimizar.
 *
 * Se usa en dos modos:
 *   (1) tiempo real (para animar), y
 *   (2) "batch" (20 réplicas headless) para cifras estables comparables a Python.
 */
(function () {
  "use strict";

  const T = (window.Trafico = window.Trafico || {});

  // ------------------------------------------------------------------ utils
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function percentil(ordenados, q) {
    const n = ordenados.length;
    if (n === 0) return 0;
    const k = (n - 1) * q;
    const f = Math.floor(k),
      c = Math.ceil(k);
    return f === c ? ordenados[k] : ordenados[f] * (c - k) + ordenados[c] * (k - f);
  }

  T.nivelServicio = function (d) {
    if (d <= 10) return "A";
    if (d <= 20) return "B";
    if (d <= 35) return "C";
    if (d <= 55) return "D";
    if (d <= 80) return "E";
    return "F";
  };

  T.COLOR_LOS = { A: "#1a9850", B: "#66bd63", C: "#fdae61", D: "#f46d43", E: "#d73027", F: "#a50026" };

  T.COLOR_ACCESO = { Norte: "#4c9be8", Sur: "#f2a33c", Este: "#5cc46a", Oeste: "#b07fd6" };

  // -------------------------------------------------------------- constantes
  const SPACING = 18; // separación entre autos encolados (px)
  const CREEP = 70; // velocidad de avance de la cola (px/s)
  const CRUZ = 260; // velocidad al cruzar la intersección (px/s)
  const S_MAX = 320; // recorrido máximo al cruzar (px)
  // Tolerancia numérica: el tiempo se acumula sumando pasos (this.t += h), lo que
  // arrastra un error de punto flotante. Sin esta cota, una descarga programada en
  // la rejilla exacta (p. ej. t=452.0) se retrasaba a 452.2, perdiendo capacidad.
  const EPS = 1e-6;

  const ACCESOS_DEF = [
    { nombre: "Norte", flujo: 750, fase: "A" },
    { nombre: "Sur", flujo: 700, fase: "A" },
    { nombre: "Este", flujo: 550, fase: "B" },
    { nombre: "Oeste", flujo: 500, fase: "B" },
  ];

  const OPC_DEF = {
    accesos: ACCESOS_DEF.map((a) => ({ ...a })),
    saturacion: 1800,
    perdidaPorFase: 4,
    ciclo: 90,
    reparto: "igual", // 'igual' | 'optimo' | 'manual'
    splitA: 50, // % del verde para la fase A cuando reparto === 'manual'
    carriles: 1,
    calentamiento: 0,
    horizonte: Infinity,
    seed: 20261019,
    paso: 0.05,
  };

  // ------------------------------------------------------------- Simulación
  function Simulacion(ops) {
    this.op = Object.assign({}, OPC_DEF, ops || {});
    this.op.accesos = this.op.accesos.map((a) => ({ ...a }));
    this.accesos = this.op.accesos.map((a) => ({
      nombre: a.nombre,
      flujo: a.flujo,
      fase: a.fase,
      cola: [],
      cruzando: [],
      demoras: [],
      servidos: 0,
      colaMax: 0,
      nextArrival: 0,
      nextDescarga: 0,
    }));
    this.reiniciar();
  }

  Simulacion.prototype.reiniciar = function () {
    this.t = 0;
    this.rng = mulberry32(this.op.seed >>> 0);
    for (const a of this.accesos) {
      a.cola = [];
      a.cruzando = [];
      a.demoras = [];
      a.servidos = 0;
      a.colaMax = 0;
      const lam = a.flujo / 3600;
      a.nextArrival = lam > 0 ? this._exp(lam) : Infinity;
      a.nextDescarga = 0;
    }
    this._construirSecuencia();
  };

  Simulacion.prototype._exp = function (lam) {
    return -Math.log(1 - this.rng()) / lam;
  };

  Simulacion.prototype._construirSecuencia = function () {
    const v = this.verdes();
    this.secuencia = [];
    for (const f of ["A", "B"]) {
      this.secuencia.push({ tipo: "verde", fase: f, dur: Math.max(0.01, v[f]) });
      this.secuencia.push({ tipo: "perdida", fase: null, dur: Math.max(0.01, this.op.perdidaPorFase) });
    }
    this.faseIdx = 0;
    this.tFase = 0;
    const e = this.secuencia[0];
    this.faseActual = e.fase;
    this.enVerde = true;
  };

  // --- plan semafórico -----------------------------------------------------
  Simulacion.prototype._flujoCritico = function (fase) {
    let m = 0;
    for (const a of this.accesos) if (a.fase === fase) m = Math.max(m, a.flujo);
    return m;
  };

  Simulacion.prototype._satEfectiva = function () {
    return this.op.saturacion * this.op.carriles;
  };

  Simulacion.prototype._razon = function (fase) {
    const s = this._satEfectiva();
    return s > 0 ? this._flujoCritico(fase) / s : 0;
  };

  Simulacion.prototype.Y = function () {
    return this._razon("A") + this._razon("B");
  };

  Simulacion.prototype.verdes = function () {
    const total = Math.max(1, this.op.ciclo - 2 * this.op.perdidaPorFase);
    if (this.op.reparto === "igual") return { A: total / 2, B: total / 2 };
    if (this.op.reparto === "manual") {
      const p = Math.min(0.95, Math.max(0.05, this.op.splitA / 100));
      return { A: total * p, B: total * (1 - p) };
    }
    const Y = this.Y();
    if (Y <= 0) return { A: total / 2, B: total / 2 };
    return { A: (total * this._razon("A")) / Y, B: (total * this._razon("B")) / Y };
  };

  Simulacion.prototype.capacidad = function (fase) {
    return (this._satEfectiva() * this.verdes()[fase]) / this.op.ciclo;
  };

  Simulacion.prototype.gradoSaturacion = function (a) {
    const cap = this.capacidad(a.fase);
    return cap > 0 ? a.flujo / cap : Infinity;
  };

  Simulacion.prototype.cicloOptimoWebster = function () {
    const Y = this.Y();
    if (Y >= 1) return Infinity;
    return (1.5 * 2 * this.op.perdidaPorFase + 5) / (1 - Y);
  };

  // --- estado del semáforo para el dibujo ----------------------------------
  Simulacion.prototype.luz = function (fase) {
    if (this.enVerde && this.faseActual === fase) return "verde";
    const n = this.secuencia.length;
    const prev = this.secuencia[(this.faseIdx - 1 + n) % n];
    if (!this.enVerde && prev && prev.tipo === "verde" && prev.fase === fase) return "ambar";
    return "rojo";
  };

  Simulacion.prototype.restanteFase = function () {
    return this.secuencia[this.faseIdx].dur - this.tFase;
  };

  // --- sincronización desde la interfaz ------------------------------------
  Simulacion.prototype.sincronizar = function () {
    this.accesos.forEach((a, i) => {
      a.flujo = this.op.accesos[i].flujo;
      a.fase = this.op.accesos[i].fase;
    });
    this._construirSecuencia();
  };

  // --- avance temporal -----------------------------------------------------
  Simulacion.prototype.avanzar = function (dt) {
    if (!(dt > 0)) return;
    let restante = dt;
    const paso = this.op.paso || 0.05;
    let guard = 0;
    while (restante > 1e-9 && guard++ < 200000) {
      const h = Math.min(paso, restante);
      this._paso(h);
      restante -= h;
    }
  };

  Simulacion.prototype._crear = function (a, tLlegada) {
    const carriles = Math.max(1, this.op.carriles);
    const fila = Math.floor(a.cola.length / carriles);
    const v = {
      llegada: tLlegada,
      dist: (fila + 2) * SPACING,
      lane: a.cola.length % carriles,
      s: 0,
    };
    a.cola.push(v);
  };

  Simulacion.prototype._paso = function (h) {
    this.t += h;

    // 1) controlador semafórico
    this.tFase += h;
    let guard = 0;
    while (this.tFase >= this.secuencia[this.faseIdx].dur - EPS && guard++ < 10000) {
      this.tFase -= this.secuencia[this.faseIdx].dur;
      this.faseIdx = (this.faseIdx + 1) % this.secuencia.length;
    }
    const e = this.secuencia[this.faseIdx];
    this.faseActual = e.tipo === "verde" ? e.fase : null;
    this.enVerde = e.tipo === "verde";

    // 2) llegadas + descargas + animación
    const headway = 3600 / this._satEfectiva();
    for (const a of this.accesos) {
      const lam = a.flujo / 3600;
      // Las llegadas se cortan en el horizonte (como en Python); luego solo drena.
      if (a.nextArrival <= this.t + EPS && this.t <= this.op.horizonte + EPS) {
        let g = 0;
        while (a.nextArrival <= this.t + EPS && a.nextArrival <= this.op.horizonte + EPS && g++ < 100000) {
          this._crear(a, a.nextArrival);
          if (lam > 0) a.nextArrival += this._exp(lam);
          else {
            a.nextArrival = Infinity;
            break;
          }
        }
      }

      if (this.enVerde && this.faseActual === a.fase && a.cola.length > 0 && this.t >= a.nextDescarga - EPS) {
        const v = a.cola.shift();
        v.s = 0;
        a.cruzando.push(v);
        a.demoras.push({ llegada: v.llegada, demora: this.t - v.llegada });
        a.servidos++;
        a.nextDescarga = this.t + headway;
      }

      // animación de la cola (avance suave hacia su posición; en varios carriles
      // los autos se acomodan lado a lado y no en diagonal)
      const carriles = Math.max(1, this.op.carriles);
      for (let i = 0; i < a.cola.length; i++) {
        const v = a.cola[i];
        const obj = Math.floor(i / carriles) * SPACING;
        if (v.dist > obj) v.dist = Math.max(obj, v.dist - CREEP * h);
        else v.dist = obj;
      }
      if (a.cola.length > a.colaMax) a.colaMax = a.cola.length;

      // autos que cruzan
      if (a.cruzando.length) {
        for (const v of a.cruzando) v.s += CRUZ * h;
        a.cruzando = a.cruzando.filter((v) => v.s < S_MAX);
      }
    }
  };

  // --- métricas ------------------------------------------------------------
  Simulacion.prototype.metricas = function () {
    const horizonte = isFinite(this.op.horizonte) ? this.op.horizonte : this.t;
    const ventana = horizonte - this.op.calentamiento;

    const demoras = [];
    for (const a of this.accesos) {
      for (const d of a.demoras) {
        if (d.llegada >= this.op.calentamiento && d.llegada <= horizonte) demoras.push(d.demora);
      }
      for (const v of a.cola) {
        if (v.llegada >= this.op.calentamiento && v.llegada <= horizonte) demoras.push(this.t - v.llegada);
      }
    }
    demoras.sort((x, y) => x - y);
    const N = demoras.length;
    const media = N ? demoras.reduce((s, x) => s + x, 0) / N : 0;

    const porAcceso = this.accesos.map((a) => ({
      nombre: a.nombre,
      fase: a.fase,
      flujo: a.flujo,
      cola: a.cola.length,
      colaMax: a.colaMax,
      servidos: a.servidos,
      x: this.gradoSaturacion(a),
    }));

    return {
      t: this.t,
      demoraMedia: media,
      demoraP90: percentil(demoras, 0.9),
      demoraMax: N ? demoras[N - 1] : 0,
      servidos: N,
      colaMedia: ventana > 0 ? (N / ventana) * media : 0,
      colaMax: this.accesos.reduce((s, a) => s + a.colaMax, 0),
      colaActual: this.accesos.reduce((s, a) => s + a.cola.length, 0),
      nivel: T.nivelServicio(media),
      Y: this.Y(),
      porAcceso,
    };
  };

  // --- modo batch (varias réplicas, como Python) ---------------------------
  T.correrReplicas = function (ops, replicas) {
    replicas = replicas || 20;
    const acum = [];
    for (let r = 0; r < replicas; r++) {
      const s = new Simulacion(
        Object.assign({}, ops, {
          seed: 1000 + r,
          calentamiento: 900,
          horizonte: 3600,
          paso: 0.1,
        })
      );
      s.avanzar(5400); // horizonte + drenaje
      acum.push(s.metricas());
    }
    const prom = (f) => acum.reduce((s, m) => s + f(m), 0) / acum.length;
    return {
      replicas,
      demoraMedia: prom((m) => m.demoraMedia),
      demoraP90: prom((m) => m.demoraP90),
      colaMax: prom((m) => m.colaMax),
      colaMedia: prom((m) => m.colaMedia),
      servidos: prom((m) => m.servidos),
      nivel: T.nivelServicio(prom((m) => m.demoraMedia)),
      Y: prom((m) => m.Y),
    };
  };

  T.Simulacion = Simulacion;
  T.OPC_DEF = OPC_DEF;
  T.SPACING = SPACING;
})();
