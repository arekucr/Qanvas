<p align="center">
  <img src="web/public/brand/qanvas-wordmark-384.webp" alt="Qanvas" height="96">
</p>

# Qanvas

Estudio local para generar y editar imágenes con IA sobre **Qwen-Image-2.1**: texto a imagen, editor con marcas y máscaras, stickers con fondo transparente, memes, fotos grupales, mejorador de prompts y ampliación 2×. Todo corre en tu PC con Docker: las imágenes y fotos no salen de tu equipo.

## Requisitos

| | Mínimo |
|---|---|
| GPU | NVIDIA con **12 GB de VRAM** (probado con RTX 3060) y driver reciente |
| RAM | 32 GB |
| Disco | ~45 GB libres (27 GB de modelos + imágenes de Docker) |
| Software | **Windows:** Docker Desktop con WSL2 · **Linux:** Docker + Compose v2 + [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) |

## Instalación (un comando)

```bash
git clone <url-del-repo> qanvas && cd qanvas
```

- **Windows:** doble clic en `setup.cmd` (o ejecútalo en una terminal).
- **Linux / WSL:** `./setup.sh`

El setup comprueba Docker y la GPU, crea `.env`, descarga los modelos (~27 GB, se puede cortar y reanudar), construye las imágenes, arranca todo y espera a que los modelos queden precargados. Al terminar abre **http://localhost:3000**.

Se puede volver a correr cuando quieras: salta lo que ya está hecho.

### Windows: memoria de WSL2

Docker Desktop usa por defecto la mitad de la RAM. Con 32 GB conviene fijarla en 20 GB para que los modelos quepan y Windows siga fluido. Crea `%USERPROFILE%\.wslconfig`:

```ini
[wsl2]
memory=20GB
```

y reinicia Docker Desktop (o ejecuta `wsl --shutdown`).

## Configuración (`.env`)

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `COMFY_GPU` | `0` | GPU que genera las imágenes |
| `LLM_GPU` | `0` | GPU del mejorador de prompts. Si es la misma que `COMFY_GPU`, se turnan la tarjeta |
| `APP_PORT` | `3000` | Puerto de la web |
| `RETENTION_HOURS` | `24` | Horas que se guardan las imágenes antes de borrarse solas |
| `COMFY_ARGS` | `--disable-pinned-memory` | Argumentos de ComfyUI (con 64 GB de RAM puedes quitarlo) |

Después de cambiar `.env`: `docker compose up -d`.

### Con dos GPUs

Por defecto todo usa una sola GPU: al pulsar «Mejorar prompt», Qanvas libera la tarjeta, corre el mejorador y la devuelve (la siguiente imagen tarda ~20 s más en cargar modelos). Si tienes una segunda GPU de 8 GB o más, pon `LLM_GPU=1` en `.env`: el mejorador queda cargado en ella y trabaja en paralelo con la generación.

## Uso diario

```bash
docker compose up -d          # iniciar (si Docker Desktop no arranca solo con Windows)
docker compose down           # detener
docker compose logs -f app    # ver qué está pasando
```

Para que arranque solo al encender la PC: Docker Desktop → Settings → General → *Start Docker Desktop when you sign in*.

## Actualizar

```bash
git pull
./setup.sh        # o setup.cmd
```

## Desinstalar

```bash
docker compose down
docker volume rm qwen_models qwen_llm   # borra los modelos (27 GB)
```

## Problemas comunes

- **«Docker no ve ninguna GPU»:** actualiza el driver NVIDIA; en Windows usa Docker Desktop con el backend WSL2; en Linux instala nvidia-container-toolkit y reinicia Docker.
- **La descarga se cortó:** vuelve a ejecutar el setup; continúa donde quedó.
- **La PC se pone lenta:** revisa la memoria de WSL2 (arriba) y cierra otras apps pesadas mientras generas.
- **La primera imagen tarda más:** es la precarga de modelos; el indicador arriba a la derecha dice «Preparando modelos…» hasta que termina.

## Licencias y uso responsable

- Qwen-Image-2.1 y sus mejoradores de prompt se distribuyen bajo la **Qwen Research License**: revísala antes de cualquier uso comercial.
- Las funciones con personas reales (meme, foto grupal) exigen el permiso de quienes aparecen. Las fotos de rostros son datos personales (en Costa Rica, Ley 8968); las imágenes se borran solas tras `RETENTION_HOURS`.

Documentación técnica para agentes y desarrolladores: [`AGENTS.md`](AGENTS.md).
