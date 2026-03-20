import crypto from 'crypto';
import { getAdminFirestore, FieldValue } from './firebase-admin';

export async function getCachedAnswer(
  question: string,
  userId: string
): Promise<unknown | null> {
  if (process.env.ENABLE_QUERY_CACHE !== 'true') return null;

  const hash = crypto
    .createHash('md5')
    .update(`${userId}:${question}`)
    .digest('hex');

  const db = getAdminFirestore();
  const doc = await db.collection('query_cache').doc(hash).get();

  if (doc.exists) {
    const data = doc.data()!;
    const age = Date.now() - data.timestamp.toMillis();

    if (age < 24 * 60 * 60 * 1000) {
      await db.collection('query_cache').doc(hash).update({
        hitCount: FieldValue.increment(1),
      });
      return data.answer;
    }
  }

  return null;
}

export async function cacheAnswer(
  question: string,
  userId: string,
  answer: unknown
): Promise<void> {
  if (process.env.ENABLE_QUERY_CACHE !== 'true') return;

  const hash = crypto
    .createHash('md5')
    .update(`${userId}:${question}`)
    .digest('hex');

  const db = getAdminFirestore();
  await db.collection('query_cache').doc(hash).set({
    userId,
    question,
    answer,
    timestamp: FieldValue.serverTimestamp(),
    hitCount: 0,
  });
}
