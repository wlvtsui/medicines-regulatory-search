FROM eclipse-temurin:21-jre-jammy

ARG CLOJURE_TOOLS_VERSION=1.12.0.1530

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates curl git \
    && curl -fsSLO "https://download.clojure.org/install/linux-install-${CLOJURE_TOOLS_VERSION}.sh" \
    && chmod 0755 "linux-install-${CLOJURE_TOOLS_VERSION}.sh" \
    && ./linux-install-${CLOJURE_TOOLS_VERSION}.sh \
    && rm "linux-install-${CLOJURE_TOOLS_VERSION}.sh" \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY services/uk-dmd/deps.edn ./deps.edn
RUN clojure -P -M:run
COPY services/uk-dmd/src ./src
COPY services/uk-dmd/start-dmd.sh /usr/local/bin/start-dmd
RUN chmod 0755 /usr/local/bin/start-dmd

ENV DMD_DATA_DIR=/data
EXPOSE 8081
ENTRYPOINT ["/usr/local/bin/start-dmd"]