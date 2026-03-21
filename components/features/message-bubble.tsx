'use client';

import { useState, useRef, useCallback, useEffect, Fragment } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Citation {
  title?: string;
  titleJa?: string;
  uri?: string;
  arxivId?: string;
  publishedAt?: string;
  chunkContents?: Array<{ content?: string }>;
}

/**
 * ReactMarkdown の children（ReactNode）の中から [N] / [[N]] パターンを検出し、
 * クリックで Citation Preview を開くインライン番号ボタンに差し替える。
 */
function injectCitations(
  children: React.ReactNode,
  citations: Citation[] | undefined,
  onCitationClick: ((c: Citation) => void) | undefined,
): React.ReactNode {
  const processString = (text: string, keyPrefix: string): React.ReactNode => {
    const parts = text.split(/(\[\[?\d+\]?\])/);
    if (parts.length === 1) return text;
    return parts.map((part, i) => {
      const m = part.match(/^\[{1,2}(\d+)\]{1,2}$/);
      if (!m) return <Fragment key={`${keyPrefix}-t${i}`}>{part}</Fragment>;
      const idx = parseInt(m[1]) - 1;
      const c = citations?.[idx];
      return (
        <button
          key={`${keyPrefix}-c${i}`}
          onClick={(e) => { e.stopPropagation(); c && onCitationClick?.(c); }}
          title={c?.titleJa || c?.title || `引用 ${idx + 1}`}
          className="inline-flex items-center justify-center min-w-[15px] h-[15px] px-1 mx-0.5
            rounded-full bg-purple-700/70 border border-purple-400/50
            text-[9px] font-bold text-purple-100
            hover:bg-purple-500/80 hover:border-purple-300/70 hover:text-white
            transition-colors cursor-pointer relative -top-0.5 flex-shrink-0"
        >
          {m[1]}
        </button>
      );
    });
  };

  if (typeof children === 'string') return processString(children, 'root');
  if (Array.isArray(children)) {
    return children.map((child, i) =>
      typeof child === 'string'
        ? <Fragment key={i}>{processString(child, `arr-${i}`)}</Fragment>
        : child
    );
  }
  return children;
}

interface RelatedDoc {
  title: string;
  titleJa: string;
  arxivId: string;
}

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  suggestions?: string[];
  relatedDocs?: RelatedDoc[];
  onCitationClick?: (citation: Citation) => void;
  onDeepDive?: (selectedText: string) => void;
}

interface TooltipState {
  x: number;
  y: number;
  text: string;
}

