import { getAdminAuth } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  const { idToken } = await req.json();

  if (!idToken) {
    return Response.json({ error: 'ID token is required' }, { status: 400 });
  }

  try {
    const adminAuth = getAdminAuth();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days in ms
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

    cookies().set('session', sessionCookie, {
      maxAge: expiresIn / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return Response.json({ status: 'success', uid: decodedToken.uid });
  } catch (error) {
    console.error('Session creation failed:', error);
    return Response.json({ error: 'Authentication failed' }, { status: 401 });
  }
}

export async function DELETE() {
  cookies().set('session', '', { maxAge: 0, path: '/' });
  return Response.json({ status: 'success' });
}
