#!/usr/bin/env bash
# Secret Manager にサーバーサイドシークレットを登録するスクリプト
# setup-gcp.sh を実行した後に実行してください
#
# Usage: bash scripts/setup-secrets.sh
# 実行前に .env.local の値を確認してください

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-tsukineko-grimoire-dev}"
gcloud config set project "$PROJECT_ID"

create_or_update_secret() {
  local NAME="$1"
  local VALUE="$2"
  if gcloud secrets describe "$NAME" --quiet 2>/dev/null; then
    echo "🔄 Updating secret: $NAME"
    echo -n "$VALUE" | gcloud secrets versions add "$NAME" --data-file=-
  else
    echo "✨ Creating secret: $NAME"
    echo -n "$VALUE" | gcloud secrets create "$NAME" --data-file=- --replication-policy=automatic
  fi
}

# .env.local から値を読み込む（またはここに直接入力）
source "$(dirname "$0")/../.env.local" 2>/dev/null || true

echo "🔐 Registering secrets to Secret Manager..."
echo "（値が未設定の場合はプロンプトで入力してください）"
echo ""

# FIREBASE_PRIVATE_KEY
if [[ -z "${FIREBASE_PRIVATE_KEY:-}" ]]; then
  echo "FIREBASE_PRIVATE_KEY を入力（Enterで改行、Ctrl+D で完了）:"
  FIREBASE_PRIVATE_KEY=$(cat)
fi
create_or_update_secret "FIREBASE_PRIVATE_KEY" "$FIREBASE_PRIVATE_KEY"

# FIREBASE_CLIENT_EMAIL
if [[ -z "${FIREBASE_CLIENT_EMAIL:-}" ]]; then
  read -r -p "FIREBASE_CLIENT_EMAIL: " FIREBASE_CLIENT_EMAIL
fi
create_or_update_secret "FIREBASE_CLIENT_EMAIL" "$FIREBASE_CLIENT_EMAIL"

# CRON_SECRET（本番用の強いシークレット）
if [[ -z "${CRON_SECRET:-}" ]] || [[ "$CRON_SECRET" == "local-dev-secret" ]]; then
  echo "⚠️  CRON_SECRET が未設定またはデフォルト値です"
  echo "本番用シークレットを生成します..."
  # 値は画面に出さない（ターミナルの履歴・ログに残るため）
  CRON_SECRET=$(openssl rand -hex 32)
  CRON_SECRET_GENERATED=1
fi
create_or_update_secret "CRON_SECRET" "$CRON_SECRET"
if [[ "${CRON_SECRET_GENERATED:-0}" == "1" ]]; then
  echo "CRON_SECRET を作って Secret Manager に入れました（値は表示しません）"
  echo "→ GitHub Secrets の CRON_SECRET にも同じ値が要ります。値を画面に出さずに写すには："
  echo "   gcloud secrets versions access latest --secret=CRON_SECRET --project=\"$PROJECT_ID\" | gh secret set CRON_SECRET --repo nekoai-lab/tsukineko-grimoire"
fi

echo ""
echo "✅ Secret Manager へのシークレット登録が完了しました"
echo ""
echo "Cloud Run のサービスアカウントに secretmanager.secretAccessor 権限があることを確認してください:"
echo "  gcloud projects add-iam-policy-binding $PROJECT_ID \\"
echo "    --member='serviceAccount:<CLOUD_RUN_SA>@${PROJECT_ID}.iam.gserviceaccount.com' \\"
echo "    --role='roles/secretmanager.secretAccessor'"
