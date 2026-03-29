#!/usr/bin/env node
/**
 * ワンショット: 本棚アイテムの要約・メタが空の行を、documents の現状と同期する。
 *
 * - Translate API は呼ばない（書庫に既にある文字列のコピーのみ）
 * - 対象: summaryJa と summary がどちらも空（または未設定）の shelves/{uid}/items/{documentId}
 *
 * 前提環境変数（Next と同じ）:
 *   GOOGLE_CLOUD_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *
 * Usage:
 *   node scripts/backfill-shelf-summaries.mjs           # 実行
 *   DRY_RUN=1 node scripts/backfill-shelf-summaries.mjs # 更新せず件数のみ
 */

import admin from 'firebase-admin';

const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

function initAdmin() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      'Missing env: GOOGLE_CLOUD_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY',
    );
    process.exit(1);
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
  return admin.firestore();
}

function isBlankSummary(data) {
  const ja = String(data?.summaryJa ?? '').trim();
  const en = String(data?.summary ?? '').trim();
  return !ja && !en;
}

async function main() {
  const db = initAdmin();
  const shelvesSnap = await db.collection('shelves').get();
  let examined = 0;
  let wouldUpdate = 0;
  let updated = 0;
  let skippedNoDoc = 0;
  let skippedHasSummary = 0;

  for (const userDoc of shelvesSnap.docs) {
    const itemsSnap = await userDoc.ref.collection('items').get();
    for (const itemDoc of itemsSnap.docs) {
      examined++;
      const item = itemDoc.data();
      if (!isBlankSummary(item)) {
        skippedHasSummary++;
        continue;
      }
      const documentId = itemDoc.id;
      const docSnap = await db.collection('documents').doc(documentId).get();
      if (!docSnap.exists) {
        skippedNoDoc++;
        console.warn(`[skip] no documents/${documentId} (shelf user ${userDoc.id})`);
        continue;
      }
      const d = docSnap.data() ?? {};
      const next = {
        title: d.title ?? '',
        titleJa: d.titleJa ?? '',
        authors: Array.isArray(d.authors) ? d.authors : [],
        arxivId: d.arxivId ?? '',
        category: d.category ?? '',
        publishedAt: d.publishedAt ?? '',
        summaryJa: d.summaryJa ?? '',
        summary: d.summary ?? '',
        tags: Array.isArray(d.tags) ? d.tags : [],
        theme: typeof d.theme === 'string' ? d.theme : '',
      };
      if (!String(next.summaryJa).trim() && !String(next.summary).trim()) {
        console.warn(`[skip] documents/${documentId} also has empty summary`);
        continue;
      }
      wouldUpdate++;
      if (dryRun) {
        console.log(`[dry-run] would update shelves/${userDoc.id}/items/${documentId}`);
        continue;
      }
      await itemDoc.ref.update(next);
      updated++;
      console.log(`[ok] shelves/${userDoc.id}/items/${documentId}`);
    }
  }

  console.log('---');
  console.log(
    JSON.stringify(
      {
        dryRun,
        examined,
        skippedHasSummary,
        skippedNoDoc,
        wouldUpdate,
        updated,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
