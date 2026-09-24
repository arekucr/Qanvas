# Qanvas: agent context

**Qanvas** (formerly "Qwen Studio"; containers and internal keys keep the `qwen-*` prefix): local AI image generation and editing studio on top of **Qwen-Image-2.1** (released 2026-09-20), running in Docker on a Windows PC with two GPUs. This file is the starting context for any new agent session. Update it when the architecture changes.

## User and working rules
- **Always reply in Spanish** (user in Costa Rica).
- **Don't test the UI yourself** (no browser pane, screenshots or UI clicks). The user tests manually. After frontend changes, run `tsc`/`lint`/`build` and summarize: what changed, how to try it, what's pending.
- **Don't run tests or generations yourself** (neither UI nor API benchmarks) unless the user asks. Deploy, verify health (`/api/health`) and let the user test.
- The machine runs **other Docker stacks** (dograh voice stack, QualiBot Supabase, `ollama`). **Ask before stopping, restarting or touching them.** `wsl --shutdown` restarts all of them. It is allowed only with permission.
- Original plan and product ideas: `E:\Downloads\qwen-image-2.1-comfyui-contexto.md`.

## Installation and configuration
- **One command after cloning:** `setup.cmd` (Windows, runs `setup.ps1`) or `./setup.sh` (Linux/WSL). It checks Docker and the GPU, creates `.env` from `.env.example`, downloads models with `docker compose --profile setup run --rm models` (`scripts/download-models.sh` + `scripts/models.txt`: path|exact size|URL; resumable, skips files with the right size), `docker compose build`, `up -d` and waits for `/api/health` → `warm.comfy`. Idempotent. `setup.ps1` must stay ASCII (PowerShell 5.1).
- **`.env`** (gitignored; template `.env.example`): `COMFY_GPU`, `LLM_GPU`, `APP_PORT`, `RETENTION_HOURS`, `COMFY_ARGS`. **Default is 1 GPU** (`LLM_GPU` = `COMFY_GPU`): `config.sharedGpu` → the enhancer goes through the same queue as ComfyUI, the server calls ComfyUI `POST /free` before and llama.cpp `POST /models/unload` after, and the enhancer isn't warmed. **This PC** uses `LLM_GPU=1` (dedicated 1070).
- Pinned images: `yanwk/comfyui-boot` and `llama.cpp:server-cuda` by digest (in `Dockerfile` and `docker-compose.yml`). Updating them is a deliberate decision: test the enhancer (the image marker and the router changed between versions).
- Volumes `qwen_models` / `qwen_llm` declared with a fixed `name:` (not `external`): Compose creates them on a clean install and reuses the existing ones here (it prints a harmless warning because they were created by hand).
- `README.md` = user guide (requirements, install, `.env`, WSL2, troubleshooting). `.gitattributes` forces LF on `*.sh`, `scripts/models.txt` and `llm/presets.ini`.

## Hardware and host
- Windows 10, 32 GB RAM, Docker Desktop on WSL2.
- **RTX 3060 12 GB** (CUDA index 0): image generation/editing (ComfyUI).
- **GTX 1070 8 GB** (index 1, Pascal sm_61): prompt enhancer (llama.cpp, CUDA 12.8 build; CUDA 13 does not support Pascal).
- `C:\Users\jass_\.wslconfig` → `memory=20GB`. This leaves ~12 GB for Windows. At 24 GB with pinned memory, Windows ran out of RAM and the VM thrashed.

## Architecture

```
Browser ──► http://localhost:3000  qwen-studio (app, no GPU)
               │  static UI (web/dist) + REST API /api + SSE
      ┌────────┴────────────────┐
      ▼                         ▼
 comfyui-qwen  comfyui:8188    qwen-pe  llm:8080 (host 8189)
 RTX 3060                      GTX 1070
 Qwen-Image-2.1 (t2i/edit)     PE-T2I GGUF (prompt rewrite)
```

