#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example — review passwords before production use."
fi

docker compose up -d --build "$@"

echo ""
echo "Phenitime is starting..."
echo "  Web UI:  http://localhost:${APP_PORT:-8080}"
echo "  Logs:    docker compose logs -f"
echo "  Seed DB: docker compose exec backend npm run seed"
