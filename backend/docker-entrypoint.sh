#!/bin/sh
set -e

echo "[backend] Running Prisma migrations..."
if ! npx prisma migrate deploy; then
  echo "[backend] migrate deploy failed (e.g. existing schema without migration history); syncing with db push..."
  npx prisma db push --skip-generate
fi

echo "[backend] Starting API..."
exec "$@"
