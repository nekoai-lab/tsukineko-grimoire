'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Search, FileText, BookOpen, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { formatBytes } from '@/lib/utils';
import Link from 'next/link';

// ─── 型定義 ──────────────────────────────────────────────────────

type Tab = 'arxiv' | 'other';

interface OtherMeta {
  title: string;
  titleJa: string;
  authors: string;
  summary: string;
  docType: string;
  publishedAt: string;
  tags: string;
}

interface FileUploaderProps {
  userId: string;
  onSuccess?: () => void;
}

const DOC_TYPES = [
  { value: 'paper',    label: '論文' },
  { value: 'report',   label: '技術レポート' },
  { value: 'internal', label: '社内資料' },
  { value: 'minutes',  label: '議事録' },
  { value: 'other',    label: 'その他' },
] as const;

// ─── arXiv 一括登録タブ（最大10件：検索 → 確認 → 各自登録）────────

interface ArxivPreview {
  arxivId: string;
  title: string;
  authors: string[];
  summary: string;
  category: string;
  tags?: string[];
  publishedAt: string;
}

type EntryStatus =
  | { kind: 'searching' }
  | { kind: 'preview';     data: ArxivPreview }
  | { kind: 'registering'; data: ArxivPreview }
  | { kind: 'registered';  data: ArxivPreview }
  | { kind: 'duplicate';   arxivId: string; title?: string }
  | { kind: 'not_found';   arxivId: string }
  | { kind: 'invalid';     raw: string }
  | { kind: 'error';       arxivId: string; message: string };

const MAX_ENTRIES = 10;

/** URL/ID を正規化して arXiv ID を返す。無効なら null */
function parseArxivId(raw: string): string | null {
  const s = raw.trim()
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf|html)\//, '')
    .replace(/\.pdf$/, '')
    .replace(/v\d+$/, '')
    .trim();
  // YYMM.NNNNN 形式 or 旧形式7桁
  if (/^\d{4}\.\d{4,5}$/.test(s) || /^\d{7}$/.test(s)) return s;
  return null;
}

