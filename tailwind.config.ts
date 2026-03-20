import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        'void-black': '#0a0a0a',
        'mystic-purple': '#7c3aed',
        'gold-accent': '#fbbf24',
        'ghost-white': '#f9fafb',
        'mana-glow': '#a78bfa',
      },
      fontFamily: {
        cinzel: ['Cinzel', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'levitate': 'levitate 3s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        levitate: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 10px rgba(167, 139, 250, 0.3)' },
          '50%': { boxShadow: '0 0 25px rgba(167, 139, 250, 0.7)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
