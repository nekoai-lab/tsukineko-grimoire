/**
 * /api/paper-figures?arxivId=XXXX
 *
 * arXiv HTML 版から代表図・結果表を抽出して返す。
 * ブラウザは返された URL を直接 <img> タグで表示する（GCS 保存なし）。
 *
 * 代表図の選定ルール：
 * 1. キャプションに overview / architecture / framework / proposed / pipeline
 *    / system / model を含む figure を優先
 * 2. なければ本文中で最初に登場する figure
 * 3. 最大 3 件を返す
 *
 * 結果表の選定ルール：
 * 1. キャプションに result / comparison / performance / accuracy / baseline
 *    / evaluation / benchmark を含む table を優先
 * 2. 行数 2〜25、列数 2〜10 のものに限定（大きすぎる表は除外）
 * 3. 最大 2 件を返す
 */

import * as cheerio from 'cheerio';
import { getAdminFirestore } from '@/lib/firebase-admin';
import {
  getCachedPaperFigureCaption,
  savePaperFigureCaptionTranslation,
} from '@/lib/paper-figure-caption-cache';
import { normalizeSnippetSourceText, SNIPPET_TARGET_LANG_JA } from '@/lib/translation-snippet-cache';
import { translateToJapanese } from '@/lib/translate';

// キャッシュを無効化（古いURLがキャッシュされて図が壊れる問題を防ぐ）
export const dynamic = 'force-dynamic';

interface Figure {
  url: string;
  caption: string;
  captionJa: string;
  label: string;
}

export interface ResultTable {
  caption: string;
  captionJa: string;
  /** rowspan/colspan を含む複雑な表。rawHtml でアプリ内描画する */
  isComplex: boolean;
  /** 複雑な表の生 HTML（コンテナ含む） */
  rawHtml?: string;
  /** 原文確認用の arXiv HTML URL */
  arxivUrl: string;
  headers: string[];
  rows: string[][];
}

const FIGURE_PRIORITY_KEYWORDS = [
  'overview', 'architecture', 'framework', 'proposed', 'pipeline',
  'system', 'model', 'approach', 'method', 'illustration',
];

