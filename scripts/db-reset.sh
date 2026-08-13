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

# drizzle-kit は Vite を通らないため .env を読みません。
# 設定ファイルを環境に依存させたくないので、読み込みはここで行います。
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ "$USE_DOCKER" -eq 1 ]; then
  step "PostgreSQL コンテナを起動します"
  # --wait は healthcheck が通るまでブロックします
  docker compose up -d --wait
  info "起動しました（localhost:5432）"
fi

step "マイグレーションを適用します"
# drizzle-kit はプロジェクトの依存なので dlx ではなくローカルの binary を使います。
# dlx は隔離環境で解決するため、同居する drizzle-orm を見つけられません。
vp run db:migrate
info "アプリ用データベースに適用しました"

# テスト用データベースにも同じマイグレーションを当てます。
if [ -n "${TEST_DATABASE_URL:-}" ]; then
  DATABASE_URL="$TEST_DATABASE_URL" vp run db:migrate
  info "テスト用データベースに適用しました"
fi

step "seed を流し込みます"
# 既存を消してから入れ直すので、何度実行しても同じ結果になります。
vp run seed
info "完了"