All containers live in `docker-compose.yml` (project root). They talk over the Compose network by service name.

| Service / container | Image | GPU | Ports | Volumes |
|---|---|---|---|---|
| `comfyui` / `comfyui-qwen` | `qwen-comfyui:cu128-slim-0.37` (`Dockerfile`, based on `yanwk/comfyui-boot:cu128-slim`) | `COMFY_GPU` (3060 here) | 127.0.0.1:8188 | `qwen_models` → `/root/ComfyUI/models`; bind mounts from `E:` for `custom_nodes`, `.cache`, `.config`, `.local`, `input`, `output`, `user`; **anonymous volume on `/root`** (holds the ComfyUI code) |
| `llm` / `qwen-pe` | `ghcr.io/ggml-org/llama.cpp:server-cuda` in **router mode** (`--models-preset /config/presets.ini --models-max 1`) | `LLM_GPU` (1070 here) | 127.0.0.1:8189→8080 | `qwen_llm` → `/models`; `./llm/presets.ini` → `/config/presets.ini` |
| `app` / `qwen-studio` | `qwen-studio-app` (`Dockerfile.app`: web build + Node server) | none | `APP_PORT` (3000) | `qwen_data` → `/data`; `./workflows` → `/app/workflows:ro`; `./storage-user/input|output` → `/comfy/input|output` |

- All three use `restart: unless-stopped`. **Docker Desktop has `AutoStart=False`**, so nothing comes up after a reboot until the user enables "Start Docker Desktop when you sign in".
- GPUs: `deploy.devices` uses `count: all` (fixed indexes would break on 1-GPU machines) and isolation is done with `CUDA_VISIBLE_DEVICES` (Docker Desktop ignores `device_ids` anyway).
- ComfyUI runs with `CLI_ARGS=--disable-pinned-memory`. Pinned memory locks ~14 GB of RAM and hung the warm-up for 30 min.

### Models (in Docker named volumes, inside `docker_data.vhdx`; they survive restarts)
| File | Size | Volume / folder | Use |
|---|---|---|---|
| `qwen_image_2.1_int8_convrot.safetensors` | 7.3 GB | `qwen_models/diffusion_models` | 7B DiT (generate and edit) |
| `qwen3vl_8b_w4a8.safetensors` | 6.3 GB | `qwen_models/text_encoders` | **Active** text encoder (CLIPLoader type `qwen_image`) |
| `qwen3vl_8b_int8_convrot.safetensors` | 9.35 GB | `qwen_models/text_encoders` | **Unused**: w4a8 gave practically identical results (including text) at the same seed. Can be deleted |
| `qwen_image_2.1_vae_bf16.safetensors` | 0.7 GB | `qwen_models/vae` | VAE |
| `qwen3.5_9b_qwen_image_2.1_pe_t2i.int8_convrot.safetensors` | 9.5 GB | `qwen_models/text_encoders` | **Unused** (PE through ComfyUI ran at ~0.8 tok/s). Can be deleted |
| `pe-t2i-Q4_K_M.gguf` | 5.6 GB | `qwen_llm` | T2I enhancer (prithivMLmods/Qwen-Image-2.1-PE-T2I-GGUF); `pe-t2i` in the router; the app primes it at startup only with a dedicated GPU |
| `pe-i2i-Q4_K_M.gguf` + `pe-i2i-mmproj-bf16.gguf` | 5.6 + 0.9 GB | `qwen_llm` | Edit enhancer with vision (prithivMLmods/Qwen-Image-2.1-PE-I2I-GGUF); `pe-i2i` in the router. It doesn't fit alongside pe-t2i: the router swaps them (~40 s) |
| `RealESRGAN_x2plus.pth` | 64 MB | `qwen_models/upscale_models` | 2x upscaler (official xinntao/Real-ESRGAN v0.2.1 release, BSD). ~8 s from 1024 to 2048 |

