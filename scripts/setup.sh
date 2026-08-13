#!/usr/bin/env bash
# clone 直後の環境を一度で立ち上げます。
#   vp run setup
#
# 何度実行しても壊れません。既にある .env は上書きしません。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
info() { printf '    %s\n' "$1"; }
warn() { printf '\033[33m    ! %s\033[0m\n' "$1"; }
fail() { printf '\033[31m    x %s\033[0m\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------------------
step ".env を用意します"
# ---------------------------------------------------------------------------
if [ -f .env ]; then
  info ".env は既にあります。上書きしません"
else
  cp .env.example .env
  info ".env.example から .env を作りました"
fi

# COOKIE_SECRET が空なら生成して埋めます。
# 署名鍵が無いと Cookie を書き換えるだけで他人になれるため、空のままでは起動させません。
if grep -qE '^COOKIE_SECRET=$' .env; then
  if ! command -v openssl >/dev/null 2>&1; then
    fail "openssl が見つかりません。.env の COOKIE_SECRET を手で埋めてください"
  fi
  SECRET="$(openssl rand -base64 32)"
  # 区切り文字に | を使い、base64 の / と衝突しないようにします
  if sed --version >/dev/null 2>&1; then
    sed -i "s|^COOKIE_SECRET=$|COOKIE_SECRET=${SECRET}|" .env   # GNU sed
  else
    sed -i "" "s|^COOKIE_SECRET=$|COOKIE_SECRET=${SECRET}|" .env # BSD sed (macOS)
  fi
  info "COOKIE_SECRET を生成しました"
else
  info "COOKIE_SECRET は設定済みです"
fi

# ---------------------------------------------------------------------------
step "依存をインストールします"
# ---------------------------------------------------------------------------
if ! command -v vp >/dev/null 2>&1; then
  fail "vp が見つかりません。https://viteplus.dev/guide/ の手順で Vite+ を入れてください"
fi
vp install
info "完了"

# ---------------------------------------------------------------------------
step "PostgreSQL を起動します"
# ---------------------------------------------------------------------------
# .env の DATABASE_URL が localhost を指していなければ、外部の DB を使う構成と判断して
# Docker には触りません。クラウド環境などで Docker が使えない場合はこの経路になります。
DB_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"

case "$DB_URL" in
  *localhost*|*127.0.0.1*)
    if ! command -v docker >/dev/null 2>&1; then
      warn "docker が見つかりません"
      warn "外部の PostgreSQL を使う場合は .env の DATABASE_URL と TEST_DATABASE_URL を書き換えて、"
      warn "このスクリプトを再実行してください"
      exit 1
    fi
    bash scripts/db-reset.sh
    ;;
  *)
    info "DATABASE_URL が外部ホストを指しています。Docker は起動しません"
    bash scripts/db-reset.sh --no-docker
    ;;
esac

# ---------------------------------------------------------------------------
step "セットアップが完了しました"
# ---------------------------------------------------------------------------
info "開発サーバー:  vp dev"
info "テスト:        vp test"
info "DB のやり直し: vp run db:reset"
