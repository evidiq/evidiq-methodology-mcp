#!/usr/bin/env bash
set -euo pipefail

# Production container deployment for EVIDIQ Methodology MCP (port 3016).
# Infrastructure — 9 free verification tools, no x402 payment gate.
# Defect #15: always deploy via this script (includes --env-file).
CONTAINER_NAME="evidiq-methodology"
IMAGE_NAME="evidiq-methodology:latest"
ENV_FILE="/root/evidiq-methodology.env"
HOST_PORT="3016"

echo "Deploying ${CONTAINER_NAME} on host port ${HOST_PORT}..."

if [ ! -f "${ENV_FILE}" ]; then
  echo "Error: Environment file ${ENV_FILE} not found!"
  exit 1
fi

docker stop "${CONTAINER_NAME}" 2>/dev/null || true
docker rm "${CONTAINER_NAME}" 2>/dev/null || true

docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  --network coolify \
  --env-file "${ENV_FILE}" \
  -p "127.0.0.1:${HOST_PORT}:3000" \
  --label "traefik.enable=true" \
  --label "traefik.http.routers.methodology.rule=Host(\`mcp.evidiq.dev\`) && PathPrefix(\`/methodology\`)" \
  --label "traefik.http.routers.methodology.tls=true" \
  --label "traefik.http.routers.methodology.tls.certresolver=letsencrypt" \
  --label "traefik.http.routers.methodology.middlewares=methodology-strip" \
  --label "traefik.http.middlewares.methodology-strip.stripprefix.prefixes=/methodology" \
  --label "traefik.http.services.methodology.loadbalancer.server.port=3000" \
  "${IMAGE_NAME}"

echo "Started ${CONTAINER_NAME}."
