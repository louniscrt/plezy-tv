#!/bin/bash
set -euo pipefail
# Run as the ordinary Umbrel user. Sudo is used only for the Docker commands.
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/plezy-android-build"
mkdir -p "$cache_dir"
server_url="${1:-http://100.127.49.5:8096}"
if [[ "$server_url" != http://* && "$server_url" != https://* ]]; then
    echo 'Usage: bash tools/build-on-umbrel.sh http://SERVER:8096' >&2
    exit 1
fi
if [[ "$(uname -m)" != x86_64 ]]; then
    echo 'This Android toolchain requires Linux x86_64.' >&2
    exit 1
fi
if docker info >/dev/null 2>&1; then
    docker_command=(docker)
else
    sudo -v
    docker_command=(sudo docker)
fi
# Do not modify the Docker socket permissions or install packages on Umbrel.
"${docker_command[@]}" info >/dev/null
build_options=()
run_options=()
if [[ -n "${CODEX_PROXY_CERT:-}" && -f "${CODEX_PROXY_CERT}" ]]; then
    build_options+=(--secret "id=proxy_ca,src=$CODEX_PROXY_CERT" --secret 'id=ca_bundle,src=/etc/ssl/certs/ca-certificates.crt')
    run_options+=(--mount 'type=bind,src=/etc/ssl/certs/java/cacerts,dst=/run/plezy-cacerts,readonly')
fi
"${docker_command[@]}" build "${build_options[@]}" -t plezy-android-builder:8.4 "$repo_dir/tools/android-build"
"${docker_command[@]}" run --rm --memory=6g --cpus=2 \
    --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=$repo_dir,dst=/project" \
    --mount "type=bind,src=$cache_dir,dst=/cache" \
    "${run_options[@]}" \
    -e "PLEZY_JELLYFIN_URL=$server_url" \
    plezy-android-builder:8.4
printf '\nCompilation terminée : %s\n' "$repo_dir/deliverables/PlezyTV-Umbrel-Stremio.apk"
