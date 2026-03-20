'use client';

export const dynamic = 'force-dynamic';

import { signInWithPopup } from 'firebase/auth';
import { getClientAuth, getGoogleProvider } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await signInWithPopup(getClientAuth(), getGoogleProvider());
      const idToken = await result.user.getIdToken();

      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (response.ok) {
        router.push('/grimoire');
      } else {
        setError('ログインに失敗しました');
      }
    } catch (err) {
      console.error('Login failed:', err);
      setError('ログインエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 bg-gradient-radial from-purple-900/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-purple-700/10 rounded-full blur-3xl pointer-events-none" />

      <div className="glass-panel p-10 max-w-md w-full relative z-10">
        {/* Moon icon */}
        <div className="text-6xl text-center mb-4 animate-levitate">🌙</div>

        <h1 className="magic-title text-3xl font-bold text-center mb-1">
          Tsukineko Grimoire
        </h1>
        <p className="text-purple-300/60 text-center text-sm mb-8">
          月ねこグリモワール
        </p>

        <div className="space-y-3 mb-8 text-sm text-purple-200/60">
          <div className="flex items-center gap-2">
            <span>📜</span> <span>PDFや論文を魔導書に収蔵</span>
          </div>
          <div className="flex items-center gap-2">
            <span>🔮</span> <span>自然言語で知識を問う</span>
          </div>
          <div className="flex items-center gap-2">
            <span>✨</span> <span>技術記事を自動で詠唱</span>
          </div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="glow-button w-full py-3 text-base flex items-center justify-center gap-3"
        >
          {loading ? (
            <>
              <span className="animate-spin">🌀</span> 召喚中...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </>
          )}
        </button>

        {error && (
          <p className="text-red-400 mt-4 text-center text-sm">{error}</p>
        )}
      </div>
    </main>
  );
}
