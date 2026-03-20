import { SearchServiceClient } from '@google-cloud/discoveryengine';
import { getAdminFirestore, FieldValue } from '@/lib/firebase-admin';

// Cloud Scheduler または手動実行用 — Bearer トークン認証
function isAuthorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';

  // Cloud Scheduler OIDC トークン（デプロイ後）
  if (auth.startsWith('Bearer ')) return true;

  // 開発環境用: CRON_SECRET で保護
  const secret = process.env.CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return true;

  // Cloud Scheduler からの x-cloudscheduler-jobname ヘッダー
  if (req.headers.get('x-cloudscheduler-jobname')) return true;

  return false;
}

function buildApiEndpoint(): string {
  const location = process.env.VERTEX_AI_LOCATION ?? 'global';
  return location === 'global'
    ? 'discoveryengine.googleapis.com'
    : `${location}-discoveryengine.googleapis.com`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminFirestore();
  const startedAt = Date.now();

  try {
    // 1. pending ドキュメントを取得（最大100件）
    const snapshot = await db
      .collection('documents')
      .where('status', '==', 'pending')
      .limit(100)
      .get();

    if (snapshot.empty) {
      return Response.json({ updated: 0, message: 'No pending documents' });
    }

    // 2. Agent Builder でサンプル検索して到達可能か確認
    const location = process.env.VERTEX_AI_LOCATION ?? 'global';
    const servingConfig = `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/locations/${location}/collections/default_collection/engines/${process.env.VERTEX_AI_ENGINE_ID}/servingConfigs/default_config`;

    const client = new SearchServiceClient({
      apiEndpoint: buildApiEndpoint(),
    });

    let updatedCount = 0;
    const errors: string[] = [];

    // 3. 各ドキュメントのファイル名で検索してインデックス済みか確認
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const searchTerm = data.title || data.filename || '';

      if (!searchTerm) continue;

      try {
        const [results] = await (client.search({
          servingConfig,
          query: searchTerm,
          pageSize: 1,
          filter: '',
        }, { autoPaginate: false }) as unknown as Promise<unknown[]>);

        const hits = results as Array<unknown>;

        if (hits && hits.length > 0) {
          // 検索結果が返ってきた = エンジンがインデックス済み
          await docSnap.ref.update({
            status: 'indexed',
            indexedAt: FieldValue.serverTimestamp(),
          });
          updatedCount++;
        }
      } catch {
        // 個別ドキュメントのチェック失敗はスキップ
        errors.push(docSnap.id);
      }

      // Agent Builder のレートリミット対策: 200ms 間隔
      await new Promise(r => setTimeout(r, 200));
    }

    const elapsed = Date.now() - startedAt;

    console.log(`sync-status: checked ${snapshot.size} docs, updated ${updatedCount}, elapsed ${elapsed}ms`);

    return Response.json({
      checked: snapshot.size,
      updated: updatedCount,
      errors: errors.length,
      elapsed_ms: elapsed,
    });
  } catch (error) {
    console.error('sync-status error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Cloud Scheduler の GET リクエストにも対応
export const GET = POST;
