# Gateway (FastAPI) + site estático + MCP. Contexto de build: raiz do repositório.
# O contexto extra "calc" é a imagem da calculadora oficial: dela vem uma cópia do
# banco SQLite oficial (somente leitura), para saber quais cClassTrib têm lista de NCM/NBS.
#   docker build --build-context calc=docker-image://consulta-rtc-calculadora:latest -f gateway/Dockerfile .
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 WEB_DIR=/app/web CALC_DB=/app/calculadora-pro.db
COPY --from=calc /app/calculadora/db/calculadora-pro.db /app/calculadora-pro.db
WORKDIR /app/gateway
COPY gateway/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY gateway/app ./app
COPY web /app/web
RUN useradd --uid 1000 --create-home app
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/saude', timeout=4)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
