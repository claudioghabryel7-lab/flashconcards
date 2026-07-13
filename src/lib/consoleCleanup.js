import { isDevEnv } from './env.js'

let applied = false

const MUTED_METHODS = [
  'log',
  'info',
  'debug',
  'warn',
  'error',
  'trace',
  'table',
  'dir',
  'dirxml',
  'group',
  'groupCollapsed',
  'groupEnd',
  'time',
  'timeEnd',
  'timeLog',
  'count',
  'countReset',
  'assert',
]

/**
 * Silencia o console no browser em produção.
 * Seguro chamar várias vezes; no-op em desenvolvimento.
 */
export function cleanupConsole() {
  if (applied || typeof window === 'undefined') return
  applied = true

  if (isDevEnv()) return

  const noop = () => {}
  MUTED_METHODS.forEach((method) => {
    try {
      // eslint-disable-next-line no-console
      console[method] = noop
    } catch {
      /* ignore */
    }
  })

  try {
    // Evita que libs reatribuam métodos comuns
    ;['log', 'info', 'warn', 'error', 'debug'].forEach((method) => {
      Object.defineProperty(console, method, {
        value: noop,
        writable: false,
        configurable: false,
      })
    })
  } catch {
    /* alguns browsers/ambientes bloqueiam */
  }
}

// Auto-aplica ao importar no cliente
if (typeof window !== 'undefined') {
  cleanupConsole()
}
