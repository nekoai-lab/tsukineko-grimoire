'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getClientAuth, getClientDb } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

const DEFAULT_KEYWORDS = ['LLM', 'RAG', 'Retrieval Augmented Generation', 'Agent'];

export function SettingsPanel() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // コレクター設定
  const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
  const [keywordsInput, setKeywordsInput] = useState('');
  const [maxResults, setMaxResults] = useState(5);
  const [minCitations, setMinCitations] = useState(50);
  const [collectorEnabled, setCollectorEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

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

      {/* アカウント */}
      <div className="glass-panel p-6">
        <h2 className="text-purple-200 font-semibold mb-4">🔐 アカウント</h2>
        {user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {user.photoURL && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt="avatar" className="w-10 h-10 rounded-full" />
              )}
              <div>
                <p className="text-purple-200 text-sm font-medium">{user.displayName}</p>
                <p className="text-purple-300/60 text-xs">{user.email}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              サインアウト
            </button>
          </div>
        ) : (
          <p className="text-purple-300/50 text-sm">サインインしていません</p>
        )}
      </div>

      {/* Vertex AI Agent Builder */}
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

      {/* コレクター設定 */}
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
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
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
                  className="flex-1 bg-purple-900/20 border border-purple-500/20 rounded-lg px-3 py-1.5 text-purple-200 text-sm placeholder-purple-400/30 focus:outline-none focus:border-purple-500/50"
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
                  className="w-full bg-purple-900/20 border border-purple-500/20 rounded-lg px-3 py-1.5 text-purple-200 text-sm focus:outline-none focus:border-purple-500/50"
                />
              </div>
              <div>
                <label className="text-purple-300/60 text-xs mb-1 block">最低被引用数</label>
                <input
                  type="number"
                  value={minCitations}
                  onChange={e => setMinCitations(Math.max(0, Number(e.target.value)))}
                  min={0}
                  className="w-full bg-purple-900/20 border border-purple-500/20 rounded-lg px-3 py-1.5 text-purple-200 text-sm focus:outline-none focus:border-purple-500/50"
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
    </div>
  );
}
