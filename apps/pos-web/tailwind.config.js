import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.resolve(__dirname, 'index.html'),
    path.resolve(__dirname, 'src/**/*.{js,ts,jsx,tsx}'),
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        page: 'var(--bg-page)',
        surface: 'var(--bg-surface)',
        'surface-2': 'var(--bg-surface-2)',
        elevated: 'var(--bg-elevated)',
        input: 'var(--bg-input)',
        border: {
          DEFAULT: 'var(--border-subtle)',
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        text: {
          main: 'var(--text-main)',
          muted: 'var(--text-muted)',
          dim: 'var(--text-dim)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          soft: 'var(--primary-soft)',
          fg: 'var(--primary-fg)',
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          soft: 'var(--warning-soft)',
          fg: 'var(--warning-fg)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          soft: 'var(--danger-soft)',
          fg: 'var(--danger-fg)',
        },
        info: {
          DEFAULT: 'var(--info)',
          soft: 'var(--info-soft)',
          fg: 'var(--info-fg)',
        },
        gebeya: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          soft: 'var(--primary-soft)',
          fg: 'var(--primary-fg)',
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans Ethiopic', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        ethiopic: ['Noto Sans Ethiopic', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        input: '12px',
        panel: '16px',
        pill: '9999px',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        card: 'var(--shadow-soft)',
        modal: 'var(--shadow-modal)',
      },
      spacing: {
        rail: '88px',
        touch: '44px',
        'touch-lg': '56px',
      },
      minHeight: {
        touch: '44px',
        'touch-lg': '56px',
      },
      minWidth: {
        touch: '44px',
        'touch-lg': '56px',
        rail: '88px',
      },
      width: {
        rail: '88px',
      },
      transitionDuration: {
        fast: '150ms',
        modal: '200ms',
      },
    },
  },
  plugins: [],
};
