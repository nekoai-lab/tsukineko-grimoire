import { Storage } from '@google-cloud/storage';
import { verifyAndGetUser } from '@/lib/auth-helpers';
import { getAdminFirestore, FieldValue } from '@/lib/firebase-admin';
import { translateToJapanese } from '@/lib/translate';
import { pdfToMarkdown } from '@/lib/pdf-to-markdown';
import { fetchArxivHtmlAsMarkdown } from '@/lib/html-to-markdown';

const MAX_SIZE_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? '100', 10);
const ALLOWED_TYPES = ['application/pdf', 'text/markdown', 'text/plain', 'text/x-markdown'];

// arXiv ID を抽出
//   新形式: 2603.16871v1.pdf  → "2603.16871"
//   旧形式: 0211159v1.pdf     → "0211159"   (7桁 or 7桁+v)
function extractArxivId(filename: string): string | null {
  // 新形式: YYMM.NNNNN
  const newFormat = filename.match(/(\d{4}\.\d{4,5})(?:v\d+)?/);
  if (newFormat) return newFormat[1];

  // 旧形式: 7桁数字 (例: 0211159v1.pdf)
  const oldFormat = filename.match(/(?:^|[^.\d])(\d{7})(?:v\d+)?(?:\.|$)/);
  if (oldFormat) return oldFormat[1];

  return null;
}

// arXiv API からメタデータを取得
async function fetchArxivMetadata(arxivId: string) {
  try {
    const res = await fetch(
      `https://export.arxiv.org/api/query?id_list=${arxivId}&max_results=1`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const xml = await res.text();

    const title = xml.match(/<title>(?!arXiv)([^<]+)<\/title>/)?.[1]?.trim() ?? '';
    const summary = xml.match(/<summary>([^<]+)<\/summary>/)?.[1]?.trim().replace(/\s+/g, ' ') ?? '';
    const published = xml.match(/<published>([^<]+)<\/published>/)?.[1]?.slice(0, 10) ?? '';

    const authorMatches = [...xml.matchAll(/<name>([^<]+)<\/name>/g)];
    const authors = authorMatches.map(m => m[1].trim()).slice(0, 5);

    const categoryMatch = xml.match(/term="([^"]+)"/);
    const category = categoryMatch?.[1] ?? '';

    if (!title) return null;
    return { title, summary, authors, category, publishedAt: published };
  } catch {
    return null;
  }
}


