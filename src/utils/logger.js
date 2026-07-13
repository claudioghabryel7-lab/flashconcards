import { isDevEnv } from '@/lib/env.js'
// Logger utilitário - desabilita logs em produção
const isDev = isDevEnv()
const noop = () => {}

export const logger = {
  log: isDev ? (...args) => console.log(...args) : noop,
  warn: isDev ? (...args) => console.warn(...args) : noop,
  error: isDev ? (...args) => console.error(...args) : noop,
  info: isDev ? (...args) => console.info(...args) : noop,
  debug: isDev ? (...args) => console.debug(...args) : noop,
}
