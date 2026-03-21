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

// ─── arXiv ID 入力タブ ────────────────────────────────────────────

function ArxivIdTab({ onSuccess }: { onSuccess?: () => void }) {
  const [arxivId, setArxivId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const cleaned = arxivId.trim().replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//, '').replace(/\.pdf$/, '').replace(/v\d+$/, '');
    if (!cleaned) return;

    setLoading(true);
    try {
      const res = await fetch('/api/collector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arxivId: cleaned }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? '取り込みに失敗しました');
        return;
      }

      if (data.skipped > 0) {
        toast.info(`arXiv:${cleaned} は既に書庫に登録済みです`);
      } else {
        toast.success(`✨ arXiv:${cleaned} を取り込みました`, {
          description: data.results?.[0]?.title ?? '',
        });
        setArxivId('');
        onSuccess?.();
      }
    } catch {
      toast.error('取り込み中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-purple-300/60 text-xs leading-relaxed">
        arXiv の論文 ID または URL を入力してください。<br />
        タイトル・著者・要約を自動取得し、HTML 版でインデックスします。
      </p>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400/50" />
          <input
            type="text"
            value={arxivId}
            onChange={e => setArxivId(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !loading) handleSubmit(); }}
            placeholder="2403.10131 または https://arxiv.org/abs/2403.10131"
            className="w-full bg-purple-900/20 border border-purple-500/30 rounded-lg
              pl-9 pr-3 py-2.5 text-purple-100 text-sm placeholder-purple-500/40
              focus:outline-none focus:border-purple-400/60 transition-colors"
            disabled={loading}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!arxivId.trim() || loading}
          className="glow-button px-4 py-2 text-sm disabled:opacity-40 flex-shrink-0"
        >
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 border border-purple-300 border-t-transparent rounded-full animate-spin" />
              取得中
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Upload size={13} />
              追加
            </span>
          )}
        </button>
      </div>

      <div className="bg-purple-900/15 border border-purple-500/15 rounded-lg p-3 text-purple-400/50 text-xs space-y-1">
        <p>📌 対応フォーマット例</p>
        <p className="font-mono">2403.10131 · 2401.04088v2</p>
        <p className="font-mono">https://arxiv.org/abs/2403.10131</p>
      </div>
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
            ? <ArxivIdTab onSuccess={onSuccess} />
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
