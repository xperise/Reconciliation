import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas:         'var(--canvas)',
        surface:        'var(--surface)',
        'surface-2':    'var(--surface-2)',
        line:           'var(--line)',
        'line-soft':    'var(--line-soft)',
        ink:            'var(--ink)',
        'ink-2':        'var(--ink-2)',
        'ink-3':        'var(--ink-3)',
        violet:         'var(--violet)',
        'violet-deep':  'var(--violet-deep)',
        'violet-soft':  'var(--violet-soft)',
        teal:           'var(--teal)',
        'teal-soft':    'var(--teal-soft)',
        amber:          'var(--amber)',
        'amber-soft':   'var(--amber-soft)',
        red:            'var(--red)',
        'red-soft':     'var(--red-soft)',
      },
      fontFamily: {
        body: ['var(--font-body)', 'Be Vietnam Pro', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        card: 'var(--r)',
        ui:   'var(--r-sm)',
      },
      boxShadow: {
        card: 'var(--shadow)',
      },
    },
  },
  plugins: [],
} satisfies Config;
