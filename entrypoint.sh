#!/bin/bash
set -e

# Force pip-installed cuBLAS 13.1+ over the system CUDA toolkit's 13.0.2, which
# lacks Blackwell (sm_121 / compute 12.1) support.  LD_PRELOAD is required
# because the NVIDIA container runtime injects the system libs early in the
# search path, bypassing both LD_LIBRARY_PATH and torch's RPATH.
NVIDIA_PIP_LIB="/app/venv/lib/python3.12/site-packages/nvidia/cu13/lib"
if [ -d "$NVIDIA_PIP_LIB" ]; then
    export LD_PRELOAD="${NVIDIA_PIP_LIB}/libcublas.so.13:${NVIDIA_PIP_LIB}/libcublasLt.so.13${LD_PRELOAD:+:$LD_PRELOAD}"
fi

CHECKPOINT_DIR="/app/ComfyUI/models/checkpoints"
SD15_FILE="$CHECKPOINT_DIR/v1-5-pruned-emaonly-fp16.safetensors"

# Download default checkpoint if no models exist
if [ -z "$(ls -A $CHECKPOINT_DIR 2>/dev/null)" ]; then
    echo "[comfyui-spark] No checkpoints found. Downloading SD 1.5 (~2GB)..."
    wget -q --show-progress -O "$SD15_FILE" \
        "https://huggingface.co/Comfy-Org/stable-diffusion-v1-5-archive/resolve/main/v1-5-pruned-emaonly-fp16.safetensors" \
        || echo "[comfyui-spark] Warning: checkpoint download failed, continuing without it"
    echo "[comfyui-spark] Checkpoint download complete."
else
    echo "[comfyui-spark] Checkpoints directory not empty, skipping download."
fi

# Apply server-side download patch to frontend
echo "[comfyui-spark] Applying server-side download patch..."
python3 /app/web_patches/patch_frontend.py || echo "[comfyui-spark] Warning: frontend patch failed"

echo "[comfyui-spark] Starting ComfyUI..."
exec python3 main.py --listen 0.0.0.0 "$@"
