import { ChatInterface } from '@/components/features/chat-interface';
import { ParticleBackground } from '@/components/magic-ui/particle-bg';

export const dynamic = 'force-dynamic';

/** Next.js 15 から searchParams は Promise（await してから読む） */
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

export default async function GrimoirePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { arxivId } = await searchParams;
  const initialArxivId = pickArxivId(arxivId);

  return (
    <div className="h-[calc(100dvh-52px)] relative">
      <ParticleBackground />
      <div className="relative z-10 h-full flex flex-col">
        <ChatInterface initialArxivId={initialArxivId} />
      </div>
    </div>
  );
}
