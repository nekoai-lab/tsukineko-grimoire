import { cn } from '@/lib/utils';

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function GlassPanel({ children, className, hover = false }: GlassPanelProps) {
  return (
    <div
      className={cn(
        'bg-black/60 backdrop-blur-xl border border-purple-500/20 rounded-lg',
        hover && 'hover:border-purple-400/40 transition-all duration-300',
        className
      )}
    >
      {children}
    </div>
  );
}
