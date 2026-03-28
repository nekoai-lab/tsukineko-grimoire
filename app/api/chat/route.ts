import { randomUUID } from 'crypto';
import { getAdminFirestore, FieldValue, getAdminAuth } from '@/lib/firebase-admin';
import { isValidGrimoireGuestChatId } from '@/lib/grimoire-chat-constants';
import { getCachedAnswer, cacheAnswer } from '@/lib/query-cache';
import { getSearchClient, buildServingConfigPath } from '@/lib/vertex-discovery';
import { translateToEnglish } from '@/lib/translate';

export async function POST(req: Request) {
  // 1. 認証（/api/chat は public パスのため middleware が x-session-token を付与しない）
  //    Cookie ヘッダーから session を直接読んで検証し、未ログインは 'guest' として続行。
  let userId = 'guest';
  const cookieHeader = req.headers.get('cookie') ?? '';
  const sessionMatch = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  const sessionToken = sessionMatch?.[1];
  if (sessionToken) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(sessionToken, true);
      userId = decoded.uid;
    } catch {
      // 無効なトークンはゲスト扱いで続行
    }
  }

  const { question, history, chatId } = await req.json() as {
    question: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    chatId?: string;
  };

  const clientChatId = typeof chatId === 'string' ? chatId.trim() : '';

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

  // 4. 質問タイプを6種類に分類して、構造・検索パラメータを動的調整
  type QueryType = 'overview' | 'definition' | 'mechanism' | 'comparison' | 'practical' | 'research';

  function detectQueryType(q: string): QueryType {
    if (/評価|指標|ベンチマーク|貢献|限界|再現|データセット|ablation|先行研究|sota|state.of.the.art|実験結果|精度は|スコア/i.test(q)) return 'research';
    if (/比較|違い|差|vs\b|versus|どっち|どれ|おすすめ|選び方|使い分け/i.test(q)) return 'comparison';
    if (/実装|使い方|手順|どうやって|ツール|コード|導入|やり方|進め方/i.test(q)) return 'practical';
    if (/仕組み|原理|なぜ|どのように動く|アーキテクチャ|アルゴリズム|メカニズム|内部/i.test(q)) return 'mechanism';
    if (/とは|定義|意味|概念|とはなにか|what is/i.test(q)) return 'definition';
    return 'overview'; // 最新動向・サーベイ・その他
  }

  interface QueryConfig {
    pageSize: number;
    summaryResultCount: number;
    preamble: string;
  }

  const queryConfigs: Record<QueryType, QueryConfig> = {
    overview: {
      pageSize: 7,
      summaryResultCount: 5,
      preamble: `You are an AI/ML research assistant. Answer in Japanese using this structure.
Do NOT repeat the same information across sections. Each section must add new content.
If information for a section is not found in the search results, omit that section entirely. Do not write "information is not available."
Add citation numbers like [1][2] after each sentence or bullet that references a source.
Only use a Markdown table when you have specific numerical metrics (accuracy, F1, BLEU, benchmark scores, etc.) to compare. For listing methods or findings descriptively, always use bullet points — never a table.

## 概要
1-2 sentences summarizing the current state or trend. [cite]

## 背景・重要性
Background and motivation. Why does this topic matter? [cite]

## 主な手法・研究
(Always use bullet points here. Do NOT use a table.)
- Method or finding 1 with brief description [cite]
- Method or finding 2 with brief description [cite]
- Method or finding 3 with brief description [cite]

Write in natural Japanese. No repetition between sections.`,
    },

    definition: {
      pageSize: 4,
      summaryResultCount: 3,
      preamble: `You are an AI/ML research assistant. Answer in Japanese using this structure.
Do NOT repeat the same information across sections.
If information for a section is not found in the search results, omit that section entirely. Do not write "information is not available."
Add citation numbers like [1][2] after each sentence or bullet that references a source.
Only use a Markdown table when you have specific numerical metrics to compare. For descriptive listings, always use bullet points.

## 定義
One clear definition sentence. [cite]

## 特徴・構成要素
(Use bullet points.)
- Feature 1 [cite]
- Feature 2 [cite]

## 類似概念との違い
Brief comparison with related terms or methods. [cite]

Write in natural Japanese. Keep it concise and precise.`,
    },

    mechanism: {
      pageSize: 4,
      summaryResultCount: 3,
      preamble: `You are an AI/ML research assistant. Answer in Japanese using this structure.
Do NOT repeat the same information across sections. Each bullet must add NEW evidence.
If information for a section is not found in the search results, omit that section entirely. Do not write "information is not available."
Add citation numbers like [1][2] after each sentence or bullet that references a source.
Only use a Markdown table when you have specific numerical metrics to compare. For explanatory listings, always use bullet points.

## 結論
One sentence directly answering how it works. [cite]

## 論拠
(Use bullet points.)
- Point 1 with brief reason [cite]
- Point 2 with brief reason [cite]
- Point 3 with brief reason [cite]

Each bullet should state the point AND briefly explain why, using a different aspect from the others.
Write in natural Japanese.`,
    },

    comparison: {
      pageSize: 6,
      summaryResultCount: 4,
      preamble: `You are an AI/ML research assistant. Answer in Japanese using this structure.
Do NOT repeat the same information across sections.
CRITICAL: If the search results do not contain enough information to write a section with actual content, OMIT that section entirely. Never write that information was not found or could not be identified — just skip the section silently.
CRITICAL: If ALL sections would be empty, respond with only one short sentence explaining what you could not find, without any section headers.
Add citation numbers like [1][2] after each sentence or bullet that references a source.
When comparing multiple methods, models, or metrics, present the data as a Markdown table instead of bullet points.

## 共通点
What both/all approaches share. [cite]

## 相違点
Use a Markdown table with the compared methods as columns and key differences as rows:
| 観点 | 手法A | 手法B |
|---|---|---|
| (key difference 1) | ... | ... |
| (key difference 2) | ... | ... |

## 使い分けの指針
When to choose which, with brief reasoning. [cite]

Write in natural Japanese. Include only sections that have real content from the search results.`,
    },

    practical: {
      pageSize: 4,
      summaryResultCount: 3,
      preamble: `You are an AI/ML research assistant. Answer in Japanese using this structure.
Do NOT repeat the same information across sections.
If information for a section is not found in the search results, omit that section entirely. Do not write "information is not available."
Add citation numbers like [1][2] after each sentence or bullet that references a source.
Only use a Markdown table when you have specific numerical metrics to compare. For steps and considerations, always use numbered lists or bullet points.

## 概要
One sentence describing what we are implementing or doing. [cite]

## 手順
(Use a numbered list.)
1. Step 1 [cite]
2. Step 2 [cite]
3. Step 3

## 注意点・ポイント
(Use bullet points.)
- Important consideration 1 [cite]
- Important consideration 2 [cite]

Write in natural, practical Japanese.`,
    },

    research: {
      pageSize: 5,
      summaryResultCount: 4,
      preamble: `You are an AI/ML research assistant helping a researcher. Answer in Japanese using this structure.
Do NOT repeat the same information across sections.
If information for a section is not found in the search results, omit that section entirely. Do not write "information is not available."
Add citation numbers like [1][2] after each sentence or bullet that references a source.
When comparing multiple methods, models, or metrics, present the data as a Markdown table instead of bullet points.

## 主な貢献
What is novel or significant about this work? [cite]

## 実験・評価
If multiple methods or baselines are compared, format results as a Markdown table:
| 手法 | データセット | 指標 | スコア |
|---|---|---|---|
| ... | ... | ... | ... |

## 限界と今後の課題
- Known limitations [cite]
- Future directions mentioned by authors

Write in precise, academic Japanese suitable for a researcher.`,
    },
  };

  const queryType = detectQueryType(question);
  const { pageSize, summaryResultCount, preamble } = queryConfigs[queryType];

  // 5. 会話履歴をクエリに注入（直近2往復 = 4件まで、ユーザー発言のみ英語化）
  // AI回答（日本語）を英語クエリに混入させると検索精度が落ちるため、
  // ユーザー発言のみをコンテキストとして使用する
  const recentHistory = (history ?? []).slice(-4);
  const userOnlyContext = recentHistory
    .filter(m => m.role === 'user')
    .map(m => `Previous question: ${m.content}`)
    .join('\n');

  const enrichedQuery = userOnlyContext
    ? `${userOnlyContext}\nCurrent question: ${englishQuestion}`
    : englishQuestion;

  // 6. SearchServiceClient（シングルトン）で Agent Builder に問い合わせ
  const client = getSearchClient();
  const servingConfig = buildServingConfigPath();

  try {
    // autoPaginate: false で [results[], nextPageReq, rawResponse] の形式で返る
    const searchResult = await (client.search({
      servingConfig,
      query: enrichedQuery,
      pageSize,
      contentSearchSpec: {
        summarySpec: {
          summaryResultCount,
          includeCitations: true,
          modelPromptSpec: { preamble },
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
            extractive_answers?: {
              listValue?: {
                values?: Array<{
                  structValue?: {
                    fields?: {
                      content?: { stringValue?: string };
                      pageNumber?: { stringValue?: string };
                    };
                  };
                }>;
              };
            };
            extractive_segments?: {
              listValue?: {
                values?: Array<{
                  structValue?: {
                    fields?: {
                      content?: { stringValue?: string };
                    };
                  };
                }>;
              };
            };
          };
        };
      };
    }>;
    const rawResponse = searchResult[2] as {
      summary?: { summaryText?: string };
    };

    const answer = rawResponse?.summary?.summaryText ?? '';
    const citations = results.map(r => {
      const fields = r.document?.derivedStructData?.fields;
      const title = fields?.title?.stringValue ?? '';
      const uri = fields?.link?.stringValue ?? '';

      // GCS パスまたはファイル名から arxivId を抽出（例: 2403.12345）
      // URI → title の順で試みる（ファイル名形式 arxiv_2403.12345_... にも対応）
      const arxivId =
        uri.match(/(\d{4}\.\d{4,5})/)?.[1] ??
        title.match(/(\d{4}\.\d{4,5})/)?.[1] ??
        '';

      // extractive_answers → extractive_segments の順でスニペットを取得
      const extractiveAnswers = fields?.extractive_answers?.listValue?.values ?? [];
      const extractiveSegments = fields?.extractive_segments?.listValue?.values ?? [];
      const snippetSource = extractiveAnswers.length > 0 ? extractiveAnswers : extractiveSegments;
      const chunkContents = snippetSource
        .map(v => ({ content: v.structValue?.fields?.content?.stringValue ?? '' }))
        .filter(c => c.content.length > 0);

      return { title, uri, arxivId, chunkContents, titleJa: '', publishedAt: '' };
    }).filter(c => c.uri);

    // Firestore から titleJa・publishedAt を一括取得して citations に追加
    const arxivIdsToFetch = citations.map(c => c.arxivId).filter(Boolean);
    if (arxivIdsToFetch.length > 0) {
      try {
        const titleDb = getAdminFirestore();
        const titleSnap = await titleDb.collection('documents')
          .where('arxivId', 'in', arxivIdsToFetch.slice(0, 10))
          .get();
        const metaMap: Record<string, { titleJa: string; publishedAt: string }> = {};
        titleSnap.docs.forEach(doc => {
          const d = doc.data();
          if (d.arxivId) {
            metaMap[d.arxivId] = {
              titleJa: d.titleJa ?? '',
              publishedAt: d.publishedAt ?? '',
            };
          }
        });
        citations.forEach(c => {
          if (c.arxivId && metaMap[c.arxivId]) {
            c.titleJa = metaMap[c.arxivId].titleJa;
            c.publishedAt = metaMap[c.arxivId].publishedAt;
          }
        });
      } catch {
        // メタデータ取得失敗は無視（フォールバック表示を使用）
      }
    }

    // 結果なし検知
    // - Agent Builder が明示的に「情報なし」を返すパターン
    // - 全セクションが否定文で埋まる「空構造」パターン（比較クエリで頻発）
    const NO_RESULTS_PATTERN =
      /no results|結果が見つかりません|try rephrasing|検索語句を修正|見当たりませんでした|見出すことはできません|特定できません|見つけることができません|情報はありません|記述は見当たりません|確認できません|情報が不足/i;

    // 否定文が回答の大半を占める「空構造」を検出（各セクションが「できませんでした」だけの状態）
    const negativeCount = (answer.match(/ませんでした|できません|ありません|見当たりません/g) ?? []).length;
    const sectionCount  = (answer.match(/^##\s/gm) ?? []).length;
    const isEmptyStructure = sectionCount >= 2 && negativeCount >= sectionCount;

    if (NO_RESULTS_PATTERN.test(answer) || isEmptyStructure || answer.trim() === '') {
      const keyword = question.replace(/[「」『』【】\(\)（）]/g, '').trim().slice(0, 30);

      // Firestore から関連論文を検索（実際に存在するものだけ表示）
      const db = getAdminFirestore();
      const [byTitleJa, byTitle] = await Promise.all([
        db.collection('documents')
          .where('titleJa', '>=', keyword.slice(0, 6))
          .where('titleJa', '<=', keyword.slice(0, 6) + '\uf8ff')
          .limit(3)
          .get(),
        db.collection('documents')
          .where('title', '>=', keyword.slice(0, 6))
          .where('title', '<=', keyword.slice(0, 6) + '\uf8ff')
          .limit(3)
          .get(),
      ]).catch(() => [null, null]);

      const relatedDocs: Array<{ title: string; titleJa: string; arxivId: string }> = [];
      const seenIds = new Set<string>();

      for (const snap of [byTitleJa, byTitle]) {
        if (!snap) continue;
        for (const doc of snap.docs) {
          const d = doc.data();
          if (d.arxivId && !seenIds.has(d.arxivId)) {
            seenIds.add(d.arxivId);
            relatedDocs.push({
              title: d.title ?? '',
              titleJa: d.titleJa ?? '',
              arxivId: d.arxivId ?? '',
            });
          }
        }
      }

      // テンプレートサジェストは表示しない（知識がないのにあるように見せない）
      const hasRelated = relatedDocs.length > 0;
      const fallbackAnswer = hasRelated
        ? `「${keyword}」についての情報はこの知識ベースには含まれていません。\n\nタイトルが近い論文が見つかりました。参考にどうぞ：`
        : `「${keyword}」についての情報はこの知識ベースには含まれていません。\n\nこのグリモワールは AI・機械学習分野の arXiv 論文を対象としています。RAG、Transformer、LLM、拡散モデルなどについて質問してみてください。`;
      return Response.json({ answer: fallbackAnswer, citations: [], suggestions: [], relatedDocs });
    }

    const result = { answer, citations };

    // 6. Firestore に会話を保存（失敗しても回答は返す）
    /** (1) 検証済み uid (2) 妥当な guestId (3) リクエスト単位の guest uuid */
    const chatsDocId: string =
      userId !== 'guest'
        ? userId
        : isValidGrimoireGuestChatId(clientChatId)
          ? clientChatId
          : `guest_${randomUUID()}`;

    if (chatsDocId) {
      try {
        const db = getAdminFirestore();
        await db.collection('chats').doc(chatsDocId).set(
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
