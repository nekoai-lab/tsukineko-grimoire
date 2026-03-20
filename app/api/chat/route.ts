import { verifyAndGetUser } from '@/lib/auth-helpers';
import { getAdminFirestore, FieldValue } from '@/lib/firebase-admin';
import { getCachedAnswer, cacheAnswer } from '@/lib/query-cache';
import { getSearchClient, buildServingConfigPath } from '@/lib/vertex-discovery';
import { translateToEnglish } from '@/lib/translate';

export async function POST(req: Request) {
  // 1. 認証
  let userId: string;
  try {
    const user = await verifyAndGetUser(req);
    userId = user.uid;
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { question, history, chatId } = await req.json() as {
    question: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    chatId?: string;
  };

  if (!question?.trim()) {
    return Response.json({ error: '呪文の詠唱に失敗しました: 質問が空です' }, { status: 400 });
  }

  // 2. キャッシュ確認（単発質問のみキャッシュ対象）
  const hasHistory = history && history.length > 0;
  if (!hasHistory) {
    try {
      const cached = await getCachedAnswer(question, userId);
      if (cached) return Response.json(cached);
    } catch {
      // Firestore未設定時はキャッシュをスキップ
    }
  }

  // 3. 日本語クエリを英語に翻訳（英語PDF検索の精度向上）
  const englishQuestion = await translateToEnglish(question);
  const usedTranslation = englishQuestion !== question;
  if (usedTranslation) {
    console.log(`query translated: "${question.slice(0, 40)}" → "${englishQuestion.slice(0, 60)}"`);
  }

  // 4. 会話履歴をクエリに注入（直近3往復 = 6件まで）
  const recentHistory = (history ?? []).slice(-6);
  const contextPrefix = recentHistory.length > 0
    ? recentHistory.map(m =>
        m.role === 'user' ? `User: ${m.content}` : `AI: ${m.content}`
      ).join('\n') + '\n\n'
    : '';
  const enrichedQuery = contextPrefix
    ? `${contextPrefix}User: ${englishQuestion}`
    : englishQuestion;

  // 5. SearchServiceClient（シングルトン）で Agent Builder に問い合わせ
  const client = getSearchClient();
  const servingConfig = buildServingConfigPath();

  try {
    // autoPaginate: false で [results[], nextPageReq, rawResponse] の形式で返る
    const searchResult = await (client.search({
      servingConfig,
      query: enrichedQuery,
      pageSize: 5,
      contentSearchSpec: {
        summarySpec: {
          summaryResultCount: 5,
          modelPromptSpec: {
            preamble: 'あなたは AI・機械学習の専門家アシスタントです。検索結果をもとに、必ず日本語で詳しく回答してください。',
          },
        },
        extractiveContentSpec: { maxExtractiveAnswerCount: 1 },
      },
      queryExpansionSpec: { condition: 'AUTO' as const },
    }, { autoPaginate: false }) as unknown as Promise<unknown[]>);

    const results = searchResult[0] as Array<{
      document?: {
        name?: string;
        derivedStructData?: {
          fields?: {
            link?: { stringValue?: string };
            title?: { stringValue?: string };
          };
        };
      };
    }>;
    const rawResponse = searchResult[2] as {
      summary?: { summaryText?: string };
    };

    const answer = rawResponse?.summary?.summaryText ?? '';
    const citations = results.map(r => ({
      title: r.document?.derivedStructData?.fields?.title?.stringValue ?? '',
      uri: r.document?.derivedStructData?.fields?.link?.stringValue ?? '',
    })).filter(c => c.uri);

    const result = { answer, citations };

    // 6. Firestore に会話を保存（失敗しても回答は返す）
    if (chatId) {
      try {
        const db = getAdminFirestore();
        await db.collection('chats').doc(chatId).set(
          {
            userId,
            messages: FieldValue.arrayUnion(
              { role: 'user', content: question, timestamp: new Date() },
              { role: 'assistant', content: answer, citations, timestamp: new Date() }
            ),
            lastUpdatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch (firestoreError) {
        console.warn('Firestore save skipped:', (firestoreError as Error).message?.slice(0, 100));
      }
    }

    // 7. 単発質問のみキャッシュ保存（失敗しても回答は返す）
    if (!hasHistory) {
      try {
        await cacheAnswer(question, userId, result);
      } catch {
        // Firestore未設定時はスキップ
      }
    }

    return Response.json(result);
  } catch (error: unknown) {
    console.error('Agent Builder error:', error);
    const err = error as { code?: string };
    const errorMessages: Record<string, string> = {
      RESOURCE_EXHAUSTED: '魔力が不足しています。しばらくお待ちください',
      NOT_FOUND: 'その知識は魔導書に記録されていません',
      INVALID_ARGUMENT: '呪文の詠唱に失敗しました',
      UNAUTHENTICATED: '魔導書へのアクセスが拒否されました',
    };

    return Response.json(
      { error: errorMessages[err.code ?? ''] ?? '予期せぬ魔法の干渉が発生しました' },
      { status: 500 }
    );
  }
}
