import { loadEnvConfig } from '@next/env'
import type { NextConfig } from 'next'

loadEnvConfig(process.cwd())

/** Apenas valores seguros para o bundle do browser. Secrets LLM NÃO entram aqui. */
const clientEnvKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_GEMINI_MODEL',
  'VITE_GEMINI_TTS_MODEL',
  'VITE_MERCADOPAGO_PUBLIC_KEY',
  // Ollama no PC via browser (sem túnel)
  'VITE_OLLAMA_BASE_URL',
  'VITE_OLLAMA_MODEL',
  'NEXT_PUBLIC_OLLAMA_BASE_URL',
  'NEXT_PUBLIC_OLLAMA_MODEL',
]

const env: Record<string, string> = {}
for (const key of clientEnvKeys) {
  env[key] = process.env[key] || ''
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['framer-motion'],
  env,
  turbopack: {
    resolveAlias: {
      'react-router-dom': './src/lib/react-router-compat.tsx',
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
