import Link from 'next/link';
import { ParticleBackground } from '@/components/magic-ui/particle-bg';

/** トップページ埋め込み: 使い方デモ（YouTube） */
const DEMO_VIDEO_ID = 'aFHqisqeMfI';

const FEATURES = [
  {
    symbol: '◎',
    label: '論文を見つける',
    desc: 'キーワードや自然文でAI・機械学習論文を検索',
  },
  {
    symbol: '⬡',
    label: '論文をためる',
    desc: '気になった論文をマイ本棚に保存',
  },
  {
    symbol: '✦',
    label: 'あとで聞き返す',
    desc: '保存した論文にチャットで質問、引用付きで回答',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col bg-[#0a0a0a] relative overflow-hidden">
      <ParticleBackground />

      {/* ── Hero ── */}
      <section className="relative z-10 flex flex-col gap-8 md:gap-10 justify-center
        min-h-screen px-6 py-16 md:py-0 max-w-5xl mx-auto w-full">

        {/* 上段: キャラ + コピー〜CTA（PC は上揃え） */}
        <div className="flex flex-col md:flex-row items-center md:items-start justify-center gap-10 w-full">
        {/* キャラクター */}
        <div className="flex-shrink-0 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/tsukineko-mascot.png"
            alt="月ねこグリモワール マスコット"
            className="w-52 h-52 md:w-72 md:h-72 object-contain rounded-2xl
              shadow-[0_0_64px_rgba(167,139,250,0.5)]
              border border-purple-500/20 bg-white/5"
          />
        </div>

        {/* テキストブロック */}
        <div className="text-center md:text-left min-w-0 flex-1">
          {/* タイトル */}
          <h1 className="text-4xl md:text-5xl font-bold mb-1 text-transparent bg-clip-text
            bg-gradient-to-r from-purple-300 to-yellow-400 leading-tight">
            Tsukineko Grimoire
          </h1>
          <div className="flex items-center gap-3 mb-5 md:justify-start justify-center">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-purple-400/45" />
            <p className="text-purple-300/60 text-xs tracking-[0.25em]">月ねこグリモワール</p>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-purple-400/45" />
          </div>

          {/* メインコピー */}
          <p className="text-white font-bold text-3xl md:text-4xl leading-snug mb-4">
            論文を、読むだけで<br />終わらせない。
          </p>

          {/* サブコピー */}
          <p className="text-purple-200/70 text-sm leading-relaxed mb-6 max-w-md">
            AI・機械学習論文を見つけて、保存して、あとからチャットで聞き返せる。
            <br className="hidden sm:block" />
            月ねこグリモワールは、論文を「読んだ情報」ではなく<br className="hidden md:block" />
            「使い返せる知識」に変えるアプリです。
          </p>

          {/* フロー行 */}
          <div className="flex items-center gap-2 mb-8 md:justify-start justify-center flex-wrap">
            {['見つける', '保存する', 'あとで聞き返す'].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-semibold
                  bg-purple-900/60 border border-purple-500/30 text-purple-200">
                  {step}
                </span>
                {i < 2 && <span className="text-purple-500/50 text-xs">→</span>}
              </div>
            ))}
          </div>

          {/* CTA（横幅 max-w-md でサブコピーと揃える） */}
          <div className="w-full max-w-md mx-auto md:mx-0 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 md:justify-start justify-center">
              <Link
                href="/login"
                className="bg-purple-700 hover:bg-purple-600 text-white font-semibold
                  px-8 py-3 text-sm rounded-lg inline-block text-center
                  hover:shadow-[0_0_24px_rgba(167,139,250,0.6)] transition-all duration-300
                  sm:flex-1"
              >
                ログインに進む
              </Link>
              <Link
                href="/grimoire"
                className="border border-purple-500/40 text-purple-300/80 hover:text-purple-200
                  hover:border-purple-400/60 font-semibold px-8 py-3 text-sm rounded-lg
                  inline-block text-center transition-all duration-300
                  sm:flex-1"
              >
                まず試してみる
              </Link>
            </div>
            <p className="text-purple-400/35 text-[10px] md:text-left text-center">
              ゲスト利用可 · 登録不要で閲覧できます
            </p>
          </div>
        </div>
        </div>

        {/* 下段: デモ動画（セクション全幅＝キャラ左端〜右コンテンツ右端） */}
        <div className="w-full">
          <p className="text-purple-400/50 text-[11px] mb-2 text-center md:text-left">
            使い方デモ動画
          </p>
          <div
            className="relative w-full overflow-hidden rounded-xl border border-purple-500/25
              bg-black/50 shadow-[0_0_24px_rgba(88,28,135,0.15)] aspect-video"
          >
            <iframe
              className="absolute inset-0 h-full w-full"
              src={`https://www.youtube.com/embed/${DEMO_VIDEO_ID}`}
              title="月ねこグリモワール 使い方デモ"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>
      </section>

      {/* ── 3列仕切りパネル ── */}
      <section className="relative z-10 px-6 pb-10 max-w-3xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x
          divide-purple-500/10 border border-purple-500/10 rounded-2xl overflow-hidden">
          {FEATURES.map(f => (
            <div key={f.label} className="px-6 py-5 text-center bg-purple-950/10">
              <p className="text-purple-400/40 text-[11px] tracking-widest mb-2 font-mono">
                {f.symbol}
              </p>
              <p className="text-purple-100 text-xs font-semibold mb-1">{f.label}</p>
              <p className="text-purple-400/50 text-[11px] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 価値コピー ── */}
      <section className="relative z-10 px-6 pb-10 max-w-2xl mx-auto w-full text-center">
        <p className="text-purple-300/40 text-xs leading-loose">
          読んで終わりにしない。保存して、あとから引用ごと聞き直せる。<br />
          図表も原文も、ぜんぶ手元に残る知識書庫。
        </p>
      </section>

      {/* ── フッター ── */}
      <footer className="relative z-10 pb-8 text-center space-y-1">
        <p className="text-purple-400/30 text-[10px] leading-relaxed">
          現在公開中のプロトタイプです。回答精度・日本語の自然さは継続改善中。
        </p>
        <p className="text-purple-500/20 text-[10px]">
          Cloud Run · Firebase · Vertex AI Agent Builder
        </p>
      </footer>
    </main>
  );
}
