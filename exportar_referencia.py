"""
Ejercicio 2 — Exporta los valores de referencia del modelo Python (SimPy) a JSON.

El objetivo es que la app web (HTML+JS) pueda mostrar una comparación honesta
"Web vs Python": el motor JavaScript (`web/modelo.js`) es un puerto del modelo
Python (`../src/modelo.py`), y aquí volcamos los resultados ya validados que
genera `../src/experimentos.py` (carpeta `resultados/`).

Uso (desde esta carpeta):
    ../../.venv/bin/python exportar_referencia.py

Salida:
    referencia.json

Si los CSV de `resultados/` no existen, se recalculan los planes con el modelo
Python (30 réplicas) para no dejar la referencia vacía.
"""

from __future__ import annotations

import csv
import json
import os
import sys

DIR_WEB = os.path.dirname(os.path.abspath(__file__))
DIR_EX2 = os.path.dirname(DIR_WEB)
DIR_RES = os.path.join(DIR_EX2, "resultados")
DIR_SRC = os.path.join(DIR_EX2, "src")
sys.path.insert(0, DIR_SRC)

# Prefijos de la columna "plan" en comparacion_planes.csv -> clave interna
CLAVES_PLAN = (("Actual", "actual"), ("Optimizado", "optimizado"), ("Webster", "webster"))

FLUJOS_BASE = [("Norte", 750.0, "A"), ("Sur", 700.0, "A"), ("Este", 550.0, "B"), ("Oeste", 500.0, "B")]


def _leer_csv(nombre: str):
    """Lee un CSV de resultados/ como lista de diccionarios (o None)."""
    ruta = os.path.join(DIR_RES, nombre)
    if not os.path.exists(ruta):
        return None
    with open(ruta, encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def _planes_desde_csv():
    filas = _leer_csv("comparacion_planes.csv")
    if not filas:
        return None
    planes = {}
    for fila in filas:
        for prefijo, clave in CLAVES_PLAN:
            if fila["plan"].startswith(prefijo):
                planes[clave] = {
                    "plan": fila["plan"],
                    "ciclo": round(float(fila["ciclo"]), 1),
                    "reparto": fila["reparto"],
                    "demora": round(float(fila["demora_media"]), 2),
                    "p90": round(float(fila["demora_p90"]), 2),
                    "colaMedia": round(float(fila["cola_media"]), 2),
                    "colaMax": round(float(fila["cola_max"]), 2),
                    "servidos": round(float(fila["vehiculos_atendidos"]), 1),
                    "nivel": fila["nivel_servicio"],
                }
    return planes or None


def _planes_calculados():
    """Recalcula los planes con el modelo Python si no hay CSV (30 réplicas)."""
    from modelo import Acceso, Parametros, ciclo_optimo_webster, simular_replicas

    def resumen(nombre, ciclo, reparto):
        p = Parametros(accesos=[Acceso(n, q, f) for n, q, f in FLUJOS_BASE], ciclo=ciclo, reparto=reparto)
        df = simular_replicas(p, replicas=30, seed_base=99)
        return {
            "plan": nombre,
            "ciclo": round(ciclo, 1),
            "reparto": reparto,
            "demora": round(float(df["demora_media"].mean()), 2),
            "p90": round(float(df["demora_p90"].mean()), 2),
            "colaMedia": round(float(df["cola_media"].mean()), 2),
            "colaMax": round(float(df["cola_max"].mean()), 2),
            "servidos": round(float(df["vehiculos_atendidos"].mean()), 1),
            "nivel": str(df["nivel_servicio"].mode()[0]),
        }

    p90 = Parametros(accesos=[Acceso(n, q, f) for n, q, f in FLUJOS_BASE], ciclo=90, reparto="igual")
    c_web = min(ciclo_optimo_webster(p90), 150.0)
    return {
        "actual": resumen("Actual (C=90, igual)", 90, "igual"),
        "optimizado": resumen("Optimizado (C=65, óptimo)", 65, "optimo"),
        "webster": resumen("Webster (C óptimo)", c_web, "optimo"),
    }


def construir() -> dict:
    from modelo import Acceso, Parametros, ciclo_optimo_webster

    p90 = Parametros(accesos=[Acceso(n, q, f) for n, q, f in FLUJOS_BASE], ciclo=90, reparto="igual")

    planes = _planes_desde_csv() or _planes_calculados()

    # Barrido demora vs ciclo (para superponer la curva de Python en el gráfico)
    barrido = []
    filas = _leer_csv("barrido_ciclo.csv")
    if filas:
        for fila in filas:
            barrido.append(
                {
                    "ciclo": round(float(fila["ciclo"]), 1),
                    "demora": round(float(fila["demora_media"]), 2),
                    "webster": round(float(fila["demora_webster"]), 2),
                }
            )

    return {
        "fuente": "modelo Python/SimPy (src/modelo.py) + resultados/ de src/experimentos.py",
        "generado_por": "web/exportar_referencia.py",
        "replicas_planes": 30,
        "semilla_base_planes": 99,
        "replicas_barrido": 25,
        "semilla_base_barrido": 7,
        "Y": round(p90.Y, 4),
        "ciclo_optimo_webster": round(ciclo_optimo_webster(p90), 1),
        "planes": planes,
        "barrido_ciclo": barrido,
    }


def main() -> None:
    datos = construir()
    ruta = os.path.join(DIR_WEB, "referencia.json")
    with open(ruta, "w", encoding="utf-8") as fh:
        json.dump(datos, fh, ensure_ascii=False, indent=2)

    print("✅ Referencia exportada a:", ruta)
    print("   Y = %s   |   ciclo óptimo Webster = %s s" % (datos["Y"], datos["ciclo_optimo_webster"]))
    for clave, plan in datos["planes"].items():
        print(
            "   %-11s C=%-5s %-6s  demora=%5.2f s  LOS %s"
            % (clave, plan["ciclo"], plan["reparto"], plan["demora"], plan["nivel"])
        )
    print("   puntos del barrido:", len(datos["barrido_ciclo"]))


if __name__ == "__main__":
    main()
