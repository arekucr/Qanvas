# Pinned digest of yanwk/comfyui-boot:cu128-slim, so a future upstream push can't break installs.
FROM yanwk/comfyui-boot:cu128-slim@sha256:4172d960fe57c630d33f6bd8891aa7ecf55e7768559565c6b74e8d57e44512a9

# The base image bundles ComfyUI 0.21.1; Qwen-Image-2.1 nodes need >= 0.37. The entrypoint copies
# this bundle into /root (an anonymous volume) only when it's empty, so pin the version here too.
RUN cd /default-comfyui-bundle/ComfyUI \
    && git fetch --tags --quiet \
    && git checkout --quiet v0.37.2

# Dependencies required by ComfyUI 0.37 (torch already ships with the base image).
RUN pip install --no-cache-dir \
    comfyui-frontend-package==1.52.7 \
    comfyui-workflow-templates==0.11.69 \
    comfyui-embedded-docs==0.5.12 \
    comfy-kitchen==0.2.35 \
    comfy-aimdo==0.5.5 \
    comfy-angle
