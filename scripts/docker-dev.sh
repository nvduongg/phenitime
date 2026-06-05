#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

COMPOSE=(docker compose -f compose.yaml -f compose.dev.yaml)

if [[ "${1:-}" == "--build" ]]; then
  shift
  "${COMPOSE[@]}" up -d --build "$@"
else
  "${COMPOSE[@]}" up -d "$@"
fi

echo ""
echo "Phenitime DEV (hot reload — sửa code là thấy ngay, không cần --build)"
echo "  Frontend (Vite):  http://localhost:${FRONTEND_DEV_PORT:-5173}"
echo "  Backend API:    http://localhost:${BACKEND_PORT:-5000}/api/v1"
echo "  Logs:           docker compose -f compose.yaml -f compose.dev.yaml logs -f"
echo ""
echo "Lần đầu hoặc sau khi đổi package.json: ./scripts/docker-dev.sh --build"
