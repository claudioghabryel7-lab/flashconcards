import { readEnv, isDevEnv } from '@/lib/env.js'
// Logger utilitário - desabilita logs em produção
const isDev = isDevEnv()

export const logger = {
  log: (...args) => {
    if (isDev) {
      console.log(...args)
    }
  },
  warn: (...args) => {
    if (isDev) {
      console.warn(...args)
    }
  },
  error: (...args) => {
    // Erros sempre são logados, mesmo em produção
    console.error(...args)
  },
  info: (...args) => {
    if (isDev) {
      console.info(...args)
    }
  },
  debug: (...args) => {
    if (isDev) {
      console.debug(...args)
    }
  }
}

