/**
 * Semantic Scholar API ユーティリティ
 *
 * arXiv ID から被引用数を取得する。
 * バッチコレクターの品質フィルタとして使用し、
 * 被引用数が閾値未満の論文をスキップする。
 *
 * API 制限: 認証なしで 100 req / 5分
 * https://api.semanticscholar.org/api-docs/
 */

const S2_BASE = 'https://api.semanticscholar.org/graph/v1/paper';

export interface S2PaperInfo {
  citationCount: number;
  title: string;
  year: number | null;
}

/**
 * arXiv ID を使って Semantic Scholar から被引用数を取得する。
 * 取得失敗時は null を返す（呼び出し元でスキップ判断する）。
 */
export async function getCitationCount(arxivId: string): Promise<number | null> {
  const info = await fetchS2Paper(arxivId);
  return info?.citationCount ?? null;
}

export async function fetchS2Paper(arxivId: string): Promise<S2PaperInfo | null> {
  const cleanId = arxivId.replace(/v\d+$/, '');
  const url = `${S2_BASE}/arXiv:${cleanId}?fields=citationCount,title,year`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Tsukineko-Grimoire/1.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 404) return null; // 論文が S2 に未登録
    if (!res.ok) {
      console.warn(`S2 API error ${res.status} for ${cleanId}`);
      return null;
    }

    const data = await res.json() as {
      citationCount?: number;
      title?: string;
      year?: number;
    };

    return {
      citationCount: data.citationCount ?? 0,
      title: data.title ?? '',
      year: data.year ?? null,
    };
  } catch (err) {
    console.warn(`fetchS2Paper failed for ${cleanId}:`, (err as Error).message?.slice(0, 80));
    return null;
  }
}
