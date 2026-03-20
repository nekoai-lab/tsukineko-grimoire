// pdf-parse は ESM デフォルトエクスポートを持たないため require を使用
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (
  dataBuffer: Buffer,
  options?: object
) => Promise<{ text: string; numpages: number }>;

export interface PaperMetadata {
  title: string;
  authors: string[];
  category: string;
  publishedAt: string;
  arxivId: string;
  summary: string;
  summaryJa: string;
}

/**
 * PDF バッファをテキスト抽出してメタデータ注入型 Markdown に変換する。
 * Agent Builder がインデックス化しやすい構造にし、日本語クエリとの
 * マッチング精度を上げる。
 */
export async function pdfToMarkdown(
  pdfBuffer: Buffer,
  meta: PaperMetadata
): Promise<string> {
  let bodyText = '';

  try {
    const parsed = await pdfParse(pdfBuffer, {
      // ページ区切りを改行2つに変換
      pagerender: (pageData) => {
        return pageData.getTextContent().then((textContent: { items: Array<{ str: string }> }) => {
          return textContent.items.map((item) => item.str).join(' ');
        });
      },
    });
    bodyText = cleanPdfText(parsed.text);
  } catch (err) {
    console.warn('pdf-parse failed, using metadata-only markdown:', (err as Error).message?.slice(0, 80));
    // PDF解析失敗時はメタデータのみのMarkdownを返す
  }

  return buildMarkdown(meta, bodyText);
}

/**
 * PDFテキストのクリーニング:
 * - 連続する空白・改行を圧縮
 * - 非印刷文字を除去
 * - ヘッダー/フッターのページ番号パターンを削除
 */
function cleanPdfText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[^\x20-\x7E\n\u3000-\u9FFF\uFF00-\uFFEF]/g, ' ') // 非印刷文字を空白に
    .replace(/[ \t]{3,}/g, '  ')               // 3つ以上の連続空白を2つに
    .replace(/\n{4,}/g, '\n\n\n')              // 4行以上の空行を3行に
    .replace(/^\s*\d+\s*$/gm, '')             // 単独行のページ番号を削除
    .trim();
}

/**
 * メタデータ + 本文テキストから Markdown を組み立てる。
 * 先頭にメタデータブロックを置くことで、Agent Builder が
 * 各チャンクのコンテキストを把握しやすくなる。
 */
function buildMarkdown(meta: PaperMetadata, bodyText: string): string {
  const authorsStr = meta.authors.length > 0 ? meta.authors.join(', ') : 'Unknown';
  const arxivUrl = meta.arxivId
    ? `https://arxiv.org/abs/${meta.arxivId}`
    : '';

  const lines: string[] = [];

  // ── ヘッダー ──────────────────────────────────────────────────
  lines.push(`# ${meta.title}`);
  lines.push('');
  lines.push(`**Authors:** ${authorsStr}`);
  if (meta.publishedAt) lines.push(`**Published:** ${meta.publishedAt}`);
  if (meta.category)    lines.push(`**Category:** ${meta.category}`);
  if (arxivUrl)         lines.push(`**Source:** ${arxivUrl}`);
  lines.push('');

  // ── 日本語概要（日本語クエリとのマッチング向上） ────────────
  if (meta.summaryJa) {
    lines.push('## 日本語概要');
    lines.push('');
    lines.push(meta.summaryJa);
    lines.push('');
  }

  // ── 英語 Abstract ─────────────────────────────────────────────
  if (meta.summary) {
    lines.push('## Abstract');
    lines.push('');
    lines.push(meta.summary);
    lines.push('');
  }

  // ── 本文 ──────────────────────────────────────────────────────
  if (bodyText) {
    lines.push('---');
    lines.push('');
    lines.push(bodyText);
  }

  return lines.join('\n');
}
