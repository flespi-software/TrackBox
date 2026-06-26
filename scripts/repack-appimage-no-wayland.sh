#!/usr/bin/env bash
#
# Post-process a Tauri-built AppImage: drop the bundled libwayland-* libraries so
# the app uses the host's. Tauri/linuxdeploy bundles libwayland-client (against
# the AppImage excludelist), and the old bundled copy conflicts with a modern
# Wayland compositor / Mesa — WebKit then aborts with
#   "Could not create default EGL display: EGL_BAD_PARAMETER. Aborting..."
# and renders a blank window. Using the system libwayland fixes it. libwayland is
# present on every Wayland desktop, so this is safe; X11-only sessions are
# unaffected (the libs just go unused).
#
# Runs on the host or inside the build container. Needs network (fetches
# appimagetool once) and APPIMAGE_EXTRACT_AND_RUN=1 so no FUSE is required.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/src-tauri/target/release/bundle/appimage"
APPIMAGE="$(ls "$OUT"/*.AppImage 2>/dev/null | head -1 || true)"
[ -n "$APPIMAGE" ] || { echo "repack: no AppImage in $OUT" >&2; exit 1; }

export APPIMAGE_EXTRACT_AND_RUN=1
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cp "$APPIMAGE" "$work/in.AppImage"
chmod +x "$work/in.AppImage"
( cd "$work" && ./in.AppImage --appimage-extract >/dev/null )

removed=0
for lib in libwayland-client.so.0 libwayland-cursor.so.0 libwayland-egl.so.1 libwayland-server.so.0; do
  if rm -f "$work/squashfs-root/usr/lib/$lib"; then removed=$((removed + 1)); fi
done
echo "repack: dropped $removed bundled libwayland-* libs (use system)"

# appimagetool: prefer a cached copy, else download the continuous build.
TOOL="${APPIMAGETOOL:-$work/appimagetool}"
if [ ! -x "$TOOL" ]; then
  TOOL="$work/appimagetool"
  url="https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage"
  if command -v wget >/dev/null; then wget -qO "$TOOL" "$url"; else curl -fsSL -o "$TOOL" "$url"; fi
  chmod +x "$TOOL"
fi

ARCH=x86_64 "$TOOL" --appimage-extract-and-run "$work/squashfs-root" "$work/out.AppImage" >/dev/null 2>&1
mv -f "$work/out.AppImage" "$APPIMAGE"
chmod +x "$APPIMAGE"
echo "repack: done -> $APPIMAGE"
