'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getClientAuth, getClientDb, getGoogleProvider } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? '';

const DEFAULT_KEYWORDS = ['LLM', 'RAG', 'Retrieval Augmented Generation', 'Agent'];

const SIGN_IN_FEATURES = [
  { icon: '🛰️', label: '論文の追加', desc: 'arXivから論文をインデックス' },
  { icon: '🗂', label: 'マイ本棚', desc: '論文を保存・整理' },
];

export function SettingsPanel() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signInLoading, setSignInLoading] = useState(false);
  const [signInError, setSignInError] = useState('');

  // コレクター設定
  const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
  const [keywordsInput, setKeywordsInput] = useState('');
  const [maxResults, setMaxResults] = useState(5);
  const [minCitations, setMinCitations] = useState(50);
  const [collectorEnabled, setCollectorEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const isAdmin = Boolean(ADMIN_EMAIL) && user?.email === ADMIN_EMAIL;

  useEffect(() => {
    const auth = getClientAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) await loadCollectorSettings();
    });
    return () => unsub();
  }, []);

  async function loadCollectorSettings() {
    try {
      const db = getClientDb();
      const snap = await getDoc(doc(db, 'settings', 'collector'));
      if (snap.exists()) {
        const d = snap.data();
        if (Array.isArray(d.keywords)) setKeywords(d.keywords);
        if (typeof d.maxResults === 'number') setMaxResults(d.maxResults);
        if (typeof d.minCitations === 'number') setMinCitations(d.minCitations);
        if (typeof d.enabled === 'boolean') setCollectorEnabled(d.enabled);
      }
    } catch { /* 設定未存在はデフォルト値で続行 */ }
    setSettingsLoaded(true);
  }

  async function saveCollectorSettings() {
    setSaving(true);
    try {
      const db = getClientDb();
      await setDoc(doc(db, 'settings', 'collector'), {
        keywords,
        maxResults,
        minCitations,
        enabled: collectorEnabled,
        updatedAt: new Date(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Settings save failed:', e);
    }
    setSaving(false);
  }

  function addKeyword() {
    const kw = keywordsInput.trim();
    if (kw && !keywords.includes(kw)) {
      setKeywords([...keywords, kw]);
    }
    setKeywordsInput('');
  }

  function removeKeyword(kw: string) {
    setKeywords(keywords.filter(k => k !== kw));
  }

  async function handleGoogleSignIn() {
    setSignInLoading(true);
    setSignInError('');
    try {
      const result = await signInWithPopup(getClientAuth(), getGoogleProvider());
      const idToken = await result.user.getIdToken();
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) setSignInError('サインインに失敗しました');
    } catch {
      setSignInError('サインインエラーが発生しました');
    } finally {
      setSignInLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
      await signOut(getClientAuth());
      router.push('/login');
    } catch (e) {
      console.error('Sign out failed:', e);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-purple-300/50 text-sm">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-4">
      <div>
        <h1 className="magic-title text-2xl sm:text-3xl font-bold mb-1">⚙️ Settings</h1>
        <p className="text-purple-300/60 text-sm">魔導書の設定</p>
      </div>

      {/* ── 未サインイン時：サインイン促進 ── */}
      {!user && (
        <div className="glass-panel p-6 space-y-5">
          <div className="text-center space-y-1">
            <p className="text-purple-200/80 text-sm font-medium">Google アカウントでサインイン</p>
            <p className="text-purple-400/55 text-xs">サインインすると以下の機能が使えます</p>
          </div>

          <div className="space-y-2 px-2">
            {SIGN_IN_FEATURES.map(f => (
              <div key={f.label} className="flex items-center gap-2 text-sm">
                <span className="text-base w-5 shrink-0">{f.icon}</span>
                <span className="text-purple-200/75 font-medium w-24 shrink-0">{f.label}</span>
                <span className="text-purple-400/45 text-xs">— {f.desc}</span>
              </div>
            ))}
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={signInLoading}
            className="glow-button w-full py-3 text-sm flex items-center justify-center gap-3"
          >
            {signInLoading ? (
              <><span className="animate-spin">🌀</span> ログイン中...</>
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </>
            )}
          </button>
          {signInError && <p className="text-red-400 text-center text-xs">{signInError}</p>}
        </div>
      )}

      {/* ── サインイン済み：アカウント ── */}
      {user && (
        <div className="glass-panel p-6">
          <h2 className="text-purple-200 font-semibold mb-4">🔐 アカウント</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {user.photoURL && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt="avatar" className="w-10 h-10 rounded-full" />
              )}
              <div>
                <p className="text-purple-200 text-sm font-medium">{user.displayName}</p>
                <p className="text-purple-300/60 text-xs">{user.email}</p>
                {isAdmin && (
                  <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded-sm bg-purple-700/30 border border-purple-500/30 text-purple-300/70">
                    管理者
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              サインアウト
            </button>
          </div>
        </div>
      )}

      {/* ── 管理者専用：Vertex AI ── */}
      {isAdmin && (
        <div className="glass-panel p-6">
          <h2 className="text-purple-200 font-semibold mb-4">🤖 Vertex AI Agent Builder</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-purple-300/60">Location</span>
              <span className="text-green-400 font-mono">global</span>
            </div>
            <div className="flex justify-between">
              <span className="text-purple-300/60">Engine</span>
              <span className="text-purple-200/50 font-mono text-xs">
                {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? 'configured ✓' : 'not configured'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── 管理者専用：Auto Collector ── */}
      {isAdmin && (
        <div className="glass-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-purple-200 font-semibold">🛰️ Auto Collector</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-purple-300/60 text-xs">{collectorEnabled ? '有効' : '無効'}</span>
              <div
                onClick={() => setCollectorEnabled(!collectorEnabled)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  collectorEnabled ? 'bg-purple-600' : 'bg-purple-900/50'
                }`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                  collectorEnabled ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </div>
            </label>
          </div>

          {settingsLoaded && (
            <div className="space-y-4">
              {/* キーワード */}
              <div>
                <label className="text-purple-300/60 text-xs mb-2 block">収集キーワード</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {keywords.map(kw => (
                    <span
                      key={kw}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-700/30 border border-purple-500/30 text-purple-200 text-xs"
                    >
                      {kw}
                      <button
                        onClick={() => removeKeyword(kw)}
                        className="text-purple-400 hover:text-red-400 transition-colors ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={keywordsInput}
                    onChange={e => setKeywordsInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addKeyword()}
                    placeholder="キーワードを追加..."
                    className="flex-1 bg-purple-900/20 border border-purple-500/20 rounded-lg px-3 py-1.5 text-purple-200 text-sm placeholder-purple-400/30 focus:outline-hidden focus:border-purple-500/50"
                  />
                  <button
                    onClick={addKeyword}
                    className="px-3 py-1.5 rounded-lg bg-purple-700/30 border border-purple-500/30 text-purple-200 text-sm hover:bg-purple-700/50 transition-colors"
                  >
                    追加
                  </button>
                </div>
              </div>

              {/* 件数・被引用数 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-purple-300/60 text-xs mb-1 block">最大取得件数/回</label>
                  <input
                    type="number"
                    value={maxResults}
                    onChange={e => setMaxResults(Math.min(20, Math.max(1, Number(e.target.value))))}
                    min={1} max={20}
                    className="w-full bg-purple-900/20 border border-purple-500/20 rounded-lg px-3 py-1.5 text-purple-200 text-sm focus:outline-hidden focus:border-purple-500/50"
                  />
                </div>
                <div>
                  <label className="text-purple-300/60 text-xs mb-1 block">最低被引用数</label>
                  <input
                    type="number"
                    value={minCitations}
                    onChange={e => setMinCitations(Math.max(0, Number(e.target.value)))}
                    min={0}
                    className="w-full bg-purple-900/20 border border-purple-500/20 rounded-lg px-3 py-1.5 text-purple-200 text-sm focus:outline-hidden focus:border-purple-500/50"
                  />
                  <p className="text-purple-400/50 text-xs mt-0.5">0 = フィルタ無効</p>
                </div>
              </div>

              {/* 保存ボタン */}
              <button
                onClick={saveCollectorSettings}
                disabled={saving}
                className="w-full py-2 rounded-lg bg-purple-600/40 border border-purple-500/40 text-purple-200 text-sm hover:bg-purple-600/60 transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : saved ? '✓ 保存しました' : '設定を保存'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
