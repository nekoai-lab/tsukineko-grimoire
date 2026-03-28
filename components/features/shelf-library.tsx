'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Users, Calendar, ExternalLink, Trash2, ArrowUpDown, Globe, FileText, Filter, Plus, X,
  LayoutGrid, Table2, GripVertical, Search, ChevronDown,
} from 'lucide-react';
import { getClientDb } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';
import Link from 'next/link';

export type ShelfReadStatus = 'unread' | 'reading' | 'done';

export interface ShelfItem {
  id: string;
  documentId: string;
  addedAt: string | null;
  title: string;
  titleJa: string;
  authors: string[];
  arxivId: string;
  category: string;
  publishedAt: string;
  summaryJa: string;
  summary: string;
  tags: string[];
  theme: string;
  memo: string;
  readStatus: ShelfReadStatus;
  userTags: string[];
}

const THEME_LABELS: Record<string, { label: string; emoji: string }> = {
  A: { label: 'Foundations',            emoji: '📖' },
  B: { label: 'Retrieval & RAG',        emoji: '🔍' },
  C: { label: 'Agentic / Deep Research', emoji: '🤖' },
  D: { label: 'Evaluation',             emoji: '📊' },
  E: { label: 'Trust & Safety',         emoji: '🛡️' },
  F: { label: 'Build & Operate',        emoji: '⚙️' },
};

const READ_STATUS_LABELS: Record<ShelfReadStatus, string> = {
  unread: '未読',
  reading: '読書中',
  done: '読了',
};

type SortKey = 'addedDesc' | 'addedAsc' | 'publishedDesc' | 'titleAsc' | 'readStatusUnreadFirst';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'addedDesc', label: '追加日（新しい順）' },
  { value: 'addedAsc', label: '追加日（古い順）' },
  { value: 'publishedDesc', label: '公開日（新しい順）' },
  { value: 'titleAsc', label: 'タイトル（あいうえお）' },
  { value: 'readStatusUnreadFirst', label: '状態（未読を上に）' },
];

function sortShelfItems(items: ShelfItem[], key: SortKey): ShelfItem[] {
  const copy = [...items];
  switch (key) {
    case 'addedDesc':
      return copy.sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''));
    case 'addedAsc':
      return copy.sort((a, b) => (a.addedAt ?? '').localeCompare(b.addedAt ?? ''));
    case 'publishedDesc':
      return copy.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    case 'titleAsc':
      return copy.sort((a, b) => {
        const ta = (a.titleJa || a.title || '').toLowerCase();
        const tb = (b.titleJa || b.title || '').toLowerCase();
        return ta.localeCompare(tb, 'ja');
      });
    case 'readStatusUnreadFirst': {
      const rank: Record<ShelfReadStatus, number> = { unread: 0, reading: 1, done: 2 };
      return copy.sort((a, b) => {
        const ra = rank[a.readStatus] ?? 0;
        const rb = rank[b.readStatus] ?? 0;
        if (ra !== rb) return ra - rb;
        return (b.addedAt ?? '').localeCompare(a.addedAt ?? '');
      });
    }
    default:
      return copy;
  }
}

const ADDED_DAYS_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'すべて', value: null },
  { label: '直近 7 日', value: 7 },
  { label: '直近 30 日', value: 30 },
  { label: '3 ヶ月以内', value: 90 },
  { label: '半年以内', value: 180 },
];

/** カテゴリ・読了状態・タグ・テーマ・検索ワード・追加日で絞り込み */
function filterShelfItems(
  items: ShelfItem[],
  category: string,
  readStatus: '' | ShelfReadStatus,
  tagFilters: string[],
  searchQuery: string,
  filterTheme: string,
  addedDays: number | null,
): ShelfItem[] {
  const q = searchQuery.trim().toLowerCase();
  const now = Date.now();
  return items.filter(item => {
    if (category && item.category !== category) return false;
    if (readStatus && item.readStatus !== readStatus) return false;
    if (filterTheme) {
      if (filterTheme === '__none__') { if (item.theme) return false; }
      else if (item.theme !== filterTheme) return false;
    }
    if (addedDays !== null) {
      const ms = item.addedAt ? new Date(item.addedAt).getTime() : 0;
      if (now - ms > addedDays * 86_400_000) return false;
    }
    if (q) {
      const haystack = [
        item.title, item.titleJa, item.authors.join(' '), item.arxivId,
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (tagFilters.length > 0) {
      const paper = item.tags ?? [];
      const mine = item.userTags ?? [];
      const hit = tagFilters.some(ft => paper.includes(ft) || mine.includes(ft));
      if (!hit) return false;
    }
    return true;
  });
}

export type ShelfVisibleColumns = {
  readStatus: boolean;
  authors: boolean;
  category: boolean;
  theme: boolean;
  added: boolean;
  published: boolean;
  arxiv: boolean;
  tags: boolean;
  memo: boolean;
  userTags: boolean;
};

const DEFAULT_VISIBLE_COLUMNS: ShelfVisibleColumns = {
  readStatus: true,
  authors: true,
  category: true,
  theme: false,
  added: true,
  published: true,
  arxiv: true,
  tags: false,
  memo: false,
  userTags: false,
};

const COLUMN_LABELS: { key: keyof ShelfVisibleColumns; label: string }[] = [
  { key: 'readStatus', label: '状態' },
  { key: 'authors', label: '著者' },
  { key: 'category', label: 'カテゴリ' },
  { key: 'theme', label: 'テーマ' },
  { key: 'added', label: '追加日' },
  { key: 'published', label: '公開' },
  { key: 'arxiv', label: 'arXiv' },
  { key: 'tags', label: 'タグ' },
  { key: 'memo', label: 'メモ' },
  { key: 'userTags', label: 'マイタグ' },
];

/** Phase D: 表 / カンバン */
export type ShelfViewMode = 'table' | 'kanban';

const PREFS_STORAGE_KEY = (uid: string) => `tg-shelf-prefs-v1:${uid}`;

interface ShelfPersistedPrefs {
  viewMode: ShelfViewMode;
  sortKey: SortKey;
  filterCategory: string;
  filterReadStatus: '' | ShelfReadStatus;
  filterTags: string[];
  filterTheme: string;
  addedDays: number | null;
  visibleCols: ShelfVisibleColumns;
}

function isSortKey(v: unknown): v is SortKey {
  return typeof v === 'string' && SORT_OPTIONS.some(o => o.value === v);
}

function loadShelfPrefs(userId: string): Partial<ShelfPersistedPrefs> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY(userId));
    if (!raw) return null;
    return JSON.parse(raw) as Partial<ShelfPersistedPrefs>;
  } catch {
    return null;
  }
}

