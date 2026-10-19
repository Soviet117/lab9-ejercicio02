#!/usr/bin/env bash
#
# Arranca un servidor local para la demo interactiva del Ejercicio 2.
# Uso:  ./abrir.sh [puerto]      (por defecto 8000)
#
set -euo pipefail
cd "$(dirname "$0")"

PUERTO="${1:-8000}"

echo "──────────────────────────────────────────────────────────"
echo " Demo interactiva — Ejercicio 2 (intersección)"
echo " Abre en el navegador:  http://localhost:${PUERTO}/"
echo " Detener: Ctrl+C"
echo "──────────────────────────────────────────────────────────"

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "${PUERTO}"
elif command -v python >/dev/null 2>&1; then
  exec python -m http.server "${PUERTO}"
else
  echo "⚠️  No se encontró Python. Abre 'index.html' directamente en el navegador." >&2
  exit 1
fi