function ArxivIdTab() {
  const [input, setInput] = useState('');
  const [entries, setEntries] = useState<EntryStatus[]>([]);
  const [searching, setSearching] = useState(false);
  const [registeringAll, setRegisteringAll] = useState(false);

  const updateEntry = (i: number, next: EntryStatus) =>
    setEntries(prev => prev.map((e, idx) => idx === i ? next : e));

  // Step 1: 一括検索（Firestore 既存チェック込み）
  const handleSearch = async () => {
    const lines = input
      .split(/[\n,]+/)
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, MAX_ENTRIES);

    if (lines.length === 0) return;
    setSearching(true);

    // 初期状態をセット（invalid は即座に確定）
    const initial: EntryStatus[] = lines.map(raw => {
      const id = parseArxivId(raw);
      return id ? { kind: 'searching' } : { kind: 'invalid', raw };
    });
    setEntries(initial);

    // 有効な ID を順番にずらして取得（arXiv API レート制限対策: 350ms 間隔）
    await Promise.all(lines.map(async (raw, i) => {
      await new Promise(r => setTimeout(r, i * 350));
      const id = parseArxivId(raw);
      if (!id) return;
      try {
        const res = await fetch(`/api/arxiv-preview?id=${encodeURIComponent(id)}&check=1`);
        const data = await res.json();
        if (res.status === 404) {
          updateEntry(i, { kind: 'not_found', arxivId: id });
        } else if (!res.ok) {
          updateEntry(i, { kind: 'error', arxivId: id, message: data.error ?? '取得失敗' });
        } else if (data.inLibrary) {
          updateEntry(i, { kind: 'duplicate', arxivId: id, title: data.title });
        } else {
          updateEntry(i, { kind: 'preview', data });
        }
      } catch {
        updateEntry(i, { kind: 'error', arxivId: id, message: 'ネットワークエラー' });
      }
    }));

    setSearching(false);
  };

  // Step 2: 1件ずつ登録（Archive へは遷移しない）
  const handleRegister = async (i: number) => {
    const entry = entries[i];
    if (entry.kind !== 'preview') return;
    const { data } = entry;
    updateEntry(i, { kind: 'registering', data });
    try {
      const res = await fetch('/api/collector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arxivId: data.arxivId }),
      });
      const json = await res.json();
      if (!res.ok) {
        updateEntry(i, { kind: 'error', arxivId: data.arxivId, message: json.error ?? '登録失敗' });
        return;
      }
      if (json.skipped > 0) {
        updateEntry(i, { kind: 'duplicate', arxivId: data.arxivId, title: data.title });
      } else {
        updateEntry(i, { kind: 'registered', data });
      }
    } catch {
      updateEntry(i, { kind: 'error', arxivId: data.arxivId, message: 'ネットワークエラー' });
    }
  };

  // 全件まとめて登録
  const handleRegisterAll = async () => {
    setRegisteringAll(true);
    const previewIndices = entries
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.kind === 'preview')
      .map(({ i }) => i);
    for (const i of previewIndices) {
      await handleRegister(i);
    }
    setRegisteringAll(false);
  };

  const hasEntries = entries.length > 0;
  const previewCount = entries.filter(e => e.kind === 'preview').length;
  const TERMINAL = ['registered', 'duplicate', 'not_found', 'invalid', 'error'];
  const allDone = hasEntries && entries.every(e => TERMINAL.includes(e.kind));

  return (
    <div className="space-y-4">
      <p className="text-purple-300/60 text-xs leading-relaxed">
        arXiv の論文 ID または URL を1行ずつ入力（最大 {MAX_ENTRIES} 件）。
        内容を確認してから1件ずつ登録できます。
      </p>

      {/* 入力エリア */}
      <div className="space-y-2">
        <textarea
          value={input}
          onChange={e => { setInput(e.target.value); setEntries([]); }}
          placeholder={`2403.10131\n2401.04088\nhttps://arxiv.org/abs/2312.00752`}
          rows={4}
          disabled={searching}
          className="w-full bg-purple-900/20 border border-purple-500/30 rounded-lg
            px-3 py-2.5 text-purple-100 text-sm placeholder-purple-500/35
            focus:outline-none focus:border-purple-400/60 transition-colors
            resize-none font-mono leading-relaxed disabled:opacity-50"
        />
        <div className="flex items-center justify-between">
          <p className="text-purple-400/40 text-xs">
            {input.split(/[\n,]+/).filter(l => l.trim()).length} / {MAX_ENTRIES} 件
          </p>
          <button
            onClick={handleSearch}
            disabled={!input.trim() || searching}
            className="glow-button px-4 py-2 text-sm disabled:opacity-40"
          >
            {searching ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 border border-purple-300 border-t-transparent rounded-full animate-spin" />
                検索中...
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Search size={13} />
                まとめて検索
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 結果リスト */}
      <AnimatePresence>
        {hasEntries && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            {/* 全件登録ボタン（preview が2件以上あるとき） */}
            {previewCount >= 2 && (
              <button
                onClick={handleRegisterAll}
                disabled={registeringAll}
                className="w-full glow-button py-2 text-xs disabled:opacity-50"
              >
                {registeringAll ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 border border-purple-300 border-t-transparent rounded-full animate-spin" />
                    一括登録中...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <BookOpen size={13} />
                    {previewCount}件をまとめて登録
                  </span>
                )}
              </button>
            )}

            {entries.map((entry, i) => (
              <EntryCard key={i} entry={entry} onRegister={() => handleRegister(i)} />
            ))}

            {/* 全件完了後にやり直しボタン */}
            {allDone && (
              <button
                onClick={() => { setEntries([]); setInput(''); }}
                className="w-full py-2 text-xs text-purple-400/50 hover:text-purple-300/70
                  border border-purple-500/15 hover:border-purple-500/30
                  rounded-lg transition-all duration-200 mt-1"
              >
                ← 入力に戻る
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* フォーマットヒント（結果がないとき） */}
      {!hasEntries && (
        <div className="bg-purple-900/15 border border-purple-500/15 rounded-lg p-3 text-purple-400/50 text-xs space-y-1">
          <p>📌 対応フォーマット（1行に1件）</p>
          <p className="font-mono">2403.10131</p>
          <p className="font-mono">https://arxiv.org/abs/2403.10131</p>
        </div>
      )}
    </div>
  );
}

