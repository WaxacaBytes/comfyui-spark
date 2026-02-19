# comfyui-spark

GPU-ready ComfyUI Docker image for DGX Spark / ARM64 with Spark-specific UX patches:
- server-side model downloads from the Missing Models modal
- persistent download progress behavior patched in frontend bundle
- optional first-run SD 1.5 checkpoint download

This repository is an **overlay repo**: it does not vendor ComfyUI source.
The Docker build clones upstream ComfyUI at a pinned commit and applies Spark patches on top.

## Run

```bash
docker compose up -d
```

Then open `http://localhost:8188`.

## Build

```bash
docker build -t abelpc/comfyui-spark:latest .
```

## Push

```bash
docker push abelpc/comfyui-spark:latest
```

## GitHub Actions

This repository includes CI at `.github/workflows/docker-image.yml`.
On each push to `main`, it builds and pushes:
- `abelpc/comfyui-spark:latest`
- `abelpc/comfyui-spark:main`
- `abelpc/comfyui-spark:sha-<commit>`

On `v*` tags, it also pushes the tag name (for example `v1.0.0`).

Required repository secrets:
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

## Customize upstream ComfyUI

The Dockerfile exposes two build args:
- `COMFYUI_REPO`
- `COMFYUI_REF`

Example:

```bash
docker build \
  --build-arg COMFYUI_REF=<commit-or-tag> \
  -t abelpc/comfyui-spark:custom .
```
