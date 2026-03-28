import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { Storage } from '@google-cloud/storage';
import { getAdminFirestore, FieldValue } from '@/lib/firebase-admin';
import { translateToJapanese } from '@/lib/translate';
import { pdfToMarkdown } from '@/lib/pdf-to-markdown';
import { fetchArxivHtmlAsMarkdown } from '@/lib/html-to-markdown';
import { getCitationCount } from '@/lib/semantic-scholar';
import { getAdminAuth } from '@/lib/firebase-admin';
import { parseArxivCategories } from '@/lib/arxiv-categories';
import { classifyTheme } from '@/lib/classify-theme';
import type * as FirebaseFirestore from '@google-cloud/firestore';

const USER_AGENT = 'Tsukineko-Grimoire/1.0 (arXiv collector; contact via GitHub)';

// Cloud Scheduler または CRON_SECRET による管理者認証
function isAdminAuthorized(req: Request): boolean {
  if (req.headers.get('x-cloudscheduler-jobname')) return true;
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;
  return !!secret && auth === `Bearer ${secret}`;
}

// デフォルトキーワード（Firestore の settings に上書き可能）
const DEFAULT_KEYWORDS = ['LLM', 'RAG', 'Retrieval Augmented Generation', 'Agent'];
const DEFAULT_MAX_RESULTS = 5;

interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  published: string;
  author: { name: string } | Array<{ name: string }>;
  category?: { '#text'?: string; '@_term'?: string } | Array<{ '#text'?: string; '@_term'?: string }>;
}

// PDF を最大3回リトライでダウンロード
async function downloadWithRetry(url: string, maxRetries = 3): Promise<Buffer> {
  for (let i = 0; i < maxRetries; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 2000 * i));
    try {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: { 'User-Agent': USER_AGENT },
      });
      return Buffer.from(res.data);
    } catch (err) {
      if (i === maxRetries - 1) throw err;
    }
  }
  throw new Error('Download failed after retries');
}

