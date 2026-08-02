# ---- Stage 1: frontend ----
FROM node:22-slim AS webbuild
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci
COPY project_config.yaml ./
COPY frontend/ frontend/
RUN cd frontend && npm run build

# ---- Stage 2: runtime ----
FROM python:3.13-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg sqlite3 rclone \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt backend/
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY project_config.yaml ./
COPY backend/ backend/
COPY --from=webbuild /build/frontend/dist frontend/dist
WORKDIR /app/backend
EXPOSE 8080
CMD ["uvicorn", "serve:app", "--host", "0.0.0.0", "--port", "8080", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
