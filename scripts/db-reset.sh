#!/usr/bin/env bash
# データベースを起動し、マイグレーションを当て、seed を流し込みます。
#   vp run db:reset
#
# --no-docker を渡すと Docker には触らず、.env の DATABASE_URL が指す先に対して
# マイグレーションと seed だけを実行します。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

USE_DOCKER=1
[ "${1:-}" = "--no-docker" ] && USE_DOCKER=0

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
info() { printf '    %s\n' "$1"; }
warn() { printf '\033[33m    ! %s\033[0m\n' "$1"; }

if [ "$USE_DOCKER" -eq 1 ]; then
  step "PostgreSQL コンテナを起動します"
  # --wait は healthcheck が通るまでブロックします
  docker compose up -d --wait
  info "起動しました（localhost:5432）"
fi

step "マイグレーションを適用します"
if [ -f drizzle.config.ts ]; then
  vp dlx drizzle-kit migrate
  info "完了"
else
  warn "drizzle.config.ts がまだありません。マイグレーションを飛ばします"
  warn "スキーマ定義は issue #2 で入ります"
fi

step "seed を流し込みます"
if [ -f src/db/seed.ts ]; then
  vp run seed
  info "完了"
else
  warn "src/db/seed.ts がまだありません。seed を飛ばします"
  warn "各状態のサンプルは issue #11 で入ります"
fi
