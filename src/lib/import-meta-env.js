/**
 * Compatibilidade import.meta.env no Next.js (código legado Vite).
 */
import { ENV, readEnv } from './env.js'

const proxy = new Proxy(ENV, {
  get(_target, prop) {
    if (prop === 'env') return proxy
    if (typeof prop !== 'string') return undefined
    return readEnv(prop)
  },
  has(_target, prop) {
    if (typeof prop !== 'string') return false
    return readEnv(prop) != null
  },
})

try {
  if (typeof import.meta !== 'undefined') {
    Object.defineProperty(import.meta, 'env', {
      value: proxy,
      writable: false,
      configurable: true,
    })
  }
} catch {
  // ignore — alguns bundlers não permitem redefinir import.meta.env
}

export {}
