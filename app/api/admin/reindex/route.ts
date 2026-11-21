/**
 * /api/admin/reindex
 *
 * Firestore の documents コレクションにある既存 PDF を対象に Markdown を再生成し、
 * GCS に保存する。Agent Builder は GCS の変更を自動検知してインデックスを更新する。
 *
 * モード:
 *   mode=html  (デフォルト) : arXiv HTML 版を優先取得、失敗時は PDF にフォールバック
 *   mode=pdf               : PDF テキスト抽出のみ（HTML を使わない）
 *
 * Usage:
 *   curl -X POST http://localhost:3002/api/admin/reindex \
 *     -H "Authorization: Bearer local-dev-secret" \
 *     -H "Content-Type: application/json" \
 *     -d '{"limit": 10, "mode": "html"}'
 *
 * 過去分の一括アップグレード:
 *   htmlIndexed フラグがない（または false の）論文を対象にして繰り返し呼び出す。
 *   {"limit": 20, "mode": "html", "onlyNotHtmlIndexed": true}
 */

import { Storage } from '@google-cloud/storage';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { pdfToMarkdown } from '@/lib/pdf-to-markdown';
import { fetchArxivHtmlAsMarkdown } from '@/lib/html-to-markdown';
import { isCronAuthorized } from '@/lib/cron-auth';

function isAuthorized(req: Request): boolean {
  return isCronAuthorized(req);
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let batchLimit = 10;
  let mode: 'html' | 'pdf' = 'html';
  let onlyNotHtmlIndexed = false;

  try {
    const body = await req.json() as { limit?: number; mode?: string; onlyNotHtmlIndexed?: boolean };
    if (typeof body.limit === 'number') batchLimit = Math.min(body.limit, 50);
    if (body.mode === 'pdf') mode = 'pdf';
    if (body.onlyNotHtmlIndexed === true) onlyNotHtmlIndexed = true;
  } catch { /* body なし */ }

  const db = getAdminFirestore();
  const storage = new Storage();
  const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);

  // 対象ドキュメントを取得
  // onlyNotHtmlIndexed=true の場合は htmlIndexed フラグが未設定 or false のものを優先
  const snapshotNoFlag = await db
    .collection('documents')
    .where('mimeType', '==', 'application/pdf')
    .limit(batchLimit * 3)
    .get();

  const processed = new Set<string>();
  const targets = snapshotNoFlag.docs
    .filter(doc => {
      if (processed.has(doc.id)) return false;
      processed.add(doc.id);
      const d = doc.data();
      if (onlyNotHtmlIndexed) {
        // htmlIndexed が 'html' または 'pdf'（処理済み）のものはスキップ
        return d.htmlIndexed !== 'html' && d.htmlIndexed !== 'pdf';
      }
      return true;
    })
    .slice(0, batchLimit);

  const results: Array<{ id: string; arxivId: string; status: string; source?: string }> = [];
  let converted = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of targets) {
    const data = doc.data();
    const arxivId: string = data.arxivId ?? '';
    const gcsPath: string = data.gcsPath ?? '';

    if (!gcsPath) {
      results.push({ id: doc.id, arxivId, status: 'skipped (no gcsPath)' });
      skipped++;
      continue;
    }

    const bucketName = process.env.GCS_BUCKET_NAME!;
    const filePath = gcsPath.replace(`gs://${bucketName}/`, '');
    const mdPath = filePath.replace(/\.pdf$/i, '.md');

    try {
      const paperMeta = {
        title: data.title ?? '',
        authors: data.authors ?? [],
        category: data.category ?? '',
        publishedAt: data.publishedAt ?? '',
        arxivId,
        summary: data.summary ?? '',
        summaryJa: data.summaryJa ?? '',
      };

      let markdown: string | null = null;
      let source: 'html' | 'pdf' = 'pdf';

      if (mode === 'html' && arxivId) {
        // HTML 版を試みる（arXiv に 3 秒インターバルは呼び出し側で考慮）
        markdown = await fetchArxivHtmlAsMarkdown(arxivId, paperMeta);
        if (markdown) source = 'html';
      }

      if (!markdown) {
        // HTML なし・PDF モード：GCS から PDF を取得してテキスト抽出
        const [pdfBuffer] = await bucket.file(filePath).download();
        const result = await pdfToMarkdown(Buffer.from(pdfBuffer), paperMeta);
        markdown = result.markdown;
        source = result.parseStatus === 'success' ? 'pdf' : 'pdf'; // pdf モードは常に 'pdf' 扱い
      }

      // GCS に Markdown を保存（上書き）
      await bucket.file(mdPath).save(Buffer.from(markdown, 'utf-8'), {
        metadata: { contentType: 'text/markdown' },
      });

      // Firestore にフラグを更新
      // htmlIndexed: 'html' | 'pdf' の文字列で区別し、どちらでも処理済みとして扱う
      await doc.ref.update({
        mdGenerated: true,
        htmlIndexed: source, // 'html' または 'pdf'
        htmlIndexedAt: new Date().toISOString(),
      });

      converted++;
      results.push({ id: doc.id, arxivId, status: 'converted', source });

      // arXiv への連続リクエストを避けるため少し待機
      await new Promise(r => setTimeout(r, mode === 'html' ? 3000 : 200));
    } catch (err) {
      console.error(`reindex error for ${doc.id} (${arxivId}):`, (err as Error).message?.slice(0, 100));
      errors++;
      results.push({ id: doc.id, arxivId, status: `error: ${(err as Error).message?.slice(0, 60)}` });
    }
  }

  console.log(`reindex(mode=${mode}): converted=${converted}, skipped=${skipped}, errors=${errors}`);
  return Response.json({ mode, converted, skipped, errors, total: targets.length, results });
}

export const GET = POST;
