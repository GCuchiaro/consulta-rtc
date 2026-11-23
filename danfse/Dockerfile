# Gerador de DANFSe oficial da Receita Federal (Go), SEM modificações.
# Mesmos passos do Dockerfile oficial do repositório, com o código baixado na versão fixada
# e o commit conferido. VERSAO é só o rótulo; vale o COMMIT (o robô troca os dois).
FROM golang:1.27.1 AS builder
ARG VERSAO=teste-robo
ARG COMMIT=a3246ccc3363c3b1b281bea5c2c6b057711dd221
WORKDIR /app
RUN git clone --filter=blob:none https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse.git . \
 && git checkout -q --detach "${COMMIT}" \
 && test "$(git rev-parse HEAD)" = "${COMMIT}" || (echo "Commit diferente do esperado" && exit 1)
RUN go mod download
RUN go install github.com/swaggo/swag/cmd/swag@v1.16.6 && /go/bin/swag init -g cmd/danfse/main.go -o ./api/swagger
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o danfse-service ./cmd/danfse

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata
ENV TZ=America/Sao_Paulo
WORKDIR /app
COPY --from=builder /app/danfse-service .
RUN adduser -S -D app
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/health/live || exit 1
ENTRYPOINT ["./danfse-service"]
