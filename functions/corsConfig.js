const cors = require('cors')

const STATIC_ORIGINS = new Set([
  'https://www.flashconcards.com.br',
  'https://flashconcards.com.br',
  'https://flashconcards.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
])

function isAllowedOrigin(origin) {
  if (!origin) return true
  if (STATIC_ORIGINS.has(origin)) return true
  if (/^https:\/\/flashconcards[a-z0-9-]*\.vercel\.app$/i.test(origin)) return true
  if (/^http:\/\/localhost:\d+$/i.test(origin)) return true
  if (/^http:\/\/127\.0\.0\.1:\d+$/i.test(origin)) return true
  return false
}

const corsMiddleware = cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true)
      return
    }
    console.warn('CORS bloqueado para origem:', origin)
    callback(null, false)
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})

module.exports = { corsMiddleware, isAllowedOrigin }
