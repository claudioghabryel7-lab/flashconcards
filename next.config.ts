import { loadEnvConfig } from '@next/env'
import type { NextConfig } from 'next'

loadEnvConfig(process.cwd())

const viteEnvKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_GEMINI_API_KEY',
  'VITE_GROQ_API_KEY',
  'VITE_GEMINI_MODEL',
  'VITE_GOOGLE_SEARCH_API_KEY',
  'VITE_GOOGLE_SEARCH_ENGINE_ID',
  'VITE_MERCADOPAGO_PUBLIC_KEY',
]

const env: Record<string, string> = {}
for (const key of viteEnvKeys) {
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