- Sources: `Comfy-Org/Qwen-Image-2.1` (safetensors), `prithivMLmods/Qwen-Image-2.1-PE-T2I-GGUF`.
- `E:\Proyectos\AI\QwenImage\storage-models\models` holds an **old, unused copy** (~26 GB). Reading models from `E:` via bind mount was ~10x slower (50 MB/s), which is why they live in a volume.
- To download into a volume, use a `curlimages/curl` container with `-u 0` and `MSYS_NO_PATHCONV=1`.

## Repository layout
```
docker-compose.yml   Dockerfile (ComfyUI)   Dockerfile.app (app)   .dockerignore
workflows/           ComfyUI API templates + manifest + PE system prompts
  t2i.api.json       nodes: 1 UNETLoader, 2 CLIPLoader, 3 VAELoader, 5 EmptyLatentImage,
                     6 TextEncodeQwenImage21, 7 KSampler, 8 VAEDecode, 9 SaveImageAdvanced
  edit.api.json      + 4 QwenImage21Cache, 11–20 LoadImage (image_1..10), 5 encoder, 6 KSampler, 8 Save
  upscale.api.json   1 UpscaleModelLoader, 2 LoadImage, 3 ImageUpscaleWithModel, 4 Save (drops alpha: not for stickers)
  manifest.json      maps each param to [node, input], imageSlots, output node, native ratios
  prompts/           system_prompt_t2i.txt / system_prompt_edit.txt (copied from the PE custom node)
  _official/         official ComfyUI templates (reference only)
server/              Node 24 + Fastify (ESM, JS without a build step)
web/                 React 19 + Vite + TS + Tailwind 4 + shadcn (radix-nova) + Konva
storage-*/           ComfyUI bind mounts (custom_nodes, cache, input/output)
```

## Backend (`server/src`)
- `index.js`: Fastify routes, optional API key (`API_KEY`, `x-api-key` header or `?key=`), serves `web/dist` when present, and starts the warm-up.
- `queue.js`: **two lanes, one per GPU** (`comfy`, `llm`), each serial. `runExclusive()` runs internal tasks (warm-up) ahead of queued jobs. Job cancel: `/interrupt` for ComfyUI, `AbortController` for llama.cpp. It keeps each job's `phase` in memory (`uploading`, `waiting`, `loading`, `images`, `encoding`, `sampling`, `decoding`, `saving`, `thinking`), taken from ComfyUI's `execution_start`/`executing` events. The API includes it in `phase` and the UI shows it. **Don't send prompts straight to ComfyUI while the app is in use**: the app wouldn't see them, and its jobs would sit in "Esperando la GPU".
- `comfy.js`: ComfyUI client (`/upload/image`, `/prompt`, `/ws` for progress, `/history`, `/view`, `/interrupt`).
- `llm.js`: llama.cpp client (`/completion` streaming, `model` field = router preset). **The image marker is random per model instance**: it is read from `GET /props?model=pe-i2i` → `media_marker` before each multimodal request (a hardcoded `<__media__>` fails with "Failed to tokenize prompt"). Edit: user text `<image1> MARKER <image2> MARKER … prompt`, presence_penalty 0. **Fast mode** (`fast: true`, the UI default "Rápido"): pre-fills an empty `<think>

</think>

` in the assistant turn so it writes the JSON without reasoning (cap 1536 tokens). "Detallado" = original reasoning (1–3 min). The choice is saved in `localStorage` (`useEnhanceMode`). It builds the same ChatML as the PE node, `<|im_start|>assistant\n` with no `<think>` prefix, and uses temp 1.0, top_k 20, top_p 0.95, presence_penalty 1.5. It parses the JSON after `</think>` → `{ positive_prompt, wh_ratio }`.
- Uploads to ComfyUI are **named by content hash** (sha256): repeating a prompt with the same images reuses ComfyUI's cache (`--cache-ram`, the default) and skips the text encoder. This is the basis of "Otra variante" and "Renderizar final".
- `workflows.js`: loads the templates and applies params and images according to the manifest. Unused image slots are removed from the graph.
- `presets.js`: turns each job type into a workflow and params, validates consent and image counts, and applies a basic content filter.
- **Metrics per job** (`queue.js`): timeline of phases with timestamps → `result.meta` = `{ queueMs, runMs, totalMs, phases[{phase,ms}], cached[] (class_type ComfyUI took from cache), models, sampler, promptSent, encodeResolution, inputs, output{w,h,bytes}, gpu{name,vram}, comfyPromptId, enhancer{model,mode,promptTokens,cachedTokens,promptMs,generatedTokens,generateMs,tokensPerSecond} }`. Saved on errors too. The UI shows it in `components/generation-info.tsx` (ⓘ on the image, in the Editor and in History).
- `store.js`: SQLite (`node:sqlite`) in `/data/jobs.db`, with files in `/data/jobs/<id>/in_N.png|out_N.png`. Retention of `RETENTION_HOURS` (24); on restart, pending jobs are marked as errors.
- `warmup.js`: when each backend becomes reachable, it loads the models (1-step 256px generation; prime of the system prompt in llama.cpp). It repeats if a backend restarts. `/api/health` reports `warm.comfy`/`warm.llm`.

