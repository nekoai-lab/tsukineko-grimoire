import crypto from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from '@/lib/firebase-admin';
import { normalizeSnippetSourceText } from '@/lib/translation-snippet-cache';

/** /api/paper-figures のキャプション翻訳キャッシュ用コレクション */
export const PAPER_FIGURE_CAPTION_COLLECTION = 'translation_paper_figure_caption_cache';

function normalizeArxivId(arxivId: string): string {
  return arxivId.trim();
}

/**
 * キャッシュキー: SHA-256( normalizedArxivId + "\\n" + targetLanguage + "\\n" + normalizedCaption )
 * （論理キー: arxivId + caption 原文の正規化後 + targetLanguage）
 */
export function buildPaperFigureCaptionDocId(
  arxivId: string,
  caption: string,
  targetLanguage: string
): string {
  const a = normalizeArxivId(arxivId);
  const c = normalizeSnippetSourceText(caption);
  return crypto
    .createHash('sha256')
    .update(`${a}\n${targetLanguage}\n${c}`, 'utf8')
    .digest('hex');
}

export async function getCachedPaperFigureCaption(
  db: Firestore,
  arxivId: string,
  caption: string,
  targetLanguage: string
): Promise<string | null> {
  const a = normalizeArxivId(arxivId);
  const c = normalizeSnippetSourceText(caption);
  if (!a || !c) return null;
  const id = buildPaperFigureCaptionDocId(arxivId, caption, targetLanguage);
  const snap = await db.collection(PAPER_FIGURE_CAPTION_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const ja = snap.data()?.translatedText;
  return typeof ja === 'string' && ja.length > 0 ? ja : null;
}

export async function savePaperFigureCaptionTranslation(
  db: Firestore,
  arxivId: string,
  caption: string,
  targetLanguage: string,
  translatedText: string
): Promise<void> {
  const a = normalizeArxivId(arxivId);
  const c = normalizeSnippetSourceText(caption);
  if (!a || !c || !normalizeSnippetSourceText(translatedText)) return;
  const id = buildPaperFigureCaptionDocId(arxivId, caption, targetLanguage);
  const ref = db.collection(PAPER_FIGURE_CAPTION_COLLECTION).doc(id);
  const snap = await ref.get();
  await ref.set(
    {
      cacheKeyHash: id,
      arxivId: a,
      targetLanguage,
      translatedText: translatedText.trim(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(!snap.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true }
  );
}
