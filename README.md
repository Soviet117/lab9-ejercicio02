# 🖥️ Demo interactiva — Ejercicio 2 (intersección)

Aplicación web **HTML + JavaScript puro** (sin servidor ni dependencias) para
**ver** el modelo del Ejercicio 2 en acción: los autos circulan, el semáforo cicla
y las métricas se actualizan en vivo mientras mueves los controles.

> Es una **capa añadida**: no modifica el ejercicio Python (`src/modelo.py`, tests
> y `resultados/` siguen intactos). El motor `modelo.js` es un **puerto fiel** del
> modelo SimPy, validado contra él (ver más abajo).

## ▶️ Cómo abrirla

**Opción 1 — doble clic (lo más simple):** abre `index.html` en el navegador.

**Opción 2 — servidor local (recomendado):** así se carga `referencia.json` y la
comparación "Web vs Python" usa los datos reales exportados.

```bash
cd ejercicio-2-trafico-interseccion/web
python -m http.server 8000      # o: ../../.venv/bin/python -m http.server 8000
# abrir http://localhost:8000/
```

## 🎛️ Qué puedes hacer

- **Mover el flujo** de cada acceso (Norte/Sur/Este/Oeste) y ver el efecto al instante.
- Presets: **Fluido**, **Hora punta** y **Sobrecarga** (para mostrar el colapso).
- Cambiar el **ciclo**, el **reparto del verde** (igual / óptimo / manual) y el
  **tiempo perdido por fase**.
- Añadir **carriles por acceso** (1–3) para ver cómo crece la capacidad.
- **Planes de semáforo** con un botón: *Actual (90 s, 50/50)*, *Optimizado (65 s, 57/43)*
  y *Webster (ciclo óptimo automático)*.
- **Métricas en vivo**: demora media, P90, cola actual/máxima, vehículos servidos,
  cola media (Ley de Little), nivel de servicio (HCM) y tabla por acceso.
- **Gráfico de cola** en el tiempo y **curva demora vs ciclo** (Web vs Python).
- **Validación**: botón que corre 40 réplicas y compara con el modelo Python.

Atajos: **barra espaciadora** = pausar/reanudar.

## 📁 Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de la interfaz |
| `estilos.css` | Estilo (tema oscuro) |
| `modelo.js` | **Motor de simulación** (puerto de `../src/modelo.py`) |
| `render.js` | Dibujo de la intersección en `<canvas>` (vista cenital) |
| `app.js` | Controles, métricas, gráficos y validación |
| `referencia.json` | Resultados del modelo Python para comparar |
| `exportar_referencia.py` | Regenera `referencia.json` desde `resultados/` |
| `abrir.sh` | Arranca el servidor local y muestra la URL |

## 🔬 Fidelidad del motor (Web vs Python)

Ambos usan los mismos parámetros (4 accesos 750/700/550/500 veh/h, saturación
1800 veh/h, 4 s de tiempo perdido por fase). Con 40 réplicas en el navegador:

| Plan | Demora Web | Demora Python | Δ |
|---|---:|---:|---:|
| Actual (90 s, 50/50) | 26.8 s | 26.0 s | +0.8 s |
| Optimizado (65 s, 57/43) | 18.4 s | 18.6 s | −0.2 s |
| Webster (61 s) | 18.0 s | 18.3 s | −0.3 s |

> Coinciden dentro de **±1 s** (la diferencia es varianza Monte Carlo: ambos son
> simulaciones estocásticas). Con 200 réplicas la brecha baja a **<1 %**.
> El mínimo de la curva *demora vs ciclo* aparece en **C ≈ 50 s** en ambos.

Para regenerar la referencia tras volver a correr los experimentos de Python:

```bash
cd ejercicio-2-trafico-interseccion/web
../../.venv/bin/python exportar_referencia.py
```

## 🧠 Cómo funciona (breve)

- **Llegadas**: Poisson por acceso (`expovariate`).
- **Semáforo**: secuencia verde→tiempo perdido por fase; verde efectivo repartido
  igual, óptimo (proporcional al flujo crítico) o manual.
- **Descarga**: durante el verde, un vehículo cada `3600/saturación` s.
- **Métricas**: demora = salida − llegada; nivel de servicio por umbrales HCM.
- El motor avanza en pasos pequeños (`paso`) y se usa en dos modos: **animación**
  (tiempo real escalado) y **batch** (20–40 réplicas headless, calentamiento 900 s,
  horizonte 3600 s), igual que `simular_replicas` en Python.
