FROM eclipse-temurin:21-jre-jammy

ARG DMD_VERSION=1.0.225
ARG DMD_SHA256=dd80213766515f25263b933d96aa92b99d688481380bd470462303c2783533a1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && mkdir -p /opt/dmd \
    && curl -fsSL "https://github.com/wardle/dmd/releases/download/v${DMD_VERSION}/dmd-server-${DMD_VERSION}.jar" -o /opt/dmd/dmd-server.jar \
    && echo "${DMD_SHA256}  /opt/dmd/dmd-server.jar" | sha256sum -c - \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY services/uk-dmd/importer/import-dmd.sh /usr/local/bin/import-dmd
RUN chmod 0755 /usr/local/bin/import-dmd

ENTRYPOINT ["/usr/local/bin/import-dmd"]