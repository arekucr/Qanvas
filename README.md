<p align="center">
  <img src="web/public/brand/qanvas-wordmark-384.webp" alt="Qanvas" height="96">
</p>

# Qanvas

A local studio to generate and edit images with AI on top of **Qwen-Image-2.1**: text to image, an editor with annotations and masks, stickers with transparent backgrounds, memes, group photos, a prompt enhancer and 2× upscaling. Everything runs on your PC with Docker: your images and photos never leave your machine.

## Requirements

| | Minimum |
|---|---|
| GPU | NVIDIA with **12 GB of VRAM** (tested on an RTX 3060) and a recent driver |
| RAM | 32 GB |
| Disk | ~45 GB free (27 GB of models + Docker images) |
| Software | **Windows:** Docker Desktop with WSL2 · **Linux:** Docker + Compose v2 + [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) |

## Installation (one command)

```bash
git clone https://github.com/arekucr/Qanvas.git && cd Qanvas
```

- **Windows:** double-click `setup.cmd` (or run it from a terminal).
- **Linux / WSL:** `./setup.sh`

The setup checks Docker and the GPU, creates `.env`, downloads the models (~27 GB, can be interrupted and resumed), builds the images, starts everything and waits until the models are preloaded. When it finishes it opens **http://localhost:3000**.

You can run it again at any time: it skips whatever is already done.

### Windows: WSL2 memory

Docker Desktop uses half of your RAM by default. With 32 GB it's best to cap it at 20 GB so the models fit and Windows stays responsive. Create `%USERPROFILE%\.wslconfig`:

```ini
[wsl2]
memory=20GB
```

and restart Docker Desktop (or run `wsl --shutdown`).

## Configuration (`.env`)

| Variable | Default | What it does |
|---|---|---|
| `COMFY_GPU` | `0` | GPU that generates the images |
| `LLM_GPU` | `0` | GPU for the prompt enhancer. If it's the same as `COMFY_GPU`, they take turns on the card |
| `APP_PORT` | `3000` | Web app port |
| `RETENTION_HOURS` | `24` | Hours images are kept before they are deleted automatically |
| `COMFY_ARGS` | `--disable-pinned-memory` | ComfyUI arguments (with 64 GB of RAM you can remove it) |

After changing `.env`: `docker compose up -d`.

### With two GPUs

By default everything runs on a single GPU: when you press "Improve prompt", Qanvas frees the card, runs the enhancer and hands the card back (the next image takes ~20 s longer while it reloads the models). If you have a second GPU with 8 GB or more, set `LLM_GPU=1` in `.env`: the enhancer stays loaded on it and works in parallel with image generation.

## Daily use

```bash
docker compose up -d          # start (if Docker Desktop doesn't start with Windows)
docker compose down           # stop
docker compose logs -f app    # see what's going on
```

To start it automatically when your PC boots: Docker Desktop → Settings → General → *Start Docker Desktop when you sign in*.

## Updating

```bash
git pull
./setup.sh        # or setup.cmd
```

## Uninstalling

```bash
docker compose down
docker volume rm qwen_models qwen_llm   # deletes the models (27 GB)
```

## Troubleshooting

- **"Docker can't see any GPU":** update the NVIDIA driver; on Windows use Docker Desktop with the WSL2 backend; on Linux install nvidia-container-toolkit and restart Docker.
- **The download was interrupted:** run the setup again; it resumes where it stopped.
- **Your PC gets slow:** check the WSL2 memory setting (above) and close other heavy apps while generating.
- **The first image takes longer:** that's the model preload; the indicator at the top right shows "Preparing models…" until it's done.

## Licenses and responsible use

- Qwen-Image-2.1 and its prompt enhancers are released under the **Qwen Research License**: review it before any commercial use.
- Features with real people (meme, group photo) require the consent of everyone who appears. Face photos are personal data (in Costa Rica, Law 8968); images are deleted automatically after `RETENTION_HOURS`.

The app's interface is in Spanish. Technical documentation for agents and developers: [`AGENTS.md`](AGENTS.md).
