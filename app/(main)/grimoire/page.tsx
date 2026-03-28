import { use } from 'react';
import { ChatInterface } from '@/components/features/chat-interface';
import { ParticleBackground } from '@/components/magic-ui/particle-bg';

export const dynamic = 'force-dynamic';

// チャットIDは簡易的にセッションベースで生成（実装後はユーザーごとに管理）
const DEFAULT_CHAT_ID = 'default';

export default function GrimoirePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = use(searchParams);
  const arxivIdParam = params.arxivId;
  const initialArxivId = typeof arxivIdParam === 'string' ? arxivIdParam : undefined;

  return (
    <div className="h-[calc(100dvh-52px)] relative">
      <ParticleBackground />
      <div className="relative z-10 h-full flex flex-col">
        <ChatInterface chatId={DEFAULT_CHAT_ID} initialArxivId={initialArxivId} />
      </div>
    </div>
  );
}
