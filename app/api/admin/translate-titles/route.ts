import { getAdminFirestore } from '@/lib/firebase-admin';
import { translateToJapanese } from '@/lib/translate';

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  const query = new URL(req.url).searchParams.get('secret') ?? '';
  return auth === `Bearer ${secret}` || query === secret;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { batchLimit = 50 } = await req.json().catch(() => ({})) as { batchLimit?: number };

  const db = getAdminFirestore();

  // 全件取得してJS側でフィルタ（Firestoreは「フィールドが存在しない」クエリ非対応のため）
  const snapshot = await db.collection('documents')
    .limit(500)
    .get();

  const targets = snapshot.docs
    .filter(doc => {
      const data = doc.data();
      return !data.titleJa && data.title; // titleJa 未設定 かつ title あり
    })
    .slice(0, batchLimit);

  let translated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const doc of targets) {
    const { title } = doc.data() as { title: string };
    try {
      const titleJa = await translateToJapanese(title);
      if (titleJa) {
        await doc.ref.update({ titleJa });
        translated++;
      } else {
        skipped++;
      }
      // Translation API レート制限対策
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      errors.push(`${doc.id}: ${(err as Error).message?.slice(0, 60)}`);
    }
  }

  return Response.json({
    translated,
    skipped,
    errors,
    total: targets.length,
    remaining: snapshot.docs.filter(doc => !doc.data().titleJa && doc.data().title).length - targets.length,
  });
}

export const GET = POST;
