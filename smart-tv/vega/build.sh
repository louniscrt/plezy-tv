#!/usr/bin/env bash
set -euo pipefail
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_DIR="${KEPLER_SDK_PATH:?Définir KEPLER_SDK_PATH avec le SDK Amazon Vega installé}"
BUILD_DIR="${PLEZY_VEGA_BUILD_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/plezy-vega-build}"
MODULES_DIR="${PLEZY_VEGA_NODE_MODULES:-$SOURCE_DIR/node_modules}"
export PATH="$SDK_DIR/bin/tools:$SDK_DIR/bin:$PATH"
export KEPLER_SDK_PATH="$SDK_DIR"
command -v node >/dev/null
command -v vega >/dev/null
if [ ! -d "$MODULES_DIR" ]; then
  printf '%s\n' 'Installer les dépendances avec npm install ou définir PLEZY_VEGA_NODE_MODULES.' >&2
  exit 1
fi
MODULES_DIR="$(cd "$MODULES_DIR" && pwd -P)"
mkdir -p "$BUILD_DIR/src" "$BUILD_DIR/assets"
BUILD_DIR="$(cd "$BUILD_DIR" && pwd -P)"
if [ "$BUILD_DIR" = "$SOURCE_DIR" ]; then
  printf '%s\n' 'Le répertoire de build doit être distinct des sources.' >&2
  exit 1
fi
cd "$SOURCE_DIR"
node prepare.cjs
VERSION="$(node -p "require('./package.json').version")"
cp package.json app.json index.js babel.config.js metro.config.js tsconfig.json manifest.toml "$BUILD_DIR/"
cp src/App.tsx src/injection.json src/navigation.js src/navigation.d.ts "$BUILD_DIR/src/"
cp -R assets/. "$BUILD_DIR/assets/"
if [ ! -e "$BUILD_DIR/node_modules" ]; then
  ln -s "$MODULES_DIR" "$BUILD_DIR/node_modules"
fi
cd "$BUILD_DIR"
./node_modules/.bin/tsc --noEmit
npx --no-install react-native build-vega --build-type Release --target armv7
test -s "$BUILD_DIR/build/lib/rn-bundles/Release/index.hermes.bundle"
vega build -t armv7 -b Release
mkdir -p "$SOURCE_DIR/../dist"
PACKAGE_PATH="$(find "$BUILD_DIR/build" -type f -name '*.vpkg' -not -path '*/intermediate/*' | head -1)"
test -n "$PACKAGE_PATH"
vega exec vpt validate "$PACKAGE_PATH"
OUTPUT="$SOURCE_DIR/../dist/Plezy-TV-Vega-$VERSION-armv7.vpkg"
cp "$PACKAGE_PATH" "$OUTPUT"
sha256sum "$OUTPUT"
