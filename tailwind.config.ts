import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          main: '#0a0a0f',
          card: '#111118',
          input: '#16161f',
          hover: '#1c1c28',
          elevated: '#1f1f2c',
        },
        accent: {
          gold: '#FFD700',
          amber: '#FFBF00',
          honey: '#F5C542',
          dim: '#B8960C',
          glow: 'rgba(255, 215, 0, 0.15)',
        },
        border: {
          subtle: '#2a2a3a',
          gold: 'rgba(255, 215, 0, 0.25)',
          bright: 'rgba(255, 215, 0, 0.5)',
        },
        text: {
          primary: '#ffffff',
          secondary: '#c0c0d0',
          muted: '#6b6b80',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'gold-sm': '0 0 10px rgba(255, 215, 0, 0.1)',
        'gold-md': '0 0 20px rgba(255, 215, 0, 0.15)',
        'gold-lg': '0 0 40px rgba(255, 215, 0, 0.2)',
        'gold-glow': '0 0 60px rgba(255, 215, 0, 0.3)',
      },
      animation: {
        'pulse-gold': 'pulseGold 2s ease-in-out infinite',
        'scan-line': 'scanLine 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 10px rgba(255, 215, 0, 0.1)' },
          '50%': { boxShadow: '0 0 30px rgba(255, 215, 0, 0.3)' },
        },
        scanLine: {
          '0%': { transform: 'translateY(-100%)' },
          '50%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(-100%)' },
        },
        glow: {
          '0%': { textShadow: '0 0 5px rgba(255, 215, 0, 0.3)' },
          '100%': { textShadow: '0 0 20px rgba(255, 215, 0, 0.6)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
