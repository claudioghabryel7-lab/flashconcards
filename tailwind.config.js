/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  // Remover CSS não usado (PurgeCSS já está integrado no Tailwind v3+)
  safelist: [
    // Classes dinâmicas que podem ser geradas em runtime
    'scale-102',
    'scale-98',
    'tab-indicator',
  ],
  theme: {
    extend: {
      colors: {
        // ConCursos2.5X Theme - Dark Mode + Electric Orange/Cyan
        background: {
          primary: '#09090b',
          secondary: '#0a0a0c',
          tertiary: '#0f0f12',
          card: '#121214',
          'card-hover': '#1a1a1e',
        },
        accent: {
          // Electric Orange
          orange: '#ff6b35',
          'orange-dim': '#e55a2b',
          'orange-dark': '#cc4d20',
          // Electric Cyan
          cyan: '#00f0ff',
          'cyan-dim': '#00c8d4',
          'cyan-dark': '#0096a8',
          // Supporting colors
          blue: '#3b82f6',
          indigo: '#6366f1',
        },
        text: {
          primary: '#fafafa',
          secondary: '#a1a1aa',
          tertiary: '#71717a',
          muted: '#52525b',
        },
        border: {
          primary: '#27272a',
          secondary: '#3f3f46',
          accent: '#ff6b35',
        },
        // Legacy colors for compatibility
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        secondary: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        alego: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        tech: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'gradient-25x': 'linear-gradient(135deg, #ff6b35 0%, #00f0ff 50%, #3b82f6 100%)',
        'gradient-25x-subtle': 'linear-gradient(135deg, rgba(255, 107, 53, 0.1) 0%, rgba(0, 240, 255, 0.1) 100%)',
        'gradient-dark': 'linear-gradient(180deg, #09090b 0%, #0a0a0c 100%)',
        // Legacy gradients for compatibility
        'gradient-primary': 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 50%, #3b82f6 100%)',
        'gradient-secondary': 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)',
        'gradient-accent': 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
        'gradient-tech': 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        'gradient-blue': 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'gradient-purple': 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(255, 107, 53, 0.3)',
        'glow-lg': '0 0 40px rgba(255, 107, 53, 0.5)',
        'glow-strong': '0 0 60px rgba(255, 107, 53, 0.4)',
        'glow-cyan': '0 0 20px rgba(0, 240, 255, 0.3)',
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.5), 0 1px 2px -1px rgba(0, 0, 0, 0.3)',
        'card-hover': '0 10px 30px -10px rgba(0, 0, 0, 0.5)',
        'inner-lg': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.1)',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.6s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'shimmer-slow': 'shimmer 3s linear infinite',
        'shimmer-slide': 'shimmer-slide 3s linear infinite',
      },
      keyframes: {
        'shimmer-slide': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

