import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Otimizações de build
    minify: 'esbuild', // esbuild é mais rápido que terser
    target: 'esnext', // Usar ES modules modernos
    cssCodeSplit: true, // Code splitting de CSS
    rollupOptions: {
      output: {
        // Code splitting manual para melhor cache
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'ui-vendor': ['@heroicons/react'],
        },
      },
    },
    // Chunk size warnings
    chunkSizeWarningLimit: 1000,
    // Source maps apenas em dev
    sourcemap: false,
  },
  // Otimizações de dev server
  server: {
    hmr: {
      overlay: false, // Desabilita overlay de erros para melhor performance
    },
  },
  // Pre-bundling otimizado
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
    ],
  },
})
