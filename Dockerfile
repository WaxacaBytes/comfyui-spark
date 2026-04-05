FROM nvcr.io/nvidia/cuda:13.0.1-devel-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python3-dev \
    git wget curl \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create venv and install PyTorch with CUDA 13.0
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu130

# Clone ComfyUI
ARG COMFYUI_REPO=https://github.com/Comfy-Org/ComfyUI.git
ARG COMFYUI_REF=v0.18.1
RUN git clone "$COMFYUI_REPO" /app/ComfyUI && \
    cd /app/ComfyUI && git checkout "$COMFYUI_REF"

WORKDIR /app/ComfyUI

# Install ComfyUI dependencies, then restore the matching CUDA torchaudio wheel.
# ComfyUI currently pulls torchaudio separately and can upgrade it past the
# pinned torch version, which breaks import on Spark.
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cu130 torchaudio==2.10.0

# Add server-side model download custom node
COPY server_download.py /app/ComfyUI/custom_nodes/server_download.py

# Include frontend patch script and download manager; entrypoint applies at container start.
RUN mkdir -p /app/web_patches
COPY web_patches/patch_frontend.py /app/web_patches/patch_frontend.py
COPY web_patches/download_manager.js /app/web_patches/download_manager.js

# Create directories for external volumes
RUN mkdir -p /app/ComfyUI/models/checkpoints \
             /app/ComfyUI/models/loras \
             /app/ComfyUI/models/vae \
             /app/ComfyUI/output \
             /app/ComfyUI/input

EXPOSE 8188

# Download SD 1.5 checkpoint on first run if not present, then start
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