export async function POST(req: Request) {
  const db = getAdminFirestore();

  // リクエストボディを解析
  let bodyOverride: {
    keywords?: string[];
    maxResults?: number;
    start?: number;
    arxivId?: string;      // 直接 ID 指定モード（フィルタなし）
    minCitations?: number; // 被引用数フィルタ（省略時は環境変数か50）
  } = {};
  try {
    const text = await req.text();
    if (text) bodyOverride = JSON.parse(text);
  } catch { /* body なし or 空は無視 */ }

  // ── 直接 ID 指定モード ───────────────────────────────────────
  // ログインユーザーからの単体追加リクエストはセッションクッキー認証でも許可
  if (bodyOverride.arxivId) {
    const isAdmin = isAdminAuthorized(req);
    let sessionUserId: string | null = null;
    if (!isAdmin) {
      // /api/collector は middleware の公開パスのため x-session-token が付かない。
      // Cookie ヘッダーから session を直接読んで検証する。
      const cookieHeader = req.headers.get('cookie') ?? '';
      const sessionMatch = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
      const sessionToken = sessionMatch?.[1];
      if (!sessionToken) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      try {
        const decoded = await getAdminAuth().verifySessionCookie(sessionToken, true);
        sessionUserId = decoded.uid;
      } catch {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    return handleSingleById(db, bodyOverride.arxivId, sessionUserId ?? 'system');
  }

  // バッチ収集モードは管理者のみ
  if (!isAdminAuthorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Firestore の設定を読み込む（なければデフォルト値）
  let keywords = DEFAULT_KEYWORDS;
  let maxResults = DEFAULT_MAX_RESULTS;
  try {
    const settingsDoc = await db.collection('settings').doc('collector').get();
    if (settingsDoc.exists) {
      const s = settingsDoc.data()!;
      if (Array.isArray(s.keywords) && s.keywords.length > 0) keywords = s.keywords;
      if (typeof s.maxResults === 'number') maxResults = s.maxResults;
      if (s.enabled === false && !bodyOverride.keywords) {
        return Response.json({ message: 'Collector is disabled', collected: 0 });
      }
    }
  } catch { /* 設定取得失敗はデフォルト値で続行 */ }

  // リクエストボディの値で上書き
  if (Array.isArray(bodyOverride.keywords) && bodyOverride.keywords.length > 0) {
    keywords = bodyOverride.keywords;
  }
  if (typeof bodyOverride.maxResults === 'number') {
    maxResults = Math.min(bodyOverride.maxResults, 20);
  }
  const startOffset = typeof bodyOverride.start === 'number' ? bodyOverride.start : 0;

  // 被引用数フィルタ閾値（0 = フィルタ無効）
  const minCitations =
    typeof bodyOverride.minCitations === 'number'
      ? bodyOverride.minCitations
      : parseInt(process.env.MIN_CITATION_COUNT ?? '50', 10);

  const searchQuery = `all:(${keywords.join(' OR ')})`;

  try {
    // 1. arXiv API から最新論文を取得
    const response = await axios.get('https://export.arxiv.org/api/query', {
      params: {
        search_query: searchQuery,
        start: startOffset,
        max_results: maxResults,
        sortBy: 'submittedDate',
        sortOrder: 'descending',
      },
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });

    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const data = parser.parse(response.data);
    const rawEntries = data?.feed?.entry;
    if (!rawEntries) {
      return Response.json({ collected: 0, skipped: 0, message: 'No entries from arXiv' });
    }
    const entries: ArxivEntry[] = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

    const storage = new Storage();
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);

    let collected = 0;
    let skipped = 0;
    const results: Array<{ arxivId: string; title: string; action: string }> = [];

    for (const entry of entries) {
      // arXiv ID を正規化（例: http://arxiv.org/abs/2603.16871v1 → 2603.16871）
      const rawId = typeof entry.id === 'string' ? entry.id : String(entry.id);
      const arxivId = rawId.split('/').pop()?.replace(/v\d+$/, '') ?? '';
      if (!arxivId) continue;

      // 2. 重複チェック
      const existing = await db
        .collection('documents')
        .where('arxivId', '==', arxivId)
        .limit(1)
        .get();

      if (!existing.empty) {
        skipped++;
        results.push({ arxivId, title: String(entry.title).trim(), action: 'skipped (duplicate)' });
        continue;
      }

      // 3. 被引用数フィルタ（minCitations > 0 の場合のみチェック）
      if (minCitations > 0) {
        // Semantic Scholar API のレート制限対策（1秒待機）
        await new Promise(r => setTimeout(r, 1000));
        const citations = await getCitationCount(arxivId);
        if (citations !== null && citations < minCitations) {
          skipped++;
          results.push({
            arxivId,
            title: String(entry.title).trim(),
            action: `skipped (citations=${citations} < ${minCitations})`,
          });
          continue;
        }
        // citations が null（S2未登録・新しすぎる論文）は通過させる
      }

      // 4. PDF をダウンロード（3秒インターバル）
      await new Promise(r => setTimeout(r, 3000));
      const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;

      try {
        const pdfBuffer = await downloadWithRetry(pdfUrl);

        // 5. GCS に保存
        const filename = `arxiv_${arxivId}_${Date.now()}.pdf`;
        const destination = `incoming/${filename}`;
        await bucket.file(destination).save(pdfBuffer, {
          metadata: { contentType: 'application/pdf' },
        });
        const gcsPath = `gs://${process.env.GCS_BUCKET_NAME}/${destination}`;

        // 5. メタデータを整形
        const title = String(entry.title ?? '').trim().replace(/\s+/g, ' ');
        const summary = String(entry.summary ?? '').trim().replace(/\s+/g, ' ');
        const publishedAt = String(entry.published ?? '').slice(0, 10);

        const authorsRaw = entry.author;
        const authors: string[] = Array.isArray(authorsRaw)
          ? authorsRaw.map(a => a.name).slice(0, 5)
          : authorsRaw?.name ? [authorsRaw.name] : [];

        const { category, tags } = parseArxivCategories(entry.category);

        // 6. 日本語翻訳（失敗しても続行）。title と summary が同一なら 1 回の翻訳を両方に使う
        const summaryJa = await translateToJapanese(summary);
        const titleJa = title === summary ? summaryJa : await translateToJapanese(title);

        // 7. HTML 優先で Markdown 変換して GCS に保存（失敗時は PDF フォールバック）
        const mdFilename = filename.replace(/\.pdf$/, '.md');
        const mdDestination = `incoming/${mdFilename}`;
        const paperMeta = { title, authors, category, publishedAt, arxivId, summary, summaryJa };
        let contentSource: 'html' | 'pdf' | 'metadata_only' = 'metadata_only';
        let parseStatus: 'success' | 'fallback' | 'disabled' | 'failed' = 'disabled';
        try {
          // HTML 版（arXiv HTML）を試みる
          console.log(`[collector] html fetch start: ${arxivId}`);
          const htmlMarkdown = await fetchArxivHtmlAsMarkdown(arxivId, paperMeta);
          let finalMarkdown: string;
          if (htmlMarkdown) {
            console.log(`[collector] html extraction success: ${arxivId}`);
            finalMarkdown = htmlMarkdown;
            contentSource = 'html';
            parseStatus = 'success';
          } else {
            console.log(`[collector] html extraction failed: ${arxivId}`);
            console.log(`[collector] pdf fallback entered: ${arxivId}`);
            const result = await pdfToMarkdown(pdfBuffer, paperMeta);
            finalMarkdown = result.markdown;
            parseStatus = result.parseStatus;
            contentSource = result.parseStatus === 'success' ? 'pdf' : 'metadata_only';
          }
          await bucket.file(mdDestination).save(Buffer.from(finalMarkdown, 'utf-8'), {
            metadata: { contentType: 'text/markdown' },
          });
          console.log(`[collector] markdown saved: arxivId=${arxivId} contentSource=${contentSource} parseStatus=${parseStatus}`);
        } catch (mdErr) {
          console.error(`[collector] markdown generation failed for ${arxivId}:`, (mdErr as Error).message?.slice(0, 80));
        }

        // 8. Firestore に登録
        await db.collection('documents').add({
          userId: 'system',
          filename,
          gcsPath,
          fileSize: pdfBuffer.length,
          mimeType: 'application/pdf',
          status: 'pending',
          uploadedAt: FieldValue.serverTimestamp(),
          title,
          titleJa,
          summary,
          summaryJa,
          authors,
          category,
          arxivId,
          publishedAt,
          tags,
          theme: classifyTheme(title, summary, tags),
          contentSource,
          parseStatus,
          metadata: { source: 'arxiv' },
        });

        collected++;
        results.push({ arxivId, title, action: 'collected' });
      } catch (err) {
        console.error(`Failed to process ${arxivId}:`, (err as Error).message?.slice(0, 100));
        results.push({ arxivId, title: String(entry.title).trim(), action: `error: ${(err as Error).message?.slice(0, 60)}` });
      }
    }

    console.log(`collector: collected=${collected}, skipped=${skipped}`);
    return Response.json({ collected, skipped, results });
  } catch (error) {
    console.error('Collector error:', error);
    return Response.json({ error: 'Collection failed' }, { status: 500 });
  }
}

// ── arXiv ID 直接指定で1件取得 ────────────────────────────────
async function handleSingleById(
  db: FirebaseFirestore.Firestore,
  arxivId: string,
  userId: string = 'system'
): Promise<Response> {
  // 正規化: "2005.11401v3" → "2005.11401"
  const cleanId = arxivId.trim().replace(/v\d+$/, '');

  // 重複チェック
  const existing = await db.collection('documents')
    .where('arxivId', '==', cleanId)
    .limit(1)
    .get();

  if (!existing.empty) {
    return Response.json({
      collected: 0,
      skipped: 1,
      results: [{ arxivId: cleanId, title: '', action: 'skipped (duplicate)' }],
    });
  }

  try {
    // arXiv API に id_list で直接問い合わせ
    const response = await axios.get('https://export.arxiv.org/api/query', {
      params: { id_list: cleanId, max_results: 1 },
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });

    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const data = parser.parse(response.data);
    const rawEntry = data?.feed?.entry;
    if (!rawEntry) {
      return Response.json({ collected: 0, skipped: 0, error: `ID not found: ${cleanId}` });
    }
    const entry: ArxivEntry = Array.isArray(rawEntry) ? rawEntry[0] : rawEntry;

    const title = String(entry.title ?? '').trim().replace(/\s+/g, ' ');
    const summary = String(entry.summary ?? '').trim().replace(/\s+/g, ' ');
    const publishedAt = String(entry.published ?? '').slice(0, 10);

    const authorsRaw = entry.author;
    const authors: string[] = Array.isArray(authorsRaw)
      ? authorsRaw.map(a => a.name).slice(0, 5)
      : authorsRaw?.name ? [authorsRaw.name] : [];

    const { category, tags } = parseArxivCategories(entry.category);

    // 日本語翻訳。title と summary が同一なら 1 回の翻訳を両方に使う
    const summaryJa = await translateToJapanese(summary);
    const titleJa = title === summary ? summaryJa : await translateToJapanese(title);

    // PDF ダウンロード
    const pdfUrl = `https://arxiv.org/pdf/${cleanId}.pdf`;
    const pdfBuffer = await downloadWithRetry(pdfUrl);

    // GCS に保存
    const storage = new Storage();
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);
    const filename = `arxiv_${cleanId}_${Date.now()}.pdf`;
    const destination = `incoming/${filename}`;
    await bucket.file(destination).save(pdfBuffer, {
      metadata: { contentType: 'application/pdf' },
    });
    const gcsPath = `gs://${process.env.GCS_BUCKET_NAME}/${destination}`;

    // HTML 優先で Markdown 変換して GCS に保存（失敗時は PDF フォールバック）
    let contentSource: 'html' | 'pdf' | 'metadata_only' = 'metadata_only';
    let parseStatus: 'success' | 'fallback' | 'disabled' | 'failed' = 'disabled';
    try {
      const paperMeta = { title, authors, category, publishedAt, arxivId: cleanId, summary, summaryJa };
      console.log(`[collector] html fetch start: ${cleanId}`);
      const htmlMarkdown = await fetchArxivHtmlAsMarkdown(cleanId, paperMeta);
      let finalMarkdown: string;
      if (htmlMarkdown) {
        console.log(`[collector] html extraction success: ${cleanId}`);
        finalMarkdown = htmlMarkdown;
        contentSource = 'html';
        parseStatus = 'success';
      } else {
        console.log(`[collector] html extraction failed: ${cleanId}`);
        console.log(`[collector] pdf fallback entered: ${cleanId}`);
        const result = await pdfToMarkdown(pdfBuffer, paperMeta);
        finalMarkdown = result.markdown;
        parseStatus = result.parseStatus;
        contentSource = result.parseStatus === 'success' ? 'pdf' : 'metadata_only';
      }
      const mdDestination = `incoming/${filename.replace(/\.pdf$/, '.md')}`;
      await bucket.file(mdDestination).save(Buffer.from(finalMarkdown, 'utf-8'), {
        metadata: { contentType: 'text/markdown' },
      });
      console.log(`[collector] markdown saved: arxivId=${cleanId} contentSource=${contentSource} parseStatus=${parseStatus}`);
    } catch (mdErr) {
      console.error(`[collector] markdown generation failed for ${cleanId}:`, (mdErr as Error).message?.slice(0, 80));
    }

    // Firestore に登録
    await db.collection('documents').add({
      userId,
      filename,
      gcsPath,
      fileSize: pdfBuffer.length,
      mimeType: 'application/pdf',
      status: 'pending',
      uploadedAt: FieldValue.serverTimestamp(),
      title,
      titleJa,
      summary,
      summaryJa,
      authors,
      category,
      arxivId: cleanId,
      publishedAt,
      tags,
      theme: classifyTheme(title, summary, tags),
      contentSource,
      parseStatus,
      metadata: { source: 'arxiv' },
    });

    console.log(`collector(byId): collected ${cleanId} "${title.slice(0, 50)}"`);
    return Response.json({
      collected: 1,
      skipped: 0,
      results: [{ arxivId: cleanId, title, action: 'collected' }],
    });
  } catch (err) {
    console.error(`handleSingleById error for ${cleanId}:`, (err as Error).message?.slice(0, 100));
    return Response.json({ collected: 0, skipped: 0, error: (err as Error).message?.slice(0, 100) }, { status: 500 });
  }
}

// Cloud Scheduler の GET リクエストにも対応
export const GET = POST;
