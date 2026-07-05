/**
 * Polyfill runtime para import.meta.env (código legado Vite → Next.js).
 * Em produção, next.config também injeta via turbopack.define / DefinePlugin.
 */
import { readEnv, isDevEnv } from './env.js'

function createEnvProxy() {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'env') return createEnvProxy()
        if (prop === 'DEV') return isDevEnv()
        if (prop === 'PROD') return !isDevEnv()
        if (prop === 'MODE') return isDevEnv() ? 'development' : 'production'
        if (typeof prop === 'string') return readEnv(prop)
        return undefined
      },
      has(_target, prop) {
        if (prop === 'DEV' || prop === 'PROD' || prop === 'MODE') return true
        if (typeof prop === 'string') return readEnv(prop) != null
        return false
      },
    }
  )
}

const envProxy = createEnvProxy()

if (typeof import.meta !== 'undefined') {
  try {
    if (import.meta.env == null) {
      import.meta.env = envProxy
    }
  } catch {
    try {
      Object.defineProperty(import.meta, 'env', {
        value: envProxy,
        writable: true,
        configurable: true,
      })
    } catch {
      /* bundler bloqueou — compile-time define no next.config cobre */
    }
  }
}

export {}
