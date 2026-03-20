import { cn } from '@/lib/utils';
import { type ButtonHTMLAttributes } from 'react';

interface GlowingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'purple' | 'gold';
}

export function GlowingButton({
  children,
  className,
  variant = 'purple',
  ...props
}: GlowingButtonProps) {
  return (
    <button
      className={cn(
        'font-semibold rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'purple' &&
          'bg-purple-700 hover:bg-purple-600 text-white hover:shadow-[0_0_20px_rgba(167,139,250,0.6)]',
        variant === 'gold' &&
          'bg-yellow-600 hover:bg-yellow-500 text-black hover:shadow-[0_0_20px_rgba(251,191,36,0.6)]',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
