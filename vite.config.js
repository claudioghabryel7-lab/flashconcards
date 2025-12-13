import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Otimizações de build para melhor TTFB
    minify: 'esbuild', // esbuild é mais rápido que terser
    target: 'esnext', // Usar ES modules modernos
    cssCodeSplit: true, // Code splitting de CSS
    // Otimizações de assets
    assetsInlineLimit: 4096, // Inline assets pequenos (< 4kb)
    // Melhor compressão
    reportCompressedSize: false, // Desabilita para build mais rápido
    rollupOptions: {
      output: {
        // Code splitting otimizado para melhor cache e TTFB
        manualChunks: (id) => {
          // Separar vendors em chunks menores para melhor cache
          if (id.includes('node_modules')) {
            // React core (crítico - carregar primeiro)
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react-vendor'
            }
            // Firebase (pode ser carregado depois)
            if (id.includes('firebase')) {
              return 'firebase-vendor'
            }
            // UI libraries
            if (id.includes('@heroicons') || id.includes('framer-motion')) {
              return 'ui-vendor'
            }
            // AI/ML libraries (pesados - lazy load)
            if (id.includes('@google/generative-ai') || id.includes('pdfjs') || id.includes('html2canvas')) {
              return 'ai-vendor'
            }
            // Outros vendors
            return 'vendor'
          }
        },
        // Otimizar nomes de chunks para melhor cache
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
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
  // Pre-bundling otimizado para melhor TTFB
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
    ],
    // Excluir dependências pesadas do pre-bundling
    exclude: ['@google/generative-ai', 'pdfjs-dist', 'html2canvas'],
  },
  // Otimizações de preview (produção local)
  preview: {
    port: 4173,
    strictPort: true,
  },
})
