/**
 * Compatibilidade import.meta.env no Next.js (código legado Vite).
 */
import { ENV } from './env.js'

const proxy = new Proxy(ENV, {
  get(target, prop) {
    if (prop in target) return target[prop]
    if (prop === 'env') return target
    return undefined
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
