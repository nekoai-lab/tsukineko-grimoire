'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, BookOpen, Users, Calendar, CheckCircle, XCircle, Clock, ExternalLink, ChevronRight } from 'lucide-react';
import { getClientDb } from '@/lib/firebase';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { formatBytes } from '@/lib/utils';
import Link from 'next/link';
import { toast } from 'sonner';

interface Doc {
  id: string;
  filename: string;
  fileSize: number;
  status: 'pending' | 'indexed' | 'failed';
  uploadedAt: string | null;
  title: string;
  titleJa: string;
  summary: string;
  summaryJa: string;
  authors: string[];
  category: string;
  arxivId: string;
  publishedAt: string;
}

interface CategoryGroup {
  prefix: string;           // "cs", "math", "other"
  label: string;            // "Computer Science"
  subs: string[];           // ["cs.AI", "cs.LG", ...]
}

const CATEGORY_LABELS: Record<string, string> = {
  cs: 'Computer Science',
  math: 'Mathematics',
  physics: 'Physics',
  stat: 'Statistics',
  econ: 'Economics',
  q: 'Quantitative',
  other: 'その他',
};

function groupCategories(docs: Doc[]): CategoryGroup[] {
  const subMap = new Map<string, Set<string>>();

  for (const doc of docs) {
    if (!doc.category) {
      const set = subMap.get('other') ?? new Set();
      set.add('other');
      subMap.set('other', set);
      continue;
    }
    const prefix = doc.category.split('.')[0];
    const set = subMap.get(prefix) ?? new Set();
    set.add(doc.category);
    subMap.set(prefix, set);
  }

  return Array.from(subMap.entries())
    .sort(([a], [b]) => (a === 'other' ? 1 : b === 'other' ? -1 : a.localeCompare(b)))
    .map(([prefix, subs]) => ({
      prefix,
      label: CATEGORY_LABELS[prefix] ?? prefix.toUpperCase(),
      subs: Array.from(subs).sort(),
    }));
}

interface ArchiveLibraryProps {
  userId: string;
}

