#!/usr/bin/env bash
# arXiv 論文バッチ収集スクリプト
# Usage: bash scripts/collect-papers.sh [port]
#
# 実行前に dev サーバーを起動しておいてください:
#   npm run dev -- --port 3002

PORT="${1:-3002}"
BASE_URL="http://localhost:${PORT}"
SECRET="local-dev-secret"
MAX_PER_BATCH=10

TOTAL_COLLECTED=0
TOTAL_SKIPPED=0

run_batch() {
  local label="$1"
  local keywords_json="$2"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📚 Batch: ${label}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  RESPONSE=$(curl -s -X POST "${BASE_URL}/api/collector" \
    -H "Authorization: Bearer ${SECRET}" \
    -H "Content-Type: application/json" \
    -d "{\"keywords\": ${keywords_json}, \"maxResults\": ${MAX_PER_BATCH}}")

  echo "$RESPONSE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    c = d.get('collected', 0)
    s = d.get('skipped', 0)
    print(f'  ✅ collected: {c}  ⏭  skipped: {s}')
    for r in d.get('results', []):
        icon = '✓' if r['action'] == 'collected' else '→'
        print(f'  {icon} [{r[\"arxivId\"]}] {r[\"title\"][:60]}')
except:
    print('  ⚠ Response:', sys.stdin.read()[:200])
" 2>/dev/null || echo "  Response: $RESPONSE"

  # collected 数を集計
  COLLECTED=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('collected',0))" 2>/dev/null || echo "0")
  SKIPPED=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('skipped',0))" 2>/dev/null || echo "0")
  TOTAL_COLLECTED=$((TOTAL_COLLECTED + COLLECTED))
  TOTAL_SKIPPED=$((TOTAL_SKIPPED + SKIPPED))
}

echo "🌙 Tsukineko Grimoire — arXiv Paper Collector"
echo "   Target: ${BASE_URL}"
echo "   ${MAX_PER_BATCH} papers/batch × 10 batches = max 100 papers"
echo ""

# ── バッチ定義（キーワードセット）──────────────────────────────
run_batch "Large Language Models"         '["Large Language Model", "LLM", "instruction tuning"]'
sleep 8

run_batch "RAG & Knowledge Retrieval"     '["Retrieval Augmented Generation", "RAG", "knowledge retrieval"]'
sleep 8

run_batch "AI Agents & Tool Use"          '["AI agent", "tool use", "function calling", "ReAct"]'
sleep 8

run_batch "Transformer & Attention"       '["Transformer architecture", "self-attention", "BERT", "ViT"]'
sleep 8

run_batch "RLHF & Alignment"             '["RLHF", "reinforcement learning human feedback", "alignment", "DPO"]'
sleep 8

run_batch "Multimodal Models"             '["vision language model", "multimodal", "CLIP", "image text"]'
sleep 8

run_batch "Efficient LLM"                 '["quantization", "pruning", "LoRA", "parameter efficient fine-tuning"]'
sleep 8

run_batch "Prompt Engineering"            '["prompt engineering", "chain of thought", "few-shot", "in-context learning"]'
sleep 8

run_batch "Diffusion & Generative"        '["diffusion model", "stable diffusion", "generative model", "DALL-E"]'
sleep 8

run_batch "Evaluation & Benchmarks"       '["LLM evaluation", "benchmark", "MMLU", "HumanEval"]'

# ── 結果サマリー ──────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
echo "📊 完了"
echo "   新規取得: ${TOTAL_COLLECTED} 件"
echo "   重複スキップ: ${TOTAL_SKIPPED} 件"
echo "════════════════════════════════════════════════"
echo ""
echo "⏳ Agent Builder のインデックス化は最大 48 時間かかります。"
echo "   完了後に以下で status を更新してください:"
echo "   curl -X POST ${BASE_URL}/api/admin/sync-status \\"
echo "     -H \"Authorization: Bearer ${SECRET}\""
