import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'firebase/firestore': resolve(__dirname, 'src/lib/db/firestoreShim.js'),
      'firebase/firestore-native': resolve(__dirname, 'node_modules/firebase/firestore/dist/esm/index.esm.js'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    // Otimizações de build para melhor TTFB
    minify: 'esbuild', // esbuild é mais rápido que terser
    target: 'esnext', // Usar ES modules modernos
    commonjsOptions: {
      // Resolver problemas de compatibilidade com framer-motion
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
    cssCodeSplit: true, // Code splitting de CSS
    // Otimizações de assets
    assetsInlineLimit: 4096, // Inline assets pequenos (< 4kb)
    // Melhor compressão
    reportCompressedSize: false, // Desabilita para build mais rápido
    // Source maps apenas em dev
    sourcemap: false,
    rollupOptions: {
      output: {
        // Code splitting - React deve estar no entry chunk (não separar)
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // NÃO separar React - deixar no entry chunk para evitar problemas
            // TEMPORARIAMENTE: framer-motion no vendor comum para evitar problemas de inicialização
            // TODO: Separar em chunk próprio após resolver problemas de compatibilidade
            // if (id.includes('framer-motion')) {
            //   return 'framer-motion-vendor'
            // }
            // Firebase em chunk separado
            if (id.includes('firebase')) {
              return 'firebase-vendor'
            }
            // Bibliotecas de IA/PDF em chunk separado (carregadas apenas quando necessário)
            if (id.includes('@google/generative-ai') || id.includes('pdfjs') || id.includes('html2canvas')) {
              return 'ai-vendor-gemini-2.5-flash-' + Date.now()
            }
            // Outros vendors (mas não React)
            if (!id.includes('react') && !id.includes('react-dom') && !id.includes('react-router')) {
              return 'vendor'
            }
          }
        },
        // Otimizar nomes de chunks para melhor cache COM TIMESTAMP E VERSÃO
        chunkFileNames: 'assets/js/[name]-[hash]-' + Date.now() + '-v2.5-flash.js',
        entryFileNames: 'assets/js/[name]-[hash]-' + Date.now() + '-v2.5-flash.js',
        assetFileNames: 'assets/[ext]/[name]-[hash]-' + Date.now() + '-v2.5-flash.[ext]',
      },
    },
    // Chunk size warnings
    chunkSizeWarningLimit: 1000,
  },
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  // Otimizações de dev server
  server: {
    hmr: {
      overlay: false, // Desabilita overlay de erros para melhor performance
    },
    // Configurar fallback para rotas em desenvolvimento
    historyApiFallback: true,
  },
  // Pre-bundling otimizado para melhor TTFB
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react-router-dom',
      '@tanstack/react-query',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      // framer-motion REMOVIDO do pre-bundling para evitar problemas de inicialização
      // Será carregado apenas quando necessário via code splitting (chunk separado)
    ],
    // Excluir dependências pesadas do pre-bundling (carregadas apenas quando necessário)
    exclude: ['@google/generative-ai', 'pdfjs-dist', 'html2canvas', 'framer-motion'],
    // Forçar esbuild para resolver problemas de compatibilidade
    esbuildOptions: {
      jsx: 'automatic',
    },
    // Forçar re-otimização se houver problemas
    force: false,
  },
  // Otimizações de preview (produção local)
  preview: {
    port: 4173,
    strictPort: true,
  },
})
