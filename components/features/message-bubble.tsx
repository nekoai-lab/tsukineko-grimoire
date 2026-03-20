'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Citation {
  title?: string;
  uri?: string;
  chunkContents?: Array<{ content?: string }>;
}

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  onCitationClick?: (citation: Citation) => void;
}

export function MessageBubble({ role, content, citations, onCitationClick }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
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
          className={cn(
            'rounded-2xl px-4 py-3 text-sm leading-relaxed',
            isUser
              ? 'bg-purple-700/50 text-white rounded-tr-sm'
              : 'bg-black/40 border border-purple-500/20 text-purple-50 rounded-tl-sm'
          )}
        >
          {isUser ? (
            <p>{content}</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code: ({ children, className }) => {
                  const isBlock = className?.includes('language-');
                  return isBlock ? (
                    <code className="block bg-black/50 rounded p-3 text-xs font-mono text-purple-200 overflow-x-auto my-2">
                      {children}
                    </code>
                  ) : (
                    <code className="bg-purple-900/40 rounded px-1 py-0.5 text-xs font-mono text-purple-200">
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
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
              }}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>

        {/* Citations */}
        {!isUser && citations && citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {citations.map((c, i) => (
              <button
                key={i}
                data-testid="citation"
                onClick={() => onCitationClick?.(c)}
                title={c.title ?? `引用 ${i + 1}`}
                className="citation-badge"
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
