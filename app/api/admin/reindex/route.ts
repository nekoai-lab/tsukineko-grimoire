/**
 * /api/admin/reindex
 *
 * Firestore の documents コレクションにある既存 PDF を GCS から取得し、
 * Markdown に変換して同じバケットに保存する。
 * Agent Builder は GCS の変更を自動検知してインデックスを更新する。
 *
 * Usage:
 *   curl -X POST http://localhost:3002/api/admin/reindex \
 *     -H "Authorization: Bearer local-dev-secret" \
 *     -H "Content-Type: application/json" \
 *     -d '{"limit": 10}'   # 一度に処理する件数（省略時: 10）
 */

import { Storage } from '@google-cloud/storage';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { pdfToMarkdown } from '@/lib/pdf-to-markdown';

function isAuthorized(req: Request): boolean {
  if (req.headers.get('x-cloudscheduler-jobname')) return true;
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;
  return !!secret && auth === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let batchLimit = 10;
  try {
    const body = await req.json() as { limit?: number };
    if (typeof body.limit === 'number') batchLimit = Math.min(body.limit, 50);
  } catch { /* body なし */ }

  const db = getAdminFirestore();
  const storage = new Storage();
  const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);

  // Markdown 未生成のドキュメントを取得
  // （mdGenerated フラグがない = 未変換）
  const snapshot = await db
    .collection('documents')
    .where('mimeType', '==', 'application/pdf')
    .where('mdGenerated', '==', false)
    .limit(batchLimit)
    .get();

  // mdGenerated フィールドがないドキュメントも対象にするため、
  // フィールドなしのものを追加で取得
  const snapshotNoFlag = await db
    .collection('documents')
    .where('mimeType', '==', 'application/pdf')
    .limit(batchLimit * 2)
    .get();

  const processed = new Set<string>();
  const targets = [
    ...snapshot.docs,
    ...snapshotNoFlag.docs.filter(d => d.data().mdGenerated === undefined),
  ].filter(doc => {
    if (processed.has(doc.id)) return false;
    processed.add(doc.id);
    return true;
  }).slice(0, batchLimit);

  const results: Array<{ id: string; arxivId: string; status: string }> = [];
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

    // gs://bucket/path/to/file.pdf → path/to/file.pdf
    const bucketName = process.env.GCS_BUCKET_NAME!;
    const filePath = gcsPath.replace(`gs://${bucketName}/`, '');
    const mdPath = filePath.replace(/\.pdf$/i, '.md');

    try {
      // すでに Markdown が存在するか確認
      const [mdExists] = await bucket.file(mdPath).exists();
      if (mdExists) {
        await doc.ref.update({ mdGenerated: true });
        results.push({ id: doc.id, arxivId, status: 'skipped (md already exists)' });
        skipped++;
        continue;
      }

      // GCS から PDF を取得
      const [pdfBuffer] = await bucket.file(filePath).download();

      // Markdown 変換
      const markdown = await pdfToMarkdown(Buffer.from(pdfBuffer), {
        title: data.title ?? '',
        authors: data.authors ?? [],
        category: data.category ?? '',
        publishedAt: data.publishedAt ?? '',
        arxivId,
        summary: data.summary ?? '',
        summaryJa: data.summaryJa ?? '',
      });

      // GCS に Markdown を保存
      await bucket.file(mdPath).save(Buffer.from(markdown, 'utf-8'), {
        metadata: { contentType: 'text/markdown' },
      });

      // Firestore に変換済みフラグを付与
      await doc.ref.update({ mdGenerated: true });

      converted++;
      results.push({ id: doc.id, arxivId, status: 'converted' });

      // GCS への連続書き込みに少し間隔を空ける
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`reindex error for ${doc.id} (${arxivId}):`, (err as Error).message?.slice(0, 100));
      errors++;
      results.push({ id: doc.id, arxivId, status: `error: ${(err as Error).message?.slice(0, 60)}` });
    }
  }

  console.log(`reindex: converted=${converted}, skipped=${skipped}, errors=${errors}`);
  return Response.json({ converted, skipped, errors, total: targets.length, results });
}

export const GET = POST;