### API
| Method | Route | Notes |
|---|---|---|
| GET | `/api/health` | `{ comfy, llm, warm: { comfy, llm } }` |
| GET | `/api/meta` | ratios, quality presets, retention |
| POST | `/api/jobs` | multipart: `type`, `params` (JSON), `images[]` → 202 with the job |
| GET | `/api/jobs`, `/api/jobs/:id` | includes `queuePosition` |
| DELETE | `/api/jobs/:id` | cancels a queued or running job |
| POST | `/api/jobs/delete` | `{ ids }` deletes finished jobs **everywhere**: `/data/jobs/<id>`, ComfyUI's copies (`result.meta.comfyFiles` → `storage-user/input|output`, mounted in the app as `/comfy/input|output`) and the DB row. Running ones come back in `skipped`. The 24 h retention uses the same function (`removeJob`) |
| POST | `/api/jobs/:id/rerun` | `{ mode: 'variant' }` new seed, same steps · `{ mode: 'final' }` same seed and resolution with `FINAL_STEPS` (30). Copies the inputs of the original job |
| GET | `/api/jobs/:id/events` | SSE with each job update |
| GET | `/api/files/:id/:name` | `in_N`/`out_N` images |

Env vars: `PORT`, `COMFY_URL`, `LLM_URL`, `LLM_MAX_TOKENS` (8192), `API_KEY`, `DATA_DIR`, `WORKFLOWS_DIR`, `WEB_DIR`, `RETENTION_HOURS`, `JOB_TIMEOUT_MS`.

### Job types (`presets.js`)
| type | workflow | images | notes |
|---|---|---|---|
| `t2i` | t2i | 0 | `ratio` (any `w:h`; the 7 native ones in the manifest), `quality` |
| `edit` | edit | 1–10 | the prompt references `<image1>`… (image1 = target to edit) |
| `enhance` | llm_t2i / llm_edit | 0 / 1–10 | llama.cpp lane (GTX 1070). `target`: `t2i` (default), `edit` (prompt already built by the Editor), `meme`, `group` (the server builds the template with `resolvePreset` and rewrites it looking at the images) |
| `sticker_generate` | t2i | 0 | wraps the prompt in the official RGBA format; `cartoon` adds a white outline |
| `sticker_extract` | edit | 1 | "Remove the background, and output a PNG image" |
| `meme` | edit | 2 | requires `consent`; `rawPrompt` (improved) replaces the template |
| `group` | edit | 2–10 | requires `consent`; `positions[]` per person; `rawPrompt` replaces the template |
| `upscale` | upscale | 1 | Real-ESRGAN 2x; the recommended flow is to iterate at "Rápida" and enlarge only the final version |

