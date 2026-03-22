'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, X, ExternalLink, BookOpen, FileText, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageBubble } from './message-bubble';

/** Agent Builder が返すスニペットに含まれる HTML タグを除去 */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * 日本語の連続テキストを段落分けして ReactMarkdown が読みやすいマークダウンに変換。
 * 「。」で文を分割し、2〜3文ごとに改行を挿入する。
 */
function formatSummaryAsMarkdown(text: string): string {
  if (!text) return '';
  // 「。」で区切り、空文字を除去
  const sentences = text.split('。').map(s => s.trim()).filter(Boolean);
  const paragraphs: string[] = [];
  // 2文ずつ段落にまとめる
  for (let i = 0; i < sentences.length; i += 2) {
    const chunk = sentences.slice(i, i + 2).join('。') + '。';
    paragraphs.push(chunk);
  }
  return paragraphs.join('\n\n');
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

interface Citation {
  title?: string;
  titleJa?: string;
  uri?: string;
  arxivId?: string;
  publishedAt?: string;
  chunkContents?: Array<{ content?: string }>;
}

interface RelatedDoc {
  title: string;
  titleJa: string;
  arxivId: string;
}

interface EnrichedCitation {
  titleJa: string;
  summaryJa: string;
  authors: string[];
  publishedAt: string;
  category: string;
  translatedSnippets: Array<{ en: string; ja: string }>;
  links: { abstract: string; html: string; pdf: string };
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  suggestions?: string[];
  relatedDocs?: RelatedDoc[];
}

interface ChatInterfaceProps {
  chatId: string;
}

const PANEL_MIN = 240;
const PANEL_DEFAULT = 320;

export function ChatInterface({ chatId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(PANEL_DEFAULT);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - ev.clientX; // 左に引くと広がる
      const maxWidth = Math.floor(window.innerWidth * 0.6);
      const next = Math.min(maxWidth, Math.max(PANEL_MIN, dragStartWidth.current + delta));
      setPanelWidth(next);
    };
    const onUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [panelWidth]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = useCallback(async () => {
    const question = input.trim();
    if (!question || loading) return;

    setInput('');
    setLoading(true);

    setMessages(prev => [...prev, { role: 'user', content: question }]);

    try {
      // 送信時点の履歴（今追加したユーザーメッセージは除く）をコンテキストとして渡す
      const historySnapshot = messages.map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history: historySnapshot, chatId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? '予期せぬエラーが発生しました');
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: data.error ?? '予期せぬ魔法の干渉が発生しました' },
        ]);
        return;
      }

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          citations: data.citations,
          suggestions: data.suggestions,
          relatedDocs: data.relatedDocs,
        },
      ]);
    } catch {
      toast.error('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }, [input, loading, messages, chatId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME変換中（isComposing）はEnterを無視して送信しない
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // テキスト選択からの深掘り
  // displayMessage: チャットに表示する日本語文
  // searchQuery: Agent Builder に投げる検索キーワード（選択テキストそのもの）
  const handleDeepDive = useCallback((selectedText: string) => {
    const displayMessage = `「${selectedText}」についてもっと詳しく教えてください`;
    const searchQuery = selectedText; // 自然文ではなくキーワードのみを検索に使う

    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: displayMessage }]);

    const historySnapshot = messages.map(m => ({ role: m.role, content: m.content }));
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: searchQuery, history: historySnapshot, chatId }),
    })
      .then(r => r.json())
      .then(data => {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: data.answer ?? data.error ?? 'エラーが発生しました', citations: data.citations },
        ]);
      })
      .catch(() => {
        setMessages(prev => [...prev, { role: 'assistant', content: 'ネットワークエラーが発生しました' }]);
      })
      .finally(() => {
        setLoading(false);
        textareaRef.current?.focus();
      });
  }, [messages, chatId]);

  return (
    <div className="flex h-full">
      {/* Left: Chat */}
      <div className="flex flex-col flex-1 min-w-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <AnimatePresence>
          {messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-center py-16"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="text-5xl mb-4"
              >
                🔮
              </motion.div>
              <p className="text-purple-200/60 text-lg">魔導書に問いかけてください</p>
              <p className="text-purple-300/30 text-sm mt-2">
                Shift+Enter で改行 / Enter で送信
              </p>
            </motion.div>
          ) : (
            messages.map((msg, i) => (
              <MessageBubble
                key={i}
                role={msg.role}
                content={msg.content}
                citations={msg.citations}
                suggestions={msg.suggestions}
                relatedDocs={msg.relatedDocs}
                onCitationClick={setSelectedCitation}
                onDeepDive={handleDeepDive}
              />
            ))
          )}
        </AnimatePresence>

        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="w-7 h-7 rounded-full bg-purple-700/80 flex items-center justify-center text-xs flex-shrink-0 mt-1">
              🌙
            </div>
            <div className="bg-black/40 border border-purple-500/20 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1.5 items-center">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    className="w-1.5 h-1.5 bg-purple-400 rounded-full"
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-purple-500/20">
        <div className="flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="魔導書に問いかける... (Enter で送信)"
            rows={1}
            className="magic-input flex-1 px-4 py-2.5 resize-none leading-relaxed
              min-h-[44px] max-h-32 overflow-y-auto"
            style={{ height: 'auto' }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
            }}
            disabled={loading}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || loading}
            className="glow-button p-2.5 flex-shrink-0"
            aria-label="送信"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
      </div>
      </div>{/* end Left */}

      {/* Desktop: Right slide panel (resizable) */}
      {!isMobile && (
        <AnimatePresence>
          {selectedCitation && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: panelWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="flex-shrink-0 border-l border-purple-500/20 bg-black/30 overflow-hidden relative"
              style={{ width: panelWidth }}
            >
              {/* Resize handle */}
              <div
                onMouseDown={onResizeStart}
                className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize
                  hover:bg-purple-500/40 transition-colors z-10 group"
                title="ドラッグで幅を調整"
              >
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8
                  bg-purple-500/20 group-hover:bg-purple-400/60 rounded-r transition-colors" />
              </div>

              <div className="h-full flex flex-col pl-1">
                <CitationPanelContent
                  citation={selectedCitation}
                  onClose={() => setSelectedCitation(null)}
                  onAskAbout={(query) => { setSelectedCitation(null); handleDeepDive(query); }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Mobile: Bottom sheet */}
      {isMobile && (
        <AnimatePresence>
          {selectedCitation && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 z-40"
                onClick={() => setSelectedCitation(null)}
              />
              {/* Sheet */}
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-50
                  bg-[#0d0d0d] border-t border-purple-500/20 rounded-t-2xl
                  flex flex-col"
                style={{ maxHeight: '60dvh' }}
              >
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                  <div className="w-10 h-1 bg-purple-500/30 rounded-full" />
                </div>
                <CitationPanelContent
                  citation={selectedCitation}
                  onClose={() => setSelectedCitation(null)}
                  onAskAbout={(query) => { setSelectedCitation(null); handleDeepDive(query); }}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

interface PaperFigure {
  url: string;
  caption: string;
  captionJa: string;
  label: string;
}

function CitationPanelContent({
  citation,
  onClose,
  onAskAbout,
}: {
  citation: Citation;
  onClose: () => void;
  onAskAbout: (query: string) => void;
}) {
  const [enriched, setEnriched] = useState<EnrichedCitation | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [showEn, setShowEn] = useState<Record<number, boolean>>({});
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [figures, setFigures] = useState<PaperFigure[]>([]);
  const [figureIdx, setFigureIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Escape でライトボックスを閉じる
  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxOpen]);

  useEffect(() => {
    if (!citation.arxivId) return;
    setEnriched(null);
    setShowEn({});
    setSummaryOpen(false);
    setFigures([]);
    setFigureIdx(0);
    setLightboxOpen(false);
    setEnrichLoading(true);

    const snippets = (citation.chunkContents ?? [])
      .map(c => c.content ?? '')
      .filter(Boolean);

    // メタデータ取得
    fetch('/api/citation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arxivId: citation.arxivId, snippets }),
    })
      .then(r => r.json())
      .then((data: EnrichedCitation) => setEnriched(data))
      .catch(() => {/* サイレント失敗 */})
      .finally(() => setEnrichLoading(false));

    // 代表図を取得（非同期・失敗しても問題なし）
    fetch(`/api/paper-figures?arxivId=${encodeURIComponent(citation.arxivId)}`)
      .then(r => r.json())
      .then((data: { figures: PaperFigure[] }) => {
        if (data.figures?.length) setFigures(data.figures);
      })
      .catch(() => {/* サイレント失敗 */});
  }, [citation.arxivId, citation.chunkContents]);

  const snippetsToShow = enriched?.translatedSnippets.length
    ? enriched.translatedSnippets
    : (citation.chunkContents ?? []).map(c => ({ en: c.content ?? '', ja: '' }));

  // "この論文についてグリモワールに聞く" で使うタイトル（日本語優先）
  const askTitle = enriched?.titleJa || citation.title || '';

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-purple-500/20 flex-shrink-0">
        <span className="text-purple-400/80 text-xs font-medium tracking-wide uppercase">
          Citation Preview
        </span>
        <button
          onClick={onClose}
          className="text-purple-400/50 hover:text-purple-200 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Title block */}
        <div className="space-y-1.5">
          {enrichLoading && !enriched ? (
            <div className="flex items-center gap-2">
              <Loader2 size={11} className="animate-spin text-purple-400/50 flex-shrink-0" />
              <p className="text-purple-400/40 text-xs">論文情報を取得中...</p>
            </div>
          ) : (
            <>
              {/* 日本語タイトル（常時表示） */}
              {enriched?.titleJa && (
                <p className="text-purple-100 text-sm font-semibold leading-snug">
                  {enriched.titleJa}
                </p>
              )}
              {/* 英語タイトル（常時表示・日本語がある場合はサブ扱い） */}
              <p className={enriched?.titleJa
                ? 'text-purple-300/60 text-xs leading-snug'
                : 'text-purple-100 text-sm font-semibold leading-snug'
              }>
                {citation.title ?? 'Untitled Document'}
              </p>
            </>
          )}

          {/* Meta: 著者・年・カテゴリ */}
          {enriched && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-purple-400/55 text-xs mt-0.5">
              {enriched.authors.length > 0 && (
                <span>{enriched.authors.slice(0, 3).join(', ')}{enriched.authors.length > 3 ? ' et al.' : ''}</span>
              )}
              {enriched.publishedAt && <span>{enriched.publishedAt.slice(0, 4)}</span>}
              {enriched.category && (
                <span className="bg-purple-900/40 border border-purple-500/20 rounded px-1.5 py-0.5">
                  {enriched.category}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 代表図 */}
        {figures.length > 0 && (() => {
          const fig = figures[figureIdx];
          return (
            <div className="space-y-1.5">
              {/* サムネイル（クリックで拡大） */}
              <div
                className="relative bg-white rounded-xl overflow-hidden border border-purple-500/10
                  cursor-zoom-in group"
                style={{ minHeight: '100px' }}
                onClick={() => setLightboxOpen(true)}
                title="クリックして拡大"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fig?.url}
                  alt={fig?.captionJa || fig?.caption}
                  className="w-full object-contain max-h-48 transition-opacity group-hover:opacity-90"
                  loading="lazy"
                  onError={() => {
                    const next = figures.filter((_, i) => i !== figureIdx);
                    setFigures(next);
                    setFigureIdx(0);
                  }}
                />
                {/* 拡大アイコン（ホバー時） */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="bg-black/60 text-white text-xs px-2 py-1 rounded-lg">🔍 拡大</span>
                </div>
                {/* 複数図ナビ */}
                {figures.length > 1 && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5"
                    onClick={e => e.stopPropagation()}>
                    {figures.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setFigureIdx(i)}
                        className={`w-1.5 h-1.5 rounded-full transition-colors
                          ${i === figureIdx ? 'bg-purple-200' : 'bg-purple-500/40 hover:bg-purple-400/60'}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              {/* キャプション（日本語優先） */}
              {(fig?.captionJa || fig?.caption) && (
                <p className="text-purple-400/50 text-xs leading-relaxed line-clamp-2">
                  {fig.captionJa || fig.caption}
                </p>
              )}

              {/* ライトボックス */}
              <AnimatePresence>
                {lightboxOpen && fig && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 bg-black/85 z-[200] flex flex-col items-center justify-center p-4"
                      onClick={() => setLightboxOpen(false)}
                    >
                      {/* 閉じるボタン */}
                      <button
                        className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors z-10"
                        onClick={() => setLightboxOpen(false)}
                      >
                        <X size={24} />
                      </button>

                      {/* 画像 */}
                      <motion.div
                        initial={{ scale: 0.92, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.92, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="max-w-4xl w-full max-h-[75vh] flex flex-col items-center gap-4"
                        onClick={e => e.stopPropagation()}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={fig.url}
                          alt={fig.captionJa || fig.caption}
                          className="max-w-full max-h-[60vh] object-contain rounded-xl shadow-2xl bg-white p-2"
                        />

                        {/* キャプション */}
                        {(fig.captionJa || fig.caption) && (
                          <div className="text-center space-y-1 max-w-2xl">
                            {fig.captionJa && (
                              <p className="text-white/90 text-sm leading-relaxed">{fig.captionJa}</p>
                            )}
                            {fig.caption && fig.captionJa !== fig.caption && (
                              <p className="text-white/45 text-xs leading-relaxed italic">{fig.caption}</p>
                            )}
                          </div>
                        )}

                        {/* 複数図ナビ（ライトボックス内） */}
                        {figures.length > 1 && (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setFigureIdx(i => (i - 1 + figures.length) % figures.length)}
                              className="text-white/50 hover:text-white transition-colors text-lg"
                            >‹</button>
                            <span className="text-white/40 text-xs">{figureIdx + 1} / {figures.length}</span>
                            <button
                              onClick={() => setFigureIdx(i => (i + 1) % figures.length)}
                              className="text-white/50 hover:text-white transition-colors text-lg"
                            >›</button>
                          </div>
                        )}
                      </motion.div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          );
        })()}

        {/* 引用箇所（最重要：なぜ引用されたか） */}
        {snippetsToShow.length > 0 && (
          <div className="space-y-2">
            <p className="text-purple-400/60 text-xs">📌 回答で引用された箇所</p>
            {snippetsToShow.map((s, i) => {
              const cleanJa = stripHtml(s.ja);
              const cleanEn = stripHtml(s.en);
              return (
                <div key={i} className="bg-purple-950/40 border border-purple-500/15 rounded-xl p-3 space-y-2">
                  {cleanJa && cleanJa !== cleanEn ? (
                    <>
                      <p className="text-purple-100/90 text-xs leading-relaxed">{cleanJa}</p>
                      <button
                        onClick={() => setShowEn(prev => ({ ...prev, [i]: !prev[i] }))}
                        className="text-purple-500/50 hover:text-purple-400/70 text-xs transition-colors"
                      >
                        {showEn[i] ? '原文を隠す ▲' : '英語原文を表示 ▼'}
                      </button>
                      {showEn[i] && (
                        <p className="text-purple-400/50 text-xs leading-relaxed border-t border-purple-500/10 pt-2 italic">
                          {cleanEn}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-purple-100/80 text-xs leading-relaxed">{cleanEn}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 概要（折りたたみ・Markdown レンダリング） */}
        {enriched?.summaryJa && (
          <div className="space-y-1.5">
            <button
              onClick={() => setSummaryOpen(o => !o)}
              className="flex items-center gap-1.5 text-purple-400/60 text-xs hover:text-purple-300/80 transition-colors w-full text-left"
            >
              <span>{summaryOpen ? '▲' : '▼'}</span>
              <span>論文の概要（日本語）</span>
            </button>
            {summaryOpen && (
              <div className="bg-purple-950/30 border border-purple-500/10 rounded-xl p-3">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => (
                      <p className="text-purple-100/80 text-xs leading-relaxed mb-3 last:mb-0">{children}</p>
                    ),
                    strong: ({ children }) => (
                      <strong className="text-purple-200 font-semibold">{children}</strong>
                    ),
                    ul: ({ children }) => (
                      <ul className="mb-2 space-y-0.5 pl-1">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal list-inside mb-2 space-y-0.5 text-xs text-purple-100/80">{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li className="flex gap-1.5 text-purple-100/80 text-xs leading-relaxed">
                        <span className="text-purple-500 mt-0.5 flex-shrink-0">▸</span>
                        <span>{children}</span>
                      </li>
                    ),
                    h1: ({ children }) => (
                      <h1 className="text-purple-200 font-semibold text-xs mt-3 mb-1 first:mt-0">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-purple-200 font-semibold text-xs mt-3 mb-1 first:mt-0">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-purple-300/80 font-medium text-xs mt-2 mb-0.5">{children}</h3>
                    ),
                  }}
                >
                  {formatSummaryAsMarkdown(enriched.summaryJa)}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* 論文リンク（サブ扱い・横並び） */}
        {enriched?.links && (
          <div className="space-y-1.5">
            <p className="text-purple-400/50 text-xs">論文を読む</p>
            <div className="flex gap-2">
              <a
                href={enriched.links.abstract}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                  bg-purple-900/20 border border-purple-500/20
                  text-purple-300/70 hover:text-purple-100 hover:border-purple-400/40
                  text-xs transition-colors"
              >
                <BookOpen size={11} />
                <span>Abstract</span>
              </a>
              <a
                href={enriched.links.html}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                  bg-purple-900/20 border border-purple-500/20
                  text-purple-300/70 hover:text-purple-100 hover:border-purple-400/40
                  text-xs transition-colors"
              >
                <Globe size={11} />
                <span>HTML</span>
              </a>
              <a
                href={enriched.links.pdf}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                  bg-purple-900/20 border border-purple-500/20
                  text-purple-300/70 hover:text-purple-100 hover:border-purple-400/40
                  text-xs transition-colors"
              >
                <FileText size={11} />
                <span>PDF</span>
              </a>
            </div>
          </div>
        )}

        {/* arxivId なしの場合の fallback リンク */}
        {!citation.arxivId && citation.uri && (
          <a
            href={citation.uri}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors break-all"
          >
            <ExternalLink size={11} className="flex-shrink-0" />
            <span>{citation.uri}</span>
          </a>
        )}

        {/* CTA: この論文についてグリモワールに聞く（最下部） */}
        {askTitle && (
          <button
            onClick={() => onAskAbout(askTitle)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl
              bg-purple-700/30 border border-purple-500/40
              text-purple-200 text-xs font-medium
              hover:bg-purple-600/40 hover:border-purple-400/60 hover:text-white
              transition-all active:scale-[0.98]"
          >
            <BookOpen size={13} className="flex-shrink-0" />
            <span>この論文についてグリモワールに聞く</span>
          </button>
        )}
      </div>
    </>
  );
}
