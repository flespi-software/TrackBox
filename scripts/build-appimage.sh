#!/usr/bin/env bash
#
# Build the TrackBox Linux AppImage inside an Ubuntu 22.04 LTS container so the
# binary stays compatible with older glibc than the host. Wraps:
#   1. build the builder image (if missing)
#   2. run `tauri build --bundles appimage` against the mounted source tree
#   3. restore host ownership of the artifacts the container created as root
#
# Usage:
#   scripts/build-appimage.sh              # build the AppImage
#   scripts/build-appimage.sh --rebuild    # force-rebuild the builder image first
#   ENGINE=podman scripts/build-appimage.sh
#
set -euo pipefail

# Resolve repo root (parent of this script's directory) and work from there.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENGINE="${ENGINE:-docker}"
IMAGE="trackbox-builder"

if ! command -v "$ENGINE" >/dev/null 2>&1; then
  echo "error: '$ENGINE' not found. Install Docker, or set ENGINE=podman." >&2
  exit 1
fi

# (Re)build the builder image when missing or when --rebuild is passed.
if [[ "${1:-}" == "--rebuild" ]] || ! "$ENGINE" image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "==> Building '$IMAGE' image ($ENGINE)..."
  "$ENGINE" build -t "$IMAGE" -f Dockerfile.build .
fi

echo "==> Building AppImage inside the container..."
# APPIMAGE_EXTRACT_AND_RUN=1 lets the AppImage tooling extract instead of using
# FUSE, so no --privileged / device passthrough is needed.
"$ENGINE" run --rm \
  -v "$ROOT":/app -w /app \
  -e APPIMAGE_EXTRACT_AND_RUN=1 \
  "$IMAGE" \
  bash -lc "npm install && npm run tauri:build -- --bundles appimage && bash scripts/repack-appimage-no-wayland.sh"

# Docker writes container files as root; podman (rootless) maps to the caller,
# so only fix ownership for docker.
OUT_DIR="src-tauri/target/release/bundle/appimage"
if [[ "$ENGINE" == "docker" ]]; then
  echo "==> Restoring file ownership (sudo)..."
  sudo chown -R "$(id -u):$(id -g)" src-tauri/target node_modules
fi

echo
echo "==> Done. AppImage(s):"
ls -1sh "$OUT_DIR"/*.AppImage 2>/dev/null || {
  echo "  (none found in $OUT_DIR — check the build log above)" >&2
  exit 1
}