export function MessageBubble({ role, content, citations, suggestions, relatedDocs, onCitationClick, onDeepDive }: MessageBubbleProps) {
  const isUser = role === 'user';
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const handleMouseUp = useCallback(() => {
    if (isUser || !onDeepDive) return;

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? '';

    if (selectedText.length < 4) {
      setTooltip(null);
      return;
    }

    // 選択範囲がこのコンポーネント内かチェック
    if (selection && selection.rangeCount > 0 && containerRef.current) {
      const range = selection.getRangeAt(0);
      if (!containerRef.current.contains(range.commonAncestorContainer)) {
        setTooltip(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setTooltip({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
        text: selectedText,
      });
    }
  }, [isUser, onDeepDive]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setTooltip(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleDeepDiveClick = () => {
    if (!tooltip) return;
    onDeepDive?.(tooltip.text);
    setTooltip(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <>
      {/* Floating deep-dive tooltip (portal-like, fixed position) */}
      <AnimatePresence>
        {tooltip && (
          <motion.button
            key="deepdive-tooltip"
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            onClick={handleDeepDiveClick}
            className="fixed z-[9999] -translate-x-1/2 -translate-y-full
              flex items-center gap-1.5 px-3 py-1.5 rounded-full
              bg-purple-700/90 border border-purple-400/40 text-white text-xs
              shadow-lg shadow-purple-900/50 backdrop-blur-sm
              hover:bg-purple-600/90 transition-colors cursor-pointer"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <Search size={11} />
            <span>この部分を深掘り</span>
          </motion.button>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={cn('flex gap-3', isUser && 'flex-row-reverse')}
        data-testid={`${role}-message`}
      >
      {/* Avatar */}
      <div
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs mt-1',
          isUser
            ? 'bg-yellow-600/80 text-black'
            : 'bg-purple-700/80 text-white'
        )}
      >
        {isUser ? '✦' : '🌙'}
      </div>

      {/* Bubble */}
      <div className={cn('max-w-[82%]', isUser ? 'items-end' : 'items-start', 'flex flex-col gap-1')}>
        <div
          ref={containerRef}
          onMouseUp={handleMouseUp}
          className={cn(
            'rounded-2xl px-4 py-3 text-sm leading-relaxed',
            isUser
              ? 'bg-purple-700/50 text-white rounded-tr-sm'
              : 'bg-black/40 border border-purple-500/20 text-purple-50 rounded-tl-sm selection:bg-amber-400/25 selection:text-white'
          )}
        >
          {isUser ? (
            <p>{content}</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-purple-200 font-bold text-base mt-5 mb-2 pb-1.5
                    border-b border-purple-500/30 first:mt-0">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-purple-300 font-semibold text-sm mt-5 mb-2 pb-1
                    border-b border-purple-500/20 first:mt-0">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-purple-400/90 font-medium text-sm mt-4 mb-1.5 first:mt-0">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="mb-3 last:mb-0 leading-relaxed text-purple-50/90">
                    {injectCitations(children, citations, onCitationClick)}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="mb-3 space-y-1.5 pl-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside mb-3 space-y-1.5">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="flex gap-2 text-purple-50/85 leading-relaxed">
                    <span className="text-purple-400 mt-1 flex-shrink-0">▸</span>
                    <span>{injectCitations(children, citations, onCitationClick)}</span>
                  </li>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-purple-500/50 pl-3 my-3
                    text-purple-300/70 italic text-sm">
                    {children}
                  </blockquote>
                ),
                strong: ({ children }) => (
                  <strong className="text-purple-200 font-semibold">{children}</strong>
                ),
                code: ({ children, className }) => {
                  const isBlock = className?.includes('language-');
                  return isBlock ? (
                    <code className="block bg-black/50 rounded-lg p-3 text-xs font-mono
                      text-purple-200 overflow-x-auto my-3">
                      {children}
                    </code>
                  ) : (
                    <code className="bg-purple-900/40 rounded px-1.5 py-0.5 text-xs
                      font-mono text-purple-200">
                      {children}
                    </code>
                  );
                },
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer"
                    className="text-purple-300 hover:text-purple-100 underline underline-offset-2">
                    {children}
                  </a>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>

        {/* Citations */}
        {!isUser && citations && citations.length > 0 && (() => {
          // 発表年の範囲を計算（publishedAt → arxivId 先頭2桁の順でフォールバック）
          const years = citations
            .map(c => {
              const raw = c.publishedAt?.slice(0, 4);
              if (raw && /^\d{4}$/.test(raw)) return raw;
              const yy = c.arxivId?.match(/^(\d{2})/)?.[1];
              return yy ? (parseInt(yy) < 90 ? `20${yy}` : `19${yy}`) : '';
            })
            .filter((y): y is string => !!y && /^\d{4}$/.test(y))
            .map(Number);
          const minYear = years.length > 0 ? Math.min(...years) : null;
          const maxYear = years.length > 0 ? Math.max(...years) : null;
          const yearRange = minYear && maxYear
            ? minYear === maxYear ? `${minYear}年` : `${minYear}〜${maxYear}年`
            : null;

          return (
            <div className="space-y-1.5 px-1 mt-0.5">
              {/* 時期サマリー */}
              {yearRange && (
                <p className="text-purple-500/50 text-[10px] flex items-center gap-1">
                  <span>📅</span>
                  <span>{`この回答は ${yearRange} の論文 ${citations.length} 件に基づいています`}</span>
                </p>
              )}
              {/* バッジ一覧 */}
              <div className="flex flex-wrap gap-1.5">
                {citations.map((c, i) => {
                  const isFilename = /^arxiv_\d{4}/.test(c.title ?? '');
                  const displayTitle =
                    c.titleJa ||
                    (!isFilename ? c.title?.replace(/^(.*?):.*$/, '$1').trim() : '') ||
                    `引用 ${i + 1}`;
                  const shortTitle = displayTitle.length > 28
                    ? displayTitle.slice(0, 28) + '…'
                    : displayTitle;
                  // publishedAt が空なら arxivId の先頭2桁から年を推定（例: "24" → 2024）
                  const rawYear = c.publishedAt?.slice(0, 4);
                  const arxivYY = c.arxivId?.match(/^(\d{2})/)?.[1];
                  const year = rawYear || (arxivYY ? (parseInt(arxivYY) < 90 ? `20${arxivYY}` : `19${arxivYY}`) : '');
                  return (
                    <button
                      key={i}
                      data-testid="citation"
                      onClick={() => onCitationClick?.(c)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-full
                        bg-purple-950/50 border border-purple-500/25
                        text-purple-300/70 text-xs
                        hover:border-purple-400/50 hover:text-purple-200 hover:bg-purple-900/40
                        transition-all max-w-[260px]"
                    >
                      <span className="text-purple-500 font-mono font-bold text-[10px] flex-shrink-0">
                        {i + 1}
                      </span>
                      <span className="truncate">{shortTitle}</span>
                      {year && (
                        <span className="text-purple-500/50 text-[9px] flex-shrink-0 font-mono">
                          {year}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Suggestions（結果なし時のサジェスト） */}
        {!isUser && suggestions && suggestions.length > 0 && (
          <div className="px-1 space-y-1.5 mt-1">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onDeepDive?.(s)}
                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg
                  border border-purple-500/20 bg-purple-950/20
                  text-purple-200/80 text-xs hover:border-purple-400/40
                  hover:bg-purple-900/30 hover:text-purple-100 transition-all"
              >
                <span className="text-purple-500/60 flex-shrink-0 font-mono">{i + 1}</span>
                <span>{s}</span>
              </button>
            ))}
          </div>
        )}

        {/* RelatedDocs（Firestore から見つかった関連論文） */}
        {!isUser && relatedDocs && relatedDocs.length > 0 && (
          <div className="px-1 mt-2 space-y-1">
            <p className="text-purple-500/50 text-xs px-1">📚 知識ベース内の関連論文</p>
            {relatedDocs.map((doc, i) => (
              <button
                key={i}
                onClick={() => onDeepDive?.(doc.titleJa || doc.title)}
                className="flex items-start gap-2 w-full text-left px-3 py-2 rounded-lg
                  border border-purple-500/15 bg-black/20
                  text-purple-300/70 text-xs hover:border-purple-400/30
                  hover:text-purple-200 transition-all"
              >
                <span className="text-purple-600/50 flex-shrink-0 mt-0.5">📄</span>
                <span className="leading-snug">
                  {doc.titleJa || doc.title}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      </motion.div>
    </>
  );
}
