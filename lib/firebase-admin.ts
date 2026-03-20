import * as admin from 'firebase-admin';

let app: admin.app.App | null = null;

function getApp(): admin.app.App {
  if (app) return app;
  if (admin.apps.length > 0) {
    app = admin.apps[0]!;
    return app;
  }

  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });

  return app;
}

/** Firebase Admin Auth — only call inside request handlers */
export function getAdminAuth(): admin.auth.Auth {
  return getApp().auth();
}

/** Firestore Admin — only call inside request handlers */
export function getAdminFirestore(): admin.firestore.Firestore {
  return getApp().firestore();
}

/** Storage Admin — only call inside request handlers */
export function getAdminStorage(): admin.storage.Storage {
  return getApp().storage();
}

export const FieldValue = admin.firestore.FieldValue;
export type Timestamp = admin.firestore.Timestamp;
