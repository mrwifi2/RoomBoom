#!/usr/bin/env bash
# Downloads proot (arm64) + the Alpine root filesystem (Debian/Ubuntu are not bundled). Runs inside GitHub Actions.
# NOTE: rootfs files are saved as *.dat (gzip'd tar) because the Android Gradle plugin
# silently unpacks assets that end in .gz and drops the extension.
set -euo pipefail

PROOT_URL="https://github.com/green-green-avk/build-proot-android/raw/master/packages/proot-android-aarch64.tar.gz"

OUT="${1:-android/app/src/main}"
JNI="$OUT/jniLibs/arm64-v8a"
ASSETS="$OUT/assets"
TMP="$(mktemp -d)"
mkdir -p "$JNI" "$ASSETS"

# latest <listing-url> <regex>  -> newest matching file name in an HTML directory listing
latest() {
  curl -fsSL --retry 3 "$1" | grep -oE "$2" | sort -uV | tail -1
}

warn() { echo "::warning::$*"; }

# check that a file is a real gzip archive containing a root filesystem
check_rootfs() {
  gzip -t "$1" && tar -tzf "$1" | grep -E '^(\./)?(bin|usr)(/|$)' >/dev/null
}

# ---------------------------------------------------------------- Alpine (required)
echo "==> Alpine"
# Alpine 3.23+ ships apk-tools 3, which fails with "Operation not permitted" inside proot on Android.
# So we only accept a release whose apk-tools is 2.x (older branches are tried in order).
AL_OK=0
for BRANCH in v3.22 v3.21 v3.20; do
  AL_BASE="https://dl-cdn.alpinelinux.org/alpine/${BRANCH}/releases/aarch64"
  AL_FILE="$(latest "$AL_BASE/" 'alpine-minirootfs-[0-9.]+-aarch64\.tar\.gz' || true)"
  [ -n "$AL_FILE" ] || { echo "   $BRANCH: no minirootfs found"; continue; }
  curl -fL --retry 3 -o "$ASSETS/rootfs-alpine.dat" "$AL_BASE/$AL_FILE" || continue
  check_rootfs "$ASSETS/rootfs-alpine.dat" || continue
  APK_VER="$(tar -xzOf "$ASSETS/rootfs-alpine.dat" ./lib/apk/db/installed 2>/dev/null | awk '/^P:apk-tools$/{getline; print; exit}')"
  echo "   $BRANCH: $AL_FILE  apk-tools=$APK_VER"
  case "$APK_VER" in
    V:2.*) AL_OK=1; break ;;
  esac
done
[ "$AL_OK" = 1 ] || { echo "::error::no Alpine release with apk-tools 2.x found"; exit 1; }

# ---------------------------------------------------------------- proot
echo "==> proot"
curl -fL --retry 3 -o "$TMP/proot.tar.gz" "$PROOT_URL"
mkdir -p "$TMP/proot"
tar -xzf "$TMP/proot.tar.gz" -C "$TMP/proot"
find "$TMP/proot" -type f | head -50

PROOT_BIN="$(find "$TMP/proot" -type f -name 'proot' | head -1)"
LOADER_BIN="$(find "$TMP/proot" -type f -name 'loader' | head -1)"
[ -n "$PROOT_BIN" ]  || { echo "proot binary not found in archive"; exit 1; }
[ -n "$LOADER_BIN" ] || { echo "loader binary not found in archive"; exit 1; }

cp "$PROOT_BIN"  "$JNI/libproot.so"
cp "$LOADER_BIN" "$JNI/libproot-loader.so"
chmod 755 "$JNI"/*.so
ls -la "$JNI" "$ASSETS"
