'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, X, ExternalLink, BookOpen, FileText, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageBubble } from './message-bubble';
import { onAuthStateChanged } from 'firebase/auth';
import { getClientAuth } from '@/lib/firebase';
import {
  GRIMOIRE_GUEST_CHAT_STORAGE_KEY,
  isValidGrimoireGuestChatId,
} from '@/lib/grimoire-chat-constants';

/** Agent Builder が返すスニペットに含まれる HTML タグを除去 */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * スニペットがメタデータ行（著者名・URL・日付など）である可能性を判定する。
 * Agent Builder が著者名行を誤抽出した場合に表示から除外するために使用。
 *
 * 判定基準：
 * - 60文字未満の短いテキスト（意味のある引用文としては短すぎる）
 * - "et al." / "他" を含む著者リストパターン
 * - **Authors:** / **Published:** / **Source:** などのメタデータキー
 * - URL のみのテキスト
 */
function isMetadataSnippet(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length < 60) return true;
  if (/et al\.|他$|他\s*$/.test(t)) return true;
  if (/\*\*(Authors|Published|Category|Source|DOI):\*\*/i.test(t)) return true;
  if (/^https?:\/\/\S+$/.test(t)) return true;
  return false;
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
  initialArxivId?: string;
}

const PANEL_MIN = 240;
const PANEL_DEFAULT = 320;

