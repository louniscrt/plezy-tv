# syntax=docker/dockerfile:1
FROM gradle:8.4-jdk17
USER root
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]
ENV ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH="/opt/android-sdk/platform-tools:${PATH}"
# Optional CA mounts support managed build environments without retaining their CA in the image.
RUN --mount=type=secret,id=ca_bundle --mount=type=secret,id=proxy_ca \
    command -v curl && command -v unzip && test -f /etc/ssl/certs/ca-certificates.crt && \
    if [ -f /run/secrets/ca_bundle ]; then export SSL_CERT_FILE=/run/secrets/ca_bundle CURL_CA_BUNDLE=/run/secrets/ca_bundle REQUESTS_CA_BUNDLE=/run/secrets/ca_bundle; fi && \
    if [ -f /run/secrets/proxy_ca ]; then \
      cp "$JAVA_HOME/lib/security/cacerts" /tmp/sdk-cacerts; \
      keytool -importcert -noprompt -alias build-proxy -file /run/secrets/proxy_ca -keystore /tmp/sdk-cacerts -storepass changeit; \
      export JAVA_TOOL_OPTIONS='-Djavax.net.ssl.trustStore=/tmp/sdk-cacerts'; \
    fi && \
    curl -fsSL --retry 2 https://dl.google.com/android/repository/commandlinetools-linux-16111833_latest.zip -o /tmp/android-tools.zip && \
    echo 'e025545c62a8e64c7559119566a569fb1dec5f60  /tmp/android-tools.zip' | sha1sum -c - && \
    mkdir -p "$ANDROID_HOME/cmdline-tools" && \
    unzip -q /tmp/android-tools.zip -d "$ANDROID_HOME/cmdline-tools" && \
    mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest" && \
    (yes || true) | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null && \
    "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" 'platforms;android-34' 'build-tools;34.0.0' 'platform-tools' && \
    rm -f /tmp/android-tools.zip /tmp/sdk-cacerts && \
    chmod -R a+rX "$ANDROID_HOME"
COPY container-build.sh /usr/local/bin/plezy-build
RUN chmod 755 /usr/local/bin/plezy-build
USER gradle
WORKDIR /project
ENTRYPOINT ["/usr/local/bin/plezy-build"]
