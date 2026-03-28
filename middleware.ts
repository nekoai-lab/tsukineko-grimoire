import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 認証不要のパス
  // /grimoire・/archive はゲストも閲覧可（追加・設定はログイン必須）
  // /api/admin・/api/collector は独自の Bearer 認証を持つため除外
  const isPublicPath =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname === "/grimoire" ||
    pathname.startsWith("/grimoire/") ||
    pathname === "/archive" ||
    pathname === "/archive/upload" ||
    pathname === "/settings" ||
    pathname === "/shelf" ||
    pathname.startsWith("/api/auth/session") ||
    pathname.startsWith("/api/auth/me") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/collector") ||
    pathname.startsWith("/api/paper-figures") ||
    pathname.startsWith("/api/image-proxy") ||
    pathname.startsWith("/api/search") ||
    pathname.startsWith("/api/chat");
  if (isPublicPath) return NextResponse.next();

  const session = request.cookies.get("session");

  // Cookie の存在確認のみ (firebase-admin は Edge Runtime 非対応のため使用禁止)
  // 実際のトークン検証は各 API Route で verifyAndGetUser() を使って行う
  if (!session?.value) {
    // 307 だと元リクエストのメソッドが維持され POST /login になり 405 になる。
    // 303 で Location を GET で取得させ、ログイン画面表示に限定する。
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  // セッショントークンを後段の API Route に渡す
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-session-token", session.value);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|_next/webpack-hmr|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|css|js)$).*)",
  ],
};