/** 1件分の結果カード */
function EntryCard({ entry, onRegister }: { entry: EntryStatus; onRegister: () => void }) {
  if (entry.kind === 'searching') {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-purple-950/30 border border-purple-500/15 rounded-xl">
        <span className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin shrink-0" />
        <span className="text-purple-400/50 text-xs">取得中...</span>
      </div>
    );
  }

  if (entry.kind === 'invalid') {
    return (
      <div className="flex items-start gap-2 px-4 py-3 bg-orange-950/20 border border-orange-500/20 rounded-xl">
        <span className="text-orange-400/70 text-sm shrink-0">⚠️</span>
        <div>
          <p className="text-orange-300/70 text-xs font-medium">認識できない形式です</p>
          <p className="text-orange-400/40 text-xs font-mono mt-0.5">{entry.raw}</p>
          <p className="text-orange-400/40 text-xs mt-1">例: 2403.10131 または arXiv URL を入力してください</p>
        </div>
      </div>
    );
  }

  if (entry.kind === 'not_found') {
    return (
      <div className="flex items-start gap-2 px-4 py-3 bg-red-950/20 border border-red-500/20 rounded-xl">
        <span className="text-red-400/70 text-sm shrink-0">🔍</span>
        <div>
          <p className="text-red-300/70 text-xs font-medium">論文が見つかりませんでした</p>
          <p className="text-red-400/40 text-xs font-mono mt-0.5">{entry.arxivId}</p>
          <p className="text-red-400/40 text-xs mt-1">ID が正しいか、または arXiv に公開済みか確認してください</p>
        </div>
      </div>
    );
  }

  if (entry.kind === 'error') {
    return (
      <div className="flex items-start gap-2 px-4 py-3 bg-red-950/20 border border-red-500/20 rounded-xl">
        <span className="text-red-400/70 text-sm shrink-0">⚠️</span>
        <div>
          <p className="text-red-300/70 text-xs font-medium">取得に失敗しました（時間をおいて再試行してください）</p>
          <p className="text-red-400/40 text-xs font-mono mt-0.5">{entry.arxivId}</p>
        </div>
      </div>
    );
  }

  if (entry.kind === 'duplicate') {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-purple-950/30 border border-purple-500/15 rounded-xl">
        <span className="text-purple-400/50 text-sm shrink-0">✅</span>
        <div className="flex-1 min-w-0">
          <p className="text-purple-400/50 text-xs">すでに書庫に登録済みです</p>
          {entry.title
            ? <p className="text-purple-300/50 text-xs truncate mt-0.5">{entry.title}</p>
            : <p className="text-purple-400/35 text-xs font-mono">{entry.arxivId}</p>
          }
        </div>
      </div>
    );
  }

  if (entry.kind === 'registered') {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-green-950/20 border border-green-500/20 rounded-xl">
        <span className="text-green-400/80 text-sm shrink-0">✅</span>
        <div className="flex-1 min-w-0">
          <p className="text-green-300/70 text-xs font-medium truncate">{entry.data.title}</p>
          <p className="text-green-400/40 text-xs mt-0.5">登録完了 — インデックス化には最大48時間かかります</p>
        </div>
      </div>
    );
  }

  // preview / registering
  const { data } = entry;
  const isRegistering = entry.kind === 'registering';

  return (
    <div className="bg-purple-950/50 border border-purple-500/25 rounded-xl p-4 space-y-2.5">
      <p className="text-purple-100/90 text-sm font-semibold leading-snug">{data.title}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-purple-400/55 text-xs">
        {data.authors.length > 0 && (
          <span>{data.authors.slice(0, 3).join(', ')}{data.authors.length > 3 ? ' et al.' : ''}</span>
        )}
        {data.publishedAt && <span>{data.publishedAt.slice(0, 4)}</span>}
        {data.category && (
          <span className="bg-purple-900/40 border border-purple-500/20 rounded px-1.5 py-0.5">{data.category}</span>
        )}
        {(data.tags ?? []).map(t => (
          <span
            key={t}
            className="bg-purple-900/25 border border-purple-500/15 rounded px-1.5 py-0.5 text-purple-300/65"
          >
            #{t}
          </span>
        ))}
      </div>
      {data.summary && (
        <p className="text-purple-200/45 text-xs leading-relaxed line-clamp-2">{data.summary}</p>
      )}
      <button
        onClick={onRegister}
        disabled={isRegistering}
        className="w-full glow-button py-2 text-xs disabled:opacity-50 mt-1"
      >
        {isRegistering ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 border border-purple-300 border-t-transparent rounded-full animate-spin" />
            登録中...
          </span>
        ) : (
          '✅ 書庫に登録する'
        )}
      </button>
    </div>
  );
}

