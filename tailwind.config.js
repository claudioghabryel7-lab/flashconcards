/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        alego: {
          50: '#f0f6ff',
          100: '#d9e8ff',
          200: '#b3d1ff',
          300: '#80b1ff',
          400: '#4d91ff',
          500: '#1f6ee6',
          600: '#1554b4',
          700: '#0f3c82',
          800: '#092551',
          900: '#041030',
        },
      },
    },
  },
  plugins: [],
}

