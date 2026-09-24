#!/usr/bin/env bash
# Qanvas: installs everything and leaves it running (Linux, WSL, macOS with a remote NVIDIA Docker host).
# Safe to re-run: it resumes downloads, skips what is already done and restarts the services.
set -uo pipefail
cd "$(dirname "$0")"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$1"; exit 1; }
warn() { printf '   \033[33m%s\033[0m\n' "$1"; }

step 'Comprobando Docker'
docker info >/dev/null 2>&1 || fail 'Docker no está corriendo. Instálalo/ábrelo y vuelve a ejecutar el setup.'
docker compose version >/dev/null 2>&1 || fail 'Falta Docker Compose v2.'

step 'Comprobando la GPU NVIDIA dentro de Docker'
gpus=$(docker run --rm --gpus all ubuntu:24.04 nvidia-smi -L 2>/dev/null | grep -E '^GPU [0-9]+') \
  || fail 'Docker no ve ninguna GPU NVIDIA. Instala el driver y nvidia-container-toolkit (Linux) o usa Docker Desktop con WSL2.'
echo "$gpus" | sed 's/^/   /'

if [ ! -f .env ]; then
  cp .env.example .env
  echo '   Creado .env con la configuración por defecto (1 GPU).'
fi
if [ "$(echo "$gpus" | wc -l)" -ge 2 ] && ! grep -qE '^LLM_GPU=[1-9]' .env; then
  warn 'Tienes más de una GPU: pon LLM_GPU=1 en .env para dedicar la segunda al mejorador de prompts.'
fi

step 'Descargando modelos (~21 GB la primera vez; si se corta, vuelve a correr el setup y continúa)'
docker compose --profile setup run --rm models || fail 'No se pudieron descargar todos los modelos. Revisa tu conexión y vuelve a ejecutar el setup.'

step 'Construyendo las imágenes'
docker compose build || fail 'Falló la construcción de las imágenes.'

step 'Iniciando los servicios'
docker compose up -d || fail 'No se pudieron iniciar los servicios.'

port=$(grep -E '^APP_PORT=' .env | cut -d= -f2)
url="http://localhost:${port:-3000}"

step 'Esperando a que los modelos terminen de precargarse (puede tardar unos minutos)'
for _ in $(seq 1 240); do
  if curl -fsS --max-time 5 "$url/api/health" 2>/dev/null | grep -q '"warm":{"comfy":true'; then
    printf '\n\033[1;32mQanvas está listo en %s\033[0m\n' "$url"
    exit 0
  fi
  sleep 5
done
fail 'Los servicios no quedaron listos a tiempo. Revisa: docker compose logs -f'