export function ChatInterface({ initialArxivId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
  const [userId, setUserId] = useState<string | null>(null);
  /** undefined = 認証初回コールバック前 / null = ゲスト / string = Firebase uid */
  const [firebaseUid, setFirebaseUid] = useState<string | null | undefined>(undefined);
  const [guestChatId, setGuestChatId] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(PANEL_DEFAULT);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getClientAuth(), user => {
      const uid = user?.uid ?? null;
      setUserId(uid);
      setFirebaseUid(uid);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (firebaseUid === undefined || firebaseUid !== null) return;
    try {
      let id = localStorage.getItem(GRIMOIRE_GUEST_CHAT_STORAGE_KEY);
      if (!id || !isValidGrimoireGuestChatId(id)) {
        id = `guest_${crypto.randomUUID()}`;
        localStorage.setItem(GRIMOIRE_GUEST_CHAT_STORAGE_KEY, id);
      }
      setGuestChatId(id);
    } catch {
      setGuestChatId(`guest_${crypto.randomUUID()}`);
    }
  }, [firebaseUid]);

  const chatStorageReady =
    firebaseUid !== undefined && (firebaseUid !== null || guestChatId.length > 0);

  const chatStorageId =
    firebaseUid === undefined
      ? ''
      : firebaseUid !== null
        ? firebaseUid
        : guestChatId;

  useEffect(() => {
    if (initialArxivId) {
      // initialArxivId がある場合、自動的に CitationPanel を開く
      // title はまだ分からないのでダミーを入れる（CitationPanel 側で api/citation から正確な最新タイトルを取得する）
      setSelectedCitation({
        arxivId: initialArxivId,
        title: 'Loading document info...',
      });
    }
  }, [initialArxivId]);

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
    if (!chatStorageReady) {
      toast.error('接続準備中です。少し待ってからお試しください');
      return;
    }

    setInput('');
    setLoading(true);

    setMessages(prev => [...prev, { role: 'user', content: question }]);

    try {
      // 送信時点の履歴（今追加したユーザーメッセージは除く）をコンテキストとして渡す
      const historySnapshot = messages.map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history: historySnapshot, chatId: chatStorageId }),
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
  }, [input, loading, messages, chatStorageId, chatStorageReady]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME変換中（isComposing）はEnterを無視して送信しない
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!chatStorageReady) {
        toast.error('接続準備中です。少し待ってからお試しください');
        return;
      }
      handleSubmit();
    }
  };

  // テキスト選択からの深掘り
  // displayMessage: チャットに表示する日本語文
  // searchQuery: Agent Builder に投げる検索キーワード（選択テキストそのもの）
  const handleDeepDive = useCallback((selectedText: string) => {
    if (!chatStorageReady) {
      toast.error('接続準備中です。少し待ってからお試しください');
      return;
    }
    const displayMessage = `「${selectedText}」についてもっと詳しく教えてください`;
    const searchQuery = selectedText; // 自然文ではなくキーワードのみを検索に使う

    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: displayMessage }]);

    const historySnapshot = messages.map(m => ({ role: m.role, content: m.content }));
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: searchQuery, history: historySnapshot, chatId: chatStorageId }),
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
  }, [messages, chatStorageId, chatStorageReady]);

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
              className="flex flex-col items-center justify-center h-full py-12 px-6"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="text-4xl mb-6"
              >
                🔮
              </motion.div>

              <div className="w-full max-w-sm space-y-5 text-left">
                {/* 聞き方のコツ */}
                <div>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent to-purple-400/20" />
                    <p className="text-purple-300/50 text-[10px] font-semibold tracking-[0.18em] whitespace-nowrap">聞き方のコツ</p>
                    <div className="flex-1 h-px bg-gradient-to-l from-transparent to-purple-400/20" />
                  </div>
                  <ul className="space-y-2 text-xs">
                    <li className="flex gap-2 text-purple-200/55">
                      <span className="shrink-0">✅</span>
                      <span>論文のタイトルや手法名など、具体的な単語で聞く</span>
                    </li>
                    <li className="flex gap-2 text-purple-200/55">
                      <span className="shrink-0">✅</span>
                      <span>「〜を比較して」「〜の仕組みを教えて」のように目的を明確に</span>
                    </li>
                    <li className="flex gap-2 text-purple-200/40">
                      <span className="shrink-0">⚠️</span>
                      <span>曖昧な質問は検索精度が下がるため、キーワードを絞ると◎</span>
                    </li>
                  </ul>
                </div>

                {/* 回答後にできること */}
                <div>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent to-purple-400/20" />
                    <p className="text-purple-300/50 text-[10px] font-semibold tracking-[0.18em] whitespace-nowrap">回答後にできること</p>
                    <div className="flex-1 h-px bg-gradient-to-l from-transparent to-purple-400/20" />
                  </div>
                  <ul className="space-y-2 text-xs">
                    <li className="flex gap-2 text-purple-200/55">
                      <span className="shrink-0">💬</span>
                      <span>気になった単語を選択 → そのままさらに深掘り質問</span>
                    </li>
                    <li className="flex gap-2 text-purple-200/55">
                      <span className="shrink-0">📌</span>
                      <span>引用論文をタップ → 概要・図・実験結果をサイドパネルで表示</span>
                    </li>
                  </ul>
                </div>

                {/* 仕組みと注意点 */}
                <div>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent to-purple-400/20" />
                    <p className="text-purple-300/50 text-[10px] font-semibold tracking-[0.18em] whitespace-nowrap">仕組みと注意点</p>
                    <div className="flex-1 h-px bg-gradient-to-l from-transparent to-purple-400/20" />
                  </div>
                  <ul className="space-y-2 text-xs">
                    <li className="flex gap-2 text-purple-200/40">
                      <span className="shrink-0">📚</span>
                      <span>書庫にインデックスした論文のみ回答可能</span>
                    </li>
                    <li className="flex gap-2 text-purple-200/40">
                      <span className="shrink-0">🚫</span>
                      <span>インデックスにない内容は「情報なし」と返す（ハルシネーション防止）</span>
                    </li>
                  </ul>
                </div>
              </div>

              <p className="text-purple-300/25 text-xs mt-7">
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
            placeholder="ここに質問を入力してください (Enter で送信)"
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
            disabled={!input.trim() || loading || !chatStorageReady}
            className="glow-button p-2.5 flex-shrink-0"
            aria-label="送信"
            title={!chatStorageReady ? '接続準備中です' : undefined}
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
        {!chatStorageReady && (
          <p className="text-purple-300/45 text-xs mt-2">接続準備中…</p>
        )}
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
                  userId={userId}
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
                  userId={userId}
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

interface ResultTable {
  caption: string;
  captionJa: string;
  /** rowspan/colspan を含む複雑な表 */
  isComplex?: boolean;
  /** 複雑な表の生 HTML（アプリ内レンダリング用） */
  rawHtml?: string;
  /** 原文確認用の arXiv HTML URL */
  arxivUrl?: string;
  headers: string[];
  rows: string[][];
}

