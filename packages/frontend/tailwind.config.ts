import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        crystal: '#FFFFFF',
        'ice-silver': '#E4E7EC',
        electric: {
          DEFAULT: '#0A84FF',
          soft: '#5AA9FF',
        },
        emerald: {
          DEFAULT: '#30D158',
        },
        amber: {
          DEFAULT: '#FF9F0A',
        },
        danger: {
          DEFAULT: '#FF453A',
        },
        'deep-navy': '#0B0E1A',
        glass: {
          light: 'rgba(255,255,255,0.55)',
          dark: 'rgba(14,14,22,0.32)',
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      borderRadius: {
        xl2: '1.75rem',
        xl3: '2rem',
      },
      boxShadow: {
        glass:
          '0 24px 60px rgba(0,0,0,0.20), inset 0 1px 1px rgba(255,255,255,0.5), inset 0 -8px 20px rgba(255,255,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.13)',
        'glass-dark':
          '0 24px 60px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255,255,255,0.14), inset 0 -8px 20px rgba(255,255,255,0.03), inset 0 0 0 1px rgba(255,255,255,0.08)',
      },
      keyframes: {
        'liquid-in': {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'liquid-in': 'liquid-in 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 2.2s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
