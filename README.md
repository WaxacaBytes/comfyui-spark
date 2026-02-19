# ComfyUI Spark

A GPU-ready [ComfyUI](https://github.com/Comfy-Org/ComfyUI) Docker image built for **NVIDIA DGX Spark / ARM64** with CUDA 13.0.

This image packages upstream ComfyUI with quality-of-life patches so you can run it standalone or as the compute backend for [SparkForge](https://github.com/WaxacaBytes/sparkforge).

## What's included

Everything in upstream ComfyUI, plus:

- **Server-side model downloads** — download models directly from the Missing Models dialog (supports HuggingFace, CivitAI, and GitHub URLs)
- **Download progress tracking** — patched frontend shows real-time progress for server-side downloads
- **Optional first-run checkpoint** — automatically downloads SD 1.5 (fp16) on first start if no checkpoints are present

This is an **overlay repo**: it does not vendor ComfyUI source. The Docker build clones upstream at a pinned release and applies patches on top.

## Quick start

### Standalone

```bash
docker compose up -d
```

Open `http://localhost:8188`.

### With SparkForge

This image is published to Docker Hub as [`abelpc/comfyui-spark`](https://hub.docker.com/r/abelpc/comfyui-spark) and is consumed automatically by SparkForge. See the [SparkForge repo](https://github.com/WaxacaBytes/sparkforge) for setup instructions.

## Volumes

The compose file mounts three named volumes so data persists across container restarts:

| Volume | Container path | Contents |
|---|---|---|
| `comfyui-models` | `/app/ComfyUI/models` | Checkpoints, LoRAs, VAEs, etc. |
| `comfyui-output` | `/app/ComfyUI/output` | Generated images |
| `comfyui-input` | `/app/ComfyUI/input` | Input images |

## Build from source

```bash
docker build -t abelpc/comfyui-spark:latest .
```

To pin a specific ComfyUI version:

```bash
docker build \
  --build-arg COMFYUI_REF=<commit-or-tag> \
  -t abelpc/comfyui-spark:custom .
```

## CI / CD

On every push to `main`, GitHub Actions resolves the latest ComfyUI release and builds an ARM64 image. Published tags:

| Tag | Description |
|---|---|
| `latest` | Most recent build from `main` |
| `main` | Alias for the default branch |
| `sha-<commit>` | Pinned to a specific commit |
| `comfyui-<version>` | Tracks upstream ComfyUI release (e.g. `comfyui-v0.14.2`) |

Pushes to `v*` tags also publish the tag name (e.g. `v1.0.0`).

### Required secrets

Set these in a GitHub environment named **DockerHub**:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

If the secrets are missing, CI runs a build-only test without pushing.

## License

Same license as [ComfyUI](https://github.com/Comfy-Org/ComfyUI/blob/main/LICENSE).
