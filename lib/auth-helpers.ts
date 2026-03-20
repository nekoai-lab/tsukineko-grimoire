import { NextRequest } from 'next/server';
import { getAdminAuth } from './firebase-admin';

/**
 * セッショントークンを検証してユーザー情報を返す。
 * すべての認証が必要な API Route の先頭で使用する。
 *
 * @example
 * let userId: string;
 * try {
 *   const user = await verifyAndGetUser(req);
 *   userId = user.uid;
 * } catch {
 *   return Response.json({ error: 'Unauthorized' }, { status: 401 });
 * }
 */
export async function verifyAndGetUser(
  request: NextRequest | Request
): Promise<{ uid: string; email: string }> {
  const sessionToken = request.headers.get('x-session-token');

  if (!sessionToken) {
    throw new Error('Unauthorized: No session token');
  }

  try {
    const decodedToken = await getAdminAuth().verifySessionCookie(sessionToken, true);
    return {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
    };
  } catch {
    throw new Error('Unauthorized: Invalid session');
  }
}