export function ArchiveLibrary({ userId }: ArchiveLibraryProps) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('all');   // category filter
  const [search, setSearch] = useState('');
  const [fullText, setFullText] = useState(false); // false=タイトル検索 / true=全文検索
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const db = getClientDb();
    const q = query(
      collection(db, 'documents'),
      where('userId', 'in', [userId, 'system']),
      limit(200)
    );

    const unsubscribe = onSnapshot(q, snapshot => {
      const items: Doc[] = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          filename: d.filename ?? '',
          fileSize: d.fileSize ?? 0,
          status: d.status ?? 'pending',
          uploadedAt: d.uploadedAt?.toDate?.()?.toISOString() ?? null,
          title: d.title ?? d.filename ?? '',
          titleJa: d.titleJa ?? '',
          summary: d.summary ?? '',
          summaryJa: d.summaryJa ?? '',
          authors: d.authors ?? [],
          category: d.category ?? '',
          arxivId: d.arxivId ?? '',
          publishedAt: d.publishedAt ?? '',
        };
      });

      // Firestore の orderBy は複合インデックスが必要なため JS 側でソート
      items.sort((a, b) => {
        if (!a.uploadedAt) return 1;
        if (!b.uploadedAt) return -1;
        return b.uploadedAt.localeCompare(a.uploadedAt);
      });

      setDocs(items);
      setLoading(false);

      snapshot.docChanges().forEach(change => {
        if (change.type === 'modified' && change.doc.data().status === 'indexed') {
          toast.success(`📚 "${change.doc.data().title ?? change.doc.data().filename}" が検索可能になりました`);
        }
      });
    }, (err) => {
      console.error('Firestore onSnapshot error:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const categoryGroups = useMemo(() => groupCategories(docs), [docs]);

  const filteredDocs = useMemo(() => {
    return docs.filter(doc => {
      const matchCat =
        selected === 'all' ||
        doc.category === selected ||
        (selected === 'other' && !doc.category);
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        doc.title.toLowerCase().includes(q) ||
        doc.titleJa.toLowerCase().includes(q) ||
        (fullText && (
          doc.summary.toLowerCase().includes(q) ||
          doc.summaryJa.toLowerCase().includes(q) ||
          doc.authors.some(a => a.toLowerCase().includes(q))
        ));
      return matchCat && matchSearch;
    });
  }, [docs, selected, search, fullText]);

  const toggleGroup = (prefix: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(prefix) ? next.delete(prefix) : next.add(prefix);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-purple-300/40 text-sm">
        魔導書を開いています...
      </div>
    );
  }

  const Sidebar = (
    <nav className="space-y-1 text-sm">
      {/* All */}
      <SidebarItem
        label="📁 すべて"
        count={docs.length}
        active={selected === 'all'}
        onClick={() => { setSelected('all'); setMobileSidebarOpen(false); }}
      />

      {/* Category groups */}
      {categoryGroups.map(group => (
        <div key={group.prefix}>
          <button
            onClick={() => toggleGroup(group.prefix)}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg
              text-purple-300/50 hover:text-purple-300/80 transition-colors text-xs
              uppercase tracking-wider mt-2"
          >
            <span>{group.label}</span>
            <ChevronRight
              size={12}
              className={`transition-transform duration-200 ${expanded.has(group.prefix) ? 'rotate-90' : ''}`}
            />
          </button>

          <AnimatePresence>
            {expanded.has(group.prefix) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden pl-2 space-y-0.5"
              >
                {group.subs.map(sub => (
                  <SidebarItem
                    key={sub}
                    label={sub === 'other' ? '手動追加' : sub}
                    count={docs.filter(d => (sub === 'other' ? !d.category : d.category === sub)).length}
                    active={selected === sub}
                    onClick={() => { setSelected(sub); setMobileSidebarOpen(false); }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex h-[calc(100dvh-52px)]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-52 lg:w-60 flex-shrink-0 border-r border-purple-500/15
        p-3 overflow-y-auto">
        <div className="mb-3 px-1">
          <span className="text-purple-300/50 text-xs uppercase tracking-wider">書庫</span>
        </div>
        {Sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="fixed left-0 top-[52px] bottom-0 w-60 bg-[#0d0d0d] border-r
                border-purple-500/20 z-50 p-3 overflow-y-auto md:hidden"
            >
              {Sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-purple-500/15">
          {/* Mobile category button */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
              border border-purple-500/20 text-purple-300/60 text-xs"
          >
            📁 {selected === 'all' ? 'すべて' : selected}
          </button>

          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400/70" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={fullText ? 'タイトル・要約・著者を検索...' : 'タイトルを検索...'}
              className="w-full bg-purple-900/25 border border-purple-500/50 rounded-lg
                pl-9 pr-3 py-2 text-purple-100 text-sm placeholder-purple-400/50
                focus:outline-none focus:border-purple-400/80 focus:bg-purple-900/35
                transition-colors"
            />
          </div>

          {/* 詳細検索トグル */}
          <button
            onClick={() => setFullText(f => !f)}
            title={fullText ? '要約・著者も検索中（クリックでタイトルのみに戻す）' : 'タイトルのみ検索（クリックで要約・著者も検索）'}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg
              border text-xs transition-all
              ${fullText
                ? 'bg-purple-700/40 border-purple-400/60 text-purple-200'
                : 'bg-transparent border-purple-500/25 text-purple-400/60 hover:border-purple-400/40 hover:text-purple-300/80'
              }`}
          >
            <span className="hidden sm:inline">{fullText ? '全文検索中' : '詳細検索'}</span>
            <span className="sm:hidden">🔍</span>
          </button>
        </div>

        {/* Count + 検索フィードバック */}
        <div className="px-4 pt-3 pb-1 flex items-center gap-2 flex-wrap">
          {search.trim() ? (
            <>
              <span className="text-amber-300/80 text-xs font-medium">
                「{search}」で {filteredDocs.length} 件ヒット
              </span>
              <span className="text-purple-500/40 text-xs">
                ({fullText ? '全文検索' : 'タイトル検索'})
              </span>
              {filteredDocs.length < docs.length && (
                <span className="text-purple-400/40 text-xs">/ 全 {docs.length} 件</span>
              )}
            </>
          ) : (
            <span className="text-purple-400/40 text-xs">{filteredDocs.length} 件</span>
          )}
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3 pt-2">
          {filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-purple-300/40 text-sm">
                {docs.length === 0 ? 'まだ論文が追加されていません' : '条件に一致する論文がありません'}
              </p>
              {docs.length === 0 && (
                <Link href="/archive/upload" className="mt-4 glow-button px-4 py-2 text-xs">
                  最初の論文を追加する
                </Link>
              )}
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {filteredDocs.map((doc, i) => (
                <DocCard key={doc.id} doc={doc} index={i} search={search} />
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}

/** 検索ワードにマッチした箇所をアンバーハイライトで返す */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-amber-400/30 text-amber-200 rounded-sm px-0.5 not-italic">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function SidebarItem({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg
        text-sm transition-all duration-150 text-left
        ${active
          ? 'bg-purple-700/25 text-purple-200 border border-purple-500/25'
          : 'text-purple-300/60 hover:text-purple-200/80 hover:bg-purple-700/10'
        }`}
    >
      <span className="truncate">{label}</span>
      <span className="text-xs text-purple-400/40 ml-1 flex-shrink-0">{count}</span>
    </button>
  );
}

function DocCard({ doc, index, search }: { doc: Doc; index: number; search: string }) {
  const [expanded, setExpanded] = useState(false);
  const displaySummary = doc.summaryJa || doc.summary;

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      onClick={() => setExpanded(e => !e)}
      className="scroll-card group cursor-pointer select-none"
    >
      <div className="flex items-start gap-3">
        <BookOpen size={15} className="text-purple-400/40 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-1.5">

          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 space-y-0.5">
              {/* 日本語タイトル（メイン） */}
              {doc.titleJa ? (
                <>
                  <h3 className="text-purple-100/90 text-sm font-medium leading-snug">
                    <Highlight text={doc.titleJa} query={search} />
                  </h3>
                  <p className="text-purple-400/50 text-xs leading-snug">
                    <Highlight text={doc.title || doc.filename} query={search} />
                  </p>
                </>
              ) : (
                <h3 className="text-purple-100/90 text-sm font-medium leading-snug">
                  <Highlight text={doc.title || doc.filename} query={search} />
                </h3>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <StatusBadge status={doc.status} />
              <span className="text-purple-500/40 text-xs">{expanded ? '▲' : '▼'}</span>
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            {doc.category && (
              <span className="px-2 py-0.5 rounded-full bg-purple-700/25 border border-purple-500/20
                text-purple-300/70 text-xs">
                {doc.category}
              </span>
            )}
            {doc.arxivId && (
              <a
                href={`https://arxiv.org/abs/${doc.arxivId}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="px-2 py-0.5 rounded-full bg-green-900/20 border border-green-600/20
                  text-green-400/70 text-xs hover:text-green-300 transition-colors inline-flex
                  items-center gap-1"
              >
                arXiv:{doc.arxivId}
              </a>
            )}
          </div>

          {/* Authors + date */}
          {(doc.authors.length > 0 || doc.publishedAt) && (
            <div className="flex flex-wrap items-center gap-3 text-purple-300/40 text-xs">
              {doc.authors.length > 0 && (
                <span className="flex items-center gap-1">
                  <Users size={10} />
                  <Highlight
                    text={doc.authors.slice(0, expanded ? undefined : 3).join(', ') + ((!expanded && doc.authors.length > 3) ? ` +${doc.authors.length - 3}` : '')}
                    query={search}
                  />
                </span>
              )}
              {doc.publishedAt && (
                <span className="flex items-center gap-1">
                  <Calendar size={10} />
                  {doc.publishedAt}
                </span>
              )}
            </div>
          )}

          {/* Summary */}
          {displaySummary && (
            <p className={`text-purple-300/50 text-xs leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
              <Highlight text={displaySummary} query={search} />
            </p>
          )}

          {/* 展開時のみ表示: 英語 abstract */}
          {expanded && doc.summaryJa && doc.summary && (
            <details className="mt-1">
              <summary
                onClick={e => e.stopPropagation()}
                className="text-purple-500/50 text-xs cursor-pointer hover:text-purple-400/70 transition-colors"
              >
                英語原文を表示
              </summary>
              <p className="text-purple-400/40 text-xs leading-relaxed mt-1 italic">
                {doc.summary}
              </p>
            </details>
          )}

          {/* Action links */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5" onClick={e => e.stopPropagation()}>
            {doc.arxivId && (
              <a
                href={`https://arxiv.org/html/${doc.arxivId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-purple-400/60
                  hover:text-purple-300 transition-colors"
              >
                <ExternalLink size={11} />
                HTML版（グラフ付き）
              </a>
            )}
            {doc.arxivId && (
              <a
                href={`https://arxiv.org/pdf/${doc.arxivId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-purple-400/40
                  hover:text-purple-300/60 transition-colors"
              >
                <ExternalLink size={11} />
                PDF
              </a>
            )}
          </div>

          {/* File info */}
          <p className="text-purple-500/25 text-xs">
            {doc.filename}
            {doc.fileSize ? ` · ${formatBytes(doc.fileSize)}` : ''}
          </p>
        </div>
      </div>
    </motion.article>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'indexed') {
    return (
      <span className="flex items-center gap-1 text-green-400/80 text-xs flex-shrink-0 whitespace-nowrap">
        <CheckCircle size={11} /> 検索可能
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="flex items-center gap-1 text-red-400/80 text-xs flex-shrink-0 whitespace-nowrap">
        <XCircle size={11} /> エラー
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-yellow-400/60 text-xs flex-shrink-0 whitespace-nowrap">
      <Clock size={11} className="animate-spin" style={{ animationDuration: '3s' }} />
      処理中
    </span>
  );
}
