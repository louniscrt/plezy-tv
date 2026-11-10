#!/bin/bash
set -euo pipefail
export GRADLE_USER_HOME=/cache/gradle
export ANDROID_USER_HOME=/cache/android
mkdir -p "$GRADLE_USER_HOME" "$ANDROID_USER_HOME"
# This cache is dedicated to Plezy's container build. Proxy properties are runtime-only.
settings="$GRADLE_USER_HOME/gradle.properties"
: > "$settings"
proxy_url="${HTTPS_PROXY:-${https_proxy:-}}"
if [[ -n "$proxy_url" ]]; then
    proxy_endpoint="${proxy_url#*://}"
    proxy_endpoint="${proxy_endpoint%/}"
    if [[ "$proxy_endpoint" == *@* || "$proxy_endpoint" != *:* ]]; then
        echo 'Unsupported Java proxy format; configure a proxy without embedded credentials.' >&2
        exit 1
    fi
    proxy_host="${proxy_endpoint%:*}"
    proxy_port="${proxy_endpoint##*:}"
    printf 'systemProp.https.proxyHost=%s\nsystemProp.https.proxyPort=%s\nsystemProp.http.proxyHost=%s\nsystemProp.http.proxyPort=%s\nsystemProp.http.nonProxyHosts=localhost|127.*\n' "$proxy_host" "$proxy_port" "$proxy_host" "$proxy_port" >> "$settings"
fi
if [[ -f /run/plezy-cacerts ]]; then
    printf 'systemProp.javax.net.ssl.trustStore=/run/plezy-cacerts\n' >> "$settings"
fi
cd /project
gradle --no-daemon --max-workers=2 '-Dorg.gradle.jvmargs=-Xmx1536m -Dfile.encoding=UTF-8' -Pkotlin.daemon.jvmargs=-Xmx1024m "-Pplezy.jellyfinServerUrl=${PLEZY_JELLYFIN_URL:-}" "-Pplezy.stremioBackendUrl=${PLEZY_STREMIO_BACKEND_URL:-http://192.168.0.89:8081}" assembleDebug testDebugUnitTest lintDebug
mkdir -p deliverables
cp app/build/outputs/apk/debug/app-debug.apk deliverables/PlezyTV-Umbrel-Stremio.apk
printf '\nAPK : %s\n' '/project/deliverables/PlezyTV-Umbrel-Stremio.apk'
sha256sum deliverables/PlezyTV-Umbrel-Stremio.apk
