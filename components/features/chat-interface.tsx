'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { MessageBubble } from './message-bubble';
import { CitationModal } from './citation-modal';

interface Citation {
  title?: string;
  uri?: string;
  chunkContents?: Array<{ content?: string }>;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
}

interface ChatInterfaceProps {
  chatId: string;
}

export function ChatInterface({ chatId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        { role: 'assistant', content: data.answer, citations: data.citations },
      ]);
    } catch {
      toast.error('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }, [input, loading, messages, chatId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full">
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
                onCitationClick={setSelectedCitation}
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

      {/* Citation Modal */}
      <CitationModal
        citation={selectedCitation}
        onClose={() => setSelectedCitation(null)}
      />
    </div>
  );
}
