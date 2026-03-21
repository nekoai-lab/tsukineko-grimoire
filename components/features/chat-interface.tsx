'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, X, ExternalLink, BookOpen, FileText, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { MessageBubble } from './message-bubble';

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
  uri?: string;
  arxivId?: string;
  chunkContents?: Array<{ content?: string }>;
}

interface RelatedDoc {
  title: string;
  titleJa: string;
  arxivId: string;
}

interface EnrichedCitation {
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
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

function CitationPanelContent({
  citation,
  onClose,
}: {
  citation: Citation;
  onClose: () => void;
}) {
  const [enriched, setEnriched] = useState<EnrichedCitation | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [showEn, setShowEn] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!citation.arxivId) return;
    setEnriched(null);
    setShowEn({});
    setEnrichLoading(true);

    const snippets = (citation.chunkContents ?? [])
      .map(c => c.content ?? '')
      .filter(Boolean);

    fetch('/api/citation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arxivId: citation.arxivId, snippets }),
    })
      .then(r => r.json())
      .then((data: EnrichedCitation) => setEnriched(data))
      .catch(() => {/* サイレント失敗 */})
      .finally(() => setEnrichLoading(false));
  }, [citation.arxivId, citation.chunkContents]);

  const snippetsToShow = enriched?.translatedSnippets.length
    ? enriched.translatedSnippets
    : (citation.chunkContents ?? []).map(c => ({ en: c.content ?? '', ja: '' }));

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
      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Title + Meta */}
        <div className="space-y-1.5">
          <p className="text-purple-100 text-sm font-semibold leading-snug">
            {citation.title ?? 'Untitled Document'}
          </p>
          {enriched && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-purple-400/60 text-xs">
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

        {/* Japanese Summary */}
        {enrichLoading && !enriched && (
          <div className="bg-purple-950/30 border border-purple-500/10 rounded-lg p-3 flex items-center gap-2">
            <Loader2 size={12} className="animate-spin text-purple-400/60 flex-shrink-0" />
            <p className="text-purple-400/40 text-xs">日本語要約を取得中...</p>
          </div>
        )}
        {enriched?.summaryJa && (
          <div className="space-y-1.5">
            <p className="text-purple-400/60 text-xs">概要（日本語）</p>
            <div className="bg-purple-950/40 border border-purple-500/15 rounded-lg p-3">
              <p className="text-purple-100/85 text-xs leading-relaxed">
                {enriched.summaryJa}
              </p>
            </div>
          </div>
        )}

        {/* Snippets */}
        {snippetsToShow.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-purple-400/60 text-xs">引用箇所</p>
            {snippetsToShow.map((s, i) => (
              <div key={i} className="bg-purple-950/30 border border-purple-500/10 rounded-lg p-3 space-y-2">
                {/* 日本語（翻訳済みなら表示） */}
                {s.ja && s.ja !== s.en ? (
                  <>
                    <p className="text-purple-100/85 text-xs leading-relaxed">{s.ja}</p>
                    {/* 英語原文トグル */}
                    <button
                      onClick={() => setShowEn(prev => ({ ...prev, [i]: !prev[i] }))}
                      className="text-purple-500/50 hover:text-purple-400/70 text-xs transition-colors"
                    >
                      {showEn[i] ? '原文を隠す' : '英語原文を表示'}
                    </button>
                    {showEn[i] && (
                      <p className="text-purple-400/50 text-xs leading-relaxed border-t border-purple-500/10 pt-2">
                        {s.en}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-purple-100/80 text-xs leading-relaxed">{s.en}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Links */}
        {enriched?.links && (
          <div className="space-y-2">
            <p className="text-purple-400/60 text-xs">論文リンク</p>
            <div className="flex flex-col gap-1.5">
              <a
                href={enriched.links.abstract}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg
                  bg-purple-900/20 border border-purple-500/20
                  text-purple-200/80 hover:text-purple-100 hover:border-purple-400/40
                  text-xs transition-colors"
              >
                <BookOpen size={12} className="flex-shrink-0 text-purple-400" />
                <span>Abstract（arXiv）</span>
                <ExternalLink size={10} className="ml-auto flex-shrink-0 text-purple-400/40" />
              </a>
              <a
                href={enriched.links.html}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg
                  bg-purple-900/20 border border-purple-500/20
                  text-purple-200/80 hover:text-purple-100 hover:border-purple-400/40
                  text-xs transition-colors"
              >
                <Globe size={12} className="flex-shrink-0 text-purple-400" />
                <span>HTML 版（図表あり）</span>
                <ExternalLink size={10} className="ml-auto flex-shrink-0 text-purple-400/40" />
              </a>
              <a
                href={enriched.links.pdf}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg
                  bg-purple-900/20 border border-purple-500/20
                  text-purple-200/80 hover:text-purple-100 hover:border-purple-400/40
                  text-xs transition-colors"
              >
                <FileText size={12} className="flex-shrink-0 text-purple-400" />
                <span>PDF</span>
                <ExternalLink size={10} className="ml-auto flex-shrink-0 text-purple-400/40" />
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
      </div>
    </>
  );
}
