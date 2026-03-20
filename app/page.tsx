import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-[#0a0a0a]">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-700/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-yellow-600/5 rounded-full blur-3xl" />

      <div className="relative z-10 text-center max-w-2xl px-6">
        <div className="text-7xl mb-6">🌙</div>

        <h1 className="text-5xl font-bold mb-3 text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-yellow-400">
          Tsukineko Grimoire
        </h1>
        <p className="text-purple-300/70 text-lg mb-2">月ねこグリモワール</p>
        <p className="text-purple-200/50 text-sm mb-10 italic">
          &quot;知識を貪り、創造の魔法を紡ぐ、自分専用の魔導書&quot;
        </p>

        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {[
            { icon: '📜', label: 'Ingest', desc: '知識を取り込む' },
            { icon: '🔮', label: 'Consult', desc: '魔導書に問う' },
            { icon: '✨', label: 'Cast', desc: '記事を詠唱する' },
            { icon: '🛰️', label: 'Summon', desc: '論文を召喚する' },
          ].map(f => (
            <div
              key={f.label}
              className="bg-black/60 backdrop-blur-xl border border-purple-500/20 rounded-lg px-4 py-2 text-sm text-purple-200/80"
            >
              {f.icon} <span className="font-semibold">{f.label}</span>
              <span className="text-purple-300/50 ml-1">— {f.desc}</span>
            </div>
          ))}
        </div>

        <Link
          href="/login"
          className="bg-purple-700 hover:bg-purple-600 text-white font-semibold px-8 py-3 text-lg rounded-lg inline-block
            hover:shadow-[0_0_20px_rgba(167,139,250,0.6)] transition-all duration-300"
        >
          魔導書を開く →
        </Link>
      </div>
    </main>
  );
}
