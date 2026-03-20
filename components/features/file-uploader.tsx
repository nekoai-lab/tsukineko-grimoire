'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { formatBytes } from '@/lib/utils';
import Link from 'next/link';

interface PendingFile {
  file: File;
  title: string;
  isArxiv: boolean;
}

interface FileUploaderProps {
  userId: string;
  onSuccess?: () => void;
}

function detectArxivId(filename: string): string | null {
  const match = filename.match(/(\d{4}\.\d{4,5})(v\d+)?/);
  return match ? match[1] : null;
}

export function FileUploader({ onSuccess }: FileUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState<PendingFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    const arxivId = detectArxivId(file.name);
    if (arxivId) {
      setPending({ file, title: '', isArxiv: true });
    } else {
      setPending({ file, title: file.name.replace(/\.[^.]+$/, ''), isArxiv: false });
    }
  }, []);

  const uploadFile = useCallback(async () => {
    if (!pending) return;
    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', pending.file);
      if (!pending.isArxiv && pending.title) {
        formData.append('title', pending.title);
      }

      setProgress(30);
      const res = await fetch('/api/ingest', { method: 'POST', body: formData });
      setProgress(85);
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'アップロードに失敗しました');
        return;
      }

      setProgress(100);
      const displayTitle = data.title ?? pending.file.name;
      toast.success(`✨ "${displayTitle}" を取り込みました`, {
        description: data.arxivId
          ? `arXiv:${data.arxivId} のメタデータを自動取得しました`
          : 'インデックス化には最大48時間かかります',
      });

      setPending(null);
      onSuccess?.();
    } catch {
      toast.error('アップロード中にエラーが発生しました');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [pending, onSuccess]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-5">
      {/* Pending: confirm/title input */}
      <AnimatePresence>
        {pending && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass-panel border border-purple-500/40 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">📄</span>
              <div className="flex-1 min-w-0">
                <p className="text-purple-100/90 text-sm font-medium truncate">{pending.file.name}</p>
                <p className="text-purple-300/50 text-xs mt-0.5">{formatBytes(pending.file.size)}</p>
              </div>
            </div>

            {pending.isArxiv ? (
              <div className="bg-green-900/15 border border-green-600/20 rounded-lg p-3
                flex items-start gap-2">
                <span className="text-green-400 text-sm mt-0.5">✓</span>
                <p className="text-purple-200/70 text-xs leading-relaxed">
                  arXiv 論文を検出しました。<br />
                  タイトル・著者・要約・カテゴリを自動取得します。
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-purple-300/60 text-xs">タイトル</label>
                <input
                  type="text"
                  value={pending.title}
                  onChange={e => setPending(prev => prev ? { ...prev, title: e.target.value } : null)}
                  placeholder="ドキュメントのタイトルを入力"
                  className="w-full bg-purple-900/20 border border-purple-500/30 rounded-lg px-3 py-2
                    text-purple-100 text-sm placeholder-purple-500/40 focus:outline-none
                    focus:border-purple-400/60 transition-colors"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter' && pending.title.trim()) uploadFile();
                  }}
                />
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPending(null)}
                className="px-4 py-1.5 text-xs text-purple-300/60 hover:text-purple-300
                  border border-purple-500/20 rounded-lg transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={uploadFile}
                disabled={!pending.isArxiv && !pending.title.trim()}
                className="glow-button px-4 py-1.5 text-xs disabled:opacity-40"
              >
                <Upload size={11} className="inline mr-1.5" />
                取り込む
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drop zone */}
      {!pending && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`
            glass-panel border-2 border-dashed rounded-xl p-12 flex flex-col items-center
            justify-center text-center cursor-pointer transition-all duration-300
            ${dragging
              ? 'border-purple-400 shadow-[0_0_30px_rgba(167,139,250,0.3)] bg-purple-900/10'
              : 'border-purple-500/30 hover:border-purple-400/50'}
            ${uploading ? 'opacity-60 cursor-not-allowed' : ''}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.md,.txt"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />

          <motion.div
            animate={dragging ? { scale: 1.2 } : { scale: 1, y: [0, -6, 0] }}
            transition={
              dragging
                ? { duration: 0.2 }
                : { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }
            }
            className="text-5xl mb-4"
          >
            📜
          </motion.div>

          {uploading ? (
            <div className="w-full max-w-xs">
              <p className="text-purple-200/70 text-sm mb-3">取り込んでいます...</p>
              <div className="h-1.5 bg-purple-900/40 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>
          ) : (
            <>
              <p className="text-purple-200/70 text-base mb-1">
                {dragging ? '✨ ここにドロップ' : 'PDF / Markdown をドロップ'}
              </p>
              <p className="text-purple-300/40 text-xs">
                最大 {process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? '100'}MB
              </p>
              <button
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="mt-5 glow-button px-5 py-2 text-sm"
              >
                <Upload size={14} className="inline mr-2" />
                ファイルを選択
              </button>
            </>
          )}
        </div>
      )}

      {/* Back link */}
      <div className="text-center">
        <Link
          href="/archive"
          className="inline-flex items-center gap-1.5 text-xs text-purple-400/50
            hover:text-purple-300/70 transition-colors"
        >
          <ArrowLeft size={12} />
          書庫に戻る
        </Link>
      </div>
    </div>
  );
}
