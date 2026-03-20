import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 認証不要のパス（完全一致 or 正確なプレフィックスで判定）
  // /api/admin と /api/collector は独自の Bearer 認証を持つため除外
  const isPublicPath =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/collector');
  if (isPublicPath) return NextResponse.next();

  const session = request.cookies.get('session');

  // Cookie の存在確認のみ (firebase-admin は Edge Runtime 非対応のため使用禁止)
  // 実際のトークン検証は各 API Route で verifyAndGetUser() を使って行う
  if (!session?.value) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // セッショントークンを後段の API Route に渡す
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-session-token', session.value);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|_next/webpack-hmr).*)'],
};