const TABLE_PRIORITY_KEYWORDS = [
  'result', 'results', 'comparison', 'performance', 'accuracy',
  'baseline', 'evaluation', 'benchmark', 'ablation', 'f1', 'bleu', 'rouge',
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const arxivId = searchParams.get('arxivId')?.trim();

  if (!arxivId) {
    return Response.json({ figures: [], tables: [] });
  }

  // arXiv HTML 版を取得
  const htmlUrl = `https://arxiv.org/html/${arxivId}`;
  let html: string;
  let baseUrl: string = htmlUrl.endsWith('/') ? htmlUrl : htmlUrl + '/';
  try {
    const res = await fetch(htmlUrl, {
      headers: { 'User-Agent': 'TsukinekoGrimoire/1.0 (research tool)' },
      signal: AbortSignal.timeout(30000), // 20s → 30s に延長
      cache: 'no-store',                  // arXiv への fetch は常に最新を取得
    });
    if (!res.ok) {
      console.warn(`[paper-figures] arXiv HTML not available: ${arxivId} (HTTP ${res.status})`);
      return Response.json({ figures: [], tables: [] });
    }
    // redirect 後の最終 URL をベース URL に使う（例: /html/2603.19230 → /html/2603.19230v1/）
    const finalUrl = res.url || htmlUrl;
    baseUrl = finalUrl.endsWith('/') ? finalUrl : finalUrl + '/';
    html = await res.text();
    console.log(`[paper-figures] fetched HTML for ${arxivId}: ${html.length} bytes (base: ${baseUrl})`);
  } catch (err) {
    console.warn(`[paper-figures] fetch failed: ${arxivId}`, (err as Error).message?.slice(0, 80));
    return Response.json({ figures: [], tables: [] });
  }

  try {
    const $ = cheerio.load(html);

    // ── 図の抽出 ─────────────────────────────────────────────────────
    const allFigures: Figure[] = [];

    $('figure').each((_, el) => {
      const figure = $(el);

      // <img> または <picture><source> から src を取得
      const img = figure.find('img').first();
      const src = img.attr('src')
        ?? img.attr('data-src')
        ?? figure.find('picture source').first().attr('srcset')?.split(' ')[0]
        ?? '';
      if (!src) return;

      // data URI はスキップ（外部 SVG・PNG 等は <img> で表示可能なので除外しない）
      if (src.startsWith('data:')) return;

      let url: string;
      try {
        // LaTeXML 形式の src は "2603.19223v1/x1.png" のように
        // arXiv ID + バージョン から始まる相対パスになる場合がある。
        // この場合 baseUrl が "/html/2603.19223/" だと
        //   → /html/2603.19223/2603.19223v1/x1.png (404)
        // と二重パスになるため、/html/ を基準として直接解決する。
        const ARXIV_VERSIONED_PREFIX = /^\d{4}\.\d{4,5}v?\d*\//;
        if (ARXIV_VERSIONED_PREFIX.test(src)) {
          url = `https://arxiv.org/html/${src}`;
        } else {
          url = new URL(src, baseUrl).href;
        }
      } catch {
        return;
      }

      if (!url.includes('arxiv.org')) return;

      const captionEl = figure.find('figcaption');
      const caption = captionEl.text().trim().replace(/\s+/g, ' ').slice(0, 300);
      const label = figure.attr('id') ?? img.attr('id') ?? '';

      // ブラウザから直接 arXiv に画像リクエストするとブロックされる場合があるため
      // サーバーサイドプロキシ経由の URL に変換する
      const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`;
      allFigures.push({ url: proxyUrl, caption, captionJa: '', label });
    });

    const prioritizedFigs: Figure[] = [];
    const restFigs: Figure[] = [];
    for (const fig of allFigures) {
      const lower = fig.caption.toLowerCase();
      if (FIGURE_PRIORITY_KEYWORDS.some(kw => lower.includes(kw))) {
        prioritizedFigs.push(fig);
      } else {
        restFigs.push(fig);
      }
    }
    const selectedFigs = [...prioritizedFigs, ...restFigs].slice(0, 3);

    // ── 表の抽出 ─────────────────────────────────────────────────────
    const candidateTables: { score: number; table: ResultTable }[] = [];

    $('table').each((_, el) => {
      const tableEl = $(el);

      // ネストした table はスキップ
      if (tableEl.parents('table').length > 0) return;

      // キャプション（table 直下の caption か、ltx_table コンテナの figcaption）
      // <figure> は汎用的すぎるため使わない
      const captionRaw =
        tableEl.find('caption').first().text().trim() ||
        tableEl.closest('.ltx_table').find('figcaption').first().text().trim();
      const caption = captionRaw.replace(/\s+/g, ' ').slice(0, 300);

      // rowspan / colspan を持つセルが存在するか検出
      const hasSpans = tableEl.find('th[rowspan], td[rowspan], th[colspan], td[colspan]').filter((_, cell) => {
        const rs = parseInt($(cell).attr('rowspan') ?? '1', 10);
        const cs = parseInt($(cell).attr('colspan') ?? '1', 10);
        return rs > 1 || cs > 1;
      }).length > 0;

      // 共通スコア計算ヘルパー
      const captionLower = caption.toLowerCase();
      const kwMatches = TABLE_PRIORITY_KEYWORDS.filter(kw => captionLower.includes(kw)).length;
      // キャプションがある表には最低スコアを付与（キーワード一致なしでも除外しない）
      const baseScore = caption.length > 5 ? 0.5 : 0;

      if (hasSpans) {
        // 複雑な表：rawHtml をアプリ内描画用に保存
        const score = baseScore + kwMatches * 3;
        if (score <= 0) return; // キャプションも一致もなければスキップ

        // LaTeXML 専用コンテナ（.ltx_table）のみに絞る
        // <figure> は汎用的すぎるため使わない（本文テキストを巻き込む恐れがある）
        const ltxContainer = tableEl.closest('.ltx_table');
        const rawHtml = ltxContainer.length
          ? $.html(ltxContainer)
          : $.html(tableEl);

        candidateTables.push({
          score,
          table: {
            caption,
            captionJa: '',
            isComplex: true,
            rawHtml,
            arxivUrl: htmlUrl,
            headers: [],
            rows: [],
          },
        });
        return;
      }

      // シンプルな表：行を収集
      const rows: string[][] = [];
      tableEl.find('tr').each((_, tr) => {
        const cells: string[] = [];
        $(tr).find('th, td').each((_, cell) => {
          cells.push($(cell).text().trim().replace(/\s+/g, ' ').slice(0, 80));
        });
        if (cells.length > 0) rows.push(cells);
      });

      if (rows.length < 2 || rows.length > 25) return;
      const colCount = Math.max(...rows.map(r => r.length));
      if (colCount < 2 || colCount > 12) return;

      // 全行を同じ列数に揃える
      const normalized = rows.map(r => {
        const padded = [...r];
        while (padded.length < colCount) padded.push('');
        return padded.slice(0, colCount);
      });

      const headers = normalized[0];
      const dataRows = normalized.slice(1);

      const totalCells = dataRows.reduce((s, r) => s + r.length, 0);
      const numericCells = dataRows.reduce(
        (s, r) => s + r.filter(c => /[\d.]+/.test(c)).length,
        0
      );
      const numericRatio = totalCells > 0 ? numericCells / totalCells : 0;

      // キャプションあり表には baseScore を加算（= score=0 での全滅を防ぐ）
      const score = baseScore + kwMatches * 3 + numericRatio * 2 + Math.min(rows.length, 10) * 0.1;
      if (score <= 0) return; // キャプションも数値もなければスキップ

      candidateTables.push({
        score,
        table: { caption, captionJa: '', isComplex: false, arxivUrl: htmlUrl, headers, rows: dataRows },
      });
    });

    // スコア降順でソートして上位 2 件（score > 0 フィルタは baseScore 付与により不要）
    candidateTables.sort((a, b) => b.score - a.score);
    const selectedTables = candidateTables
      .slice(0, 2)
      .map(c => c.table);

    // ── 翻訳（並列・Firestore キャッシュ） ───────────────────────────
    const db = getAdminFirestore();
    await Promise.all([
      ...selectedFigs.map(async fig => {
        if (!fig.caption) return;
        try {
          const normalized = normalizeSnippetSourceText(fig.caption);
          if (!normalized) return;
          const cached = await getCachedPaperFigureCaption(
            db,
            arxivId,
            fig.caption,
            SNIPPET_TARGET_LANG_JA
          );
          if (cached !== null) {
            fig.captionJa = cached;
            return;
          }
          const ja = await translateToJapanese(normalized);
          fig.captionJa = ja;
          if (ja) {
            await savePaperFigureCaptionTranslation(
              db,
              arxivId,
              fig.caption,
              SNIPPET_TARGET_LANG_JA,
              ja
            );
          }
        } catch { /* 無視 */ }
      }),
      ...selectedTables.map(async tbl => {
        if (!tbl.caption) return;
        try {
          const normalized = normalizeSnippetSourceText(tbl.caption);
          if (!normalized) return;
          const cached = await getCachedPaperFigureCaption(
            db,
            arxivId,
            tbl.caption,
            SNIPPET_TARGET_LANG_JA
          );
          if (cached !== null) {
            tbl.captionJa = cached;
            return;
          }
          const ja = await translateToJapanese(normalized);
          tbl.captionJa = ja;
          if (ja) {
            await savePaperFigureCaptionTranslation(
              db,
              arxivId,
              tbl.caption,
              SNIPPET_TARGET_LANG_JA,
              ja
            );
          }
        } catch { /* 無視 */ }
      }),
    ]);

    console.log(`[paper-figures] ${arxivId}: figures=${selectedFigs.length}, tables=${selectedTables.length} (complex=${selectedTables.filter(t=>t.isComplex).length})`);
    if (selectedFigs.length > 0) {
      console.log(`[paper-figures] figure URLs: ${selectedFigs.map(f => f.url).join(' | ')}`);
    }
    return Response.json({ figures: selectedFigs, tables: selectedTables });
  } catch (err) {
    console.error(`[paper-figures] parse error: ${arxivId}`, (err as Error).message?.slice(0, 100));
    return Response.json({ figures: [], tables: [] });
  }
}
