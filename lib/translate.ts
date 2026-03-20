import { GoogleAuth } from 'google-auth-library';

let _auth: GoogleAuth | null = null;

function getAuth(): GoogleAuth {
  if (!_auth) {
    _auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-translation'],
    });
  }
  return _auth;
}

async function translateText(text: string, source: string, target: string): Promise<string> {
  if (!text?.trim()) return '';
  try {
    const client = await getAuth().getClient();
    const tokenObj = await client.getAccessToken();

    const res = await fetch(
      'https://translation.googleapis.com/language/translate/v2',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenObj.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: text, source, target, format: 'text' }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      console.warn('Translation API error:', res.status);
      return '';
    }

    const data = await res.json() as {
      data?: { translations?: Array<{ translatedText: string }> };
    };
    return data.data?.translations?.[0]?.translatedText ?? '';
  } catch (err) {
    console.warn(`translate(${source}→${target}) failed:`, (err as Error).message?.slice(0, 80));
    return '';
  }
}

/**
 * 英語テキストを日本語に翻訳する。失敗時は空文字を返す。
 */
export async function translateToJapanese(text: string): Promise<string> {
  return translateText(text, 'en', 'ja');
}

/**
 * 日本語テキストを英語に翻訳する。失敗時は元のテキストをそのまま返す。
 * RAG クエリの精度向上（日本語質問 → 英語PDF検索）に使用。
 */
export async function translateToEnglish(text: string): Promise<string> {
  if (!text?.trim()) return text;
  const result = await translateText(text, 'ja', 'en');
  return result || text; // 翻訳失敗時は元のテキストにフォールバック
}
