import Link from 'next/link';
import { ParticleBackground } from '@/components/magic-ui/particle-bg';

const FEATURES = [
  {
    icon: '🔍',
    label: '論文を見つける',
    desc: 'AI・機械学習論文をキーワードや自然文で検索できます',
  },
  {
    icon: '📚',
    label: '論文をためる',
    desc: '気になった論文をマイ本棚に保存して読書リストを育てられます',
  },
  {
    icon: '💬',
    label: 'あとで聞き返す',
    desc: '保存した論文にチャットで質問して、引用付きで答えが返ります',
  },
];

const PAINS = [
  { pain: '保存しても埋もれる', value: '本棚に整理してあとから探せる' },
  { pain: '読んだ内容を思い出せない', value: 'チャットで聞き直せる' },
  { pain: '図表や引用まで戻りたい', value: '代表図・結果表・原文リンクをすぐ確認できる' },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col bg-[#0a0a0a] relative overflow-hidden">
      <ParticleBackground />

      {/* ── Hero ── */}
      <section className="relative z-10 flex flex-col md:flex-row items-center justify-center
        min-h-screen gap-10 px-6 py-16 md:py-0 max-w-5xl mx-auto w-full">

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
        <div className="text-center md:text-left">
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

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 md:justify-start justify-center">
            <Link
              href="/login"
              className="bg-purple-700 hover:bg-purple-600 text-white font-semibold
                px-8 py-3 text-sm rounded-lg inline-block text-center
                hover:shadow-[0_0_24px_rgba(167,139,250,0.6)] transition-all duration-300"
            >
              ログインに進む
            </Link>
            <Link
              href="/grimoire"
              className="border border-purple-500/40 text-purple-300/80 hover:text-purple-200
                hover:border-purple-400/60 font-semibold px-8 py-3 text-sm rounded-lg
                inline-block text-center transition-all duration-300"
            >
              まず試してみる
            </Link>
          </div>
          <p className="text-purple-400/35 text-[10px] mt-2 md:text-left text-center">
            ゲスト利用可 · 登録不要で閲覧できます
          </p>
        </div>
      </section>

      {/* ── 3つの体験カード ── */}
      <section className="relative z-10 px-6 pb-16 max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div
              key={f.label}
              className="bg-black/60 backdrop-blur-xl border border-purple-500/20
                rounded-2xl px-5 py-6 text-center"
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <p className="text-purple-100 font-semibold text-sm mb-2">{f.label}</p>
              <p className="text-purple-300/50 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 共感 / 価値ブロック ── */}
      <section className="relative z-10 px-6 pb-16 max-w-3xl mx-auto w-full">
        <p className="text-center text-purple-300/50 text-xs tracking-widest mb-6 uppercase">
          こんな経験はありませんか
        </p>
        <div className="space-y-3">
          {PAINS.map(({ pain, value }) => (
            <div
              key={pain}
              className="flex flex-col sm:flex-row items-start sm:items-center gap-3
                bg-purple-950/30 border border-purple-500/10 rounded-xl px-5 py-4"
            >
              <span className="text-purple-400/60 text-xs flex-shrink-0 sm:w-44 leading-snug">
                ❌ &nbsp;{pain}
              </span>
              <span className="text-purple-400/30 hidden sm:block">→</span>
              <span className="text-purple-100/80 text-xs leading-snug">
                ✅ &nbsp;{value}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 注意書き ── */}
      <section className="relative z-10 px-6 pb-8 max-w-3xl mx-auto w-full text-center">
        <p className="text-purple-400/40 text-[10px] leading-relaxed">
          現在公開中のプロトタイプです。回答の精度・日本語の自然さは継続改善中です。
          フィードバックは随時歓迎しています。
        </p>
      </section>

      {/* ── 技術フッター ── */}
      <footer className="relative z-10 pb-8 text-center">
        <p className="text-purple-500/20 text-[10px]">
          Cloud Run · Firebase · Vertex AI Agent Builder
        </p>
      </footer>
    </main>
  );
}
