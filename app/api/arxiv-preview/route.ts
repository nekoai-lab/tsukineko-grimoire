import { XMLParser } from 'fast-xml-parser';
import { parseArxivCategories } from '@/lib/arxiv-categories';
import { getAdminFirestore } from '@/lib/firebase-admin';

const USER_AGENT = 'Tsukineko-Grimoire/1.0 (arXiv preview; contact via GitHub)';

export interface ArxivPreview {
  arxivId: string;
  title: string;
  authors: string[];
  summary: string;
  category: string;
  /** セカンダリ分類・大分野プレフィックス（collector / ingest と同じルール） */
  tags: string[];
  publishedAt: string;
  /** check=1 を渡したとき: 書庫にすでに登録済みか */
  inLibrary?: boolean;
}

/** arXiv API からメタデータを取得して返す（登録はしない）
 *  ?check=1 を付けると Firestore を確認して inLibrary を返す
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id')?.trim().replace(/v\d+$/, '');
  const checkExists = searchParams.get('check') === '1';

  if (!id) {
    return Response.json({ error: 'arXiv ID が必要です' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://export.arxiv.org/api/query?id_list=${id}&max_results=1`,
      {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) {
      return Response.json({ error: 'arXiv API エラー' }, { status: 502 });
    }

    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const data = parser.parse(xml);

    const rawEntry = data?.feed?.entry;
    if (!rawEntry) {
      return Response.json({ error: '論文が見つかりませんでした' }, { status: 404 });
    }

    const entry = Array.isArray(rawEntry) ? rawEntry[0] : rawEntry;

    const title = String(entry.title ?? '').trim().replace(/\s+/g, ' ');
    const summary = String(entry.summary ?? '').trim().replace(/\s+/g, ' ');
    const publishedAt = String(entry.published ?? '').slice(0, 10);

    const authorsRaw = entry.author;
    const authors: string[] = Array.isArray(authorsRaw)
      ? authorsRaw.map((a: { name: string }) => a.name).slice(0, 5)
      : authorsRaw?.name ? [authorsRaw.name] : [];

    const { category, tags } = parseArxivCategories(entry.category);

    let inLibrary: boolean | undefined;
    if (checkExists) {
      try {
        const db = getAdminFirestore();
        const snap = await db.collection('documents').where('arxivId', '==', id).limit(1).get();
        inLibrary = !snap.empty;
      } catch {
        // Firestore エラー時は inLibrary を返さない（登録フローで判定）
      }
    }

    const preview: ArxivPreview = {
      arxivId: id, title, authors, summary, category, tags, publishedAt,
      ...(checkExists ? { inLibrary: inLibrary ?? false } : {}),
    };
    return Response.json(preview);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return Response.json({ error: 'arXiv API がタイムアウトしました。時間をおいて再試行してください' }, { status: 504 });
    }
    return Response.json({ error: 'ネットワークエラーが発生しました' }, { status: 500 });
  }
}
