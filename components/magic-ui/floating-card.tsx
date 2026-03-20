'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FloatingCardProps {
  children: React.ReactNode;
  className?: string;
  intensity?: number;
}

export function FloatingCard({ children, className, intensity = 8 }: FloatingCardProps) {
  return (
    <motion.div
      animate={{ y: [0, -intensity, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      className={cn(
        'bg-black/60 backdrop-blur-xl border border-purple-500/20 rounded-lg',
        className
      )}
    >
      {children}
    </motion.div>
  );
}