// ─── その他文書アップロードタブ ───────────────────────────────────

function OtherDocTab({ onSuccess }: { onSuccess?: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<OtherMeta>({
    title: '', titleJa: '', authors: '', summary: '',
    docType: 'paper', publishedAt: '', tags: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setField = (key: keyof OtherMeta) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setMeta(prev => ({ ...prev, [key]: e.target.value }));

  const handleFile = (f: File) => {
    setFile(f);
    if (!meta.title) setMeta(prev => ({ ...prev, title: f.name.replace(/\.[^.]+$/, '') }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file || !meta.title.trim()) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', meta.title);
      formData.append('titleJa', meta.titleJa);
      formData.append('authors', meta.authors);
      formData.append('summary', meta.summary);
      formData.append('docType', meta.docType);
      formData.append('publishedAt', meta.publishedAt);
      formData.append('tags', meta.tags);

      const res = await fetch('/api/ingest', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'アップロードに失敗しました');
        return;
      }

      toast.success(`✨ "${meta.title}" を取り込みました`, {
        description: 'インデックス化には最大48時間かかります',
      });
      setFile(null);
      setMeta({ title: '', titleJa: '', authors: '', summary: '', docType: 'paper', publishedAt: '', tags: '' });
      onSuccess?.();
    } catch {
      toast.error('アップロード中にエラーが発生しました');
    } finally {
      setUploading(false);
    }
  };

  const inputClass = `w-full bg-purple-900/20 border border-purple-500/30 rounded-lg px-3 py-2
    text-purple-100 text-sm placeholder-purple-500/40
    focus:outline-none focus:border-purple-400/60 transition-colors`;
  const labelClass = 'text-purple-300/60 text-xs';

  return (
    <div className="space-y-4">
      {/* ファイルドロップゾーン */}
      {!file ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center
            justify-center text-center cursor-pointer transition-all duration-300
            ${dragging
              ? 'border-purple-400 bg-purple-900/10'
              : 'border-purple-500/25 hover:border-purple-400/40'}`}
        >
          <input ref={fileInputRef} type="file" accept=".pdf,.md,.txt" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
          <FileText size={32} className="text-purple-400/30 mb-3" />
          <p className="text-purple-300/60 text-sm">PDF / Markdown をドロップ</p>
          <p className="text-purple-400/40 text-xs mt-1">またはクリックして選択</p>
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-purple-900/20 border border-purple-500/20 rounded-xl p-3">
          <FileText size={18} className="text-purple-400/60 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-purple-100/80 text-sm truncate">{file.name}</p>
            <p className="text-purple-400/40 text-xs">{formatBytes(file.size)}</p>
          </div>
          <button onClick={() => setFile(null)} className="text-purple-400/40 hover:text-purple-300/60 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* メタデータフォーム */}
      <div className="space-y-3">
        {/* タイトル */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className={labelClass}>タイトル（英語）<span className="text-red-400 ml-0.5">*</span></label>
            <input type="text" value={meta.title} onChange={setField('title')}
              placeholder="Document title" className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>タイトル（日本語）</label>
            <input type="text" value={meta.titleJa} onChange={setField('titleJa')}
              placeholder="文書タイトル" className={inputClass} />
          </div>
        </div>

        {/* 文書種別 + 作成日 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className={labelClass}>文書種別</label>
            <select value={meta.docType} onChange={setField('docType')}
              className={inputClass + ' cursor-pointer'}>
              {DOC_TYPES.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>作成日</label>
            <input type="date" value={meta.publishedAt} onChange={setField('publishedAt')}
              className={inputClass} />
          </div>
        </div>

        {/* 著者 */}
        <div className="space-y-1">
          <label className={labelClass}>著者 / 作成者（カンマ区切り）</label>
          <input type="text" value={meta.authors} onChange={setField('authors')}
            placeholder="山田 太郎, 佐藤 花子" className={inputClass} />
        </div>

        {/* 概要 */}
        <div className="space-y-1">
          <label className={labelClass}>概要（任意）</label>
          <textarea value={meta.summary} onChange={setField('summary')}
            placeholder="この文書の内容を簡単に説明..."
            rows={3}
            className={inputClass + ' resize-none'} />
        </div>

        {/* タグ */}
        <div className="space-y-1">
          <label className={labelClass}>タグ（カンマ区切り）</label>
          <input type="text" value={meta.tags} onChange={setField('tags')}
            placeholder="RAG, LLM, 社内プロジェクト名" className={inputClass} />
        </div>
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || !meta.title.trim() || uploading}
        className="w-full glow-button py-2.5 text-sm disabled:opacity-40"
      >
        {uploading ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-3.5 h-3.5 border border-purple-300 border-t-transparent rounded-full animate-spin" />
            取り込んでいます...
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <Upload size={14} />
            取り込む
          </span>
        )}
      </button>
    </div>
  );
}

// ─── メインコンポーネント ─────────────────────────────────────────

export function FileUploader({ onSuccess }: FileUploaderProps) {
  const [tab, setTab] = useState<Tab>('arxiv');

  const tabClass = (t: Tab) =>
    `flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg
     transition-all duration-200
     ${tab === t
       ? 'bg-purple-700/40 text-purple-100 shadow-inner'
       : 'text-purple-400/60 hover:text-purple-300/80'}`;

  return (
    <div className="space-y-5">
      {/* タブ */}
      <div className="flex gap-1 bg-purple-900/20 border border-purple-500/20 rounded-xl p-1">
        <button className={tabClass('arxiv')} onClick={() => setTab('arxiv')}>
          <BookOpen size={13} />
          arXiv 論文
        </button>
        <button className={tabClass('other')} onClick={() => setTab('other')}>
          <FileText size={13} />
          その他の文書
        </button>
      </div>

      {/* タブコンテンツ */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
          className="glass-panel border border-purple-500/30 rounded-xl p-5"
        >
          {tab === 'arxiv'
            ? <ArxivIdTab />
            : <OtherDocTab onSuccess={onSuccess} />
          }
        </motion.div>
      </AnimatePresence>

      {/* 戻るリンク */}
      <div className="text-center">
        <Link
          href="/archive"
          className="inline-flex items-center gap-1.5 text-xs text-purple-400/50
            hover:text-purple-300/70 transition-colors"
        >
          ← 書庫に戻る
        </Link>
      </div>
    </div>
  );
}