/**
 * arXiv HTML の table セルに残る LaTeX 記法や FLOAT タグを除去し、
 * 人間が読みやすいテキストに変換する。
 */
function cleanTableCell(text: string): string {
  return text
    // start_FLOAT* / end_FLOAT* タグを除去
    .replace(/start_FLOAT\w+|end_FLOAT\w+/g, '')
    // \textsc{...}, \textbf{...} などの LaTeX コマンドを中身だけ残す
    .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
    // 残留する { } や \ を除去
    .replace(/[\\{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 数値かどうか判定（先頭が数字または − ならば数値として右揃え）
 */
function isNumeric(text: string): boolean {
  return /^[−\-]?[\d.,]+%?$/.test(text.trim());
}

/** 折りたたみ高さ（px）— この高さを超える表は展開ボタンを表示 */
const COMPLEX_TABLE_COLLAPSED_HEIGHT = 260;

/**
 * 結果表を表示するカード。
 * - isComplex=true + rawHtml あり → arXiv 生 HTML をダークテーマで描画（高さ制限＋展開）
 * - isComplex=true + rawHtml なし → キャプション + 原文リンク（フォールバック）
 * - isComplex=false → ゼブラストライプ + 先頭列 sticky + 数値右揃え（8行折りたたみ）
 */
function ResultTableCard({ table }: { table: ResultTable }) {
  const [expanded, setExpanded] = useState(false);
  const [rawExpanded, setRawExpanded] = useState(false);
  const [isTall, setIsTall] = useState(false);
  const rawWrapperRef = useRef<HTMLDivElement>(null);
  const PREVIEW_ROWS = 8;

  // rawHtml 表の高さを測定して折りたたみが必要か判定
  useEffect(() => {
    if (!rawWrapperRef.current) return;
    const el = rawWrapperRef.current;
    const check = () => setIsTall(el.scrollHeight > COMPLEX_TABLE_COLLAPSED_HEIGHT + 20);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [table.rawHtml]);

  const captionText = table.captionJa || table.caption;

  // 複雑な表（rowspan/colspan あり）
  if (table.isComplex) {
    // rawHtml があればアプリ内で描画
    if (table.rawHtml) {
      return (
        <div className="rounded-xl border border-purple-500/15 bg-purple-950/20 p-3 space-y-2">
          {captionText && (
            <p className="text-purple-300/65 text-xs leading-relaxed">{captionText}</p>
          )}

          {/* 表本体：高さ制限＋縦スクロール */}
          <div className="relative">
            <div
              ref={rawWrapperRef}
              className="arxiv-table-wrapper overflow-x-auto transition-[max-height] duration-300 ease-in-out"
              style={{
                maxHeight: rawExpanded ? '2400px' : `${COMPLEX_TABLE_COLLAPSED_HEIGHT}px`,
                overflowY: rawExpanded ? 'visible' : 'hidden',
              }}
              dangerouslySetInnerHTML={{ __html: table.rawHtml }}
            />
            {/* グラデーションフェード（折りたたみ時） */}
            {isTall && !rawExpanded && (
              <div className="absolute bottom-0 inset-x-0 h-12 pointer-events-none
                bg-gradient-to-t from-[#0f0920] to-transparent rounded-b-lg" />
            )}
          </div>

          {/* 展開／折りたたみボタン */}
          {isTall && (
            <button
              onClick={() => setRawExpanded(v => !v)}
              className="text-xs text-purple-400/65 hover:text-purple-200 transition-colors
                flex items-center gap-1"
            >
              {rawExpanded ? '▲ 折りたたむ' : '▼ 全て表示'}
            </button>
          )}

          {table.arxivUrl && (
            <a
              href={table.arxivUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-purple-400/40
                hover:text-purple-300/65 transition-colors"
            >
              📄 原文を見る
            </a>
          )}
        </div>
      );
    }

    // rawHtml なし（フォールバック）→ 原文リンクのみ
    return (
      <div className="rounded-xl border border-purple-500/15 bg-purple-950/20 p-3 space-y-2">
        {captionText && (
          <p className="text-purple-300/65 text-xs leading-relaxed">{captionText}</p>
        )}
        {table.arxivUrl && (
          <a
            href={table.arxivUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-purple-400/70
              hover:text-purple-200 transition-colors underline underline-offset-2"
          >
            📄 arXiv HTML で原文を見る
          </a>
        )}
      </div>
    );
  }

  const cleanedHeaders = table.headers.map(cleanTableCell);
  const cleanedRows = table.rows.map(row => row.map(cleanTableCell));
  const visibleRows = expanded ? cleanedRows : cleanedRows.slice(0, PREVIEW_ROWS);
  const hasMore = cleanedRows.length > PREVIEW_ROWS;

  return (
    <div className="space-y-1.5">
      {captionText && (
        <p className="text-purple-300/65 text-xs leading-relaxed">{captionText}</p>
      )}
      <div className="overflow-x-auto rounded-xl border border-purple-500/15">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-purple-900/50 border-b border-purple-500/20">
              {cleanedHeaders.map((h, i) => (
                <th
                  key={i}
                  className={`px-2.5 py-2 text-purple-200/85 font-semibold whitespace-nowrap ${
                    i === 0 ? 'sticky left-0 bg-purple-900/50 z-10' : ''
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, ri) => (
              <tr
                key={ri}
                className={`border-b border-purple-500/10 last:border-0 hover:bg-purple-800/25 transition-colors ${
                  ri % 2 === 0 ? 'bg-purple-950/10' : 'bg-purple-900/10'
                }`}
              >
                {row.map((cell, ci) => {
                  const cleaned = cell || '—';
                  const numeric = isNumeric(cell);
                  return (
                    <td
                      key={ci}
                      className={`px-2.5 py-1.5 whitespace-nowrap ${
                        ci === 0
                          ? 'sticky left-0 z-10 text-purple-200/80 font-medium ' +
                            (ri % 2 === 0 ? 'bg-purple-950/80' : 'bg-purple-900/80')
                          : numeric
                          ? 'text-right text-purple-100/85 font-mono tabular-nums'
                          : 'text-purple-200/70'
                      }`}
                    >
                      {cleaned}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-purple-500/60 hover:text-purple-300/80 text-xs transition-colors"
        >
          {expanded
            ? `▲ 折りたたむ`
            : `▼ さらに ${cleanedRows.length - PREVIEW_ROWS} 行を表示`}
        </button>
      )}
    </div>
  );
}

function CitationPanelContent({
  citation,
  userId,
  onClose,
  onAskAbout,
}: {
  citation: Citation;
  userId: string | null;
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
  const [resultTables, setResultTables] = useState<ResultTable[]>([]);
  const [shelfLoading, setShelfLoading] = useState(false);
  const [isShelved, setIsShelved] = useState(false);

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
    setResultTables([]);
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

    // 代表図・結果表を取得（非同期・失敗しても問題なし）
    fetch(`/api/paper-figures?arxivId=${encodeURIComponent(citation.arxivId)}`)
      .then(r => r.json())
      .then((data: { figures: PaperFigure[]; tables: ResultTable[] }) => {
        if (data.figures?.length) setFigures(data.figures);
        if (data.tables?.length) setResultTables(data.tables);
      })
      .catch(() => {/* サイレント失敗 */});
  }, [citation.arxivId, citation.chunkContents]);

  const snippetsToShow = enriched?.translatedSnippets.length
    ? enriched.translatedSnippets
    : (citation.chunkContents ?? []).map(c => ({ en: c.content ?? '', ja: '' }));

  // "この論文についてグリモワールに聞く" で使うタイトル（日本語優先）
  const askTitle = enriched?.titleJa || citation.title || '';

  // 本棚に追加・削除
  const handleShelf = async () => {
    if (!userId) { toast.error('本棚機能はログインが必要です'); return; }
    if (!citation.arxivId) return;
    setShelfLoading(true);
    try {
      if (isShelved) {
        // arxivId だけでは削除できないため、/api/shelf で documentId を解決してから削除
        const res = await fetch('/api/shelf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ arxivId: citation.arxivId }),
        });
        const data = await res.json();
        if (data.message === 'already_shelved') {
          // すでにある → documentId が返らないので別途検索は省略し、ページリロード不要で整合性は onSnapshot で取る
          toast('すでに本棚に登録済みです');
        }
        // 削除は archive-library 側の shelvedIds で管理されているため、
        // Citation Preview では「追加」のみに絞り、削除はマイ本棚ページから行う
        setIsShelved(true);
      } else {
        const res = await fetch('/api/shelf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ arxivId: citation.arxivId }),
        });
        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error ?? '本棚への追加に失敗しました');
        } else {
          const data = await res.json();
          if (data.message === 'already_shelved') {
            toast('すでに本棚に追加済みです');
            setIsShelved(true);
          } else {
            toast.success('マイ本棚に追加しました 🗂');
            setIsShelved(true);
          }
        }
      }
    } catch {
      toast.error('エラーが発生しました');
    } finally {
      setShelfLoading(false);
    }
  };

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

        {/* ── 1. タイトル・著者・カテゴリ ── */}
        <div className="space-y-1.5">
          {enrichLoading && !enriched ? (
            <div className="flex items-center gap-2">
              <Loader2 size={11} className="animate-spin text-purple-400/50 flex-shrink-0" />
              <p className="text-purple-400/40 text-xs">論文情報を取得中...</p>
            </div>
          ) : (
            <>
              {enriched?.titleJa && (
                <p className="text-purple-100 text-sm font-semibold leading-snug">
                  {enriched.titleJa}
                </p>
              )}
              <p className={enriched?.titleJa
                ? 'text-purple-300/60 text-xs leading-snug'
                : 'text-purple-100 text-sm font-semibold leading-snug'
              }>
                {citation.title ?? 'Untitled Document'}
              </p>
            </>
          )}
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

          {/* ── 論文リンク + 本棚ボタン（著者行の直下） ── */}
          {(enriched?.links || citation.arxivId) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {enriched?.links && (
                <>
                  <a
                    href={enriched.links.abstract}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full
                      border border-purple-500/25 text-purple-300/70
                      hover:text-purple-100 hover:border-purple-400/40
                      text-xs transition-colors"
                  >
                    <BookOpen size={10} />
                    <span>Abstract</span>
                  </a>
                  <a
                    href={enriched.links.html}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full
                      border border-purple-500/25 text-purple-300/70
                      hover:text-purple-100 hover:border-purple-400/40
                      text-xs transition-colors"
                  >
                    <Globe size={10} />
                    <span>HTML</span>
                  </a>
                  <a
                    href={enriched.links.pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full
                      border border-purple-500/25 text-purple-300/70
                      hover:text-purple-100 hover:border-purple-400/40
                      text-xs transition-colors"
                  >
                    <FileText size={10} />
                    <span>PDF</span>
                  </a>
                </>
              )}
              {/* 本棚に保存ボタン */}
              {citation.arxivId && (
                <button
                  onClick={handleShelf}
                  disabled={shelfLoading || isShelved}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                    border transition-all disabled:opacity-50
                    ${isShelved
                      ? 'bg-purple-700/25 border-purple-400/40 text-purple-300/90'
                      : 'border-purple-500/25 text-purple-400/60 hover:bg-purple-700/20 hover:border-purple-400/45 hover:text-purple-300/80'
                    }`}
                >
                  <span>🗂</span>
                  <span>{isShelved ? '登録済み' : '本棚に保存'}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── 2. 引用箇所（最重要：なぜ引用されたか） ── */}
        {(() => {
          // メタデータ行（著者名・URL など）を除外した有効なスニペットのみ表示
          const validSnippets = snippetsToShow.filter(s => {
            const en = stripHtml(s.en);
            const ja = stripHtml(s.ja);
            return !isMetadataSnippet(en) && !isMetadataSnippet(ja);
          });

          if (validSnippets.length === 0) {
            // 有効なスニペットがない場合は「引用元として参照」のみ表示
            return snippetsToShow.length > 0 ? (
              <div className="flex items-center gap-2 text-purple-400/50 text-xs">
                <span>📌</span>
                <span>この論文が回答の参照元として使用されました。</span>
              </div>
            ) : null;
          }

          return (
            <div className="space-y-2">
              <p className="text-purple-400/60 text-xs">📌 回答で引用された箇所</p>
              {validSnippets.map((s, i) => {
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
          );
        })()}

        {/* ── 3. 論文の概要（グラデードフェード展開） ── */}
        {enriched?.summaryJa && (
          <div className="bg-purple-950/30 border border-purple-500/10 rounded-xl p-3 space-y-2">
            <p className="text-purple-400/60 text-xs font-medium">📄 論文の概要</p>

            {/* テキスト本体：折りたたみ時は max-h で高さ制限しグラデーションで隠す */}
            <div className="relative">
              <div
                className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
                style={{ maxHeight: summaryOpen ? '1200px' : '80px' }}
              >
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

              {/* グラデーションフェード（折りたたみ時のみ） */}
              {!summaryOpen && (
                <div className="absolute bottom-0 inset-x-0 h-10 pointer-events-none
                  bg-gradient-to-t from-[#130d24] to-transparent" />
              )}
            </div>

            <button
              onClick={() => setSummaryOpen(o => !o)}
              className="flex items-center gap-1 text-purple-500/60 hover:text-purple-300/80 text-xs transition-colors"
            >
              {summaryOpen ? '▲ 閉じる' : '▼ 続きを読む'}
            </button>
          </div>
        )}

        {/* ── 4. 代表図 ── */}
        {figures.length > 0 && (() => {
          const fig = figures[figureIdx];
          return (
            <div className="space-y-2">
              {/* ヘッダー：タイトル＋枚数 */}
              <div className="flex items-center justify-between">
                <p className="text-purple-400/60 text-xs">🖼 代表図</p>
                {figures.length > 1 && (
                  <span className="text-purple-400/50 text-xs tabular-nums">
                    {figureIdx + 1} / {figures.length}
                  </span>
                )}
              </div>

              {/* サムネイル＋左右矢印 */}
              <div className="relative group/fig">
                {/* 画像エリア（クリックで拡大） */}
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
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="bg-black/60 text-white text-xs px-2 py-1 rounded-lg">🔍 拡大</span>
                  </div>
                </div>

                {/* 左右矢印（複数枚のときのみ） */}
                {figures.length > 1 && (
                  <>
                    <button
                      onClick={e => { e.stopPropagation(); setFigureIdx(i => (i - 1 + figures.length) % figures.length); }}
                      className="absolute left-1 top-1/2 -translate-y-1/2 z-10
                        w-7 h-7 flex items-center justify-center
                        rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white
                        transition-all opacity-0 group-hover/fig:opacity-100 text-sm"
                      title="前の図"
                    >
                      ‹
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setFigureIdx(i => (i + 1) % figures.length); }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 z-10
                        w-7 h-7 flex items-center justify-center
                        rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white
                        transition-all opacity-0 group-hover/fig:opacity-100 text-sm"
                      title="次の図"
                    >
                      ›
                    </button>
                  </>
                )}
              </div>

              {/* ドットインジケーター（複数枚のときのみ） */}
              {figures.length > 1 && (
                <div className="flex items-center justify-center gap-2 pt-0.5">
                  {figures.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setFigureIdx(i)}
                      className={`rounded-full transition-all duration-200
                        ${i === figureIdx
                          ? 'w-4 h-2 bg-purple-300'
                          : 'w-2 h-2 bg-purple-500/35 hover:bg-purple-400/60'
                        }`}
                      title={`図 ${i + 1}`}
                    />
                  ))}
                </div>
              )}

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
                      <button
                        className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors z-10"
                        onClick={() => setLightboxOpen(false)}
                      >
                        <X size={24} />
                      </button>
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

        {/* ── 5. 実験結果・比較表 ── */}
        {resultTables.length > 0 && (
          <div className="space-y-2">
            <p className="text-purple-400/60 text-xs">📊 実験結果・比較表</p>
            {resultTables.map((tbl, ti) => (
              <ResultTableCard key={ti} table={tbl} />
            ))}
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
