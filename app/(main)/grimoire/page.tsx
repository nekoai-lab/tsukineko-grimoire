import { ChatInterface } from '@/components/features/chat-interface';
import { ParticleBackground } from '@/components/magic-ui/particle-bg';

export const dynamic = 'force-dynamic';

/** Next.js 14 では searchParams は同期オブジェクト（15 以降の Promise パターンは使わない） */
function pickArxivId(
  raw: string | string[] | undefined
): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
    return raw[0];
  }
  return undefined;
}

export default function GrimoirePage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const initialArxivId = pickArxivId(searchParams.arxivId);

  return (
    <div className="h-[calc(100dvh-52px)] relative">
      <ParticleBackground />
      <div className="relative z-10 h-full flex flex-col">
        <ChatInterface initialArxivId={initialArxivId} />
      </div>
    </div>
  );
}
