import { verifyAndGetUser } from '@/lib/auth-helpers';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { translateToJapanese } from '@/lib/translate';

interface CitationRequest {
  arxivId: string;
  snippets?: string[];
}

interface CitationLinks {
  abstract: string;
  html: string;
  pdf: string;
}

interface CitationResponse {
  titleJa: string;
  summaryJa: string;
  authors: string[];
  publishedAt: string;
  category: string;
  translatedSnippets: Array<{ en: string; ja: string }>;
  links: CitationLinks;
}

function buildArxivLinks(arxivId: string): CitationLinks {
  return {
    abstract: `https://arxiv.org/abs/${arxivId}`,
    html: `https://arxiv.org/html/${arxivId}`,
    pdf: `https://arxiv.org/pdf/${arxivId}`,
  };
}

export async function POST(req: Request) {
  try {
    await verifyAndGetUser(req);
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as CitationRequest;
  const { arxivId, snippets = [] } = body;

  if (!arxivId?.trim()) {
    return Response.json({ error: 'arxivId is required' }, { status: 400 });
  }

  const db = getAdminFirestore();

  // Firestore から arxivId でメタデータを取得
  const snapshot = await db.collection('documents')
    .where('arxivId', '==', arxivId)
    .limit(1)
    .get();

  let titleJa = '';
  let summaryJa = '';
  let authors: string[] = [];
  let publishedAt = '';
  let category = '';

  if (!snapshot.empty) {
    const data = snapshot.docs[0].data();
    titleJa = data.titleJa ?? '';
    summaryJa = data.summaryJa ?? '';
    authors = data.authors ?? [];
    publishedAt = data.publishedAt ?? '';
    category = data.category ?? '';

    // summaryJa が未翻訳の場合、summary から翻訳してキャッシュ
    if (!summaryJa && data.summary) {
      try {
        summaryJa = await translateToJapanese(data.summary);
        if (summaryJa) {
          await snapshot.docs[0].ref.update({ summaryJa });
        }
      } catch {
        // 翻訳失敗は無視
      }
    }
  }

  // スニペットを並列で日本語翻訳（最大 3 件）
  const targetSnippets = snippets.slice(0, 3);
  const translatedSnippets = await Promise.all(
    targetSnippets.map(async en => {
      try {
        const ja = await translateToJapanese(en);
        return { en, ja: ja || en };
      } catch {
        return { en, ja: en };
      }
    })
  );

  const result: CitationResponse = {
    titleJa,
    summaryJa,
    authors,
    publishedAt,
    category,
    translatedSnippets,
    links: buildArxivLinks(arxivId),
  };

  return Response.json(result);
}