export async function POST(req: Request) {
  // 1. 認証
  let userId: string;
  try {
    const user = await verifyAndGetUser(req);
    userId = user.uid;
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const manualTitle    = (formData.get('title') as string | null)?.trim() ?? '';
  const manualTitleJa  = (formData.get('titleJa') as string | null)?.trim() ?? '';
  const manualAuthors  = (formData.get('authors') as string | null)?.trim() ?? '';
  const manualSummary  = (formData.get('summary') as string | null)?.trim() ?? '';
  const manualDocType  = (formData.get('docType') as string | null)?.trim() ?? '';
  const manualDate     = (formData.get('publishedAt') as string | null)?.trim() ?? '';
  const manualTags     = (formData.get('tags') as string | null)?.trim() ?? '';

  if (!file) {
    return Response.json({ error: 'ファイルが見つかりません' }, { status: 400 });
  }

  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return Response.json(
      { error: `ファイルサイズが上限（${MAX_SIZE_MB}MB）を超えています` },
      { status: 400 }
    );
  }

  const mimeType = file.type || 'application/octet-stream';
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return Response.json(
      { error: 'PDF、Markdown、テキストファイルのみ対応しています' },
      { status: 400 }
    );
  }

  try {
    // 2. arXiv メタデータ自動取得
    const arxivId = extractArxivId(file.name);
    let meta = {
      title: manualTitle || file.name,
      summary: '',
      authors: [] as string[],
      category: '',
      publishedAt: '',
    };

    if (arxivId) {
      const arxivMeta = await fetchArxivMetadata(arxivId);
      if (arxivMeta) {
        meta = arxivMeta;
      }
    }

    // 3. 要約・タイトルを日本語に翻訳（arXiv 論文は自動翻訳、それ以外は手動入力を優先）
    let summaryJa = manualSummary; // 手動入力があれば優先
    let titleJa   = manualTitleJa; // 手動入力があれば優先
    if (arxivId) {
      if (!summaryJa && meta.summary) summaryJa = await translateToJapanese(meta.summary);
      if (!titleJa && meta.title)     titleJa   = await translateToJapanese(meta.title);
    }

    // 4. ファイルをバッファに変換してサーバーから GCS に直接アップロード
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const storage = new Storage();
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const destination = `users/${userId}/docs/${Date.now()}_${safeFilename}`;
    const gcsFile = bucket.file(destination);

    await gcsFile.save(buffer, {
      metadata: { contentType: mimeType },
    });

    const gcsPath = `gs://${process.env.GCS_BUCKET_NAME}/${destination}`;

    // 5. PDF の場合は HTML 優先で Markdown に変換して GCS に保存（失敗時は PDF フォールバック）
    if (mimeType === 'application/pdf' && arxivId) {
      try {
        const paperMeta = {
          title: meta.title,
          authors: meta.authors,
          category: meta.category,
          publishedAt: meta.publishedAt,
          arxivId,
          summary: meta.summary,
          summaryJa,
        };
        let markdown = await fetchArxivHtmlAsMarkdown(arxivId, paperMeta);
        const source = markdown ? 'html' : 'pdf';
        if (!markdown) {
          markdown = await pdfToMarkdown(buffer, paperMeta);
        }
        const mdDestination = destination.replace(/\.pdf$/i, '.md');
        await bucket.file(mdDestination).save(Buffer.from(markdown, 'utf-8'), {
          metadata: { contentType: 'text/markdown' },
        });
        console.log(`ingest: markdown source=${source} for ${arxivId}`);
      } catch (mdErr) {
        console.warn('Markdown generation failed:', (mdErr as Error).message?.slice(0, 80));
      }
    }

    // 非 arXiv 文書の手動メタデータを整形
    const parsedAuthors = !arxivId && manualAuthors
      ? manualAuthors.split(',').map(a => a.trim()).filter(Boolean)
      : meta.authors;
    const parsedTags = manualTags
      ? manualTags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    // 6. Firestore にメタデータを保存
    const db = getAdminFirestore();
    const docRef = await db.collection('documents').add({
      userId,
      filename: file.name,
      gcsPath,
      fileSize: file.size,
      mimeType,
      status: 'pending',
      uploadedAt: FieldValue.serverTimestamp(),
      metadata: {
        source: arxivId ? 'arxiv' : 'manual',
        docType: manualDocType || (arxivId ? 'paper' : 'other'),
      },
      // 書庫用メタデータ
      title: meta.title,
      titleJa,
      summary: manualSummary || meta.summary,
      summaryJa,
      authors: parsedAuthors,
      category: meta.category || manualDocType,
      publishedAt: meta.publishedAt || manualDate,
      arxivId: arxivId ?? '',
      tags: parsedTags,
    });

    return Response.json({
      documentId: docRef.id,
      gcsPath,
      filename: file.name,
      title: meta.title,
      arxivId,
      translated: !!summaryJa,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return Response.json({ error: 'アップロードに失敗しました' }, { status: 500 });
  }
}

// ドキュメント一覧取得
export async function GET(req: Request) {
  let userId: string;
  try {
    const user = await verifyAndGetUser(req);
    userId = user.uid;
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();
    const snapshot = await db
      .collection('documents')
      .where('userId', 'in', [userId, 'system'])
      .orderBy('uploadedAt', 'desc')
      .limit(200)
      .get();

    const documents = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      uploadedAt: doc.data().uploadedAt?.toDate?.()?.toISOString() ?? null,
      indexedAt: doc.data().indexedAt?.toDate?.()?.toISOString() ?? null,
    }));

    return Response.json({ documents });
  } catch (error) {
    console.error('Firestore error:', error);
    return Response.json({ documents: [] });
  }
}
