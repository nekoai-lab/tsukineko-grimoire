#!/usr/bin/env bash
# 本棚要約バックフィル（.env.local を読み込んで node を実行）
# Usage:
#   bash scripts/backfill-shelf-summaries.sh
#   DRY_RUN=1 bash scripts/backfill-shelf-summaries.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi
exec node scripts/backfill-shelf-summaries.mjs "$@"
