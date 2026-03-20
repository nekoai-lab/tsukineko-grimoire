#!/usr/bin/env bash
# 厳選 arXiv 論文一括取得スクリプト
# Usage: bash scripts/curated-papers.sh [port]
#
# 事前準備:
#   タブ①: WATCHPACK_POLLING=true npm run dev -- --port 3002
#   タブ②: bash scripts/curated-papers.sh 3002

PORT="${1:-3002}"
BASE_URL="http://localhost:${PORT}"
SECRET="local-dev-secret"
CSV="$(dirname "$0")/curated-ids.csv"

if [[ ! -f "$CSV" ]]; then
  echo "❌ curated-ids.csv が見つかりません: $CSV"
  exit 1
fi

TOTAL=0
COLLECTED=0
SKIPPED=0
ERRORS=0

# CSV のヘッダーをスキップして1行ずつ処理
tail -n +2 "$CSV" | while IFS=',' read -r arxiv_id title category; do
  TOTAL=$((TOTAL + 1))
  short_title="${title:0:55}"

  echo ""
  echo "[$TOTAL] arXiv:${arxiv_id} — ${short_title}..."
  echo "        カテゴリ: ${category}"

  RESPONSE=$(curl -s -m 120 -X POST "${BASE_URL}/api/collector" \
    -H "Authorization: Bearer ${SECRET}" \
    -H "Content-Type: application/json" \
    -d "{\"arxivId\":\"${arxiv_id}\"}")

  # collected / skipped を解析
  C=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('collected',0))" 2>/dev/null || echo "0")
  S=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('skipped',0))" 2>/dev/null || echo "0")
  ERR=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null || echo "")

  if [[ -n "$ERR" && "$ERR" != "None" && "$ERR" != "" ]]; then
    echo "        ⚠  エラー: ${ERR}"
    ERRORS=$((ERRORS + 1))
  elif [[ "$C" == "1" ]]; then
    echo "        ✅ 取得完了"
    COLLECTED=$((COLLECTED + 1))
  elif [[ "$S" == "1" ]]; then
    echo "        ⏭  重複スキップ（既に登録済み）"
    SKIPPED=$((SKIPPED + 1))
  else
    echo "        ⚠  不明なレスポンス: ${RESPONSE:0:80}"
    ERRORS=$((ERRORS + 1))
  fi

  # arXiv のレートリミット対策（4秒待機）
  sleep 4

done

echo ""
echo "════════════════════════════════════════════════"
echo "📊 完了サマリー"
echo "   処理件数 : ${TOTAL} 件"
echo "════════════════════════════════════════════════"
echo ""
echo "⏳ Agent Builder のインデックス化は最大 48 時間かかります。"
echo "   完了後に以下でステータスを更新してください:"
echo ""
echo "   curl -X POST ${BASE_URL}/api/admin/sync-status \\"
echo "     -H \"Authorization: Bearer ${SECRET}\""
