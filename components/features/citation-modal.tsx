'use client';

import { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Citation {
  title?: string;
  uri?: string;
  chunkContents?: Array<{ content?: string }>;
}

interface CitationModalProps {
  citation: Citation | null;
  onClose: () => void;
}

export function CitationModal({ citation, onClose }: CitationModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const snippet = citation?.chunkContents?.[0]?.content ?? '';

  return (
    <AnimatePresence>
      {citation && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2 }}
            data-testid="citation-modal"
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50
              w-full max-w-xl mx-4 bg-[#111] border border-purple-500/30 rounded-xl shadow-2xl
              shadow-purple-900/30"
          >
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-purple-500/20">
              <div className="flex-1 mr-4">
                <p className="text-xs text-purple-400/60 mb-1">📄 引用元</p>
                <h3 className="text-white font-semibold text-sm leading-tight">
                  {citation.title ?? 'Untitled Document'}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="text-purple-300/50 hover:text-white transition-colors flex-shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Snippet */}
            <div className="p-5">
              {snippet ? (
                <div className="bg-purple-950/30 border border-purple-500/10 rounded-lg p-4">
                  <p className="text-xs text-purple-400/60 mb-2">スニペット</p>
                  <p className="text-purple-100/80 text-sm leading-relaxed line-clamp-10">
                    {snippet}
                  </p>
                </div>
              ) : (
                <p className="text-purple-300/40 text-sm text-center py-4">
                  スニペットは取得できませんでした
                </p>
              )}
            </div>

            {/* Footer */}
            {citation.uri && (
              <div className="px-5 pb-5">
                <a
                  href={citation.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300
                    transition-colors"
                >
                  <ExternalLink size={12} />
                  <span className="truncate">{citation.uri}</span>
                </a>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
