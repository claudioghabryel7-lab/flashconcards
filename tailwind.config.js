/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './src/app/**/*.{js,jsx,ts,tsx}',
    './src/components/**/*.{js,jsx,ts,tsx}',
    './src/routes/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cp: {
          bg: 'var(--cp-bg)',
          surface: 'var(--cp-surface)',
          card: 'var(--cp-bg-elevated)',
          text: 'var(--cp-text)',
          accent: 'var(--cp-accent)',
          accent2: 'var(--cp-accent-2)',
          accent3: 'var(--cp-accent-3)',
          accent4: 'var(--cp-accent-4)',
          success: 'var(--cp-success)',
          muted: 'var(--cp-text-muted)',
        },
        /* Legacy → tema CP */
        'background-primary': 'var(--cp-bg)',
        'background-card': 'var(--cp-surface)',
        'background-card-hover':
          'color-mix(in srgb, var(--cp-surface) 85%, var(--cp-text) 5%)',
        'text-primary': 'var(--cp-text)',
        'text-secondary': 'var(--cp-text-muted)',
        'text-muted': 'var(--cp-text-muted)',
        'border-primary': 'var(--cp-border)',
        'border-secondary': 'var(--cp-border-hover)',
        'accent-orange': 'var(--cp-accent)',
        'accent-orange-dim': 'var(--cp-accent)',
        'accent-cyan': 'var(--cp-accent-2)',
        'accent-cyan-dim': 'var(--cp-accent-2)',
        alego: {
          400: 'var(--cp-accent)',
          600: 'var(--cp-accent)',
          700: 'var(--cp-accent)',
        },
      },
      fontFamily: {
        display: ['Syne', 'var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
        tribunal: ['Cinzel', 'Georgia', 'serif'],
        'serif-body': ['Crimson Text', 'Georgia', 'serif'],
        police: ['Share Tech Mono', 'ui-monospace', 'monospace'],
        sport: ['Orbitron', 'system-ui', 'sans-serif'],
        oficial: ['Special Elite', 'Georgia', 'serif'],
      },
      boxShadow: {
        'cp-glow': '0 0 60px var(--cp-glow)',
        'cp-card': '0 24px 48px rgba(0, 0, 0, 0.12)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