function saveShelfPrefs(userId: string, prefs: ShelfPersistedPrefs) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFS_STORAGE_KEY(userId), JSON.stringify(prefs));
  } catch { /* quota */ }
}

const KANBAN_DRAG_MIME = 'application/x-tsukineko-shelf-item';

interface ShelfLibraryProps {
  userId: string;
}

export function ShelfLibrary({ userId }: ShelfLibraryProps) {
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('addedDesc');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterReadStatus, setFilterReadStatus] = useState<'' | ShelfReadStatus>('');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterTheme, setFilterTheme] = useState('');
  const [addedDays, setAddedDays] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const [visibleCols, setVisibleCols] = useState<ShelfVisibleColumns>(DEFAULT_VISIBLE_COLUMNS);
  const [viewMode, setViewMode] = useState<ShelfViewMode>('table');
  const [prefsHydrated, setPrefsHydrated] = useState(false);

  // localStorage から表示設定を復元（Phase D）
  useEffect(() => {
    const p = loadShelfPrefs(userId);
    if (p) {
      if (p.viewMode === 'table' || p.viewMode === 'kanban') setViewMode(p.viewMode);
      if (isSortKey(p.sortKey)) setSortKey(p.sortKey);
      if (typeof p.filterCategory === 'string') setFilterCategory(p.filterCategory);
      if (p.filterReadStatus === '' || p.filterReadStatus === 'unread' || p.filterReadStatus === 'reading' || p.filterReadStatus === 'done') {
        setFilterReadStatus(p.filterReadStatus);
      }
      if (Array.isArray(p.filterTags)) setFilterTags(p.filterTags.filter((t): t is string => typeof t === 'string'));
      if (typeof p.filterTheme === 'string') setFilterTheme(p.filterTheme);
      if (p.addedDays === null || typeof p.addedDays === 'number') setAddedDays(p.addedDays);
      if (p.visibleCols && typeof p.visibleCols === 'object') {
        setVisibleCols({ ...DEFAULT_VISIBLE_COLUMNS, ...p.visibleCols });
      }
    }
    setPrefsHydrated(true);
  }, [userId]);

  useEffect(() => {
    if (!prefsHydrated) return;
    saveShelfPrefs(userId, {
      viewMode,
      sortKey,
      filterCategory,
      filterReadStatus,
      filterTags,
      filterTheme,
      addedDays,
      visibleCols,
    });
  }, [prefsHydrated, userId, viewMode, sortKey, filterCategory, filterReadStatus, filterTags, filterTheme, addedDays, visibleCols]);

  useEffect(() => {
    const db = getClientDb();
    const q = query(
      collection(db, 'shelves', userId, 'items'),
      orderBy('addedAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, snap => {
      const list: ShelfItem[] = snap.docs.map(d => {
        const data = d.data();
        const rs = data.readStatus;
        const readStatus: ShelfReadStatus =
          rs === 'reading' || rs === 'done' || rs === 'unread' ? rs : 'unread';
        return {
          id: d.id,
          documentId: d.id,
          addedAt: data.addedAt?.toDate?.()?.toISOString() ?? null,
          title:      data.title      ?? '',
          titleJa:    data.titleJa    ?? '',
          authors:    data.authors    ?? [],
          arxivId:    data.arxivId    ?? '',
          category:   data.category   ?? '',
          publishedAt: data.publishedAt ?? '',
          summaryJa:  data.summaryJa  ?? '',
          summary:    data.summary    ?? '',
          tags:       data.tags       ?? [],
          theme:      typeof data.theme === 'string' ? data.theme : '',
          memo:       typeof data.memo === 'string' ? data.memo : '',
          readStatus,
          userTags:   Array.isArray(data.userTags) ? data.userTags.filter((t: unknown): t is string => typeof t === 'string') : [],
        };
      });
      setItems(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [userId]);

  const categoryOptions = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => { if (i.category?.trim()) s.add(i.category); });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const tagOptions = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => {
      (i.tags ?? []).forEach(t => { if (t?.trim()) s.add(t); });
      (i.userTags ?? []).forEach(t => { if (t?.trim()) s.add(t); });
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [items]);

  const patchItem = useCallback(async (documentId: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/shelf/${documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(typeof d.error === 'string' ? d.error : '更新に失敗しました');
      throw new Error('patch failed');
    }
  }, []);

  const filteredItems = useMemo(
    () => filterShelfItems(items, filterCategory, filterReadStatus, filterTags, searchQuery, filterTheme, addedDays),
    [items, filterCategory, filterReadStatus, filterTags, searchQuery, filterTheme, addedDays]
  );

  const sortedItems = useMemo(
    () => sortShelfItems(filteredItems, sortKey),
    [filteredItems, sortKey]
  );

  const hasActiveFilters = Boolean(filterCategory) || Boolean(filterReadStatus) || filterTags.length > 0
    || Boolean(filterTheme) || addedDays !== null || Boolean(searchQuery.trim());

  const toggleCol = (key: keyof ShelfVisibleColumns) => {
    setVisibleCols(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false);
      }
    };
    if (tagDropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tagDropdownOpen]);

  const clearFilters = () => {
    setFilterCategory('');
    setFilterReadStatus('');
    setFilterTags([]);
    setFilterTheme('');
    setAddedDays(null);
    setSearchQuery('');
  };

  const resetViewPrefs = () => {
    setViewMode('table');
    setSortKey('addedDesc');
    clearFilters(); // searchQuery も含めてリセット
    setVisibleCols({ ...DEFAULT_VISIBLE_COLUMNS });
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(PREFS_STORAGE_KEY(userId));
      } catch { /* noop */ }
    }
    toast.success('表示設定を初期化しました');
  };

  const toggleFilterTag = (tag: string) => {
    setFilterTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-purple-300/40 text-sm">本棚を開いています...</div>
      </div>
    );
  }

  return (
    <div className={`mx-auto px-4 py-6 space-y-5 ${viewMode === 'kanban' ? 'max-w-7xl' : 'max-w-6xl'}`}>
      {/* ヘッダー */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🗂</span>
          <h1 className="magic-title text-xl font-bold">マイ本棚</h1>
        </div>
      </div>

      {/* インクリメンタル検索 */}
      {items.length > 0 && (
        <div className="pl-0 sm:pl-9">
          <div className="relative max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400/50 pointer-events-none" />
            <input
              type="search"
              placeholder="タイトル・著者で検索…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-purple-950/50 border border-purple-500/25 rounded-xl pl-8 pr-4 py-2
                text-purple-200/90 text-xs placeholder:text-purple-500/40
                focus:outline-none focus:ring-1 focus:ring-purple-400/40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-purple-400/50 hover:text-purple-300"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* フィルタ・ソート・列表示 */}
      {items.length > 0 && (
        <div className="space-y-4 pl-0 sm:pl-9">
          {/* ビュー切替 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-purple-500/50 text-[11px] whitespace-nowrap mr-1">表示</span>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors
                ${viewMode === 'table'
                  ? 'bg-purple-700/30 border-purple-400/45 text-purple-100'
                  : 'border-purple-500/20 text-purple-400/60 hover:border-purple-400/35'
                }`}
            >
              <Table2 size={14} />
              表 / カード
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors
                ${viewMode === 'kanban'
                  ? 'bg-purple-700/30 border-purple-400/45 text-purple-100'
                  : 'border-purple-500/20 text-purple-400/60 hover:border-purple-400/35'
                }`}
            >
              <LayoutGrid size={14} />
              カンバン
            </button>
            <button
              type="button"
              onClick={resetViewPrefs}
              className="text-[11px] text-purple-500/45 hover:text-purple-300/70 ml-1 underline-offset-2 hover:underline"
            >
              表示をリセット
            </button>
          </div>

          {/* フィルター行（横一列・レスポンシブ） */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1 text-purple-400/60 text-[11px] font-medium flex-shrink-0">
              <Filter size={12} />
              フィルタ
            </span>

            {/* カテゴリ */}
            <label className="inline-flex items-center gap-1 text-[11px] text-purple-500/50 whitespace-nowrap">
              カテゴリ
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="bg-purple-950/50 border border-purple-500/25 rounded-lg px-2 py-1 ml-1
                  text-purple-200/90 text-[11px] max-w-[11rem] focus:outline-none focus:ring-1 focus:ring-purple-400/40"
              >
                <option value="">すべて</option>
                {categoryOptions.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>

            {/* 状態 */}
            <label className="inline-flex items-center gap-1 text-[11px] text-purple-500/50 whitespace-nowrap">
              状態
              <select
                value={filterReadStatus}
                onChange={e => setFilterReadStatus((e.target.value || '') as '' | ShelfReadStatus)}
                className="bg-purple-950/50 border border-purple-500/25 rounded-lg px-2 py-1 ml-1
                  text-purple-200/90 text-[11px] focus:outline-none focus:ring-1 focus:ring-purple-400/40"
              >
                <option value="">すべて</option>
                {(Object.keys(READ_STATUS_LABELS) as ShelfReadStatus[]).map(k => (
                  <option key={k} value={k}>{READ_STATUS_LABELS[k]}</option>
                ))}
              </select>
            </label>

            {/* テーマ */}
            <label className="inline-flex items-center gap-1 text-[11px] text-purple-500/50 whitespace-nowrap">
              テーマ
              <select
                value={filterTheme}
                onChange={e => setFilterTheme(e.target.value)}
                className="bg-purple-950/50 border border-purple-500/25 rounded-lg px-2 py-1 ml-1
                  text-purple-200/90 text-[11px] focus:outline-none focus:ring-1 focus:ring-purple-400/40"
              >
                <option value="">すべて</option>
                {Object.entries(THEME_LABELS).map(([k, { emoji, label }]) => (
                  <option key={k} value={k}>{emoji} {label}</option>
                ))}
                <option value="__none__">… 未分類のみ</option>
              </select>
            </label>

            {/* タグ（複数選択ドロップダウン） */}
            {tagOptions.length > 0 && (
              <div ref={tagDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setTagDropdownOpen(o => !o)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] transition-colors
                    ${filterTags.length > 0
                      ? 'bg-purple-700/30 border-purple-400/45 text-purple-200'
                      : 'border-purple-500/25 text-purple-400/60 hover:border-purple-400/35'
                    }`}
                >
                  タグ
                  {filterTags.length > 0 && (
                    <span className="bg-purple-500/30 text-purple-200 rounded-full px-1 text-[10px]">
                      {filterTags.length}
                    </span>
                  )}
                  <ChevronDown size={11} className={`transition-transform ${tagDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {tagDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 z-30 w-52 max-h-60 overflow-y-auto
                    rounded-xl border border-purple-500/25 bg-[#0f0a18] shadow-xl shadow-black/40">
                    <div className="p-1.5">
                      {filterTags.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setFilterTags([])}
                          className="w-full text-left px-2 py-1 text-[10px] text-purple-400/60 hover:text-purple-300 mb-1"
                        >
                          選択をクリア
                        </button>
                      )}
                      {tagOptions.map(tag => {
                        const checked = filterTags.includes(tag);
                        return (
                          <label
                            key={tag}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-purple-900/30 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleFilterTag(tag)}
                              className="accent-purple-400 w-3 h-3 flex-shrink-0"
                            />
                            <span className="text-[11px] text-purple-300/80 truncate">#{tag}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 追加日 */}
            <label className="inline-flex items-center gap-1 text-[11px] text-purple-500/50 whitespace-nowrap">
              追加日
              <select
                value={addedDays ?? ''}
                onChange={e => setAddedDays(e.target.value === '' ? null : Number(e.target.value))}
                className="bg-purple-950/50 border border-purple-500/25 rounded-lg px-2 py-1 ml-1
                  text-purple-200/90 text-[11px] focus:outline-none focus:ring-1 focus:ring-purple-400/40"
              >
                {ADDED_DAYS_OPTIONS.map(o => (
                  <option key={String(o.value)} value={o.value ?? ''}>{o.label}</option>
                ))}
              </select>
            </label>

            {/* クリア */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-0.5 text-[11px] text-purple-400/50 hover:text-purple-300 underline-offset-2 hover:underline"
              >
                <X size={11} />
                クリア
              </button>
            )}
          </div>

          {/* 表示列（表ビュー・デスクトップのみ） */}
          {viewMode === 'table' && (
          <div className="hidden md:block space-y-2">
            <p className="text-purple-500/50 text-[11px]">表示列（タイトル・操作は常に表示）</p>
            <div className="flex flex-wrap gap-1.5">
              {COLUMN_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleCol(key)}
                  className={`px-2 py-1 rounded-lg text-[11px] border transition-colors
                    ${visibleCols[key]
                      ? 'bg-purple-700/25 border-purple-400/40 text-purple-200/90'
                      : 'border-purple-500/15 text-purple-500/45 hover:border-purple-500/30'
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          )}

          {viewMode === 'kanban' && (
            <p className="text-purple-400/40 text-[11px]">
              カードをドラッグして列をまたぐと読了状態が更新されます。
            </p>
          )}
        </div>
      )}

      {/* 本棚が空 */}
      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-24 gap-4 text-center"
        >
          <div className="text-5xl opacity-40">📭</div>
          <p className="text-purple-300/50 text-sm">まだ保存した論文がありません</p>
          <p className="text-purple-400/35 text-xs max-w-xs">
            Archive ページの論文カードを開いて「本棚に追加」を押すと、ここに保存されます
          </p>
          <Link
            href="/archive"
            className="mt-2 glow-button px-4 py-2 text-xs"
          >
            Archive を見る
          </Link>
        </motion.div>
      ) : sortedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
          <p className="text-purple-300/60 text-sm">条件に一致する論文がありません</p>
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-purple-400/70 hover:text-purple-300 underline-offset-2 hover:underline"
          >
            フィルタをクリア
          </button>
        </div>
      ) : viewMode === 'kanban' ? (
        <ShelfKanbanBoard items={sortedItems} sortKey={sortKey} onPatch={patchItem} />
      ) : (
        <>
          {/* 表ヘッダー：件数 + 並び替え */}
          <div className="flex items-center justify-between">
            <span className="text-purple-500/40 text-[11px]">{sortedItems.length} 件</span>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-purple-400/55">
              <ArrowUpDown size={12} className="flex-shrink-0" />
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                className="bg-purple-950/50 border border-purple-500/25 rounded-lg px-2 py-1
                  text-purple-200/90 text-[11px] focus:outline-none focus:ring-1 focus:ring-purple-400/40"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>

          {/* デスクトップ: 表 */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-purple-500/20 bg-[#0f0a18]/80">
            <table className="w-full text-left text-xs border-collapse min-w-[480px]">
              <thead>
                <tr className="border-b border-purple-500/20 bg-purple-950/50 text-purple-400/70">
                  <th className="px-3 py-2.5 font-medium min-w-[12rem]">タイトル</th>
                  {visibleCols.readStatus && (
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">状態</th>
                  )}
                  {visibleCols.authors && (
                    <th className="px-3 py-2.5 font-medium w-[16%]">著者</th>
                  )}
                  {visibleCols.category && (
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">カテゴリ</th>
                  )}
                  {visibleCols.theme && (
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">テーマ</th>
                  )}
                  {visibleCols.added && (
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">追加日</th>
                  )}
                  {visibleCols.published && (
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">公開</th>
                  )}
                  {visibleCols.arxiv && (
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">arXiv</th>
                  )}
                  {visibleCols.tags && (
                    <th className="px-3 py-2.5 font-medium w-[10%]">タグ</th>
                  )}
                  {visibleCols.memo && (
                    <th className="px-3 py-2.5 font-medium min-w-[8rem]">メモ</th>
                  )}
                  {visibleCols.userTags && (
                    <th className="px-3 py-2.5 font-medium min-w-[7rem]">マイタグ</th>
                  )}
                  <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item, i) => (
                  <ShelfTableRow key={item.id} item={item} index={i} cols={visibleCols} onPatch={patchItem} />
                ))}
              </tbody>
            </table>
          </div>

          {/* モバイル: カード */}
          <div className="md:hidden space-y-3">
            <AnimatePresence initial={false}>
              {sortedItems.map((item, i) => (
                <ShelfCard key={item.id} item={item} index={i} onPatch={patchItem} />
              ))}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}

/** カンバン: 状態別の列へドラッグ＆ドロップで PATCH */
function ShelfKanbanBoard({
  items,
  sortKey,
  onPatch,
}: {
  items: ShelfItem[];
  sortKey: SortKey;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const [dragOver, setDragOver] = useState<ShelfReadStatus | null>(null);

  useEffect(() => {
    const end = () => setDragOver(null);
    window.addEventListener('dragend', end);
    return () => window.removeEventListener('dragend', end);
  }, []);

  const grouped = useMemo(() => {
    const m: Record<ShelfReadStatus, ShelfItem[]> = { unread: [], reading: [], done: [] };
    items.forEach(i => {
      m[i.readStatus].push(i);
    });
    (['unread', 'reading', 'done'] as const).forEach(k => {
      m[k] = sortShelfItems(m[k], sortKey);
    });
    return m;
  }, [items, sortKey]);

  const columnStyle: Record<ShelfReadStatus, string> = {
    unread: 'border-purple-500/35 bg-purple-950/25',
    reading: 'border-amber-500/30 bg-amber-950/10',
    done: 'border-emerald-500/30 bg-emerald-950/10',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[240px]">
      {(['unread', 'reading', 'done'] as const).map(status => (
        <div
          key={status}
          onDragOver={e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDragOver(status);
          }}
          onDrop={async e => {
            e.preventDefault();
            setDragOver(null);
            const id = e.dataTransfer.getData(KANBAN_DRAG_MIME);
            if (!id) return;
            const item = items.find(x => x.id === id);
            if (!item || item.readStatus === status) return;
            try {
              await onPatch(id, { readStatus: status });
            } catch { /* toast in onPatch */ }
          }}
          className={`rounded-xl border flex flex-col max-h-[min(70vh,720px)] transition-shadow
            ${columnStyle[status]}
            ${dragOver === status ? 'ring-2 ring-purple-400/45 ring-offset-2 ring-offset-[#0a0612]' : ''}`}
        >
          <div className="px-3 py-2 border-b border-purple-500/15 flex items-center justify-between flex-shrink-0">
            <span className="text-sm font-medium text-purple-200/90">{READ_STATUS_LABELS[status]}</span>
            <span className="text-xs text-purple-400/50 tabular-nums">{grouped[status].length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
            {grouped[status].length === 0 ? (
              <p className="text-purple-500/35 text-[11px] text-center py-6 px-2">
                ここにドロップ
              </p>
            ) : (
              grouped[status].map(item => (
                <ShelfKanbanCard key={item.id} item={item} />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ShelfKanbanCard({ item }: { item: ShelfItem }) {
  const title = item.titleJa || item.title || '(タイトルなし)';
  const sub = item.titleJa ? item.title : '';

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData(KANBAN_DRAG_MIME, item.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="rounded-lg border border-purple-500/20 bg-[#120c1f]/95 p-2.5 shadow-sm
        cursor-grab active:cursor-grabbing hover:border-purple-400/35 transition-colors
        select-none"
    >
      <div className="flex items-start gap-2">
        <GripVertical size={14} className="text-purple-500/35 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-purple-100/90 text-xs font-medium leading-snug line-clamp-3" title={title}>
            {title}
          </p>
          {sub && (
            <p className="text-purple-400/45 text-[10px] line-clamp-1" title={sub}>{sub}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {item.category && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 border border-purple-500/20 text-purple-300/70">
                {item.category}
              </span>
            )}
            {item.arxivId && (
              <a
                href={`https://arxiv.org/abs/${item.arxivId}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-[10px] text-green-400/70 hover:text-green-300"
              >
                arXiv
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShelfMemoCell({
  item,
  onPatch,
  wide,
}: {
  item: ShelfItem;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>;
  wide?: boolean;
}) {
  const [v, setV] = useState(item.memo);
  useEffect(() => { setV(item.memo); }, [item.memo]);
  return (
    <textarea
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={async () => {
        if (v === item.memo) return;
        try {
          await onPatch(item.id, { memo: v });
        } catch {
          setV(item.memo);
        }
      }}
      rows={wide ? 3 : 2}
      onClick={e => e.stopPropagation()}
      placeholder="メモ…"
      className={`w-full min-w-[7rem] bg-purple-950/40 border border-purple-500/20 rounded-lg px-2 py-1
        text-purple-200/85 text-[11px] leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-purple-400/40
        placeholder:text-purple-500/35 ${wide ? 'max-w-none' : 'max-w-[14rem]'}`}
    />
  );
}

function ShelfUserTagsCell({
  item,
  onPatch,
  wide,
}: {
  item: ShelfItem;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>;
  wide?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const tags = item.userTags ?? [];

  const remove = async (t: string) => {
    const next = tags.filter(x => x !== t);
    try {
      await onPatch(item.id, { userTags: next });
    } catch { /* noop */ }
  };

  const add = async () => {
    const t = draft.trim().slice(0, 40);
    if (!t || tags.includes(t) || tags.length >= 20) return;
    try {
      await onPatch(item.id, { userTags: [...tags, t] });
      setDraft('');
    } catch { /* noop */ }
  };

  return (
    <div
      className={`min-w-[6rem] space-y-1 ${wide ? 'max-w-none' : 'max-w-[10rem]'}`}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex flex-wrap gap-0.5">
        {tags.map(t => (
          <span
            key={t}
            className="inline-flex items-center gap-0.5 pl-1 pr-0.5 py-0.5 rounded text-[10px]
              bg-amber-900/25 border border-amber-600/25 text-amber-200/80"
          >
            <span className="truncate max-w-[4.5rem]" title={t}>#{t}</span>
            <button
              type="button"
              onClick={() => remove(t)}
              className="p-0.5 rounded hover:bg-amber-800/40 text-amber-300/70"
              title="削除"
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-0.5 items-center">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="追加"
          className="flex-1 min-w-0 bg-purple-950/40 border border-purple-500/20 rounded px-1.5 py-0.5
            text-[10px] text-purple-200 focus:outline-none focus:ring-1 focus:ring-purple-400/40"
        />
        <button
          type="button"
          onClick={add}
          className="p-1 rounded border border-purple-500/25 text-purple-400 hover:bg-purple-800/30"
          title="タグを追加"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

/** 表用: 1行（列順はヘッダーと一致） */
function ShelfTableRow({
  item,
  index,
  cols,
  onPatch,
}: {
  item: ShelfItem;
  index: number;
  cols: ShelfVisibleColumns;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const [removing, setRemoving] = useState(false);
  const displayTitle = item.titleJa || item.title || '(タイトルなし)';
  const subTitle = item.titleJa ? item.title : '';
  const authorsShort = item.authors.slice(0, 2).join(', ') + (item.authors.length > 2 ? ' et al.' : '');
  const added = item.addedAt
    ? new Date(item.addedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';
  const published = item.publishedAt
    ? item.publishedAt.slice(0, 10)
    : '—';

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRemoving(true);
    try {
      await fetch(`/api/shelf/${item.id}`, { method: 'DELETE' });
      toast.success('本棚から削除しました');
    } catch {
      toast.error('削除に失敗しました');
      setRemoving(false);
    }
  };

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(index * 0.02, 0.2) }}
      className="border-b border-purple-500/10 hover:bg-purple-900/15 transition-colors"
    >
      <td className="px-3 py-2 align-top">
        <p
          className="text-purple-100/90 font-medium leading-snug line-clamp-2"
          title={displayTitle + (subTitle ? `\n${subTitle}` : '')}
        >
          {displayTitle}
        </p>
        {subTitle && (
          <p className="text-purple-400/45 text-[11px] mt-0.5 line-clamp-1" title={subTitle}>{subTitle}</p>
        )}
      </td>
      {cols.readStatus && (
        <td className="px-3 py-2 align-top">
          <select
            value={item.readStatus}
            onChange={async e => {
              const v = e.target.value as ShelfReadStatus;
              try {
                await onPatch(item.id, { readStatus: v });
              } catch {
                /* onSnapshot keeps old value */
              }
            }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[6.5rem] bg-purple-950/60 border border-purple-500/25 rounded-lg px-1.5 py-1
              text-[11px] text-purple-200 focus:outline-none focus:ring-1 focus:ring-purple-400/40"
          >
            {(Object.keys(READ_STATUS_LABELS) as ShelfReadStatus[]).map(k => (
              <option key={k} value={k}>{READ_STATUS_LABELS[k]}</option>
            ))}
          </select>
        </td>
      )}
      {cols.authors && (
        <td className="px-3 py-2 align-top text-purple-300/50" title={item.authors.join(', ')}>
          <span className="line-clamp-2">{authorsShort || '—'}</span>
        </td>
      )}
      {cols.category && (
        <td className="px-3 py-2 align-top">
          {item.category ? (
            <span className="inline-block px-1.5 py-0.5 rounded bg-purple-900/40 border border-purple-500/20 text-purple-300/75">
              {item.category}
            </span>
          ) : (
            <span className="text-purple-500/40">—</span>
          )}
        </td>
      )}
      {cols.theme && (
        <td className="px-3 py-2 align-top whitespace-nowrap">
          {item.theme && THEME_LABELS[item.theme] ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-900/40 border border-purple-500/20 text-purple-300/75 text-[11px]">
              {THEME_LABELS[item.theme].emoji} {THEME_LABELS[item.theme].label}
            </span>
          ) : (
            <span className="text-purple-500/40">—</span>
          )}
        </td>
      )}
      {cols.added && (
        <td className="px-3 py-2 align-top text-purple-400/55 whitespace-nowrap tabular-nums">{added}</td>
      )}
      {cols.published && (
        <td className="px-3 py-2 align-top text-purple-400/55 whitespace-nowrap tabular-nums">{published}</td>
      )}
      {cols.arxiv && (
        <td className="px-3 py-2 align-top">
          {item.arxivId ? (
            <a
              href={`https://arxiv.org/abs/${item.arxivId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-400/70 hover:text-green-300 underline-offset-2 hover:underline"
            >
              {item.arxivId}
            </a>
          ) : (
            <span className="text-purple-500/40">—</span>
          )}
        </td>
      )}
      {cols.tags && (
        <td className="px-3 py-2 align-top">
          <div className="flex flex-wrap gap-0.5 max-w-[8rem]">
            {(item.tags ?? []).length > 0 ? (
              (item.tags ?? []).slice(0, 4).map(t => (
                <span
                  key={t}
                  className="text-[10px] px-1 py-0.5 rounded bg-purple-900/30 border border-purple-500/15 text-purple-400/70 truncate max-w-full"
                  title={t}
                >
                  #{t}
                </span>
              ))
            ) : (
              <span className="text-purple-500/40">—</span>
            )}
            {(item.tags ?? []).length > 4 && (
              <span className="text-[10px] text-purple-500/40">+{(item.tags ?? []).length - 4}</span>
            )}
          </div>
        </td>
      )}
      {cols.memo && (
        <td className="px-3 py-2 align-top">
          <ShelfMemoCell item={item} onPatch={onPatch} />
        </td>
      )}
      {cols.userTags && (
        <td className="px-3 py-2 align-top">
          <ShelfUserTagsCell item={item} onPatch={onPatch} />
        </td>
      )}
      <td className="px-3 py-2 align-top text-right">
        <div className="flex flex-wrap items-center justify-end gap-1">
          {item.arxivId && (
            <>
              <a
                href={`https://arxiv.org/html/${item.arxivId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg border border-purple-500/20 text-purple-400/70 hover:bg-purple-800/30"
                title="HTML"
              >
                <Globe size={14} />
              </a>
              <a
                href={`https://arxiv.org/pdf/${item.arxivId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg border border-purple-500/20 text-purple-400/70 hover:bg-purple-800/30"
                title="PDF"
              >
                <FileText size={14} />
              </a>
            </>
          )}
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="p-1.5 rounded-lg border border-purple-500/20 text-purple-500/50 hover:text-red-400/80 hover:border-red-500/30 disabled:opacity-40"
            title="削除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </motion.tr>
  );
}

function ShelfCard({
  item,
  index,
  onPatch,
}: {
  item: ShelfItem;
  index: number;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [removing, setRemoving] = useState(false);
  const displaySummary = item.summaryJa || item.summary;

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRemoving(true);
    try {
      await fetch(`/api/shelf/${item.id}`, { method: 'DELETE' });
      toast.success('本棚から削除しました');
    } catch {
      toast.error('削除に失敗しました');
      setRemoving(false);
    }
  };

  const addedDate = item.addedAt
    ? new Date(item.addedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
    : null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ delay: Math.min(index * 0.03, 0.25) }}
      onClick={() => setExpanded(e => !e)}
      className="scroll-card group cursor-pointer select-none"
    >
      <div className="flex items-start gap-3">
        <BookOpen size={15} className="text-purple-400/40 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-1.5">

          {/* タイトル行 */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 space-y-0.5">
              {item.titleJa ? (
                <>
                  <h3 className="text-purple-100/90 text-sm font-medium leading-snug">
                    {item.titleJa}
                  </h3>
                  <p className="text-purple-400/50 text-xs leading-snug">{item.title}</p>
                </>
              ) : (
                <h3 className="text-purple-100/90 text-sm font-medium leading-snug">
                  {item.title || '(タイトルなし)'}
                </h3>
              )}
            </div>
            <span className="text-purple-500/40 text-xs flex-shrink-0">{expanded ? '▲' : '▼'}</span>
          </div>

          {/* バッジ */}
          <div className="flex flex-wrap items-center gap-1.5">
            {item.arxivId && (
              <a
                href={`https://arxiv.org/abs/${item.arxivId}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="px-2 py-0.5 rounded-full bg-green-900/20 border border-green-600/20
                  text-green-400/70 text-xs hover:text-green-300 transition-colors"
              >
                arXiv:{item.arxivId}
              </a>
            )}
            {item.category && (
              <span className="px-2 py-0.5 rounded-full bg-purple-700/25 border border-purple-500/20
                text-purple-300/70 text-xs">
                {item.category}
              </span>
            )}
            <span
              className={`px-2 py-0.5 rounded-full text-xs border
                ${item.readStatus === 'done'
                  ? 'bg-emerald-900/25 border-emerald-600/25 text-emerald-300/80'
                  : item.readStatus === 'reading'
                    ? 'bg-amber-900/25 border-amber-600/25 text-amber-200/80'
                    : 'bg-purple-900/30 border-purple-500/20 text-purple-300/60'
                }`}
            >
              {READ_STATUS_LABELS[item.readStatus]}
            </span>
          </div>

          {/* 著者・日付 */}
          {(item.authors.length > 0 || item.publishedAt) && (
            <div className="flex flex-wrap items-center gap-3 text-purple-300/40 text-xs">
              {item.authors.length > 0 && (
                <span className="flex items-center gap-1">
                  <Users size={10} />
                  {item.authors.slice(0, expanded ? undefined : 3).join(', ')}
                  {!expanded && item.authors.length > 3 && ` +${item.authors.length - 3}`}
                </span>
              )}
              {item.publishedAt && (
                <span className="flex items-center gap-1">
                  <Calendar size={10} />
                  {item.publishedAt}
                </span>
              )}
            </div>
          )}

          {/* 要約 */}
          {displaySummary && (
            <p className={`text-purple-300/50 text-xs leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
              {displaySummary}
            </p>
          )}

          {/* メモ・マイタグ・状態（カード内編集） */}
          <div className="space-y-2 pt-1 border-t border-purple-500/15" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-purple-500/50">状態</span>
              <select
                value={item.readStatus}
                onChange={async e => {
                  const v = e.target.value as ShelfReadStatus;
                  try {
                    await onPatch(item.id, { readStatus: v });
                  } catch { /* noop */ }
                }}
                className="w-full max-w-[12rem] bg-purple-950/60 border border-purple-500/25 rounded-lg px-2 py-1.5
                  text-xs text-purple-200 focus:outline-none focus:ring-1 focus:ring-purple-400/40"
              >
                {(Object.keys(READ_STATUS_LABELS) as ShelfReadStatus[]).map(k => (
                  <option key={k} value={k}>{READ_STATUS_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-purple-500/50">メモ</span>
              <ShelfMemoCell item={item} onPatch={onPatch} wide />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-purple-500/50">マイタグ</span>
              <ShelfUserTagsCell item={item} onPatch={onPatch} wide />
            </div>
          </div>

          {/* アクション */}
          <div className="flex flex-wrap items-center gap-3 pt-0.5" onClick={e => e.stopPropagation()}>
            {item.arxivId && (
              <a
                href={`https://arxiv.org/html/${item.arxivId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-purple-400/60 hover:text-purple-300 transition-colors"
              >
                <ExternalLink size={11} />
                HTML版
              </a>
            )}
            {item.arxivId && (
              <a
                href={`https://arxiv.org/pdf/${item.arxivId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-purple-400/40 hover:text-purple-300/60 transition-colors"
              >
                <ExternalLink size={11} />
                PDF
              </a>
            )}
            <button
              onClick={handleRemove}
              disabled={removing}
              className="inline-flex items-center gap-1 text-xs text-purple-500/35
                hover:text-red-400/70 transition-colors disabled:opacity-40 ml-auto"
            >
              <Trash2 size={11} />
              {removing ? '削除中...' : '削除'}
            </button>
          </div>

          {/* 追加日 */}
          {addedDate && (
            <p className="text-purple-500/25 text-xs">追加日: {addedDate}</p>
          )}
        </div>
      </div>
    </motion.article>
  );
}
