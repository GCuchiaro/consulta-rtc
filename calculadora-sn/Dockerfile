# Calculadora oficial da Receita Federal (Simples Nacional), SEM modificações.
# Baixa o código no commit fixado (VERSAO é só o rótulo), confere e empacota o JAR. O banco SQLite é o
# mesmo da calculadora do regime regular (o README oficial manda gerá-lo com os scripts de lá):
# vem da imagem dela pelo contexto extra "calc".
#   docker build --build-context calc=docker-image://consulta-rtc-calculadora:latest calculadora-sn
FROM maven:3.9-eclipse-temurin-25 AS build
ARG VERSAO=1.0.2-1-ga926d5a
ARG COMMIT=a926d5a76095ac0295a6612a9a54db7ffead2396
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --filter=blob:none https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional.git . \
 && git checkout -q --detach "${COMMIT}" \
 && test "$(git rev-parse HEAD)" = "${COMMIT}" || (echo "Commit diferente do esperado" && exit 1)
RUN mvn -q clean package -DskipTests --batch-mode

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /src/target/api-simples-nacional.jar ./app.jar
COPY --from=calc /app/calculadora/db/calculadora-pro.db ./calculadora/db/calculadora-pro.db
RUN useradd --system --create-home app && chown -R app /app
USER app
EXPOSE 8082
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/8082 && printf "GET /api/versao HTTP/1.0\r\n\r\n" >&3 && grep -q "200" <&3'
CMD ["java", "-Dspring.profiles.active=offline", "-jar", "app.jar"]
