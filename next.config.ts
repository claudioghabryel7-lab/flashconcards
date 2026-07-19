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
  'VITE_FIREBASE_VAPID_KEY',
  'NEXT_PUBLIC_FIREBASE_VAPID_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'VITE_USE_SUPABASE',
  'NEXT_PUBLIC_USE_SUPABASE',
  'VITE_SUPABASE_FUNCTIONS_URL',
  'NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL',
  'VITE_GEMINI_API_KEY',
  'VITE_GEMINI_API_KEY_1',
  'VITE_GEMINI_API_KEY_2',
  'VITE_GEMINI_API_KEY_3',
  'VITE_GEMINI_API_KEY_4',
  'VITE_GEMINI_API_KEY_5',
  'VITE_GEMINI_API_KEY_6',
  'VITE_GEMINI_API_KEY_7',
  'VITE_GEMINI_API_KEY_8',
  'VITE_GEMINI_API_KEY_9',
  'VITE_GEMINI_API_KEY_10',
  'VITE_GOOGLE_AI_API_KEY',
  'VITE_GROQ_API_KEY',
  'VITE_GEMINI_MODEL',
  'VITE_GOOGLE_SEARCH_API_KEY',
  'VITE_GOOGLE_SEARCH_ENGINE_ID',
]

const env: Record<string, string> = {}
for (const key of viteEnvKeys) {
  env[key] = process.env[key] || ''
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['framer-motion'],
  env,
  productionBrowserSourceMaps: false,
  serverExternalPackages: ['firebase-admin', 'firebase-functions', 'nodemailer', 'mercadopago'],
  compiler: {
    // Remove console.* do bundle em produção
    removeConsole: process.env.NODE_ENV === 'production',
  },
  turbopack: {
    resolveAlias: {
      'react-router-dom': './src/lib/react-router-compat.tsx',
      'firebase/firestore': './src/lib/db/firestoreShim.js',
      'firebase/firestore-native': './node_modules/firebase/firestore/dist/esm/index.esm.js',
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'react-router-dom': require('path').resolve(__dirname, 'src/lib/react-router-compat.tsx'),
      'firebase/firestore': require('path').resolve(__dirname, 'src/lib/db/firestoreShim.js'),
      'firebase/firestore-native': require('path').resolve(
        __dirname,
        'node_modules/firebase/firestore/dist/esm/index.esm.js',
      ),
    }
    return config
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