Quality: `preview` 12 steps ~0.5 MP (edit res 768), `normal` 25 steps 1 MP (1024), `hd` 40 steps native 2K (2048). In edits, `resolution` is the pixel budget per image (the output keeps image_1's aspect ratio). The browser caps inputs at 2048 px on the long side (`normalizeImage`).

## Frontend (`web/src`)
- Layout at full width (no `max-w`): form column 380–520 px + result that fills the height (`100dvh`).
- `components/image-viewer.tsx`: zoom (wheel, buttons, double click) and pan by dragging; shows the real size in px. `components/lightbox.tsx`: full-screen "cinema mode" (black backdrop, Esc, browser fullscreen API). `ResultPanel` combines both plus "Ampliar 2×" with an Original/2× toggle.
- Hash router in `App.tsx` (`#/generate`, `editor`, `stickers`, `meme`, `group`, `history`). The Editor stays mounted (hidden) so version history survives navigation.
- `lib/api.ts` (fetch + SSE), `hooks/use-job.ts` (submit + follow + cancel), `hooks/use-theme.ts` (own theme; `next-themes` was dropped because of a script-tag error under React 19).
- Editor: `components/editor/mark-canvas.tsx` (Konva; marks stored in the image's natural coordinates; wheel zoom and "hand" tool `pan`; remounted with `key` per version) + `lib/marks.ts` (export of annotated image or B/W mask, normalization to ≤2048 px, WebP 512 for stickers). Annotation sends `[original, annotated]`; mask sends `[original, mask]`; extra references follow after.
- The shell comes from the shadcn-studio block `application-shell-01`. Registries (`@ss-blocks`, `@ss-components`…) are configured in `components.json` with `${EMAIL}`/`${LICENSE_KEY}` from `web/.env` (**secret, gitignored and excluded from the Docker build**). In Vite, the CLI skips the blocks' `page.tsx`; download it from the registry if needed.
- `components/enhanced-prompt-field.tsx`: prompt field + "Mejorar prompt" + editable result + "Deshacer" (Editor, Meme, Group). Enhancer images go at ≤768 px JPEG (`toEnhancerImage`). `ResultPanel` and the Editor offer "Otra variante"/"Renderizar final" (`useJob().rerun`) and keep showing the previous image while the new one generates.
- Useful MCPs: `shadcn-studio-mcp` (blocks) and `context7` (up-to-date docs).

## Brand and visual design (Qanvas)
- Guide: `E:\Downloads\qanvas-ui-branding-guide.md`. Rule: neutral UI (75–80%), **blue `#005CFC` for interaction** (buttons, focus, active state), **multicolor only for AI** (1–2 visible elements per screen), red/yellow/orange/green for states.
- Visual style based on the user's reference mockups (light and dark): neutral/navy UI with soft shadows (`shadow-card`), `rounded-2xl` cards, **active menu item as a blue gradient pill with glow** (`--brand-gradient`, `--brand-glow`), selected options with a solid blue border, dotted canvas behind results (`.bg-dots`), green status pill in the header, square amber theme button, robot status card at the bottom of the sidebar.
- Light: background `#F3F6FB`, cards and sidebar white. Dark (**navy blues**, not grays): background `#0A1120`, cards `#101B30`, borders `#1F2C49`, sidebar `#0B1324`.
- Tokens in `web/src/index.css` (`:root` / `.dark`): shadcn variables mapped to the palette + `--qanvas-*`, `--qanvas-gradient`, `--brand-gradient`, `--brand-glow`, `--card-shadow`, `--dot`, `--success`, `--warning`, `--primary-hover`. Classes: `.btn-brand` (`Button variant='ai'`: blue gradient with glow and yellow sparkle; only the main action of each page), `.ai-field` (multicolor line on prompt fields when focused / `data-working`), `.ai-ring` (multicolor border on the result canvas while generating), `.bg-dots`, `.text-qanvas-gradient`, `animate-float` (mascot).
- Assets in `web/public/`: originals `images/qanvas-logo.png`, `images/logo-robot.png`, `icons/logo-robot.ico` (from the user, don't delete). Derived: `brand/qanvas-wordmark-{96,192,288,384,768}.webp` (+ `-512.png`), `brand/qanvas-robot-{48…512}.webp`, `brand/og-image.jpg` (1200×630), `favicon.ico` (16/32/48), `icons/favicon-{16,32}.png`, `icons/apple-touch-icon.png`, `icons/icon-{192,512}.png`, `icons/icon-maskable-512.png`, `site.webmanifest`.
- `components/brand.tsx`: `<Wordmark height>` (top-left corner of the sidebar, next to the robot avatar with a status dot) and `<Mascot size>` (empty states: results, Editor, History; floats while working). Both use `srcSet` + `sizes` according to the rendered size.

## Operations
```bash
docker compose up -d                 # start everything (warm-up takes ~1 min)
docker compose build app && docker compose up -d app      # after changing server/ or web/
docker compose build comfyui && docker compose up -d comfyui
docker logs -f qwen-studio           # API logs + "Precarga ... lista"
curl localhost:3000/api/health
npm --prefix web run dev             # UI dev at :5173 (proxies /api to :3000)
```
- Changes under `workflows/` apply by restarting `app` (read-only mount); no rebuild needed.
- Git Bash on Windows rewrites paths such as `/models/...` in `docker run`. Use `MSYS_NO_PATHCONV=1`.
- If `npx shadcn` fails with `ERR_MODULE_NOT_FOUND`, delete the corrupt folder under `%LOCALAPPDATA%\npm-cache\_npx`.
- **Do not run `docker compose down -v`**: it deletes the anonymous `/root` volume. The Dockerfile already pins 0.37.2 in the bundle, but custom nodes and caches would be lost.

## Reference performance (RTX 3060 / GTX 1070)
- Preview generation (704 px, 12 steps): ~33 s of sampling (~2.7 s/step) plus model loading. Before the warm-up and the RAM fixes, overhead was ~50 s per job.
- Prompt enhancer: prefill ~500 tok/s (2.4k-token system prompt, cached after warm-up), generation ~25 tok/s, ~1 min per enhancement (~1.2k tokens including `<think>`).

## Known issues
- `--use-sage-attention` can produce black/NaN images on Ampere (not used).
- Recent bug in ComfyUI's native mask editor (PR #16141). It does not affect this app, which sends masks as images.
- ComfyUI-Manager logs "PyTorch is not installed"; this is harmless.

## Pending
1. Docker Desktop autostart (user setting).
2. Not yet tested by the user: Meme and Group photo with real faces, Mask mode, WebP export.
3. Security: ComfyUI and llama.cpp now listen only on `127.0.0.1`. `API_KEY` exists in the server but the UI has no field to enter it (it would only work via `localStorage`); it is not in `.env.example`.
4. Repo: https://github.com/arekucr/Qanvas (branch `main`). Commit as `Alexander <arekucr@gmail.com>` using `git -c user.name=... -c user.email=...`: the global Git identity is the user's work email, don't use it or change it. Push uses the credentials saved in Git Credential Manager.
5. Cleanup: the old PE (9.5 GB) and the `int8` encoder (9.35 GB), both unused; the `storage-models` folder on `E:` (~26 GB); the ComfyUI PE custom node, which the app no longer uses.
6. WhatsApp bot (stage 2 of the plan). Official Cloud API vs Baileys (risk of the number being banned).
7. The containers `dograh-coqui`, `dograh-parakeet` and `dograh-bonsai` were stopped to free the 3060. They don't restart on their own, and if they are running they compete for GPU and RAM.

## Legal and product
- **Qwen Research License**: not for commercial use without reviewing it.
- Real people (meme, group, bot): consent checkbox, content filter (sexual, humiliating, minors), 24 h retention. Faces are personal data under **Ley 8968** (Costa Rica).
