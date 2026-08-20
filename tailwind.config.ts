import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        muted: 'var(--muted)',
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        line: 'var(--line)',
        'line-soft': 'var(--line-soft)',
        teal: 'var(--teal)',
        'teal-deep': 'var(--teal-deep)',
        'teal-wash': 'var(--teal-wash)',
      },
      fontFamily: {
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
