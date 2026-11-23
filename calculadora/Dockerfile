# Calculadora oficial da Receita Federal (regime regular), SEM modificações.
# Baixa o código na versão fixada abaixo, confere o commit, gera o banco SQLite
# (Flyway) e empacota o JAR. Para atualizar: troque VERSAO e COMMIT.
FROM maven:3.9-eclipse-temurin-25 AS build
ARG VERSAO=1.7.2
ARG COMMIT=32df7196356e81f2df08e6023fc2b6dbc48036d3
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 20 --branch ${VERSAO} https://github.com/ReceitaFederal/calculadora-rtc-regime-regular.git . \
 && git rev-parse HEAD | grep -q "^${COMMIT}" || (echo "Commit diferente do esperado" && exit 1)
# O repositório não traz o .jar do Maven Wrapper; usamos o Maven da imagem.
RUN mkdir -p calculadora/db \
 && mvn -q flyway:migrate -Dflyway.configFiles=./flyway/flyway-pro.conf --batch-mode --errors \
 && mvn -q clean package -DskipTests --batch-mode

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /src/target/api-regime-geral.jar ./app.jar
COPY --from=build /src/calculadora/db/calculadora-pro.db ./calculadora/db/calculadora-pro.db
RUN useradd --system --create-home app && chown -R app /app
USER app
EXPOSE 8080
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080 && printf "GET /api/calculadora/dados-abertos/versao HTTP/1.0\r\n\r\n" >&3 && grep -q "200" <&3'
CMD ["java", "-Dspring.profiles.active=offline", "-jar", "app.jar"]
