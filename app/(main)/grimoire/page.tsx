import { ChatInterface } from '@/components/features/chat-interface';
import { ParticleBackground } from '@/components/magic-ui/particle-bg';

export const dynamic = 'force-dynamic';

// チャットIDは簡易的にセッションベースで生成（実装後はユーザーごとに管理）
const DEFAULT_CHAT_ID = 'default';

export default function GrimoirePage() {
  return (
    <div className="flex flex-col md:flex-row h-[calc(100dvh-52px)] relative">
      <ParticleBackground />

      {/* Chat panel */}
      <div className="relative z-10 w-full md:w-[60%] lg:w-[55%] border-r border-purple-500/20 flex flex-col">
        <ChatInterface chatId={DEFAULT_CHAT_ID} />
      </div>

      {/* Citation preview panel (md+) */}
      <div className="hidden md:flex relative z-10 md:w-[40%] lg:w-[45%] flex-col">
        <div className="p-4 border-b border-purple-500/20">
          <p className="text-purple-400/50 text-xs uppercase tracking-wider">📄 Citation Preview</p>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center text-purple-300/20">
            <div className="text-4xl mb-3">📖</div>
            <p className="text-sm">引用番号をクリックすると</p>
            <p className="text-sm">スニペットが表示されます</p>
          </div>
        </div>
      </div>
    </div>
  );
}
